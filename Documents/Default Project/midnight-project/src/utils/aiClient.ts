import type {
  AppState,
  BacklogNote,
  RecoverySuggestion,
  RevisionTask,
  ScheduleChatTurn,
  ScheduleOperation,
  StudyTask,
} from '../types/study.ts';

export interface AIStatusResponse {
  configured: boolean;
  model: string;
}

export interface AIPlanResponse {
  tasks: StudyTask[];
  whyThisPlan: string;
  remainingBacklog: BacklogNote[];
  violations: string[];
}

export interface AIRecoveryResponse {
  suggestions: RecoverySuggestion[];
  whyThisRecovery: string;
  remainingBacklogCount: number;
}

export interface AIScheduleChatResponse {
  assistantMessage: string;
  isOutOfScope: boolean;
  operations: ScheduleOperation[];
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return `Request failed with status ${res.status}`;
}

export async function fetchAIStatus(): Promise<AIStatusResponse> {
  const res = await fetch('/api/ai/status');
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AIStatusResponse;
}

export async function requestGeminiDayPlan(
  state: AppState,
  targetDate: string,
  availableMinutes: number
): Promise<AIPlanResponse> {
  const res = await fetch('/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, targetDate, availableMinutes }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AIPlanResponse;
}

export async function requestGeminiRecovery(
  state: AppState,
  activeDate: string,
  missedTasks: StudyTask[],
  overdueRevisions: RevisionTask[]
): Promise<AIRecoveryResponse> {
  const res = await fetch('/api/ai/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, activeDate, missedTasks, overdueRevisions }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AIRecoveryResponse;
}

export async function requestGeminiScheduleChat(
  state: AppState,
  activeDate: string,
  history: ScheduleChatTurn[],
  message: string
): Promise<AIScheduleChatResponse> {
  const res = await fetch('/api/ai/schedule-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, activeDate, history, message }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AIScheduleChatResponse;
}
