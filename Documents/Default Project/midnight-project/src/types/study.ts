export type SubjectId =
  | 'english_language'
  | 'english_literature'
  | 'mathematics'
  | 'biology'
  | 'geography'
  | 'chemistry'
  | 'history_civics'
  | 'commercial_applications'
  | 'telugu'
  | 'physics';

export type ChapterStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Needs Revision'
  | 'Strong'
  | 'Weak';

export type PracticeStatus = 'Not Started' | 'In Progress' | 'Done';

export type ChapterDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Not rated';

export type TimeEstimateStandard =
  | 'unassigned'
  | 'section1_30_60_90'
  | 'section12_15_45_90';

export type RevisionStage = 'D1' | 'D3' | 'D7' | 'D23' | 'Extra';

export type TaskType =
  | 'first_study'
  | 'revision'
  | 'practice'
  | 'exam_prep'
  | 'custom';

export interface SubjectMeta {
  id: SubjectId;
  name: string;
  shortName: string;
  hasChapters: boolean;
}

export interface ChapterItem {
  id: string;
  subjectId: SubjectId;
  subCategory?: 'History' | 'Civics';
  chapterName: string;
  status: ChapterStatus;
  isWeak: boolean;
  isStateConfirmed: boolean;
  confidence: number | null; // 1-5
  lastStudiedDate: string | null; // YYYY-MM-DD
  lastRevision: string | null; // YYYY-MM-DD
  revisionDueDate: string | null; // YYYY-MM-DD
  mistakes: string;
  practiceStatus: PracticeStatus;
  answerWritingStatus: PracticeStatus;
  notes: string;
  plannedStudyDate: string | null; // YYYY-MM-DD
  difficulty: ChapterDifficulty;
  estimatedMinutes: number | null; // null until user assigns or chooses time standard
  completedParts?: string[]; // e.g. ["Part A", "Part B"]
  remainingParts?: string[]; // e.g. ["Part C", "Part D"]
  totalPartsCount?: number;
}

export interface PracticeTopicItem {
  id: string;
  subjectId: 'english_language' | 'telugu' | 'english_literature';
  category: 'english_language' | 'telugu_practice' | 'extra_literature';
  title: string;
  status: ChapterStatus;
  confidence: number | null;
  lastPracticedDate: string | null;
  practiceCount: number;
  mistakes: string;
  notes: string;
}

export interface ExamItem {
  id: string;
  subjectId: SubjectId;
  subjectName: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  notes: string;
}

export interface RevisionTask {
  id: string;
  chapterId: string;
  subjectId: SubjectId;
  chapterName: string;
  stage: RevisionStage;
  originalDueDate: string; // YYYY-MM-DD (immutable)
  scheduledDate: string; // YYYY-MM-DD
  completed: boolean;
  completedDate: string | null;
  confidence: number | null;
  mistakes: string;
  practiceDone: boolean;
  answerWritingDone: boolean;
  carriedForward: boolean;
}

export interface StudyTask {
  id: string;
  subjectId: SubjectId;
  chapterId?: string;
  practiceTopicId?: string;
  revisionId?: string;
  title: string;
  objective: string;
  durationMinutes: number;
  timeSlot: string;
  blockIndex: number; // 0 = Morning (Telugu), 1 = Block 1, 2 = Block 2, 3 = Extra/Custom
  taskType: TaskType;
  completed: boolean;
  completedAt: string | null;
  originalDate: string; // YYYY-MM-DD (never overwritten)
  scheduledDate: string; // YYYY-MM-DD
  carriedForward: boolean;
  dismissed?: boolean;
  splitPart?: string;
  subPartLabel?: string; // e.g. "Parts C & D"
  completedParts?: string[];
  remainingParts?: string[];
  difficulty: ChapterDifficulty;
  aiReason?: string;
}

export interface WorkoutEntry {
  completed: boolean;
  title: string;
  durationMinutes: number;
  notes: string;
}

export interface BacklogNote {
  subjectId: SubjectId;
  chapterId?: string;
  title: string;
  reason: string;
  remainingMinutes?: number;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  availableMinutes: number;
  tasks: StudyTask[];
  workout: WorkoutEntry;
  generatedAt: string;
  isManuallyAdjusted: boolean;
  plannedBy?: 'local' | 'gemini';
  whyThisPlan?: string;
  remainingBacklog?: BacklogNote[];
}

export type FocusTimerMode = 'countdown' | 'stopwatch' | 'pomodoro';

export type FocusClockStyle = 'minimal' | 'bold';

export interface FocusTimerPreferences {
  defaultMode: FocusTimerMode;
  countdownMinutes: number; // 1..maxDayMinutes
  pomodoroWorkMinutes: number; // 5..180
  pomodoroShortBreakMinutes: number; // 1..60
  pomodoroLongBreakMinutes: number; // 1..90
  pomodoroCyclesBeforeLong: number; // 1..8
  maxDayMinutes: number; // 30..1440 (up to 24h customizable day)
  soundEnabled: boolean;
  wallpaperId: string; // 'auto' | 'none' | curated id
  wallpaperRotateSeconds: number; // 0 (off) | 15 | 30 | 60 | 120
  backgroundDimPercent: number; // 25..85
  showQuote: boolean;
  clockStyle: FocusClockStyle;
}

export type AiMemoryCategory = 'test' | 'daily_update' | 'preference';

export interface AiMemoryItem {
  id: string;
  category: AiMemoryCategory;
  content: string;
  subjectId?: SubjectId;
  testDate?: string; // YYYY-MM-DD
  prepDate?: string; // YYYY-MM-DD (1 day before testDate)
  syllabus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSettings {
  eveningStart: string; // "17:30"
  eveningEnd: string; // "20:00"
  blockDurationMinutes: number; // 75
  breakMinutes: number; // 10
  teluguMorningMinutes: number; // 60 realistic dedicated morning slot
  timeEstimateStandard: TimeEstimateStandard;
  /** Day of week 0 (Sun) - 6 (Sat) -> subject pairs */
  rotation: Record<number, [SubjectId | 'weakest_priority', SubjectId | 'rotating_low']>;
  focusTimerPrefs?: FocusTimerPreferences;
}

export interface FormulaItem {
  id: string;
  name: string;
  subjectId: SubjectId;
  chapter: string;
  topic: string;
  latex: string;
  symbols: string;
  example: string;
  notes: string;
  status: 'Mastered' | 'Needs Revision';
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecoverySuggestion {
  id: string;
  sourceTaskId?: string;
  sourceRevisionId?: string;
  kind: 'task' | 'revision';
  subjectId: SubjectId;
  chapterId?: string;
  title: string;
  objective: string;
  originalDate: string;
  suggestedDate: string;
  durationMinutes: number;
  splitRecommended: boolean;
  priorityScore: number;
  reason: string;
  difficulty: ChapterDifficulty;
}

export interface FocusSession {
  id: string;
  date: string; // YYYY-MM-DD
  taskId?: string;
  subjectId?: SubjectId;
  chapterId?: string;
  taskTitle: string;
  mode: 'focus' | 'short_break' | 'long_break' | 'flowtime';
  timerType?: FocusTimerMode;
  durationMinutes: number;
  startedAt: string;
  endedAt: string;
}

export interface ActiveTimerState {
  timerType: FocusTimerMode;
  taskId?: string;
  taskTitle: string;
  subjectId?: SubjectId;
  chapterId?: string;
  objective?: string;
  mode: 'focus' | 'short_break' | 'long_break';
  presetId: '25_5' | '50_10' | 'custom' | 'stopwatch';
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  pomodoroCycle: number;
  pomodoroCyclesBeforeLong: number;
  isFlowtime: boolean;
  isRunning: boolean;
  soundEnabled: boolean;
  /** Epoch ms when the current running segment started, or null if paused */
  startedAtMs: number | null;
  /** Accumulated seconds before the current running segment */
  accumulatedSeconds: number;
  /** Target total seconds when countdown or pomodoro */
  targetSeconds: number;
  /** Active study date for logging */
  date: string;
}

export interface SyllabusAuditIssue {
  id: string;
  title: string;
  details: string;
  source: string;
}

export type ScheduleOperation =
  | {
      type: 'replace_day_plan';
      date: string;
      availableMinutes?: number;
      tasks: Array<{
        subjectId: SubjectId;
        chapterId?: string;
        title: string;
        objective: string;
        durationMinutes: number;
        blockIndex: number;
        taskType: TaskType;
        reason?: string;
      }>;
      summary: string;
    }
  | {
      type: 'add_task';
      date: string;
      subjectId: SubjectId;
      chapterId?: string;
      title: string;
      objective: string;
      durationMinutes: number;
      blockIndex: number;
      taskType: TaskType;
      summary: string;
    }
  | {
      type: 'move_task';
      fromDate: string;
      toDate: string;
      taskId?: string;
      matchTitle?: string;
      blockIndex?: number;
      summary: string;
    }
  | {
      type: 'remove_task';
      date: string;
      taskId?: string;
      matchTitle?: string;
      summary: string;
    }
  | {
      type: 'update_day_window';
      date: string;
      availableMinutes: number;
      summary: string;
    }
  | {
      type: 'update_settings';
      eveningStart?: string;
      eveningEnd?: string;
      blockDurationMinutes?: number;
      breakMinutes?: number;
      teluguMorningMinutes?: number;
      summary: string;
    }
  | {
      type: 'set_next_topic';
      subjectId: SubjectId;
      chapterId: string;
      summary: string;
    }
  | {
      type: 'save_memory';
      memoryId?: string;
      category: AiMemoryCategory;
      content: string;
      subjectId?: SubjectId;
      testDate?: string;
      prepDate?: string;
      syllabus?: string;
      summary: string;
    }
  | {
      type: 'remove_memory';
      memoryId?: string;
      matchText?: string;
      summary: string;
    }
  | {
      type: 'schedule_test_prep';
      testDate: string;
      subjectId: SubjectId;
      syllabus: string;
      chapterId?: string;
      durationMinutes?: number;
      summary: string;
    }
  | {
      type: 'update_chapter_progress';
      chapterId: string;
      subjectId?: SubjectId;
      status?: ChapterStatus;
      completedParts?: string[];
      remainingParts?: string[];
      isWeak?: boolean;
      confidence?: number;
      mistakes?: string;
      notes?: string;
      scheduleRemainingDate?: string;
      durationMinutes?: number;
      summary: string;
    }
  | {
      type: 'batch_update_chapters';
      updates: Array<{
        chapterId?: string;
        subjectId?: SubjectId;
        chapterNameMatch?: string;
        status: ChapterStatus;
        completedParts?: string[];
        remainingParts?: string[];
        confidence?: number;
        isWeak?: boolean;
        notes?: string;
      }>;
      summary: string;
    };

export interface ScheduleChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ScheduleChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  isOutOfScope?: boolean;
  appliedChanges?: string[];
  rejectedChanges?: string[];
  undone?: boolean;
  snapshotBefore?: {
    chapters?: ChapterItem[];
    revisions?: RevisionTask[];
    plans: Record<string, DayPlan>;
    settings: ScheduleSettings;
    nextTopicBySubject: Partial<Record<SubjectId, string>>;
    aiMemory: AiMemoryItem[];
  };
}

export interface AppState {
  version: number;
  baselineDate: string; // "2026-11-24"
  chapters: ChapterItem[];
  practiceTopics: PracticeTopicItem[];
  exams: ExamItem[];
  revisions: RevisionTask[];
  plans: Record<string, DayPlan>; // keyed by YYYY-MM-DD
  formulas: FormulaItem[];
  settings: ScheduleSettings;
  nextTopicBySubject: Partial<Record<SubjectId, string>>;
  focusSessions: FocusSession[];
  aiMemory: AiMemoryItem[];
}
