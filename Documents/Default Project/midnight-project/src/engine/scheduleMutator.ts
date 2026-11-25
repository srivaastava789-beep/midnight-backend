import { SUBJECT_MAP } from '../data/seed.ts';
import type {
  AiMemoryCategory,
  AiMemoryItem,
  AppState,
  ChapterItem,
  ChapterStatus,
  DayPlan,
  ScheduleOperation,
  StudyTask,
  SubjectId,
  TaskType,
} from '../types/study.ts';
import { addDays } from '../utils/date.ts';
import {
  isValidISODate,
  timeToMinutes,
  validateAndConstrainDayTasks,
} from './validator.ts';
import { generateDayPlan } from './planner.ts';
import { scheduleRevisionsForChapter } from './revision.ts';

function formatClockMinutes(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeTimeSlots(tasks: StudyTask[], state: AppState): StudyTask[] {
  const morning = tasks.filter((t) => t.blockIndex === 0);
  const evening = tasks.filter((t) => t.blockIndex >= 1);

  const normalizedMorning = morning.map((t) => {
    const startMin = 7 * 60 + 30;
    const endMin = startMin + t.durationMinutes;
    return {
      ...t,
      timeSlot: `${formatClockMinutes(startMin)}–${formatClockMinutes(endMin)}`,
    };
  });

  let cursor = timeToMinutes(state.settings.eveningStart);
  const normalizedEvening = evening.map((t, idx) => {
    if (idx > 0) cursor += state.settings.breakMinutes;
    const startStr = formatClockMinutes(cursor);
    cursor += t.durationMinutes;
    const endStr = formatClockMinutes(cursor);
    return {
      ...t,
      blockIndex: idx + 1,
      timeSlot: `${startStr}–${endStr}`,
    };
  });

  return [...normalizedMorning, ...normalizedEvening];
}

function getOrBuildDayPlan(state: AppState, date: string): DayPlan {
  return state.plans[date] ?? generateDayPlan(state, date);
}

function isValidTimeHHMM(val: string | undefined): val is string {
  return Boolean(val && /^\d{2}:\d{2}$/.test(val) && timeToMinutes(val) >= 0);
}

const VALID_TASK_TYPES = new Set<TaskType>([
  'first_study',
  'revision',
  'practice',
  'exam_prep',
  'custom',
]);

const SUBJECT_ALIASES: Record<string, SubjectId> = {
  mathematics: 'mathematics',
  math: 'mathematics',
  maths: 'mathematics',
  physics: 'physics',
  phy: 'physics',
  chemistry: 'chemistry',
  chem: 'chemistry',
  biology: 'biology',
  bio: 'biology',
  history_civics: 'history_civics',
  'history & civics': 'history_civics',
  'history and civics': 'history_civics',
  history: 'history_civics',
  civics: 'history_civics',
  'hist/civ': 'history_civics',
  hist_civ: 'history_civics',
  histciv: 'history_civics',
  geography: 'geography',
  geog: 'geography',
  geo: 'geography',
  commercial_applications: 'commercial_applications',
  'commercial applications': 'commercial_applications',
  'comm app': 'commercial_applications',
  comm_app: 'commercial_applications',
  commerce: 'commercial_applications',
  english_language: 'english_language',
  'english language': 'english_language',
  'eng lang': 'english_language',
  eng_lang: 'english_language',
  english_literature: 'english_literature',
  'english literature': 'english_literature',
  'eng lit': 'english_literature',
  eng_lit: 'english_literature',
  telugu: 'telugu',
  tel: 'telugu',
};

const CHAPTER_PREFIX_TO_SUBJECT: Array<[string, SubjectId]> = [
  ['MAT-', 'mathematics'],
  ['PHY-', 'physics'],
  ['CHE-', 'chemistry'],
  ['BIO-', 'biology'],
  ['HIS-', 'history_civics'],
  ['CIV-', 'history_civics'],
  ['GEO-', 'geography'],
  ['COM-', 'commercial_applications'],
  ['ENG-', 'english_literature'],
  ['TEL-', 'telugu'],
];

export function normalizeSubjectId(
  rawSubject?: string,
  chapterId?: string
): SubjectId | undefined {
  if (typeof rawSubject === 'string' && rawSubject.trim()) {
    const cleaned = rawSubject.trim().toLowerCase();
    if (SUBJECT_ALIASES[cleaned]) return SUBJECT_ALIASES[cleaned];
    const underscoreNormalized = cleaned.replace(/[\s&/-]+/g, '_');
    if (SUBJECT_ALIASES[underscoreNormalized]) return SUBJECT_ALIASES[underscoreNormalized];
  }
  if (typeof chapterId === 'string' && chapterId.trim()) {
    const upper = chapterId.trim().toUpperCase();
    for (const [prefix, subjId] of CHAPTER_PREFIX_TO_SUBJECT) {
      if (upper.startsWith(prefix)) return subjId;
    }
  }
  return undefined;
}

export interface ApplyScheduleResult {
  nextState: AppState;
  appliedChanges: string[];
  rejectedChanges: string[];
}

export function applyScheduleOperations(
  state: AppState,
  operations: ScheduleOperation[],
  activeDate: string
): ApplyScheduleResult {
  let current: AppState = {
    ...state,
    chapters: [...state.chapters],
    revisions: [...state.revisions],
    plans: { ...state.plans },
    settings: { ...state.settings, rotation: { ...state.settings.rotation } },
    nextTopicBySubject: { ...(state.nextTopicBySubject ?? {}) },
    aiMemory: [...(state.aiMemory ?? [])],
  };

  const chapterMap = new Map(current.chapters.map((c) => [c.id, c]));
  const examMap = new Map(current.exams.map((e) => [e.subjectId, e]));
  const validSubjectIds = new Set<SubjectId>(current.exams.map((e) => e.subjectId));

  const appliedChanges: string[] = [];
  const rejectedChanges: string[] = [];

  for (const op of operations) {
    if (op.type === 'update_settings') {
      const nextSettings = { ...current.settings };
      if (isValidTimeHHMM(op.eveningStart)) nextSettings.eveningStart = op.eveningStart;
      if (isValidTimeHHMM(op.eveningEnd)) nextSettings.eveningEnd = op.eveningEnd;
      if (typeof op.blockDurationMinutes === 'number' && Number.isFinite(op.blockDurationMinutes)) {
        nextSettings.blockDurationMinutes = Math.max(30, Math.min(120, Math.round(op.blockDurationMinutes)));
      }
      if (typeof op.breakMinutes === 'number' && Number.isFinite(op.breakMinutes)) {
        nextSettings.breakMinutes = Math.max(0, Math.min(30, Math.round(op.breakMinutes)));
      }
      if (typeof op.teluguMorningMinutes === 'number' && Number.isFinite(op.teluguMorningMinutes)) {
        nextSettings.teluguMorningMinutes = Math.max(45, Math.min(90, Math.round(op.teluguMorningMinutes)));
      }
      current = { ...current, settings: nextSettings };
      appliedChanges.push(op.summary || 'Updated study window settings.');
      continue;
    }

    if (op.type === 'set_next_topic') {
      const ch = chapterMap.get(op.chapterId);
      const subjId = normalizeSubjectId(op.subjectId, op.chapterId);
      if (!ch || !subjId || ch.subjectId !== subjId) {
        rejectedChanges.push(`Ignored next-topic change for unknown chapter ${op.chapterId}.`);
        continue;
      }
      current = {
        ...current,
        nextTopicBySubject: {
          ...current.nextTopicBySubject,
          [subjId]: op.chapterId,
        },
      };
      appliedChanges.push(op.summary || `Set next ${subjId} topic to ${ch.id} · ${ch.chapterName}.`);
      continue;
    }

    if (op.type === 'update_day_window') {
      if (!isValidISODate(op.date) || op.date < activeDate) {
        rejectedChanges.push(`Ignored window update for invalid or past date ${op.date}.`);
        continue;
      }
      const mins = Math.max(30, Math.min(300, Math.round(op.availableMinutes)));
      const existing = getOrBuildDayPlan(current, op.date);
      const validated = validateAndConstrainDayTasks(existing.tasks, current, op.date, mins);
      const updatedPlan: DayPlan = {
        ...existing,
        availableMinutes: mins,
        tasks: validated.tasks,
        remainingBacklog: validated.remainingBacklog,
        isManuallyAdjusted: true,
        plannedBy: 'gemini',
        generatedAt: new Date().toISOString(),
      };
      current = {
        ...current,
        plans: { ...current.plans, [op.date]: updatedPlan },
      };
      appliedChanges.push(op.summary || `Updated ${op.date} evening study window to ${mins}m.`);
      continue;
    }

    if (op.type === 'replace_day_plan') {
      if (!isValidISODate(op.date) || op.date < activeDate) {
        rejectedChanges.push(`Ignored schedule replacement for invalid or past date ${op.date}.`);
        continue;
      }
      const existing = getOrBuildDayPlan(current, op.date);
      const availableMinutes = Math.max(
        30,
        Math.min(300, Math.round(op.availableMinutes ?? existing.availableMinutes))
      );

      const candidateTasks: StudyTask[] = op.tasks
        .map((t) => ({
          ...t,
          normalizedSubjectId: normalizeSubjectId(t.subjectId, t.chapterId),
        }))
        .filter((t): t is typeof t & { normalizedSubjectId: SubjectId } =>
          Boolean(t.normalizedSubjectId && validSubjectIds.has(t.normalizedSubjectId))
        )
        .map((t, idx) => {
          const ch = t.chapterId ? chapterMap.get(t.chapterId) : undefined;
          const taskType = VALID_TASK_TYPES.has(t.taskType) ? t.taskType : 'first_study';
          return {
            id: `chat-${op.date}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            subjectId: t.normalizedSubjectId,
            chapterId: ch ? ch.id : undefined,
            title: ch ? `${ch.id} · ${ch.chapterName}` : t.title,
            objective: t.objective || 'Focused study session',
            durationMinutes: Math.max(20, Math.min(120, Math.round(t.durationMinutes || 60))),
            timeSlot: t.blockIndex === 0 ? '07:30–08:30' : '17:30–18:45',
            blockIndex: Number.isFinite(t.blockIndex) ? t.blockIndex : 1,
            taskType,
            completed: false,
            completedAt: null,
            originalDate: op.date,
            scheduledDate: op.date,
            carriedForward: false,
            difficulty: ch?.difficulty ?? 'Medium',
            aiReason: t.reason,
          };
        });

      const validated = validateAndConstrainDayTasks(
        candidateTasks,
        current,
        op.date,
        availableMinutes
      );

      if (validated.tasks.length === 0) {
        rejectedChanges.push(`Skipped ${op.date} replacement because proposed tasks violated active exam or constraint rules.`);
        continue;
      }

      const updatedPlan: DayPlan = {
        ...existing,
        date: op.date,
        availableMinutes,
        tasks: validated.tasks,
        remainingBacklog: validated.remainingBacklog,
        isManuallyAdjusted: true,
        plannedBy: 'gemini',
        whyThisPlan: op.summary,
        generatedAt: new Date().toISOString(),
      };
      current = {
        ...current,
        plans: { ...current.plans, [op.date]: updatedPlan },
      };
      appliedChanges.push(op.summary || `Updated schedule for ${op.date}.`);
      continue;
    }

    if (op.type === 'add_task') {
      const subjId = normalizeSubjectId(op.subjectId, op.chapterId);
      if (!isValidISODate(op.date) || op.date < activeDate || !subjId || !validSubjectIds.has(subjId)) {
        rejectedChanges.push(`Ignored invalid add_task for ${op.date}.`);
        continue;
      }
      const exam = examMap.get(subjId);
      if (exam && op.date > exam.date) {
        rejectedChanges.push(`Cannot schedule ${subjId} on ${op.date} after its exam (${exam.date}).`);
        continue;
      }

      const existing = getOrBuildDayPlan(current, op.date);
      const ch = op.chapterId ? chapterMap.get(op.chapterId) : undefined;
      const taskType = VALID_TASK_TYPES.has(op.taskType) ? op.taskType : 'first_study';
      const newTask: StudyTask = {
        id: `chat-${op.date}-${Math.random().toString(36).slice(2, 7)}`,
        subjectId: subjId,
        chapterId: ch ? ch.id : undefined,
        title: ch ? `${ch.id} · ${ch.chapterName}` : op.title,
        objective: op.objective || 'Focused study block',
        durationMinutes: Math.max(20, Math.min(120, Math.round(op.durationMinutes || 60))),
        timeSlot: op.blockIndex === 0 ? '07:30–08:30' : '17:30–18:45',
        blockIndex: subjId === 'telugu' ? 0 : Math.max(1, op.blockIndex || 1),
        taskType,
        completed: false,
        completedAt: null,
        originalDate: op.date,
        scheduledDate: op.date,
        carriedForward: false,
        difficulty: ch?.difficulty ?? 'Medium',
      };

      const combined = [...existing.tasks, newTask];
      const validated = validateAndConstrainDayTasks(
        combined,
        current,
        op.date,
        existing.availableMinutes
      );

      current = {
        ...current,
        plans: {
          ...current.plans,
          [op.date]: {
            ...existing,
            tasks: validated.tasks,
            remainingBacklog: validated.remainingBacklog,
            isManuallyAdjusted: true,
            plannedBy: 'gemini',
            generatedAt: new Date().toISOString(),
          },
        },
      };
      if (validated.tasks.some((t) => t.id === newTask.id)) {
        appliedChanges.push(op.summary || `Added "${newTask.title}" on ${op.date}.`);
      } else {
        rejectedChanges.push(`Added "${newTask.title}" to ${op.date} backlog because the study window is full.`);
      }
      continue;
    }

    if (op.type === 'move_task') {
      if (!isValidISODate(op.fromDate) || !isValidISODate(op.toDate) || op.toDate < activeDate) {
        rejectedChanges.push(`Ignored move_task with invalid date (${op.fromDate} -> ${op.toDate}).`);
        continue;
      }
      const fromPlan = getOrBuildDayPlan(current, op.fromDate);
      const targetTask = fromPlan.tasks.find((t) => {
        if (t.completed) return false;
        if (op.taskId && t.id === op.taskId) return true;
        if (op.matchTitle && t.title.toLowerCase().includes(op.matchTitle.toLowerCase())) return true;
        return false;
      });
      if (!targetTask) {
        rejectedChanges.push(`Could not find open task to move from ${op.fromDate}.`);
        continue;
      }
      const exam = examMap.get(targetTask.subjectId);
      if (exam && op.toDate > exam.date) {
        rejectedChanges.push(`Cannot move "${targetTask.title}" to ${op.toDate} after exam (${exam.date}).`);
        continue;
      }

      const remainingFrom = fromPlan.tasks.filter((t) => t.id !== targetTask.id);
      const toPlan = getOrBuildDayPlan(current, op.toDate);
      const movedTask: StudyTask = {
        ...targetTask,
        scheduledDate: op.toDate,
        carriedForward: op.toDate > targetTask.originalDate,
        blockIndex:
          typeof op.blockIndex === 'number' ? op.blockIndex : targetTask.blockIndex,
      };

      const validatedTo = validateAndConstrainDayTasks(
        [...toPlan.tasks, movedTask],
        current,
        op.toDate,
        toPlan.availableMinutes
      );

      current = {
        ...current,
        plans: {
          ...current.plans,
          [op.fromDate]: {
            ...fromPlan,
            tasks: normalizeTimeSlots(remainingFrom, current),
            isManuallyAdjusted: true,
          },
          [op.toDate]: {
            ...toPlan,
            tasks: validatedTo.tasks,
            remainingBacklog: validatedTo.remainingBacklog,
            isManuallyAdjusted: true,
            plannedBy: 'gemini',
          },
        },
      };
      if (validatedTo.tasks.some((t) => t.id === movedTask.id)) {
        appliedChanges.push(op.summary || `Moved "${targetTask.title}" from ${op.fromDate} to ${op.toDate}.`);
      } else {
        appliedChanges.push(`Moved "${targetTask.title}" from ${op.fromDate} to ${op.toDate} backlog (target window full).`);
      }
      continue;
    }

    if (op.type === 'remove_task') {
      if (!isValidISODate(op.date)) {
        rejectedChanges.push(`Ignored remove_task for invalid date ${op.date}.`);
        continue;
      }
      const plan = getOrBuildDayPlan(current, op.date);
      const targetTask = plan.tasks.find((t) => {
        if (t.completed) return false;
        if (op.taskId && t.id === op.taskId) return true;
        if (op.matchTitle && t.title.toLowerCase().includes(op.matchTitle.toLowerCase())) return true;
        return false;
      });
      if (!targetTask) {
        rejectedChanges.push(`Could not find open task to remove on ${op.date}.`);
        continue;
      }
      const nextTasks = plan.tasks.filter((t) => t.id !== targetTask.id);
      current = {
        ...current,
        plans: {
          ...current.plans,
          [op.date]: {
            ...plan,
            tasks: normalizeTimeSlots(nextTasks, current),
            isManuallyAdjusted: true,
          },
        },
      };
      appliedChanges.push(op.summary || `Removed "${targetTask.title}" from ${op.date}.`);
      continue;
    }

    if (op.type === 'save_memory') {
      const content = op.content.trim();
      if (!content) {
        rejectedChanges.push('Ignored empty memory note.');
        continue;
      }
      const now = new Date().toISOString();
      const validCat: AiMemoryCategory =
        op.category === 'test' || op.category === 'daily_update' || op.category === 'preference'
          ? op.category
          : 'daily_update';
      const normalizedSubj = normalizeSubjectId(op.subjectId);
      const validSubj = normalizedSubj && validSubjectIds.has(normalizedSubj) ? normalizedSubj : undefined;
      const validTestDate = op.testDate && isValidISODate(op.testDate) ? op.testDate : undefined;
      const computedPrepDate =
        op.prepDate && isValidISODate(op.prepDate)
          ? op.prepDate
          : validTestDate
            ? addDays(validTestDate, -1) < activeDate
              ? activeDate
              : addDays(validTestDate, -1)
            : undefined;

      const existingIdx = current.aiMemory.findIndex((m) => {
        if (op.memoryId && m.id === op.memoryId) return true;
        if (validCat === 'test' && validTestDate && validSubj && m.category === 'test' && m.testDate === validTestDate && m.subjectId === validSubj) {
          return true;
        }
        return m.content.toLowerCase() === content.toLowerCase();
      });

      const nextMem: AiMemoryItem = {
        id: existingIdx >= 0 ? current.aiMemory[existingIdx].id : `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        category: validCat,
        content,
        subjectId: validSubj,
        testDate: validTestDate,
        prepDate: computedPrepDate,
        syllabus: op.syllabus?.trim() || undefined,
        createdAt: existingIdx >= 0 ? current.aiMemory[existingIdx].createdAt : now,
        updatedAt: now,
      };

      const nextList = [...current.aiMemory];
      if (existingIdx >= 0) {
        nextList[existingIdx] = nextMem;
      } else {
        nextList.unshift(nextMem);
      }

      current = {
        ...current,
        aiMemory: nextList.slice(0, 40),
      };
      appliedChanges.push(op.summary || `Saved memory: ${content}`);
      continue;
    }

    if (op.type === 'remove_memory') {
      const beforeLen = current.aiMemory.length;
      const q = op.matchText?.trim().toLowerCase();
      const nextList = current.aiMemory.filter((m) => {
        if (op.memoryId && m.id === op.memoryId) return false;
        if (q && m.content.toLowerCase().includes(q)) return false;
        return true;
      });
      if (nextList.length === beforeLen) {
        rejectedChanges.push('Could not find matching saved memory to remove.');
        continue;
      }
      current = {
        ...current,
        aiMemory: nextList,
      };
      appliedChanges.push(op.summary || 'Removed memory item.');
      continue;
    }

    if (op.type === 'schedule_test_prep') {
      const subjId = normalizeSubjectId(op.subjectId, op.chapterId);
      if (!isValidISODate(op.testDate) || op.testDate < activeDate || !subjId || !validSubjectIds.has(subjId)) {
        rejectedChanges.push(`Ignored invalid test prep date or subject (${op.testDate}).`);
        continue;
      }
      const rawPrepDate = addDays(op.testDate, -1);
      const prepDate = rawPrepDate < activeDate ? activeDate : rawPrepDate;
      const exam = examMap.get(subjId);
      if (exam && prepDate > exam.date) {
        rejectedChanges.push(`Cannot schedule ${subjId} test prep on ${prepDate} after exam (${exam.date}).`);
        continue;
      }

      const existing = getOrBuildDayPlan(current, prepDate);
      const ch = op.chapterId ? chapterMap.get(op.chapterId) : undefined;
      const subjShort = SUBJECT_MAP[subjId]?.shortName ?? subjId;
      const syllabusText = op.syllabus?.trim() || (ch ? `${ch.id} · ${ch.chapterName}` : 'Test syllabus');
      const prepDur = Math.max(45, Math.min(120, Math.round(op.durationMinutes || 75)));

      const prepTask: StudyTask = {
        id: `prep-${prepDate}-${subjId}-${Math.random().toString(36).slice(2, 6)}`,
        subjectId: subjId,
        chapterId: ch?.id,
        title: `${subjShort} Test Prep · ${syllabusText}`,
        objective: `1-day-before preparation for ${op.testDate} test: ${syllabusText}`,
        durationMinutes: prepDur,
        timeSlot: subjId === 'telugu' ? '07:30–08:30' : '17:30–18:45',
        blockIndex: subjId === 'telugu' ? 0 : 1,
        taskType: 'exam_prep',
        completed: false,
        completedAt: null,
        originalDate: prepDate,
        scheduledDate: prepDate,
        carriedForward: false,
        difficulty: ch?.difficulty ?? 'Medium',
        aiReason: `1-day-before test prep saved for ${op.testDate} test`,
      };

      // Rebalance non-completed tasks on prepDate so the prep block fits inside evening/morning capacity
      const completedTasks = existing.tasks.filter((t) => t.completed);
      let openTasks = existing.tasks.filter((t) => !t.completed);
      const deferredNotes = [...(existing.remainingBacklog ?? [])];

      if (subjId === 'telugu') {
        openTasks = openTasks.filter((t) => {
          if (t.blockIndex === 0) {
            deferredNotes.push({
              subjectId: t.subjectId,
              chapterId: t.chapterId,
              title: t.title,
              reason: `Deferred for ${op.testDate} Telugu test prep`,
              remainingMinutes: t.durationMinutes,
            });
            return false;
          }
          return true;
        });
      } else {
        // Respect max 1 math chapter & remove lowest-priority non-test-prep open tasks until capacity allows prepTask
        if (subjId === 'mathematics' && prepTask.chapterId) {
          openTasks = openTasks.filter((t) => {
            if (t.subjectId === 'mathematics' && t.chapterId) {
              deferredNotes.push({
                subjectId: t.subjectId,
                chapterId: t.chapterId,
                title: t.title,
                reason: `Replaced by ${op.testDate} Math test prep`,
                remainingMinutes: t.durationMinutes,
              });
              return false;
            }
            return true;
          });
        }

        const eveningCompletedMins = completedTasks
          .filter((t) => t.blockIndex >= 1)
          .reduce((sum, t) => sum + t.durationMinutes, 0);
        const morningTasks = openTasks.filter((t) => t.blockIndex === 0);
        let eveningOpen = openTasks.filter((t) => t.blockIndex >= 1);

        // If prepTask is Hard and an open Hard block exists, defer the open Hard block
        if (prepTask.difficulty === 'Hard') {
          eveningOpen = eveningOpen.filter((t) => {
            if (t.difficulty === 'Hard' && t.taskType !== 'exam_prep') {
              deferredNotes.push({
                subjectId: t.subjectId,
                chapterId: t.chapterId,
                title: t.title,
                reason: `Shifted for ${op.testDate} ${subjShort} test prep`,
                remainingMinutes: t.durationMinutes,
              });
              return false;
            }
            return true;
          });
        }

        const targetWindow = Math.max(existing.availableMinutes, prepDur);
        while (
          eveningCompletedMins +
            prepDur +
            eveningOpen.reduce((sum, t) => sum + t.durationMinutes, 0) >
            targetWindow &&
          eveningOpen.length > 0
        ) {
          // Defer last non-test-prep open task first, otherwise last open task
          let dropIdx = -1;
          for (let i = eveningOpen.length - 1; i >= 0; i--) {
            if (eveningOpen[i].taskType !== 'exam_prep') {
              dropIdx = i;
              break;
            }
          }
          if (dropIdx === -1) dropIdx = eveningOpen.length - 1;
          const [dropped] = eveningOpen.splice(dropIdx, 1);
          deferredNotes.push({
            subjectId: dropped.subjectId,
            chapterId: dropped.chapterId,
            title: dropped.title,
            reason: `Deferred to fit 1-day-before ${subjShort} test prep`,
            remainingMinutes: dropped.durationMinutes,
          });
        }

        openTasks = [...morningTasks, ...eveningOpen];
      }

      const candidateList =
        subjId === 'telugu'
          ? [...completedTasks, prepTask, ...openTasks]
          : [...completedTasks, prepTask, ...openTasks];

      const validated = validateAndConstrainDayTasks(
        candidateList,
        current,
        prepDate,
        Math.max(existing.availableMinutes, prepDur)
      );

      // Ensure matching test memory exists
      const now = new Date().toISOString();
      const hasTestMem = current.aiMemory.some(
        (m) => m.category === 'test' && m.testDate === op.testDate && m.subjectId === subjId
      );
      const nextAiMemory = hasTestMem
        ? current.aiMemory
        : [
            {
              id: `mem-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
              category: 'test' as const,
              content: `${SUBJECT_MAP[subjId]?.name ?? subjId} test (${syllabusText}) on ${op.testDate}`,
              subjectId: subjId,
              testDate: op.testDate,
              prepDate,
              syllabus: syllabusText,
              createdAt: now,
              updatedAt: now,
            },
            ...current.aiMemory,
          ].slice(0, 40);

      current = {
        ...current,
        aiMemory: nextAiMemory,
        plans: {
          ...current.plans,
          [prepDate]: {
            ...existing,
            availableMinutes: Math.max(existing.availableMinutes, prepDur),
            tasks: validated.tasks,
            remainingBacklog: [...deferredNotes, ...validated.remainingBacklog],
            isManuallyAdjusted: true,
            plannedBy: 'gemini',
            whyThisPlan: `Prioritized ${subjShort} test preparation 1 day before ${op.testDate} test.`,
            generatedAt: now,
          },
        },
      };
      appliedChanges.push(
        op.summary || `Saved 1-day-before prep for ${subjShort} test on ${prepDate} (test ${op.testDate}).`
      );
      continue;
    }

    if (op.type === 'update_chapter_progress') {
      const q = op.chapterId.trim().toLowerCase();
      const chIdx = current.chapters.findIndex(
        (c) => c.id.toLowerCase() === q || c.chapterName.toLowerCase().includes(q)
      );
      if (chIdx < 0) {
        rejectedChanges.push(`Could not find chapter matching "${op.chapterId}".`);
        continue;
      }

      const prevCh = current.chapters[chIdx];
      const nextStatus: ChapterStatus = op.status ?? prevCh.status;
      const isCompleted = nextStatus === 'Completed' || nextStatus === 'Strong';
      const wasCompleted = prevCh.status === 'Completed' || prevCh.status === 'Strong';

      const updatedCh: ChapterItem = {
        ...prevCh,
        status: nextStatus,
        completedParts: op.completedParts ?? prevCh.completedParts,
        remainingParts: op.remainingParts ?? prevCh.remainingParts,
        isWeak: typeof op.isWeak === 'boolean' ? op.isWeak : nextStatus === 'Weak' ? true : prevCh.isWeak,
        confidence: typeof op.confidence === 'number' ? op.confidence : prevCh.confidence,
        mistakes: op.mistakes ? `${prevCh.mistakes ? prevCh.mistakes + '; ' : ''}${op.mistakes}` : prevCh.mistakes,
        notes: op.notes ? `${prevCh.notes ? prevCh.notes + '; ' : ''}${op.notes}` : prevCh.notes,
        lastStudiedDate: activeDate,
      };

      const nextChapters = [...current.chapters];
      nextChapters[chIdx] = updatedCh;
      chapterMap.set(updatedCh.id, updatedCh);

      let nextRevisions = current.revisions;
      if (isCompleted && !wasCompleted) {
        nextRevisions = scheduleRevisionsForChapter(updatedCh, activeDate, current.revisions);
      }

      let nextPlans = current.plans;
      if (op.remainingParts && op.remainingParts.length > 0) {
        const rawDate = op.scheduleRemainingDate && isValidISODate(op.scheduleRemainingDate)
          ? op.scheduleRemainingDate
          : addDays(activeDate, 1);
        const schedDate = rawDate >= activeDate ? rawDate : activeDate;
        const dayPlan = getOrBuildDayPlan(current, schedDate);
        const remainingLabel = op.remainingParts.join(' & ');
        const newTask: StudyTask = {
          id: `subpart-${schedDate}-${updatedCh.id}-${Math.random().toString(36).slice(2, 6)}`,
          subjectId: updatedCh.subjectId,
          chapterId: updatedCh.id,
          title: `${updatedCh.id} · ${updatedCh.chapterName} (${remainingLabel})`,
          objective: `Complete remaining ${remainingLabel} of ${updatedCh.chapterName}`,
          durationMinutes: Math.max(30, Math.min(120, op.durationMinutes || 60)),
          timeSlot: updatedCh.subjectId === 'telugu' ? '07:30–08:30' : '17:30–18:45',
          blockIndex: updatedCh.subjectId === 'telugu' ? 0 : 1,
          taskType: 'first_study',
          completed: false,
          completedAt: null,
          originalDate: schedDate,
          scheduledDate: schedDate,
          carriedForward: false,
          subPartLabel: remainingLabel,
          remainingParts: op.remainingParts,
          difficulty: updatedCh.difficulty,
          aiReason: `Continuation session after finishing ${op.completedParts?.join(', ') || 'prior parts'}`,
        };

        const completedTasks = dayPlan.tasks.filter((t) => t.completed);
        const morningTasks = dayPlan.tasks.filter((t) => !t.completed && t.blockIndex === 0);
        const openEveningTasks = dayPlan.tasks.filter(
          (t) =>
            !t.completed &&
            t.blockIndex >= 1 &&
            !(t.chapterId === updatedCh.id && t.taskType === 'first_study')
        );

        const candidateList =
          updatedCh.subjectId === 'telugu'
            ? [...completedTasks, newTask, ...morningTasks, ...openEveningTasks]
            : [...completedTasks, ...morningTasks, newTask, ...openEveningTasks];

        const validated = validateAndConstrainDayTasks(
          candidateList,
          current,
          schedDate,
          dayPlan.availableMinutes
        );

        nextPlans = {
          ...nextPlans,
          [schedDate]: {
            ...dayPlan,
            tasks: normalizeTimeSlots(validated.tasks, current),
            remainingBacklog: validated.remainingBacklog,
            isManuallyAdjusted: true,
            plannedBy: 'gemini',
          },
        };
      }

      current = {
        ...current,
        chapters: nextChapters,
        revisions: nextRevisions,
        plans: nextPlans,
      };

      let subSummary = `${updatedCh.id} · ${updatedCh.chapterName} updated to ${nextStatus}`;
      if (op.completedParts?.length) {
        subSummary += ` (Done: ${op.completedParts.join(', ')})`;
      }
      if (op.remainingParts?.length) {
        subSummary += ` (Remaining: ${op.remainingParts.join(', ')})`;
      }
      appliedChanges.push(op.summary || subSummary);
      continue;
    }

    if (op.type === 'batch_update_chapters') {
      let count = 0;
      const nextChapters = [...current.chapters];
      let nextRevisions = current.revisions;

      for (const upd of op.updates) {
        const chIdx = nextChapters.findIndex((c) => {
          if (upd.chapterId && c.id.toLowerCase() === upd.chapterId.toLowerCase()) return true;
          if (upd.chapterNameMatch && c.chapterName.toLowerCase().includes(upd.chapterNameMatch.toLowerCase())) {
            if (upd.subjectId) return c.subjectId === upd.subjectId;
            return true;
          }
          return false;
        });

        if (chIdx >= 0) {
          const prev = nextChapters[chIdx];
          const isComp = upd.status === 'Completed' || upd.status === 'Strong';
          const wasComp = prev.status === 'Completed' || prev.status === 'Strong';
          const updated: ChapterItem = {
            ...prev,
            status: upd.status,
            completedParts: upd.completedParts ?? prev.completedParts,
            remainingParts: upd.remainingParts ?? prev.remainingParts,
            isWeak: typeof upd.isWeak === 'boolean' ? upd.isWeak : upd.status === 'Weak' ? true : prev.isWeak,
            confidence: typeof upd.confidence === 'number' ? upd.confidence : prev.confidence,
            notes: upd.notes ? `${prev.notes ? prev.notes + '; ' : ''}${upd.notes}` : prev.notes,
            lastStudiedDate: activeDate,
          };
          nextChapters[chIdx] = updated;
          chapterMap.set(updated.id, updated);
          if (isComp && !wasComp) {
            nextRevisions = scheduleRevisionsForChapter(updated, activeDate, nextRevisions);
          }
          count++;
        }
      }

      current = {
        ...current,
        chapters: nextChapters,
        revisions: nextRevisions,
      };
      appliedChanges.push(op.summary || `Updated status of ${count} chapters across syllabus.`);
      continue;
    }
  }

  return {
    nextState: current,
    appliedChanges,
    rejectedChanges,
  };
}
