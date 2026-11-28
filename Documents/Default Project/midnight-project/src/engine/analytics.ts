import { SUBJECT_MAP, SUBJECTS } from '../data/seed.ts';
import type { AppState, ChapterItem, DayPlan, SubjectId } from '../types/study.ts';
import { addDays } from '../utils/date.ts';

export interface SubjectProgressStat {
  subjectId: SubjectId;
  subjectName: string;
  total: number;
  completed: number;
  inProgress: number;
  needsRevision: number;
  strong: number;
  weak: number;
  unconfirmed: number;
  practiceDone: number;
  answerWritingDone: number;
  completionPercent: number;
}

export interface OverallSyllabusStats {
  totalPortions: number;
  completedPortions: number;
  inProgressPortions: number;
  weakPortions: number;
  strongPortions: number;
  needsRevisionPortions: number;
  unconfirmedPortions: number;
  overallCompletionPercent: number;
  bySubject: SubjectProgressStat[];
}

export function calculateSyllabusStats(chapters: ChapterItem[]): OverallSyllabusStats {
  const bySubject: SubjectProgressStat[] = SUBJECTS.filter((s) => s.hasChapters).map((subj) => {
    const items = chapters.filter((c) => c.subjectId === subj.id);
    const completed = items.filter((c) => c.status === 'Completed' || c.status === 'Strong').length;
    const inProgress = items.filter((c) => c.status === 'In Progress').length;
    const needsRevision = items.filter((c) => c.status === 'Needs Revision').length;
    const strong = items.filter((c) => c.status === 'Strong').length;
    const weak = items.filter((c) => c.isWeak || c.status === 'Weak').length;
    const unconfirmed = items.filter((c) => !c.isStateConfirmed).length;
    const practiceDone = items.filter((c) => c.practiceStatus === 'Done').length;
    const answerWritingDone = items.filter((c) => c.answerWritingStatus === 'Done').length;

    return {
      subjectId: subj.id,
      subjectName: subj.name,
      total: items.length,
      completed,
      inProgress,
      needsRevision,
      strong,
      weak,
      unconfirmed,
      practiceDone,
      answerWritingDone,
      completionPercent: items.length === 0 ? 0 : Math.round((completed / items.length) * 100),
    };
  });

  const totalPortions = chapters.length;
  const completedPortions = chapters.filter(
    (c) => c.status === 'Completed' || c.status === 'Strong'
  ).length;
  const inProgressPortions = chapters.filter((c) => c.status === 'In Progress').length;
  const weakPortions = chapters.filter((c) => c.isWeak || c.status === 'Weak').length;
  const strongPortions = chapters.filter((c) => c.status === 'Strong').length;
  const needsRevisionPortions = chapters.filter((c) => c.status === 'Needs Revision').length;
  const unconfirmedPortions = chapters.filter((c) => !c.isStateConfirmed).length;

  return {
    totalPortions,
    completedPortions,
    inProgressPortions,
    weakPortions,
    strongPortions,
    needsRevisionPortions,
    unconfirmedPortions,
    overallCompletionPercent:
      totalPortions === 0 ? 0 : Math.round((completedPortions / totalPortions) * 100),
    bySubject,
  };
}

export interface DaySummary {
  date: string;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  plannedMinutes: number;
  completedMinutes: number;
  focusMinutesLogged: number;
  carriedForwardCount: number;
  revisionsCompleted: number;
  workoutCompleted: boolean;
}

export function calculateDaySummary(plan: DayPlan | undefined, state: AppState, date: string): DaySummary {
  const revisionsCompleted = state.revisions.filter(
    (r) => r.completed && r.completedDate === date
  ).length;

  const focusMinutesLogged = (state.focusSessions ?? [])
    .filter((s) => s.date === date && (s.mode === 'focus' || s.mode === 'flowtime'))
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  if (!plan) {
    return {
      date,
      totalTasks: 0,
      completedTasks: 0,
      completionPercent: 0,
      plannedMinutes: 0,
      completedMinutes: 0,
      focusMinutesLogged,
      carriedForwardCount: 0,
      revisionsCompleted,
      workoutCompleted: false,
    };
  }

  const activeTasks = plan.tasks;
  const completedTasks = activeTasks.filter((t) => t.completed).length;
  const plannedMinutes = activeTasks.reduce((s, t) => s + t.durationMinutes, 0);
  const taskCompletedMinutes = activeTasks
    .filter((t) => t.completed)
    .reduce((s, t) => s + t.durationMinutes, 0);
  const completedMinutes = Math.max(taskCompletedMinutes, focusMinutesLogged);
  const carriedForwardCount = activeTasks.filter((t) => t.carriedForward).length;

  return {
    date,
    totalTasks: activeTasks.length,
    completedTasks,
    completionPercent:
      activeTasks.length === 0 ? 0 : Math.round((completedTasks / activeTasks.length) * 100),
    plannedMinutes,
    completedMinutes,
    focusMinutesLogged,
    carriedForwardCount,
    revisionsCompleted,
    workoutCompleted: plan.workout?.completed ?? false,
  };
}

export interface WeeklyAnalytics {
  startDate: string;
  endDate: string;
  totalPlannedMinutes: number;
  totalCompletedMinutes: number;
  totalFocusMinutesLogged: number;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  revisionsCompleted: number;
  revisionsDueInWindow: number;
  revisionConsistencyPercent: number;
  subjectMinutes: { subjectId: SubjectId; subjectName: string; minutes: number }[];
  weakTopics: ChapterItem[];
}

export function calculateWeeklyAnalytics(state: AppState, endDate: string): WeeklyAnalytics {
  const startDate = addDays(endDate, -6);
  let totalPlannedMinutes = 0;
  let totalCompletedMinutes = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  const subjectMap: Partial<Record<SubjectId, number>> = {};

  for (let i = 0; i < 7; i++) {
    const d = addDays(startDate, i);
    const plan = state.plans[d];
    if (!plan) continue;
    for (const t of plan.tasks) {
      totalTasks += 1;
      totalPlannedMinutes += t.durationMinutes;
      if (t.completed) {
        completedTasks += 1;
        totalCompletedMinutes += t.durationMinutes;
        subjectMap[t.subjectId] = (subjectMap[t.subjectId] ?? 0) + t.durationMinutes;
      }
    }
  }

  const focusInWindow = (state.focusSessions ?? []).filter(
    (s) =>
      s.date >= startDate &&
      s.date <= endDate &&
      (s.mode === 'focus' || s.mode === 'flowtime')
  );
  const totalFocusMinutesLogged = focusInWindow.reduce((sum, s) => sum + s.durationMinutes, 0);

  // Add focus-session minutes for tasks not yet marked completed so logged focus shows up in analytics
  for (const sess of focusInWindow) {
    if (sess.subjectId) {
      const plan = state.plans[sess.date];
      const linkedDone = sess.taskId
        ? plan?.tasks.some((t) => t.id === sess.taskId && t.completed)
        : false;
      if (!linkedDone) {
        totalCompletedMinutes += sess.durationMinutes;
        subjectMap[sess.subjectId] = (subjectMap[sess.subjectId] ?? 0) + sess.durationMinutes;
      }
    }
  }

  const revisionsDueInWindow = state.revisions.filter(
    (r) => r.scheduledDate >= startDate && r.scheduledDate <= endDate
  ).length;
  const revisionsCompleted = state.revisions.filter(
    (r) =>
      r.completed &&
      r.completedDate !== null &&
      r.completedDate >= startDate &&
      r.completedDate <= endDate
  ).length;

  const subjectMinutes = Object.entries(subjectMap)
    .map(([subjectId, minutes]) => ({
      subjectId: subjectId as SubjectId,
      subjectName: SUBJECT_MAP[subjectId as SubjectId]?.name ?? subjectId,
      minutes: minutes ?? 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const weakTopics = state.chapters.filter(
    (c) =>
      c.isWeak ||
      c.status === 'Weak' ||
      c.status === 'Needs Revision' ||
      (c.confidence !== null && c.confidence <= 2)
  );

  return {
    startDate,
    endDate,
    totalPlannedMinutes,
    totalCompletedMinutes,
    totalFocusMinutesLogged,
    totalTasks,
    completedTasks,
    completionPercent: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    revisionsCompleted,
    revisionsDueInWindow,
    revisionConsistencyPercent:
      revisionsDueInWindow === 0
        ? revisionsCompleted > 0
          ? 100
          : 0
        : Math.min(100, Math.round((revisionsCompleted / revisionsDueInWindow) * 100)),
    subjectMinutes,
    weakTopics,
  };
}
