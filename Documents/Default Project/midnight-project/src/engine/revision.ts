import type {
  ChapterItem,
  RevisionStage,
  RevisionTask,
} from '../types/study.ts';
import { addDays } from '../utils/date.ts';

const STAGE_OFFSETS: { stage: RevisionStage; offset: number }[] = [
  { stage: 'D1', offset: 1 },
  { stage: 'D3', offset: 3 },
  { stage: 'D7', offset: 7 },
  { stage: 'D23', offset: 23 },
];

export function scheduleRevisionsForChapter(
  chapter: ChapterItem,
  completionDate: string,
  existingRevisions: RevisionTask[]
): RevisionTask[] {
  const nextRevisions = [...existingRevisions];

  for (const { stage, offset } of STAGE_OFFSETS) {
    const alreadyExists = nextRevisions.some(
      (r) => r.chapterId === chapter.id && r.stage === stage && !r.completed
    );
    if (alreadyExists) continue;

    const dueDate = addDays(completionDate, offset);
    nextRevisions.push({
      id: `rev-${chapter.id}-${stage}-${dueDate}-${Math.random().toString(36).slice(2, 6)}`,
      chapterId: chapter.id,
      subjectId: chapter.subjectId,
      chapterName: chapter.chapterName,
      stage,
      originalDueDate: dueDate,
      scheduledDate: dueDate,
      completed: false,
      completedDate: null,
      confidence: chapter.confidence,
      mistakes: '',
      practiceDone: chapter.practiceStatus === 'Done',
      answerWritingDone: chapter.answerWritingStatus === 'Done',
      carriedForward: false,
    });
  }

  return nextRevisions;
}

export function getNextDueDateForChapter(
  chapterId: string,
  revisions: RevisionTask[]
): string | null {
  const pending = revisions
    .filter((r) => r.chapterId === chapterId && !r.completed)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return pending.length > 0 ? pending[0].scheduledDate : null;
}

export interface CompleteRevisionPayload {
  completedDate: string;
  confidence: number;
  mistakes: string;
  practiceDone: boolean;
  answerWritingDone: boolean;
}

export function completeRevisionTask(
  revisionId: string,
  chapters: ChapterItem[],
  revisions: RevisionTask[],
  payload: CompleteRevisionPayload
): { chapters: ChapterItem[]; revisions: RevisionTask[] } {
  const target = revisions.find((r) => r.id === revisionId);
  if (!target) {
    return { chapters, revisions };
  }

  const trimmedMistakes = payload.mistakes.trim();
  const isLowConfidenceOrMistakes = payload.confidence <= 2 || trimmedMistakes.length > 0;
  const isStrongPerformance = payload.confidence === 5 && trimmedMistakes.length === 0;

  let nextRevisions: RevisionTask[] = revisions.map((r) =>
    r.id === revisionId
      ? {
          ...r,
          completed: true,
          completedDate: payload.completedDate,
          confidence: payload.confidence,
          mistakes: trimmedMistakes,
          practiceDone: payload.practiceDone,
          answerWritingDone: payload.answerWritingDone,
        }
      : r
  );

  // If confidence is low or mistakes are logged, schedule an extra targeted review in 2 days
  if (isLowConfidenceOrMistakes) {
    const extraDate = addDays(payload.completedDate, 2);
    const hasPendingExtra = nextRevisions.some(
      (r) => r.chapterId === target.chapterId && r.stage === 'Extra' && !r.completed
    );
    if (!hasPendingExtra) {
      nextRevisions.push({
        id: `rev-${target.chapterId}-Extra-${extraDate}-${Math.random().toString(36).slice(2, 6)}`,
        chapterId: target.chapterId,
        subjectId: target.subjectId,
        chapterName: target.chapterName,
        stage: 'Extra',
        originalDueDate: extraDate,
        scheduledDate: extraDate,
        completed: false,
        completedDate: null,
        confidence: payload.confidence,
        mistakes: trimmedMistakes,
        practiceDone: payload.practiceDone,
        answerWritingDone: payload.answerWritingDone,
        carriedForward: false,
      });
    }
  }

  const nextChapters: ChapterItem[] = chapters.map((ch) => {
    if (ch.id !== target.chapterId) return ch;
    const nextDue = getNextDueDateForChapter(ch.id, nextRevisions);
    const mergedMistakes = trimmedMistakes
      ? ch.mistakes
        ? `${ch.mistakes}\n[${payload.completedDate}] ${trimmedMistakes}`
        : `[${payload.completedDate}] ${trimmedMistakes}`
      : ch.mistakes;

    return {
      ...ch,
      lastRevision: payload.completedDate,
      revisionDueDate: nextDue,
      confidence: payload.confidence,
      mistakes: mergedMistakes,
      practiceStatus: payload.practiceDone ? 'Done' : ch.practiceStatus,
      answerWritingStatus: payload.answerWritingDone ? 'Done' : ch.answerWritingStatus,
      isWeak: isLowConfidenceOrMistakes ? true : isStrongPerformance ? false : ch.isWeak,
      status: isLowConfidenceOrMistakes
        ? 'Needs Revision'
        : isStrongPerformance
          ? 'Strong'
          : ch.status === 'Not Started' || ch.status === 'In Progress'
            ? 'Completed'
            : ch.status,
      isStateConfirmed: true,
    };
  });

  return { chapters: nextChapters, revisions: nextRevisions };
}

export function rescheduleRevisionTask(
  revisionId: string,
  newDate: string,
  revisions: RevisionTask[]
): RevisionTask[] {
  return revisions.map((r) => {
    if (r.id !== revisionId) return r;
    return {
      ...r,
      scheduledDate: newDate,
      carriedForward: newDate > r.originalDueDate,
    };
  });
}

export interface CategorizedRevisions {
  today: RevisionTask[];
  overdue: RevisionTask[];
  upcoming: RevisionTask[];
  completed: RevisionTask[];
  byStage: Record<RevisionStage, RevisionTask[]>;
}

export function categorizeRevisions(
  revisions: RevisionTask[],
  activeDate: string
): CategorizedRevisions {
  const pending = revisions.filter((r) => !r.completed);
  const completed = revisions
    .filter((r) => r.completed)
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''));

  const today = pending
    .filter((r) => r.scheduledDate === activeDate)
    .sort((a, b) => a.originalDueDate.localeCompare(b.originalDueDate));

  const overdue = pending
    .filter((r) => r.scheduledDate < activeDate)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const upcoming = pending
    .filter((r) => r.scheduledDate > activeDate)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const byStage: Record<RevisionStage, RevisionTask[]> = {
    D1: pending.filter((r) => r.stage === 'D1').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    D3: pending.filter((r) => r.stage === 'D3').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    D7: pending.filter((r) => r.stage === 'D7').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    D23: pending.filter((r) => r.stage === 'D23').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    Extra: pending.filter((r) => r.stage === 'Extra').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  };

  return { today, overdue, upcoming, completed, byStage };
}
