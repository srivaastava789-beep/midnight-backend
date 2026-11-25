import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chatScheduleWithGemini,
  GeminiConfigError,
  GeminiResponseError,
  generateGeminiDayPlan,
  generateGeminiRecoveryPlan,
} from './server/gemini.ts';
import type { AppState, ScheduleChatTurn, StudyTask } from './src/types/study.ts';
import { isValidISODate } from './src/engine/validator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/ai/status', (_req, res) => {
    const configured = Boolean(process.env.GEMINI_API_KEY?.trim());
    res.json({
      configured,
      model: 'gemini-4-hydrogen',
    });
  });

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

      const result = await generateGeminiDayPlan(body.state, body.targetDate, availableMinutes);
      res.json(result);
    } catch (err) {
      if (err instanceof GeminiConfigError || err instanceof GeminiResponseError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unexpected server error while calling Gemini.';
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

      const result = await generateGeminiRecoveryPlan(
        body.state,
        body.activeDate,
        Array.isArray(body.missedTasks) ? body.missedTasks : [],
        Array.isArray(body.overdueRevisions) ? body.overdueRevisions : []
      );
      res.json(result);
    } catch (err) {
      if (err instanceof GeminiConfigError || err instanceof GeminiResponseError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unexpected server error during AI recovery planning.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/schedule-chat', async (req, res) => {
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

      const history = Array.isArray(body.history)
        ? body.history.filter(
            (h): h is ScheduleChatTurn =>
              Boolean(h) &&
              (h.role === 'user' || h.role === 'assistant') &&
              typeof h.text === 'string'
          )
        : [];

      const result = await chatScheduleWithGemini(
        body.state,
        body.activeDate,
        history,
        body.message.trim()
      );
      res.json(result);
    } catch (err) {
      if (err instanceof GeminiConfigError || err instanceof GeminiResponseError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unexpected server error during schedule chat.';
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
