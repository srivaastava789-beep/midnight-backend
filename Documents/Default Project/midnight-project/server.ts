import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Groq from 'groq';
import type { AppState, ScheduleChatTurn, StudyTask } from './src/types/study.ts';
import { isValidISODate } from './src/engine/validator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.1-8b-instant';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors({
    origin: ['https://midnight-study-app-71505.web.app', 'http://localhost:5173'],
    credentials: true,
  }));

  app.get('/api/ai/status', (_req, res) => {
    const configured = Boolean(process.env.GROQ_API_KEY?.trim());
    res.json({
      configured,
      model: MODEL,
    });
  });

  function buildPlanPrompt(state: AppState, targetDate: string, availableMinutes: number): string {
    const subjects = state.chapters.map((c) => ({
      id: c.id,
      name: c.chapterName,
      subjectId: c.subjectId,
      status: c.status,
      difficulty: c.difficulty,
      confidence: c.confidence,
      lastStudiedDate: c.lastStudiedDate,
    })).filter((s) => s.status !== 'Completed' && s.status !== 'Strong');

    const exams = state.exams.map((e) => ({
      date: e.date,
      subject: e.subjectName,
      notes: e.notes,
    }));

    const revisions = state.revisions.filter((r) => !r.completed).map((r) => ({
      chapterId: r.chapterId,
      chapterName: r.chapterName,
      stage: r.stage,
      dueDate: r.scheduledDate,
    }));

    return `You are an expert ICSE Class 10 study planner. Create a realistic study plan for ${targetDate} with ${availableMinutes} minutes available.

CURRENT STATE:
- Chapters to study: ${JSON.stringify(subjects, null, 2)}
- Upcoming exams: ${JSON.stringify(exams, null, 2)}
- Pending revisions: ${JSON.stringify(revisions, null, 2)}
- Settings: blockDurationMinutes=${state.settings.blockDurationMinutes}, timeEstimateStandard=${state.settings.timeEstimateStandard}

INSTRUCTIONS:
1. Create tasks that fit within ${availableMinutes} minutes total
2. Prioritize chapters due for revision and upcoming exams
3. Each task should have: id, title, chapterId (if applicable), subjectId, taskType ('first_study' or 'revision'), durationMinutes, timeSlot (e.g., '09:00 AM'), objective, practiceTopicId (optional)
4. Alternate subjects to avoid fatigue
5. Include short breaks every 60-90 minutes
6. Return ONLY valid JSON with this exact structure:
{
  "tasks": [...],
  "whyThisPlan": "brief explanation",
  "remainingBacklog": []
}

Do not include markdown formatting, just raw JSON.`;
  }

  function buildRecoveryPrompt(state: AppState, activeDate: string, missedTasks: StudyTask[], overdueRevisions: any[]): string {
    const missed = missedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      chapterId: t.chapterId,
      scheduledDate: t.scheduledDate,
    }));

    return `You are an expert ICSE Class 10 study planner. Help prioritize recovery for ${activeDate}.

MISSED TASKS: ${JSON.stringify(missed, null, 2)}
OVERDUE REVISIONS: ${JSON.stringify(overdueRevisions, null, 2)}
CURRENT STATE: chapters=${JSON.stringify(state.chapters.map((c) => ({ id: c.id, name: c.chapterName, status: c.status })))}

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "id": "string",
      "kind": "task" | "revision",
      "sourceTaskId": "string or null",
      "sourceRevisionId": "string or null",
      "chapterId": "string",
      "chapterName": "string",
      "subjectId": "string",
      "action": "reschedule" | "complete" | "flag_weak",
      "reason": "string"
    }
  ],
  "whyThisRecovery": "brief explanation",
  "remainingBacklogCount": number
}

Do not include markdown formatting, just raw JSON.`;
  }

  function buildScheduleChatPrompt(state: AppState, activeDate: string, history: ScheduleChatTurn[], message: string): string {
    const chatHistory = history.map((h) => `${h.role === 'user' ? 'Student' : 'Assistant'}: ${h.text}`).join('\n');

    return `You are an expert ICSE Class 10 study assistant. The student is chatting with you about their study schedule for ${activeDate}.

CURRENT STATE SUMMARY:
- Chapters: ${state.chapters.length} total
- Exams: ${state.exams.length} upcoming
- Plans for today: ${state.plans[activeDate]?.tasks.length ?? 0} tasks
- Settings: blockDurationMinutes=${state.settings.blockDurationMinutes}

CONVERSATION HISTORY:
${chatHistory}

STUDENT MESSAGE: ${message}

INSTRUCTIONS:
1. Respond helpfully and concisely
2. If the student wants to reschedule, reorganize, or modify their plan, provide specific operations
3. Return ONLY valid JSON:
{
  "assistantMessage": "your response text",
  "isOutOfScope": boolean,
  "operations": [
    {
      "type": "move_task" | "complete_task" | "add_task" | "delete_task" | "update_chapter_status",
      "taskId": "string or null",
      "chapterId": "string or null",
      "newDate": "string or null",
      "newStatus": "string or null",
      "details": "string"
    }
  ]
}

Do not include markdown formatting, just raw JSON.`;
  }

  async function callGroq(prompt: string): Promise<string> {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.7,
      max_tokens: 2000,
    });
    return completion.choices[0]?.message?.content ?? '';
  }

  app.post('/api/ai/plan', async (req, res) => {
    try {
      const body = req.body as {
        state?: AppState;
        targetDate?: string;
        availableMinutes?: number;
      };

      if (!body || !body.state || typeof body.targetDate !== 'string') {
        res.status(400).json({ error: 'Missing required state or targetDate.' });
        return;
      }
      if (!isValidISODate(body.targetDate)) {
        res.status(400).json({ error: 'targetDate must be a valid YYYY-MM-DD date.' });
        return;
      }

      const availableMinutes = Math.max(
        30,
        Math.min(300, Number(body.availableMinutes) || body.state.settings.blockDurationMinutes * 2)
      );

      const prompt = buildPlanPrompt(body.state, body.targetDate, availableMinutes);
      const responseText = await callGroq(prompt);

      // Try to parse JSON from response (handle potential markdown wrapping)
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const result = JSON.parse(jsonText);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected server error while calling Groq.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/recover', async (req, res) => {
    try {
      const body = req.body as {
        state?: AppState;
        activeDate?: string;
        missedTasks?: StudyTask[];
        overdueRevisions?: Array<{
          id: string;
          chapterId: string;
          subjectId: AppState['chapters'][number]['subjectId'];
          chapterName: string;
          stage: string;
          originalDueDate: string;
        }>;
      };

      if (!body || !body.state || typeof body.activeDate !== 'string') {
        res.status(400).json({ error: 'Missing required state or activeDate.' });
        return;
      }
      if (!isValidISODate(body.activeDate)) {
        res.status(400).json({ error: 'activeDate must be a valid YYYY-MM-DD date.' });
        return;
      }

      const prompt = buildRecoveryPrompt(
        body.state,
        body.activeDate,
        Array.isArray(body.missedTasks) ? body.missedTasks : [],
        Array.isArray(body.overdueRevisions) ? body.overdueRevisions : []
      );
      const responseText = await callGroq(prompt);

      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const result = JSON.parse(jsonText);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected server error during Groq recovery.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/schedule-chat', async (req, res) => {
    try {
      const body = req.body as {
        state?: AppState;
        activeDate?: string;
        history?: ScheduleChatTurn[];
        message?: string;
      };

      if (!body || !body.state || typeof body.activeDate !== 'string' || typeof body.message !== 'string') {
        res.status(400).json({ error: 'Missing required state, activeDate, or message.' });
        return;
      }
      if (!isValidISODate(body.activeDate)) {
        res.status(400).json({ error: 'activeDate must be a valid YYYY-MM-DD date.' });
        return;
      }
      if (!body.message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const prompt = buildScheduleChatPrompt(
        body.state,
        body.activeDate,
        Array.isArray(body.history) ? body.history : [],
        body.message.trim()
      );
      const responseText = await callGroq(prompt);

      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      const result = JSON.parse(jsonText);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected server error during Groq schedule chat.';
      res.status(502).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIDNIGHT server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MIDNIGHT server:', err);
  process.exit(1);
});
