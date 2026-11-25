import { createInitialAppState, INITIAL_CHAPTERS } from '../data/seed.ts';
import { generateScheduleRange } from '../engine/planner.ts';
import { scheduleRevisionsForChapter } from '../engine/revision.ts';
import type {
  ActiveTimerState,
  AppState,
  ChapterDifficulty,
  ChapterItem,
  ChapterStatus,
  DayPlan,
  StudyTask,
} from '../types/study.ts';
import { BASELINE_DATE, FINAL_EXAM_DATE } from './date.ts';

const STORAGE_KEY_V2 = 'midnight_icse_study_state_v2';
const STORAGE_KEY_V1 = 'midnight_icse_study_state_v1';
const TIMER_STORAGE_KEY = 'midnight_active_focus_timer_v1';

function mapOldDifficulty(diff: string | undefined): ChapterDifficulty {
  if (diff === 'Easy' || diff === 'Medium' || diff === 'Hard' || diff === 'Not rated') {
    return diff;
  }
  if (diff === 'Light') return 'Easy';
  if (diff === 'Standard') return 'Medium';
  if (diff === 'Heavy') return 'Hard';
  return 'Not rated';
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u0C00-\u0C7F]+/g, ' ').trim();
}

export function migrateAppState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') {
    return buildSeededState();
  }
  const parsed = raw as Partial<AppState> & { version?: number };
  if (!Array.isArray(parsed.chapters) || !Array.isArray(parsed.exams)) {
    return buildSeededState();
  }

  // Already v2+: ensure required v2 fields exist non-destructively
  if ((parsed.version ?? 1) >= 2 && parsed.chapters.length > 0) {
    const base = createInitialAppState();
    const migratedChapters = parsed.chapters.map((c) => ({
      ...c,
      difficulty: mapOldDifficulty(c.difficulty),
      estimatedMinutes:
        typeof c.estimatedMinutes === 'number' ? c.estimatedMinutes : null,
    }));

    return {
      ...base,
      ...parsed,
      version: 2,
      chapters: migratedChapters,
      settings: {
        ...base.settings,
        ...(parsed.settings ?? {}),
        timeEstimateStandard: parsed.settings?.timeEstimateStandard ?? 'unassigned',
        rotation: {
          ...base.settings.rotation,
          ...(parsed.settings?.rotation ?? {}),
        },
        focusTimerPrefs: {
          ...base.settings.focusTimerPrefs!,
          ...(parsed.settings?.focusTimerPrefs ?? {}),
        },
      },
      nextTopicBySubject: parsed.nextTopicBySubject ?? base.nextTopicBySubject,
      focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : [],
      aiMemory: Array.isArray(parsed.aiMemory) ? parsed.aiMemory : [],
    };
  }

  // Non-destructive v1 -> v2 migration:
  // Map old user-entered chapter progress, notes, status, confidence, revisions, plans, formulas, exams onto authoritative 138 chapters.
  const base = createInitialAppState();
  const oldChapters = parsed.chapters as ChapterItem[];

  // Build map from v1 chapter IDs & normalized names
  const oldById = new Map(oldChapters.map((c) => [c.id, c]));
  const oldByNorm = new Map(oldChapters.map((c) => [normalizeName(c.chapterName), c]));

  // Explicit v1 -> v2 ID bridges where authoritative 138-chapter numbering shifted
  const v1ToV2Map: Record<string, string[]> = {
    'MAT-17': ['MAT-21'], // Cylinder -> Volume and Surface Area of Solids
    'MAT-18': ['MAT-21'], // Cone -> Volume and Surface Area of Solids
    'MAT-19': ['MAT-21'], // Sphere -> Volume and Surface Area of Solids
    'MAT-20': ['MAT-22'], // Trigonometrical Identities
    'MAT-21': ['MAT-23'], // Heights and Distances
    'MAT-22': ['MAT-24'], // Graphical Representation
    'MAT-23': ['MAT-25'], // Mean
    'MAT-24': ['MAT-26'], // Median, Quartiles and Mode
    'MAT-25': ['MAT-26'],
    'MAT-26': ['MAT-27'], // Probability
  };

  // Pre-index old chapters that map to v2 ids
  const matchedOldForNewId = new Map<string, ChapterItem>();
  for (const oldCh of oldChapters) {
    const mappedIds = v1ToV2Map[oldCh.id];
    if (mappedIds) {
      for (const nid of mappedIds) {
        const existing = matchedOldForNewId.get(nid);
        // Prefer Completed / higher confidence / user-confirmed state if multiple merge (MAT-17..19 -> MAT-21)
        if (!existing || oldCh.isStateConfirmed || oldCh.status === 'Completed') {
          matchedOldForNewId.set(nid, oldCh);
        }
      }
    }
  }

  const migratedChapters: ChapterItem[] = INITIAL_CHAPTERS.map((authCh) => {
    // Only pull user modifications from v1 if confirmed or modified by user
    const candidate =
      matchedOldForNewId.get(authCh.id) ??
      oldByNorm.get(normalizeName(authCh.chapterName)) ??
      oldById.get(authCh.id);

    if (
      candidate &&
      (candidate.isStateConfirmed ||
        candidate.status !== 'Not Started' ||
        candidate.notes.trim() !== '' ||
        candidate.mistakes.trim() !== '' ||
        candidate.confidence !== null ||
        candidate.lastStudiedDate !== null)
    ) {
      return {
        ...authCh,
        status: candidate.status as ChapterStatus,
        isWeak: candidate.isWeak,
        isStateConfirmed: candidate.isStateConfirmed,
        confidence: candidate.confidence,
        lastStudiedDate: candidate.lastStudiedDate,
        lastRevision: candidate.lastRevision,
        revisionDueDate: candidate.revisionDueDate,
        mistakes: candidate.mistakes,
        practiceStatus: candidate.practiceStatus,
        answerWritingStatus: candidate.answerWritingStatus,
        notes: candidate.notes || authCh.notes,
        plannedStudyDate: candidate.plannedStudyDate,
        // Keep authoritative Easy/Medium/Hard difficulty rating
        difficulty: authCh.difficulty,
        estimatedMinutes: null,
      };
    }

    return { ...authCh };
  });

  // Preserve custom user-added chapters that don't collide with authoritative IDs
  const authIds = new Set(INITIAL_CHAPTERS.map((c) => c.id));
  for (const oldCh of oldChapters) {
    const isStandardPrefix = /^(MAT|PHY|CHE|BIO|HIS|CIV|GEO|COM|ENG|TEL)-\d{2}$/.test(oldCh.id);
    if (!authIds.has(oldCh.id) && !isStandardPrefix) {
      migratedChapters.push({
        ...oldCh,
        difficulty: mapOldDifficulty(oldCh.difficulty),
        estimatedMinutes: null,
      });
    }
  }

  // Remap Mensuration/Trigonometry chapterIds inside revisions and plans
  const remapChapterId = (cid: string | undefined): string | undefined => {
    if (!cid) return cid;
    return v1ToV2Map[cid]?.[0] ?? cid;
  };

  const seenRevKeys = new Set<string>();
  const migratedRevisions = (parsed.revisions ?? [])
    .map((r) => {
      const nextCid = remapChapterId(r.chapterId) ?? r.chapterId;
      const targetCh = migratedChapters.find((c) => c.id === nextCid);
      return {
        ...r,
        chapterId: nextCid,
        chapterName: targetCh?.chapterName ?? r.chapterName,
      };
    })
    .filter((r) => {
      const key = `${r.chapterId}:${r.stage}:${r.originalDueDate}`;
      if (seenRevKeys.has(key)) return false;
      seenRevKeys.add(key);
      return true;
    });

  const migratedPlans: Record<string, DayPlan> = {};
  for (const [d, p] of Object.entries(parsed.plans ?? {})) {
    migratedPlans[d] = {
      ...p,
      tasks: p.tasks.map((t: StudyTask) => ({
        ...t,
        chapterId: remapChapterId(t.chapterId),
        difficulty: mapOldDifficulty(t.difficulty),
      })),
    };
  }

  // Merge authoritative practice topics while preserving user progress
  const oldTopicMap = new Map((parsed.practiceTopics ?? []).map((pt) => [pt.id, pt]));
  const migratedPractice = base.practiceTopics.map((pt) => {
    const oldPt = oldTopicMap.get(pt.id);
    return oldPt ? { ...pt, ...oldPt } : pt;
  });

  return {
    version: 2,
    baselineDate: parsed.baselineDate ?? BASELINE_DATE,
    chapters: migratedChapters,
    practiceTopics: migratedPractice,
    exams: parsed.exams,
    revisions: migratedRevisions,
    plans: migratedPlans,
    formulas: Array.isArray(parsed.formulas) ? parsed.formulas : [],
    settings: {
      ...base.settings,
      ...(parsed.settings ?? {}),
      teluguMorningMinutes:
        parsed.settings?.teluguMorningMinutes && parsed.settings.teluguMorningMinutes >= 45
          ? parsed.settings.teluguMorningMinutes
          : base.settings.teluguMorningMinutes,
      timeEstimateStandard: 'unassigned',
      rotation: {
        ...base.settings.rotation,
        ...(parsed.settings?.rotation ?? {}),
      },
      focusTimerPrefs: {
        ...base.settings.focusTimerPrefs!,
        ...(parsed.settings?.focusTimerPrefs ?? {}),
      },
    },
    nextTopicBySubject: base.nextTopicBySubject,
    focusSessions: [],
    aiMemory: [],
  };
}

export function buildSeededState(): AppState {
  const base = createInitialAppState();

  // Pre-schedule upcoming D7 and D23 maintenance revisions for already-completed Mensuration (MAT-21, 20 Nov 2026)
  // while keeping D1/D3 marked completed so Day 0 does not invent fake overdue tasks.
  let seededRevisions = [...base.revisions];
  const mensuration = base.chapters.find((c) => c.id === 'MAT-21');
  if (mensuration && mensuration.lastStudiedDate) {
    const revs = scheduleRevisionsForChapter(mensuration, mensuration.lastStudiedDate, []);
    for (const r of revs) {
      if (r.stage === 'D1' || r.stage === 'D3') {
        seededRevisions.push({
          ...r,
          completed: true,
          completedDate: r.originalDueDate,
          confidence: 4,
          practiceDone: true,
        });
      } else {
        seededRevisions.push(r);
      }
    }
  }

  const withRevs: AppState = {
    ...base,
    revisions: seededRevisions,
  };

  withRevs.plans = generateScheduleRange(withRevs, BASELINE_DATE, FINAL_EXAM_DATE);
  return withRevs;
}

export function loadAppState(): AppState {
  if (typeof window === 'undefined') {
    return buildSeededState();
  }
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const migrated = migrateAppState(JSON.parse(rawV2));
      saveAppState(migrated);
      return migrated;
    }

    const rawV1 = window.localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateAppState(JSON.parse(rawV1));
      saveAppState(migrated);
      return migrated;
    }

    const fresh = buildSeededState();
    saveAppState(fresh);
    return fresh;
  } catch {
    const fresh = buildSeededState();
    saveAppState(fresh);
    return fresh;
  }
}

export function saveAppState(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function loadActiveTimer(): ActiveTimerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveTimerState> & { presetId?: string };
    if (!parsed || typeof parsed.taskTitle !== 'string' || typeof parsed.date !== 'string') {
      return null;
    }
    const inferredType =
      parsed.timerType ??
      (parsed.isFlowtime ? 'stopwatch' : parsed.presetId === '25_5' || parsed.presetId === '50_10' ? 'pomodoro' : 'countdown');
    const safePreset: ActiveTimerState['presetId'] =
      parsed.presetId === '25_5' ||
      parsed.presetId === '50_10' ||
      parsed.presetId === 'custom' ||
      parsed.presetId === 'stopwatch'
        ? parsed.presetId
        : inferredType === 'stopwatch'
          ? 'stopwatch'
          : 'custom';
    return {
      timerType: inferredType,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : undefined,
      taskTitle: parsed.taskTitle,
      subjectId: parsed.subjectId,
      chapterId: parsed.chapterId,
      objective: parsed.objective,
      mode: parsed.mode === 'short_break' || parsed.mode === 'long_break' ? parsed.mode : 'focus',
      presetId: safePreset,
      focusMinutes: typeof parsed.focusMinutes === 'number' ? parsed.focusMinutes : 25,
      breakMinutes: typeof parsed.breakMinutes === 'number' ? parsed.breakMinutes : 5,
      longBreakMinutes: typeof parsed.longBreakMinutes === 'number' ? parsed.longBreakMinutes : 15,
      pomodoroCycle: typeof parsed.pomodoroCycle === 'number' ? Math.max(1, parsed.pomodoroCycle) : 1,
      pomodoroCyclesBeforeLong:
        typeof parsed.pomodoroCyclesBeforeLong === 'number' ? Math.max(1, parsed.pomodoroCyclesBeforeLong) : 4,
      isFlowtime: inferredType === 'stopwatch' || Boolean(parsed.isFlowtime),
      isRunning: Boolean(parsed.isRunning),
      soundEnabled: Boolean(parsed.soundEnabled),
      startedAtMs: typeof parsed.startedAtMs === 'number' ? parsed.startedAtMs : null,
      accumulatedSeconds: typeof parsed.accumulatedSeconds === 'number' ? parsed.accumulatedSeconds : 0,
      targetSeconds: typeof parsed.targetSeconds === 'number' ? parsed.targetSeconds : 25 * 60,
      date: parsed.date,
    };
  } catch {
    return null;
  }
}

export function saveActiveTimer(timer: ActiveTimerState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!timer) {
      window.localStorage.removeItem(TIMER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
    }
  } catch {
    // Ignore quota errors gracefully
  }
}

export function validateBackupPayload(data: unknown): data is AppState {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<AppState>;
  return (
    Array.isArray(candidate.chapters) &&
    Array.isArray(candidate.exams) &&
    Array.isArray(candidate.revisions) &&
    Array.isArray(candidate.formulas) &&
    typeof candidate.plans === 'object' &&
    candidate.plans !== null &&
    typeof candidate.settings === 'object' &&
    candidate.settings !== null
  );
}
