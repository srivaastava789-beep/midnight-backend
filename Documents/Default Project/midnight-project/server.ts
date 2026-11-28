import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppState, ScheduleChatTurn, StudyTask } from './src/types/study.ts';
import { isValidISODate } from './src/engine/validator.ts';
import {
  GROQ_MODEL,
  GroqConfigError,
  GroqResponseError,
  chatScheduleWithGroq,
  generateGroqDayPlan,
  generateGroqRecoveryPlan,
} from './server/groq.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function sendAiError(res: express.Response, err: unknown, fallbackMessage: string) {
  if (err instanceof GroqConfigError || err instanceof GroqResponseError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  res.status(502).json({ error: message });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(
    cors({
      origin: [
        'https://midnight-study-app-71505.web.app',
        'https://midnight-backend-jfev.onrender.com',
        'http://localhost:5173',
        'http://localhost:3000',
      ],
      credentials: true,
    })
  );

  app.get('/api/ai/status', (_req, res) => {
    const configured = Boolean(process.env.GROQ_API_KEY?.trim());
    res.json({
      configured,
      model: GROQ_MODEL,
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

      const result = await generateGroqDayPlan(body.state, body.targetDate, availableMinutes);
      res.json(result);
    } catch (err) {
      sendAiError(res, err, 'Unexpected server error while generating study plan.');
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

      const result = await generateGroqRecoveryPlan(
        body.state,
        body.activeDate,
        Array.isArray(body.missedTasks) ? body.missedTasks : [],
        Array.isArray(body.overdueRevisions) ? body.overdueRevisions : []
      );
      res.json(result);
    } catch (err) {
      sendAiError(res, err, 'Unexpected server error during recovery planning.');
    }
  });

  const handleScheduleChat: express.RequestHandler = async (req, res) => {
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

      const result = await chatScheduleWithGroq(
        body.state,
        body.activeDate,
        Array.isArray(body.history) ? body.history : [],
        body.message.trim()
      );
      res.json(result);
    } catch (err) {
      sendAiError(res, err, 'Unexpected server error during schedule chat.');
    }
  };

  app.post('/api/ai/schedule-chat', handleScheduleChat);
  app.post('/api/schedule-chat', handleScheduleChat);

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
