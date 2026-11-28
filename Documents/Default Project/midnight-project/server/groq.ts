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

export const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqConfigError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class GroqResponseError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new GroqConfigError(
      'GROQ_API_KEY is not configured on the server. Add GROQ_API_KEY in Render environment variables.',
      503
    );
  }
  return apiKey;
}

function parseJsonResponse<T>(raw: string, label: string): T {
  let jsonText = raw.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new GroqResponseError(`AI returned malformed JSON for ${label}.`, 502);
  }
}

async function callGroqJson<T>(
  systemInstruction: string,
  userContent: string,
  label: string,
  maxTokens = 3000
): Promise<T> {
  const apiKey = getGroqApiKey();
  const attempts = [
    { model: GROQ_MODEL, waitMs: 1500 },
    { model: GROQ_FALLBACK_MODEL, waitMs: 2000 },
    { model: GROQ_FALLBACK_MODEL, waitMs: 0 },
  ];

  let lastError = new GroqResponseError('AI request failed.', 502);

  for (const attempt of attempts) {
    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: attempt.model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userContent },
          ],
          temperature: 0.4,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        const transient = res.status === 429 || res.status === 404 || res.status >= 500;
        if (res.status === 401 || res.status === 403) {
          throw new GroqResponseError(
            'Groq API key was rejected. Check GROQ_API_KEY in Render environment variables.',
            res.status
          );
        }
        const msg = transient
          ? `AI service is temporarily busy (${res.status}). Please try again in a moment.`
          : `Groq API error (${res.status}): ${errorText.slice(0, 200)}`;
        lastError = new GroqResponseError(msg, transient ? 503 : res.status);
        if (!transient || attempt.waitMs === 0) {
          throw lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt.waitMs));
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new GroqResponseError(`AI returned an empty response for ${label}.`, 502);
      }
      return parseJsonResponse<T>(content, label);
    } catch (err) {
      if (err instanceof GroqResponseError && err.statusCode !== 503) {
        throw err;
      }
      lastError =
        err instanceof GroqResponseError
          ? err
          : new GroqResponseError(err instanceof Error ? err.message : 'Unexpected AI error.', 502);
      if (attempt.waitMs === 0) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt.waitMs));
    }
  }

  throw lastError;
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
    const picked = new Set<string>();
    const addCh = (c: (typeof subjChapters)[number]) => {
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
    subjChapters.filter((c) => c.status === 'In Progress').slice(0, 4).forEach(addCh);
    subjChapters.filter((c) => c.status === 'Not Started').slice(0, 4).forEach(addCh);
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

export async function generateGroqDayPlan(
  state: AppState,
  targetDate: string,
  availableMinutes: number
): Promise<{
  tasks: StudyTask[];
  whyThisPlan: string;
  remainingBacklog: BacklogNote[];
  violations: string[];
}> {
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
9. Prioritize dueRevisions, Weak/Needs Revision chapters, In Progress work, and upcoming exams while rotating subjects cleanly.
10. If work exceeds availableEveningMinutes, put overflow in remainingBacklog rather than stuffing extra tasks.

Return ONLY valid JSON with this exact structure:
{
  "whyThisPlan": "Concise 1-2 sentence explanation",
  "tasks": [
    {
      "subjectId": "canonical lowercase subjectId",
      "chapterId": "optional chapterId from candidateChapters",
      "practiceTopicId": "optional",
      "revisionId": "optional",
      "title": "string",
      "objective": "string",
      "durationMinutes": number,
      "blockIndex": 0 | 1 | 2,
      "taskType": "first_study" | "revision" | "practice" | "exam_prep" | "custom",
      "reason": "string"
    }
  ],
  "remainingBacklog": [
    {
      "subjectId": "string",
      "chapterId": "optional string",
      "title": "string",
      "reason": "string",
      "remainingMinutes": number
    }
  ]
}`;

  const parsed = await callGroqJson<{
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
  }>(systemInstruction, JSON.stringify(promptPayload), 'day planning');

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new GroqResponseError('AI returned an empty task schedule.', 422);
  }

  const chapterMap = new Map(state.chapters.map((c) => [c.id, c]));
  const validTaskTypes = new Set<TaskType>(['first_study', 'revision', 'practice', 'exam_prep', 'custom']);

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

  const validated = validateAndConstrainDayTasks(candidateTasks, state, targetDate, availableMinutes);

  if (validated.tasks.length === 0) {
    throw new GroqResponseError(
      'AI proposals violated scheduling constraints (e.g. past exam or unknown chapters) and yielded no valid tasks.',
      422
    );
  }

  return {
    tasks: validated.tasks,
    whyThisPlan: parsed.whyThisPlan || 'Generated by MIDNIGHT AI based on exam urgency and chapter readiness.',
    remainingBacklog: [...(parsed.remainingBacklog ?? []), ...validated.remainingBacklog],
    violations: validated.violations,
  };
}

export async function generateGroqRecoveryPlan(
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
): Promise<{
  suggestions: RecoverySuggestion[];
  whyThisRecovery: string;
  remainingBacklogCount: number;
}> {
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

  const systemInstruction = `You are helping a Class 10 ICSE student recover missed study tasks and overdue revisions starting on ${activeDate}.
Rules:
1. Never assign a task after its subject's exam date.
2. Never overload one day: spread work across upcomingWindowDates, recommend splitRecommended=true for heavy/long blocks when needed.
3. Preserve originalDate / originalDueDate accurately.
4. Explain priorities briefly in whyThisRecovery and per-item reason.

Return ONLY valid JSON:
{
  "whyThisRecovery": "string",
  "remainingBacklogCount": number,
  "suggestions": [
    {
      "sourceTaskId": "optional string",
      "sourceRevisionId": "optional string",
      "kind": "task" | "revision",
      "subjectId": "canonical lowercase subjectId",
      "chapterId": "optional string",
      "title": "string",
      "objective": "string",
      "originalDate": "YYYY-MM-DD",
      "suggestedDate": "YYYY-MM-DD",
      "durationMinutes": number,
      "splitRecommended": boolean,
      "priorityScore": number,
      "reason": "string",
      "difficulty": "Easy" | "Medium" | "Hard"
    }
  ]
}`;

  const parsed = await callGroqJson<{
    whyThisRecovery?: string;
    remainingBacklogCount?: number;
    suggestions?: Array<Partial<RecoverySuggestion>>;
  }>(systemInstruction, JSON.stringify(promptPayload), 'recovery plan');

  if (!Array.isArray(parsed.suggestions)) {
    throw new GroqResponseError('AI recovery output lacked suggestions array.', 422);
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

export async function chatScheduleWithGroq(
  state: AppState,
  activeDate: string,
  history: ScheduleChatTurn[],
  userMessage: string
): Promise<{
  assistantMessage: string;
  isOutOfScope: boolean;
  operations: ScheduleOperation[];
}> {
  const { activeExams, candidateChapters, dueRevisions } = buildSubjectContext(state, activeDate);

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

  const systemInstruction = `You are MIDNIGHT AI — the complete, personal academic copilot, syllabus tracker, and study planner for an ICSE Class 10 student (baseline date: ${activeDate}).

CORE CAPABILITIES:
1. FULL STUDY COMPANION & TUTOR:
   - Answer academic study questions, concept explanations, review mistakes, give exam strategy, and test the student in assistantMessage. Set isOutOfScope=false.
2. PROGRESS IMPORTER:
   - Parse completed chapters, in-progress chapters, weak areas, mistakes, and upcoming tests from any pasted text.
   - Populate "chapterUpdates" for mentioned chapters, "memoryUpdates" for tests/preferences, and "testPrepBlocks" for 1-day-before test prep.
3. SUB-CHAPTER / PART-LEVEL TRACKING (PARTS A, B, C, D):
   - When the student reports partial completion (e.g. "finished Part A and B, C and D left"), put it in "chapterUpdates" with status="In Progress", completedParts, remainingParts, scheduleRemainingDate, and add an "add_task" operation.
4. DYNAMIC SCHEDULE EDITS:
   - Adjust days ("update_day_window", "move_task", "add_task", "remove_task", "replace_day_plan", "update_settings", "set_next_topic") whenever the student asks to change their timetable or reports a commitment.
5. HARD RULES:
   - Never schedule a subject after its examDate, and never schedule on dates < ${activeDate}.
   - Max 1 Math chapter and max 1 Hard chapter per evening session.
   - Keep Telugu in blockIndex 0 (morning slot, 45-90m), never evening.
   - Preserve completed tasks (completed=true).
   - Canonical subjectId values: mathematics, physics, chemistry, biology, history_civics, geography, commercial_applications, english_language, english_literature, telugu.

Return ONLY valid JSON with these exact top-level keys:
{
  "assistantMessage": "string",
  "isOutOfScope": false,
  "chapterUpdates": [
    {
      "chapterId": "string (e.g. MAT-22, PHY-08, or chapter name)",
      "subjectId": "canonical subjectId",
      "status": "Completed" | "In Progress" | "Weak" | "Strong" | "Needs Revision" | "Not Started",
      "completedParts": ["optional"],
      "remainingParts": ["optional"],
      "scheduleRemainingDate": "optional YYYY-MM-DD",
      "durationMinutes": 60,
      "isWeak": false,
      "confidence": 3,
      "mistakes": "optional",
      "notes": "optional",
      "summary": "short description"
    }
  ],
  "memoryUpdates": [
    {
      "action": "save" | "remove",
      "memoryId": "optional",
      "category": "test" | "daily_update" | "preference",
      "content": "string",
      "subjectId": "optional canonical subjectId",
      "testDate": "optional YYYY-MM-DD",
      "prepDate": "optional YYYY-MM-DD",
      "syllabus": "optional",
      "matchText": "optional",
      "summary": "short description"
    }
  ],
  "testPrepBlocks": [
    {
      "subjectId": "canonical subjectId",
      "testDate": "YYYY-MM-DD",
      "syllabus": "string",
      "chapterId": "optional",
      "durationMinutes": 60,
      "summary": "short description"
    }
  ],
  "operations": [
    {
      "type": "replace_day_plan" | "add_task" | "move_task" | "remove_task" | "update_day_window" | "update_settings" | "set_next_topic" | "update_chapter_progress",
      "date": "YYYY-MM-DD",
      "fromDate": "YYYY-MM-DD",
      "toDate": "YYYY-MM-DD",
      "taskId": "optional",
      "matchTitle": "optional",
      "subjectId": "optional canonical subjectId",
      "chapterId": "optional",
      "title": "optional",
      "objective": "optional",
      "durationMinutes": 60,
      "blockIndex": 1,
      "taskType": "first_study",
      "availableMinutes": 150,
      "summary": "short description"
    }
  ]
}`;

  const parsed = await callGroqJson<{
    assistantMessage?: string;
    isOutOfScope?: boolean;
    chapterUpdates?: Array<Record<string, unknown>>;
    memoryUpdates?: Array<Record<string, unknown>>;
    testPrepBlocks?: Array<Record<string, unknown>>;
    operations?: Array<Record<string, unknown>>;
  }>(systemInstruction, JSON.stringify(contextPayload), 'schedule chat', 3500);

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
        subjectId: normalizeSubjectId(
          typeof cu.subjectId === 'string' ? cu.subjectId : undefined,
          cu.chapterId
        ),
        status: cu.status as ChapterItem['status'],
        completedParts: Array.isArray(cu.completedParts) ? cu.completedParts.map(String) : undefined,
        remainingParts: Array.isArray(cu.remainingParts) ? cu.remainingParts.map(String) : undefined,
        scheduleRemainingDate:
          typeof cu.scheduleRemainingDate === 'string' ? cu.scheduleRemainingDate : undefined,
        durationMinutes: typeof cu.durationMinutes === 'number' ? cu.durationMinutes : undefined,
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
      operations.push({
        type: 'save_memory',
        memoryId: typeof mem.memoryId === 'string' ? mem.memoryId : undefined,
        category: cat,
        content: mem.content.trim(),
        subjectId: normalizeSubjectId(typeof mem.subjectId === 'string' ? mem.subjectId : undefined),
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
    const summary =
      typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Updated schedule';

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
    } else if (type === 'update_chapter_progress' && typeof raw.chapterId === 'string') {
      operations.push({
        type: 'update_chapter_progress',
        chapterId: raw.chapterId,
        subjectId:
          typeof raw.subjectId === 'string'
            ? normalizeSubjectId(raw.subjectId, raw.chapterId)
            : undefined,
        status: typeof raw.status === 'string' ? (raw.status as ChapterItem['status']) : undefined,
        completedParts: Array.isArray(raw.completedParts) ? raw.completedParts.map(String) : undefined,
        remainingParts: Array.isArray(raw.remainingParts) ? raw.remainingParts.map(String) : undefined,
        scheduleRemainingDate:
          typeof raw.scheduleRemainingDate === 'string' ? raw.scheduleRemainingDate : undefined,
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
