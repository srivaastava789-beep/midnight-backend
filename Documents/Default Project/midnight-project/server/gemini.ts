import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiMemoryCategory,
  AppState,
  BacklogNote,
  ChapterDifficulty,
  ChapterItem,
  RecoverySuggestion,
  ScheduleChatTurn,
  ScheduleOperation,
  StudyTask,
  SubjectId,
  TaskType,
} from '../src/types/study.ts';
import { addDays, diffDays, getDayOfWeek, getWeekdayName } from '../src/utils/date.ts';
import { validateAndConstrainDayTasks } from '../src/engine/validator.ts';
import { normalizeSubjectId } from '../src/engine/scheduleMutator.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const CANONICAL_SUBJECT_IDS: SubjectId[] = [
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'history_civics',
  'geography',
  'commercial_applications',
  'english_language',
  'english_literature',
  'telugu',
];

export class GeminiConfigError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class GeminiResponseError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in AI Studio Secrets or environment variables to enable adaptive AI planning.',
      503
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { message: string; statusCode: number; transient: boolean } {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown Gemini error');
  let parsedMessage = raw;
  let code = 502;
  let statusText = '';

  try {
    const startIdx = raw.indexOf('{');
    if (startIdx >= 0) {
      const jsonObj = JSON.parse(raw.slice(startIdx)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (jsonObj?.error?.message) {
        parsedMessage = jsonObj.error.message;
      }
      if (typeof jsonObj?.error?.code === 'number') {
        code = jsonObj.error.code;
      }
      if (typeof jsonObj?.error?.status === 'string') {
        statusText = jsonObj.error.status;
      }
    }
  } catch {
    // Keep raw message if not JSON
  }

  const lower = `${parsedMessage} ${statusText}`.toLowerCase();
  const transient = code === 503 || code === 429 || lower.includes('unavailable') || lower.includes('high demand');

  if (code === 403 || lower.includes('permission_denied')) {
    return {
      message: 'Gemini API access was denied (403). Check your API key in Settings > Secrets.',
      statusCode: 403,
      transient: false,
    };
  }
  if (code === 400 || lower.includes('api_key_invalid')) {
    return {
      message: 'Gemini rejected the request or API key (400). Verify your key in Settings > Secrets.',
      statusCode: 400,
      transient: false,
    };
  }
  if (transient) {
    return {
      message: `Gemini is temporarily busy (${code === 429 ? 'rate limited' : 'high demand'}). Please try again in a moment.`,
      statusCode: 503,
      transient: true,
    };
  }

  return {
    message: parsedMessage,
    statusCode: code >= 400 && code < 600 ? code : 502,
    transient: false,
  };
}

async function callWithRetry<T>(fn: (model: string) => Promise<T>): Promise<T> {
  const attempts: Array<{ model: string; waitMs: number }> = [
    { model: GEMINI_MODEL, waitMs: 2000 },
    { model: GEMINI_FALLBACK_MODEL, waitMs: 3000 },
    { model: GEMINI_FALLBACK_MODEL, waitMs: 0 },
  ];

  let lastInfo: { message: string; statusCode: number; transient: boolean } = {
    message: 'Gemini request failed.',
    statusCode: 502,
    transient: true,
  };

  for (const attempt of attempts) {
    try {
      return await fn(attempt.model);
    } catch (err) {
      lastInfo = formatGeminiError(err);
      if (!lastInfo.transient || attempt.waitMs === 0) {
        throw new GeminiResponseError(lastInfo.message, lastInfo.statusCode);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt.waitMs));
    }
  }

  throw new GeminiResponseError(lastInfo.message, lastInfo.statusCode);
}

function buildSubjectContext(state: AppState, targetDate: string) {
  const activeExams = [...state.exams]
    .filter((e) => e.date >= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      subjectId: e.subjectId,
      subjectName: e.subjectName,
      examDate: e.date,
      daysRemaining: diffDays(e.date, targetDate),
    }));

  const activeSubjectIds = new Set(activeExams.map((e) => e.subjectId));

  // Send compact, accurate candidate chapters per active subject
  const candidateChapters: Array<{
    id: string;
    subjectId: SubjectId;
    name: string;
    status: string;
    difficulty: ChapterDifficulty;
    estimatedMinutes: number | null;
    isWeak: boolean;
    confidence: number | null;
    mistakes: string;
    isSelectedNext: boolean;
  }> = [];

  for (const subjId of activeSubjectIds) {
    const nextId = state.nextTopicBySubject?.[subjId];
    const subjChapters = state.chapters.filter((c) => c.subjectId === subjId);

    // Pick prioritized slice: selected next, weak/needs-revision, in-progress, first 4 not started, and 2 completed for exam prep
    const picked = new Set<string>();
    const addCh = (c: typeof subjChapters[number]) => {
      if (picked.has(c.id)) return;
      picked.add(c.id);
      candidateChapters.push({
        id: c.id,
        subjectId: c.subjectId,
        name: c.chapterName,
        status: c.status,
        difficulty: c.difficulty,
        estimatedMinutes: c.estimatedMinutes,
        isWeak: c.isWeak,
        confidence: c.confidence,
        mistakes: c.mistakes.slice(0, 120),
        isSelectedNext: c.id === nextId,
      });
    };

    if (nextId) {
      const nextCh = subjChapters.find((c) => c.id === nextId);
      if (nextCh) addCh(nextCh);
    }
    subjChapters
      .filter((c) => c.isWeak || c.status === 'Weak' || c.status === 'Needs Revision')
      .slice(0, 4)
      .forEach(addCh);
    subjChapters
      .filter((c) => c.status === 'In Progress')
      .slice(0, 4)
      .forEach(addCh);
    subjChapters
      .filter((c) => c.status === 'Not Started')
      .slice(0, 4)
      .forEach(addCh);
    subjChapters
      .filter((c) => c.status === 'Completed' || c.status === 'Strong')
      .slice(0, 2)
      .forEach(addCh);
  }

  const dueRevisions = state.revisions
    .filter((r) => !r.completed && r.scheduledDate <= addDays(targetDate, 2) && activeSubjectIds.has(r.subjectId))
    .slice(0, 12)
    .map((r) => ({
      revisionId: r.id,
      chapterId: r.chapterId,
      subjectId: r.subjectId,
      chapterName: r.chapterName,
      stage: r.stage,
      scheduledDate: r.scheduledDate,
    }));

  const practiceTopics = state.practiceTopics
    .filter((p) => activeSubjectIds.has(p.subjectId))
    .slice(0, 12)
    .map((p) => ({
      id: p.id,
      subjectId: p.subjectId,
      title: p.title,
      status: p.status,
      practiceCount: p.practiceCount,
    }));

  return { activeExams, candidateChapters, dueRevisions, practiceTopics };
}

export interface GeminiDayPlanResult {
  tasks: StudyTask[];
  whyThisPlan: string;
  remainingBacklog: BacklogNote[];
  violations: string[];
}

export async function generateGeminiDayPlan(
  state: AppState,
  targetDate: string,
  availableMinutes: number
): Promise<GeminiDayPlanResult> {
  const ai = getClient();
  const { activeExams, candidateChapters, dueRevisions, practiceTopics } = buildSubjectContext(
    state,
    targetDate
  );

  const existingPlan = state.plans[targetDate];
  const completedToday = (existingPlan?.tasks ?? [])
    .filter((t) => t.completed)
    .map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      chapterId: t.chapterId,
      title: t.title,
      durationMinutes: t.durationMinutes,
    }));

  const dow = getDayOfWeek(targetDate);
  const rotationPair = state.settings.rotation[dow];

  const promptPayload = {
    targetDate,
    weekday: getWeekdayName(targetDate),
    studyWindow: {
      eveningStart: state.settings.eveningStart,
      eveningEnd: state.settings.eveningEnd,
      availableEveningMinutes: availableMinutes,
      breakMinutes: state.settings.breakMinutes,
      teluguMorningMinutes: state.settings.teluguMorningMinutes,
    },
    weeklyRotationForToday: rotationPair,
    completedTasksAlreadyToday: completedToday,
    activeExams,
    rememberedUpdatesAndTests: (state.aiMemory ?? []).slice(0, 20),
    dueRevisions,
    candidateChapters,
    practiceTopics,
  };

  const systemInstruction = `You are an expert ICSE Class 10 academic planner inside MIDNIGHT.
Propose a realistic, calm, high-impact study plan ONLY for ${targetDate} using ONLY the chapter IDs and subject IDs provided.
Hard rules you MUST obey:
1. Never schedule a subject whose examDate < ${targetDate}.
2. Maximum 1 Mathematics chapter per day/session.
3. Maximum 1 Hard chapter in the evening session.
4. Keep Telugu strictly in blockIndex 0 (morning slot, 45-90 minutes). Never place Telugu in evening blocks.
5. Evening tasks (blockIndex 1, 2) must fit inside availableEveningMinutes (${availableMinutes}m) and end by ${state.settings.eveningEnd}.
6. Respect chapters marked isSelectedNext=true when scheduling that subject.
7. Never assign Completed or Strong chapters as taskType "first_study" (use "exam_prep" or "revision").
8. Respect rememberedUpdatesAndTests: if any remembered test occurs tomorrow (${addDays(targetDate, 1)}) or soon, prioritize its subject and syllabus immediately!
9. Prioritize dueRevisions, Weak/Needs Revision chapters, In Progress work (like Trigonometry), and upcoming exams while rotating subjects cleanly.
10. If work exceeds availableEveningMinutes, put overflow in remainingBacklog rather than stuffing extra tasks.`;

  const response = await callWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify(promptPayload),
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            whyThisPlan: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence explanation of why these subjects and chapters were chosen today.',
            },
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subjectId: { type: Type.STRING },
                  chapterId: { type: Type.STRING },
                  practiceTopicId: { type: Type.STRING },
                  revisionId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  durationMinutes: { type: Type.NUMBER },
                  blockIndex: { type: Type.NUMBER },
                  taskType: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['subjectId', 'title', 'objective', 'durationMinutes', 'blockIndex', 'taskType', 'reason'],
              },
            },
            remainingBacklog: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subjectId: { type: Type.STRING },
                  chapterId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  remainingMinutes: { type: Type.NUMBER },
                },
                required: ['subjectId', 'title', 'reason'],
              },
            },
          },
          required: ['whyThisPlan', 'tasks', 'remainingBacklog'],
        },
      },
    })
  );

  const text = response.text;
  if (!text) {
    throw new GeminiResponseError('Gemini returned an empty response for day planning.');
  }

  let parsed: {
    whyThisPlan?: string;
    tasks?: Array<{
      subjectId: string;
      chapterId?: string;
      practiceTopicId?: string;
      revisionId?: string;
      title: string;
      objective: string;
      durationMinutes: number;
      blockIndex: number;
      taskType: string;
      reason?: string;
    }>;
    remainingBacklog?: BacklogNote[];
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiResponseError('Gemini returned malformed JSON that could not be parsed.');
  }

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new GeminiResponseError('Gemini returned an empty task schedule.', 422);
  }

  const chapterMap = new Map(state.chapters.map((c) => [c.id, c]));
  const validTaskTypes = new Set<TaskType>([
    'first_study',
    'revision',
    'practice',
    'exam_prep',
    'custom',
  ]);

  const candidateTasks: StudyTask[] = parsed.tasks.map((t, idx) => {
    const ch = t.chapterId ? chapterMap.get(t.chapterId) : undefined;
    const subjId = normalizeSubjectId(t.subjectId, t.chapterId) ?? (t.subjectId as SubjectId);
    const taskType: TaskType = validTaskTypes.has(t.taskType as TaskType)
      ? (t.taskType as TaskType)
      : 'first_study';
    return {
      id: `ai-${targetDate}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId: subjId,
      chapterId: ch ? ch.id : undefined,
      practiceTopicId: t.practiceTopicId || undefined,
      revisionId: t.revisionId || undefined,
      title: ch ? `${ch.id} · ${ch.chapterName}` : t.title,
      objective: t.objective || 'Focused study & past-paper practice',
      durationMinutes: Number(t.durationMinutes) || 60,
      timeSlot: t.blockIndex === 0 ? '07:30–08:30' : '17:30–18:45',
      blockIndex: Number.isFinite(t.blockIndex) ? t.blockIndex : 1,
      taskType,
      completed: false,
      completedAt: null,
      originalDate: targetDate,
      scheduledDate: targetDate,
      carriedForward: false,
      difficulty: ch?.difficulty ?? 'Medium',
      aiReason: t.reason,
    };
  });

  const validated = validateAndConstrainDayTasks(
    candidateTasks,
    state,
    targetDate,
    availableMinutes
  );

  if (validated.tasks.length === 0) {
    throw new GeminiResponseError(
      'Gemini proposals violated scheduling constraints (e.g. past exam or unknown chapters) and yielded no valid tasks.',
      422
    );
  }

  return {
    tasks: validated.tasks,
    whyThisPlan: parsed.whyThisPlan || 'Generated by Gemini based on exam urgency and chapter readiness.',
    remainingBacklog: [...(parsed.remainingBacklog ?? []), ...validated.remainingBacklog],
    violations: validated.violations,
  };
}

export interface GeminiRecoveryResult {
  suggestions: RecoverySuggestion[];
  whyThisRecovery: string;
  remainingBacklogCount: number;
}

export async function generateGeminiRecoveryPlan(
  state: AppState,
  activeDate: string,
  missedTasks: StudyTask[],
  overdueRevisions: Array<{
    id: string;
    chapterId: string;
    subjectId: SubjectId;
    chapterName: string;
    stage: string;
    originalDueDate: string;
  }>
): Promise<GeminiRecoveryResult> {
  const ai = getClient();

  const activeExams = state.exams
    .filter((e) => e.date >= activeDate)
    .map((e) => ({
      subjectId: e.subjectId,
      subjectName: e.subjectName,
      date: e.date,
      daysRemaining: diffDays(e.date, activeDate),
    }));

  const upcomingWindowDates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(activeDate, i);
    const plan = state.plans[d];
    return {
      date: d,
      weekday: getWeekdayName(d),
      availableMinutes: plan?.availableMinutes ?? state.settings.blockDurationMinutes * 2,
      existingTaskCount: plan?.tasks.length ?? 0,
    };
  });

  const promptPayload = {
    activeDate,
    upcomingWindowDates,
    activeExams,
    rememberedUpdatesAndTests: (state.aiMemory ?? []).slice(0, 20),
    missedTasks: missedTasks.slice(0, 20).map((t) => ({
      sourceTaskId: t.id,
      subjectId: t.subjectId,
      chapterId: t.chapterId,
      title: t.title,
      objective: t.objective,
      originalDate: t.originalDate,
      durationMinutes: t.durationMinutes,
      difficulty: t.difficulty,
    })),
    overdueRevisions: overdueRevisions.slice(0, 15).map((r) => ({
      sourceRevisionId: r.id,
      subjectId: r.subjectId,
      chapterId: r.chapterId,
      chapterName: r.chapterName,
      stage: r.stage,
      originalDueDate: r.originalDueDate,
    })),
  };

  const response = await callWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify(promptPayload),
      config: {
        systemInstruction: `You are helping a Class 10 ICSE student recover missed study tasks and overdue revisions starting on ${activeDate}.
Rules:
1. Never assign a task after its subject's exam date.
2. Never overload one day: spread work across upcomingWindowDates, recommend splitRecommended=true for heavy/long blocks when needed.
3. Preserve originalDate / originalDueDate accurately.
4. Explain priorities briefly in whyThisRecovery and per-item reason.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            whyThisRecovery: { type: Type.STRING },
            remainingBacklogCount: { type: Type.NUMBER },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sourceTaskId: { type: Type.STRING },
                  sourceRevisionId: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  subjectId: { type: Type.STRING },
                  chapterId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  originalDate: { type: Type.STRING },
                  suggestedDate: { type: Type.STRING },
                  durationMinutes: { type: Type.NUMBER },
                  splitRecommended: { type: Type.BOOLEAN },
                  priorityScore: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                },
                required: [
                  'kind',
                  'subjectId',
                  'title',
                  'objective',
                  'originalDate',
                  'suggestedDate',
                  'durationMinutes',
                  'splitRecommended',
                  'reason',
                ],
              },
            },
          },
          required: ['whyThisRecovery', 'suggestions', 'remainingBacklogCount'],
        },
      },
    })
  );

  const text = response.text;
  if (!text) {
    throw new GeminiResponseError('Gemini returned an empty recovery response.');
  }

  let parsed: {
    whyThisRecovery?: string;
    remainingBacklogCount?: number;
    suggestions?: Array<Partial<RecoverySuggestion>>;
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiResponseError('Gemini returned malformed recovery JSON.');
  }

  if (!Array.isArray(parsed.suggestions)) {
    throw new GeminiResponseError('Gemini recovery output lacked suggestions array.', 422);
  }

  const examMap = new Map(state.exams.map((e) => [e.subjectId, e]));
  const validSuggestions: RecoverySuggestion[] = [];

  for (let i = 0; i < parsed.suggestions.length; i++) {
    const s = parsed.suggestions[i];
    const subjId = normalizeSubjectId(s.subjectId, s.chapterId);
    if (!subjId || !s.title || !s.suggestedDate || !s.originalDate) continue;
    const exam = examMap.get(subjId);
    if (exam && s.suggestedDate > exam.date) continue;
    if (s.suggestedDate < activeDate) continue;

    validSuggestions.push({
      id: `ai-rec-${i}-${Math.random().toString(36).slice(2, 6)}`,
      sourceTaskId: s.sourceTaskId,
      sourceRevisionId: s.sourceRevisionId,
      kind: s.kind === 'revision' ? 'revision' : 'task',
      subjectId: subjId,
      chapterId: s.chapterId,
      title: s.title,
      objective: s.objective || 'Recovery focus block',
      originalDate: s.originalDate,
      suggestedDate: s.suggestedDate,
      durationMinutes: Math.max(20, Math.min(120, Number(s.durationMinutes) || 45)),
      splitRecommended: Boolean(s.splitRecommended),
      priorityScore: Number(s.priorityScore) || 80,
      reason: s.reason || `Missed from ${s.originalDate}`,
      difficulty:
        s.difficulty === 'Easy' || s.difficulty === 'Medium' || s.difficulty === 'Hard'
          ? s.difficulty
          : 'Medium',
    });
  }

  return {
    suggestions: validSuggestions,
    whyThisRecovery:
      parsed.whyThisRecovery ||
      'Prioritized by exam proximity and spaced-revision urgency without overloading a single session.',
    remainingBacklogCount: Math.max(0, Number(parsed.remainingBacklogCount) || 0),
  };
}

export interface GeminiScheduleChatResult {
  assistantMessage: string;
  isOutOfScope: boolean;
  operations: ScheduleOperation[];
}

export async function chatScheduleWithGemini(
  state: AppState,
  activeDate: string,
  history: ScheduleChatTurn[],
  userMessage: string
): Promise<GeminiScheduleChatResult> {
  const ai = getClient();
  const { activeExams, candidateChapters, dueRevisions } = buildSubjectContext(state, activeDate);

  // Summarize schedule from activeDate - 1 through activeDate + 10
  const scheduleDays = Array.from({ length: 12 }, (_, idx) => {
    const date = addDays(activeDate, idx - 1);
    const plan = state.plans[date];
    return {
      date,
      weekday: getWeekdayName(date),
      availableMinutes: plan?.availableMinutes ?? state.settings.blockDurationMinutes * 2,
      tasks: (plan?.tasks ?? []).map((t) => ({
        id: t.id,
        subjectId: t.subjectId,
        chapterId: t.chapterId,
        title: t.title,
        objective: t.objective,
        durationMinutes: t.durationMinutes,
        timeSlot: t.timeSlot,
        blockIndex: t.blockIndex,
        taskType: t.taskType,
        completed: t.completed,
      })),
    };
  });

  const contextPayload = {
    activeDate,
    weekday: getWeekdayName(activeDate),
    settings: {
      eveningStart: state.settings.eveningStart,
      eveningEnd: state.settings.eveningEnd,
      blockDurationMinutes: state.settings.blockDurationMinutes,
      breakMinutes: state.settings.breakMinutes,
      teluguMorningMinutes: state.settings.teluguMorningMinutes,
    },
    nextTopicBySubject: state.nextTopicBySubject,
    savedMemory: (state.aiMemory ?? []).map((m) => ({
      id: m.id,
      category: m.category,
      content: m.content,
      subjectId: m.subjectId,
      testDate: m.testDate,
      prepDate: m.prepDate,
      syllabus: m.syllabus,
    })),
    activeExams,
    scheduleDays,
    dueRevisions,
    candidateChapters,
    recentConversation: history.slice(-8),
    latestUserRequest: userMessage,
  };

  const systemInstruction = `You are MIDNIGHT AI — the complete, personal academic copilot, syllabus tracker, and study planner for an ICSE Class 10 student (Pre-Final exams: 09–21 Dec 2026, baseline date: ${activeDate}).

CORE CAPABILITIES & EXPANDED SCOPE:
1. FULL STUDY COMPANION & TUTOR:
   - You are NEVER limited to scheduling only. Answer academic study questions, concept explanations (e.g. Physics formulas, Chemistry reactions, Biology processes, Math proofs, English literature themes), review mistakes, give exam strategy, and test the student directly in assistantMessage.
   - If the student asks an academic question, concept explanation, or study query, answer it thoroughly, clearly, and concisely in assistantMessage. Set isOutOfScope=false. (Only set isOutOfScope=true for malicious, abusive, or totally nonsensical inputs).

2. CHATGPT & EXTERNAL STUDY PROGRESS IMPORTER:
   - The student frequently pastes long chat histories, notes, or progress summaries from ChatGPT or other tools.
   - Read and parse all completed chapters, in-progress chapters, weak areas, mistakes, and upcoming test announcements from any pasted text!
   - Populate "chapterUpdates" for every chapter mentioned (setting status to 'Completed', 'In Progress', 'Weak', 'Needs Revision', or 'Strong', along with confidence, mistakes, and notes).
   - If upcoming tests or school exams are mentioned in the pasted text, populate "memoryUpdates" (category="test") AND "testPrepBlocks" to schedule 1-day-before prep.
   - If study constraints or daily limits are mentioned (e.g. "Wednesdays 90m max"), populate "memoryUpdates" AND emit operations right away!

3. SUB-CHAPTER / PART-LEVEL TRACKING (PARTS A, B, C, D):
   - When the student says e.g. "I only completed part A and part B of [chapter], parts C and D are left, schedule the rest tomorrow":
     a) Put this in "chapterUpdates" with status="In Progress", completedParts=["Part A", "Part B"], remainingParts=["Part C", "Part D"], and scheduleRemainingDate=(tomorrow or requested date).
     b) In "operations", add an "add_task" or schedule operation for the remaining parts on that date (title: "[Chapter ID] · [Name] (Parts C & D)").

4. DYNAMIC AD-HOC SCHEDULE DISRUPTIONS:
   - If the student mentions an ad-hoc commitment (e.g. "Tomorrow school meeting at 6 PM", "Tired tonight, shorten session to 45m", "Dentist appointment on Thursday"):
     a) Immediately adjust the day's window ("update_day_window") or move open tasks to tomorrow/weekend ("move_task" / "replace_day_plan").
     b) Save the time constraint into "memoryUpdates".

5. UPCOMING TESTS & 1-DAY-BEFORE PREP:
   - For ANY announced test date (e.g. "Physics test on 28 Nov"):
     a) "memoryUpdates": save test with testDate and prepDate (1 day before testDate).
     b) "testPrepBlocks": schedule dedicated prep block 1 day before testDate.

6. SCHEDULING HARD RULES:
   - Never schedule a subject after its Pre-Final examDate, and never schedule on dates < ${activeDate}.
   - Max 1 Math chapter per evening session.
   - Max 1 Hard chapter per evening session.
   - Keep Telugu in blockIndex 0 (morning slot, 45-90m), never evening.
   - Preserve completed tasks (completed=true).

7. CONTRACT:
   - Clearly explain in assistantMessage everything you did (chapters updated, tests scheduled, prep blocks placed, constraints saved, concepts explained).
   - Always populate the structured arrays (chapterUpdates, memoryUpdates, testPrepBlocks, operations) whenever making changes!`;

  const response = await callWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: JSON.stringify(contextPayload),
      config: {
        ...(model === GEMINI_MODEL ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            assistantMessage: {
              type: Type.STRING,
              description: 'Clear, concise, and helpful response explaining actions taken, concepts taught, or changes made.',
            },
            isOutOfScope: {
              type: Type.BOOLEAN,
              description: 'True only if the request is harmful or completely nonsensical spam.',
            },
            chapterUpdates: {
              type: Type.ARRAY,
              description: 'Chapter status, completion, and sub-part (Parts A, B, C, D) progress updates.',
              items: {
                type: Type.OBJECT,
                properties: {
                  chapterId: { type: Type.STRING, description: 'Chapter code like MAT-22, PHY-08, CHE-03 or chapter name' },
                  subjectId: {
                    type: Type.STRING,
                    enum: CANONICAL_SUBJECT_IDS,
                    description: 'Canonical lowercase subjectId.',
                  },
                  status: {
                    type: Type.STRING,
                    enum: ['Completed', 'In Progress', 'Weak', 'Strong', 'Needs Revision', 'Not Started'],
                  },
                  completedParts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Parts finished, e.g. ["Part A", "Part B"]',
                  },
                  remainingParts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Parts left, e.g. ["Part C", "Part D"]',
                  },
                  scheduleRemainingDate: { type: Type.STRING, description: 'Optional date YYYY-MM-DD to schedule remaining parts' },
                  durationMinutes: { type: Type.NUMBER },
                  isWeak: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                  mistakes: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['chapterId', 'status', 'summary'],
              },
            },
            memoryUpdates: {
              type: Type.ARRAY,
              description: 'Persistent memories to save or remove (upcoming tests, daily updates, recurring time preferences).',
              items: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING, enum: ['save', 'remove'] },
                  memoryId: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ['test', 'daily_update', 'preference'] },
                  content: { type: Type.STRING },
                  subjectId: {
                    type: Type.STRING,
                    enum: CANONICAL_SUBJECT_IDS,
                    description: 'Canonical lowercase subjectId.',
                  },
                  testDate: { type: Type.STRING },
                  prepDate: { type: Type.STRING },
                  syllabus: { type: Type.STRING },
                  matchText: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['action', 'category', 'content', 'summary'],
              },
            },
            testPrepBlocks: {
              type: Type.ARRAY,
              description: 'Dedicated test preparation blocks to schedule 1 day before each announced testDate.',
              items: {
                type: Type.OBJECT,
                properties: {
                  subjectId: {
                    type: Type.STRING,
                    enum: CANONICAL_SUBJECT_IDS,
                    description: 'Canonical lowercase subjectId.',
                  },
                  testDate: { type: Type.STRING },
                  syllabus: { type: Type.STRING },
                  chapterId: { type: Type.STRING },
                  durationMinutes: { type: Type.NUMBER },
                  summary: { type: Type.STRING },
                },
                required: ['subjectId', 'testDate', 'syllabus', 'summary'],
              },
            },
            operations: {
              type: Type.ARRAY,
              description: 'Direct edits to study days, windows, or settings.',
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    enum: [
                      'replace_day_plan',
                      'add_task',
                      'move_task',
                      'remove_task',
                      'update_day_window',
                      'update_settings',
                      'set_next_topic',
                      'update_chapter_progress',
                    ],
                    description: 'Exact operation type name.',
                  },
                  date: { type: Type.STRING },
                  fromDate: { type: Type.STRING },
                  toDate: { type: Type.STRING },
                  taskId: { type: Type.STRING },
                  matchTitle: { type: Type.STRING },
                  subjectId: {
                    type: Type.STRING,
                    enum: CANONICAL_SUBJECT_IDS,
                    description: 'Canonical lowercase subjectId.',
                  },
                  chapterId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  objective: { type: Type.STRING },
                  durationMinutes: { type: Type.NUMBER },
                  blockIndex: { type: Type.NUMBER },
                  taskType: { type: Type.STRING },
                  availableMinutes: { type: Type.NUMBER },
                  eveningStart: { type: Type.STRING },
                  eveningEnd: { type: Type.STRING },
                  blockDurationMinutes: { type: Type.NUMBER },
                  breakMinutes: { type: Type.NUMBER },
                  teluguMorningMinutes: { type: Type.NUMBER },
                  summary: { type: Type.STRING },
                  tasks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectId: {
                          type: Type.STRING,
                          enum: CANONICAL_SUBJECT_IDS,
                          description: 'Canonical lowercase subjectId.',
                        },
                        chapterId: { type: Type.STRING },
                        title: { type: Type.STRING },
                        objective: { type: Type.STRING },
                        durationMinutes: { type: Type.NUMBER },
                        blockIndex: { type: Type.NUMBER },
                        taskType: { type: Type.STRING },
                        reason: { type: Type.STRING },
                      },
                      required: [
                        'subjectId',
                        'title',
                        'objective',
                        'durationMinutes',
                        'blockIndex',
                        'taskType',
                      ],
                    },
                  },
                },
                required: ['type', 'summary'],
              },
            },
          },
          required: ['assistantMessage', 'isOutOfScope', 'chapterUpdates', 'memoryUpdates', 'testPrepBlocks', 'operations'],
        },
      },
    })
  );

  const text = response.text;
  if (!text) {
    throw new GeminiResponseError('Gemini returned an empty schedule chat response.');
  }

  let parsed: {
    assistantMessage?: string;
    isOutOfScope?: boolean;
    chapterUpdates?: Array<Record<string, unknown>>;
    memoryUpdates?: Array<Record<string, unknown>>;
    testPrepBlocks?: Array<Record<string, unknown>>;
    operations?: Array<Record<string, unknown>>;
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiResponseError('Gemini returned malformed JSON for schedule chat.');
  }

  const isOutOfScope = Boolean(parsed.isOutOfScope);
  const rawChapterUpdates =
    isOutOfScope || !Array.isArray(parsed.chapterUpdates) ? [] : parsed.chapterUpdates;
  const rawMemory = isOutOfScope || !Array.isArray(parsed.memoryUpdates) ? [] : parsed.memoryUpdates;
  const rawTestPreps =
    isOutOfScope || !Array.isArray(parsed.testPrepBlocks) ? [] : parsed.testPrepBlocks;
  const rawOps = isOutOfScope || !Array.isArray(parsed.operations) ? [] : parsed.operations;
  const operations: ScheduleOperation[] = [];

  for (const cu of rawChapterUpdates) {
    if (!cu || typeof cu !== 'object') continue;
    if (typeof cu.chapterId === 'string' && typeof cu.status === 'string') {
      const summary =
        typeof cu.summary === 'string' && cu.summary.trim()
          ? cu.summary.trim()
          : `Updated ${cu.chapterId} progress`;
      operations.push({
        type: 'update_chapter_progress',
        chapterId: cu.chapterId,
        subjectId:
          typeof cu.subjectId === 'string'
            ? normalizeSubjectId(cu.subjectId, cu.chapterId)
            : normalizeSubjectId(undefined, cu.chapterId),
        status: cu.status as ChapterItem['status'],
        completedParts: Array.isArray(cu.completedParts)
          ? cu.completedParts.map(String)
          : undefined,
        remainingParts: Array.isArray(cu.remainingParts)
          ? cu.remainingParts.map(String)
          : undefined,
        scheduleRemainingDate:
          typeof cu.scheduleRemainingDate === 'string' ? cu.scheduleRemainingDate : undefined,
        durationMinutes:
          typeof cu.durationMinutes === 'number' ? cu.durationMinutes : undefined,
        isWeak: typeof cu.isWeak === 'boolean' ? cu.isWeak : undefined,
        confidence: typeof cu.confidence === 'number' ? cu.confidence : undefined,
        mistakes: typeof cu.mistakes === 'string' ? cu.mistakes : undefined,
        notes: typeof cu.notes === 'string' ? cu.notes : undefined,
        summary,
      });
    }
  }

  for (const mem of rawMemory) {
    if (!mem || typeof mem !== 'object') continue;
    const summary =
      typeof mem.summary === 'string' && mem.summary.trim() ? mem.summary.trim() : 'Updated memory';
    if (mem.action === 'remove') {
      operations.push({
        type: 'remove_memory',
        memoryId: typeof mem.memoryId === 'string' ? mem.memoryId : undefined,
        matchText:
          typeof mem.matchText === 'string'
            ? mem.matchText
            : typeof mem.content === 'string'
              ? mem.content
              : undefined,
        summary,
      });
    } else if (typeof mem.content === 'string' && mem.content.trim()) {
      const cat: AiMemoryCategory =
        mem.category === 'test' || mem.category === 'daily_update' || mem.category === 'preference'
          ? mem.category
          : 'daily_update';
      const normalizedMemSubj = normalizeSubjectId(
        typeof mem.subjectId === 'string' ? mem.subjectId : undefined
      );
      operations.push({
        type: 'save_memory',
        memoryId: typeof mem.memoryId === 'string' ? mem.memoryId : undefined,
        category: cat,
        content: mem.content.trim(),
        subjectId: normalizedMemSubj,
        testDate: typeof mem.testDate === 'string' ? mem.testDate : undefined,
        prepDate: typeof mem.prepDate === 'string' ? mem.prepDate : undefined,
        syllabus: typeof mem.syllabus === 'string' ? mem.syllabus : undefined,
        summary,
      });
    }
  }

  for (const tp of rawTestPreps) {
    if (!tp || typeof tp !== 'object') continue;
    const chapterId = typeof tp.chapterId === 'string' ? tp.chapterId : undefined;
    const subjId = normalizeSubjectId(
      typeof tp.subjectId === 'string' ? tp.subjectId : undefined,
      chapterId
    );
    if (typeof tp.testDate === 'string' && subjId) {
      const summary =
        typeof tp.summary === 'string' && tp.summary.trim()
          ? tp.summary.trim()
          : 'Schedule 1-day-before test prep';
      operations.push({
        type: 'schedule_test_prep',
        testDate: tp.testDate,
        subjectId: subjId,
        syllabus:
          typeof tp.syllabus === 'string' && tp.syllabus.trim()
            ? tp.syllabus.trim()
            : 'Test preparation',
        chapterId,
        durationMinutes: typeof tp.durationMinutes === 'number' ? tp.durationMinutes : undefined,
        summary,
      });
    }
  }

  for (const raw of rawOps) {
    if (!raw || typeof raw !== 'object') continue;
    const type = String(raw.type || '');
    const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Updated schedule';

    if (type === 'replace_day_plan' && typeof raw.date === 'string' && Array.isArray(raw.tasks)) {
      const mappedTasks = (raw.tasks as Array<Record<string, unknown>>)
        .map((t) => {
          const chId = typeof t.chapterId === 'string' ? t.chapterId : undefined;
          const normSubj = normalizeSubjectId(
            typeof t.subjectId === 'string' ? t.subjectId : undefined,
            chId
          );
          if (!normSubj) return null;
          return {
            subjectId: normSubj,
            chapterId: chId,
            title: typeof t.title === 'string' ? t.title : 'Study Block',
            objective: typeof t.objective === 'string' ? t.objective : 'Focused study',
            durationMinutes: typeof t.durationMinutes === 'number' ? t.durationMinutes : 60,
            blockIndex: typeof t.blockIndex === 'number' ? t.blockIndex : 1,
            taskType: (typeof t.taskType === 'string' ? t.taskType : 'first_study') as TaskType,
            reason: typeof t.reason === 'string' ? t.reason : undefined,
          };
        })
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
      operations.push({
        type: 'replace_day_plan',
        date: raw.date,
        availableMinutes: typeof raw.availableMinutes === 'number' ? raw.availableMinutes : undefined,
        tasks: mappedTasks,
        summary,
      });
    } else if (type === 'add_task' && typeof raw.date === 'string') {
      const chId = typeof raw.chapterId === 'string' ? raw.chapterId : undefined;
      const normSubj = normalizeSubjectId(
        typeof raw.subjectId === 'string' ? raw.subjectId : undefined,
        chId
      );
      if (normSubj) {
        operations.push({
          type: 'add_task',
          date: raw.date,
          subjectId: normSubj,
          chapterId: chId,
          title: typeof raw.title === 'string' ? raw.title : 'Study Block',
          objective: typeof raw.objective === 'string' ? raw.objective : 'Focused study',
          durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : 60,
          blockIndex: typeof raw.blockIndex === 'number' ? raw.blockIndex : 1,
          taskType: (typeof raw.taskType === 'string' ? raw.taskType : 'first_study') as TaskType,
          summary,
        });
      }
    } else if (type === 'move_task' && typeof raw.fromDate === 'string' && typeof raw.toDate === 'string') {
      operations.push({
        type: 'move_task',
        fromDate: raw.fromDate,
        toDate: raw.toDate,
        taskId: typeof raw.taskId === 'string' ? raw.taskId : undefined,
        matchTitle: typeof raw.matchTitle === 'string' ? raw.matchTitle : undefined,
        blockIndex: typeof raw.blockIndex === 'number' ? raw.blockIndex : undefined,
        summary,
      });
    } else if (type === 'remove_task' && typeof raw.date === 'string') {
      operations.push({
        type: 'remove_task',
        date: raw.date,
        taskId: typeof raw.taskId === 'string' ? raw.taskId : undefined,
        matchTitle: typeof raw.matchTitle === 'string' ? raw.matchTitle : undefined,
        summary,
      });
    } else if (type === 'update_day_window' && typeof raw.date === 'string' && typeof raw.availableMinutes === 'number') {
      operations.push({
        type: 'update_day_window',
        date: raw.date,
        availableMinutes: raw.availableMinutes,
        summary,
      });
    } else if (type === 'update_settings') {
      operations.push({
        type: 'update_settings',
        eveningStart: typeof raw.eveningStart === 'string' ? raw.eveningStart : undefined,
        eveningEnd: typeof raw.eveningEnd === 'string' ? raw.eveningEnd : undefined,
        blockDurationMinutes:
          typeof raw.blockDurationMinutes === 'number' ? raw.blockDurationMinutes : undefined,
        breakMinutes: typeof raw.breakMinutes === 'number' ? raw.breakMinutes : undefined,
        teluguMorningMinutes:
          typeof raw.teluguMorningMinutes === 'number' ? raw.teluguMorningMinutes : undefined,
        summary,
      });
    } else if (type === 'set_next_topic' && typeof raw.chapterId === 'string') {
      const normSubj = normalizeSubjectId(
        typeof raw.subjectId === 'string' ? raw.subjectId : undefined,
        raw.chapterId
      );
      if (normSubj) {
        operations.push({
          type: 'set_next_topic',
          subjectId: normSubj,
          chapterId: raw.chapterId,
          summary,
        });
      }
    } else if (type === 'save_memory' && typeof raw.content === 'string') {
      const cat: AiMemoryCategory =
        raw.category === 'test' || raw.category === 'daily_update' || raw.category === 'preference'
          ? raw.category
          : 'daily_update';
      operations.push({
        type: 'save_memory',
        memoryId: typeof raw.memoryId === 'string' ? raw.memoryId : undefined,
        category: cat,
        content: raw.content,
        subjectId: normalizeSubjectId(
          typeof raw.subjectId === 'string' ? raw.subjectId : undefined
        ),
        testDate: typeof raw.testDate === 'string' ? raw.testDate : undefined,
        prepDate: typeof raw.prepDate === 'string' ? raw.prepDate : undefined,
        syllabus: typeof raw.syllabus === 'string' ? raw.syllabus : undefined,
        summary,
      });
    } else if (type === 'remove_memory') {
      operations.push({
        type: 'remove_memory',
        memoryId: typeof raw.memoryId === 'string' ? raw.memoryId : undefined,
        matchText: typeof raw.matchText === 'string' ? raw.matchText : undefined,
        summary,
      });
    } else if (
      type === 'schedule_test_prep' &&
      (typeof raw.testDate === 'string' || typeof raw.date === 'string')
    ) {
      const chId = typeof raw.chapterId === 'string' ? raw.chapterId : undefined;
      const normSubj = normalizeSubjectId(
        typeof raw.subjectId === 'string' ? raw.subjectId : undefined,
        chId
      );
      if (normSubj) {
        const testDateVal = typeof raw.testDate === 'string' ? raw.testDate : (raw.date as string);
        const syllabusVal =
          typeof raw.syllabus === 'string'
            ? raw.syllabus
            : typeof raw.title === 'string'
              ? raw.title
              : typeof raw.content === 'string'
                ? raw.content
                : 'Test preparation';
        operations.push({
          type: 'schedule_test_prep',
          testDate: testDateVal,
          subjectId: normSubj,
          syllabus: syllabusVal,
          chapterId: chId,
          durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : undefined,
          summary,
        });
      }
    } else if (type === 'update_chapter_progress' && typeof raw.chapterId === 'string') {
      operations.push({
        type: 'update_chapter_progress',
        chapterId: raw.chapterId,
        subjectId: typeof raw.subjectId === 'string' ? normalizeSubjectId(raw.subjectId, raw.chapterId) : undefined,
        status: typeof raw.status === 'string' ? (raw.status as ChapterItem['status']) : undefined,
        completedParts: Array.isArray(raw.completedParts) ? raw.completedParts.map(String) : undefined,
        remainingParts: Array.isArray(raw.remainingParts) ? raw.remainingParts.map(String) : undefined,
        scheduleRemainingDate: typeof raw.scheduleRemainingDate === 'string' ? raw.scheduleRemainingDate : undefined,
        durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : undefined,
        isWeak: typeof raw.isWeak === 'boolean' ? raw.isWeak : undefined,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
        mistakes: typeof raw.mistakes === 'string' ? raw.mistakes : undefined,
        notes: typeof raw.notes === 'string' ? raw.notes : undefined,
        summary,
      });
    }
  }

  return {
    assistantMessage:
      parsed.assistantMessage ||
      (isOutOfScope
        ? 'Please provide study, syllabus, or planning questions for your ICSE Class 10 preparation.'
        : 'Study plan and syllabus review complete.'),
    isOutOfScope,
    operations,
  };
}
