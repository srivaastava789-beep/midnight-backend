import type {
  AppState,
  BacklogNote,
  ChapterDifficulty,
  StudyTask,
  SubjectId,
} from '../types/study.ts';
import { addMinutesToTime } from '../utils/date.ts';

export function isValidISODate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return -1;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
  return hh * 60 + mm;
}

export interface ValidationResult {
  valid: boolean;
  tasks: StudyTask[];
  remainingBacklog: BacklogNote[];
  violations: string[];
}

/**
 * Hard scheduling validator shared between server-side Gemini output and tests.
 * Enforces:
 * 1. Valid ISO dates and active (not past) exams.
 * 2. Preserves already-completed tasks untouched.
 * 3. Study window boundaries (evening tasks end by settings.eveningEnd, within availableMinutes).
 * 4. Max 1 Mathematics chapter per session/day.
 * 5. At most 1 Hard chapter in an evening session.
 * 6. Telugu belongs in the morning slot (blockIndex 0) with realistic duration (45-90m).
 * 7. Never schedules Strong/Completed chapters as first_study.
 * 8. Splits/defers overflow into remainingBacklog rather than overloading the day.
 */
export function validateAndConstrainDayTasks(
  proposedTasks: StudyTask[],
  state: AppState,
  targetDate: string,
  availableMinutes: number
): ValidationResult {
  const violations: string[] = [];
  const remainingBacklog: BacklogNote[] = [];

  if (!isValidISODate(targetDate)) {
    return {
      valid: false,
      tasks: [],
      remainingBacklog: [],
      violations: [`Invalid target date: ${targetDate}`],
    };
  }

  const existingPlan = state.plans[targetDate];
  const completedPreserved = (existingPlan?.tasks ?? []).filter((t) => t.completed);
  const completedIds = new Set(completedPreserved.map((t) => t.id));

  const validSubjectIds = new Set<SubjectId>([
    'english_language',
    'english_literature',
    'mathematics',
    'biology',
    'geography',
    'chemistry',
    'history_civics',
    'commercial_applications',
    'telugu',
    'physics',
  ]);

  const chapterMap = new Map(state.chapters.map((c) => [c.id, c]));
  const examBySubject = new Map(state.exams.map((e) => [e.subjectId, e]));

  const eveningStartMin = Math.max(0, timeToMinutes(state.settings.eveningStart));
  const eveningEndMin = Math.max(eveningStartMin + 30, timeToMinutes(state.settings.eveningEnd));
  const windowSpan = Math.max(30, eveningEndMin - eveningStartMin);
  const maxEveningCapacity = Math.min(availableMinutes, windowSpan);

  // Track preserved completed task counts
  let mathChapterCount = completedPreserved.filter(
    (t) => t.subjectId === 'mathematics' && Boolean(t.chapterId)
  ).length;
  let eveningHardCount = completedPreserved.filter(
    (t) => t.blockIndex >= 1 && t.difficulty === 'Hard'
  ).length;
  let eveningUsedMinutes = completedPreserved
    .filter((t) => t.blockIndex >= 1)
    .reduce((sum, t) => sum + t.durationMinutes, 0);
  let hasMorningTelugu = completedPreserved.some(
    (t) => t.blockIndex === 0 && t.subjectId === 'telugu'
  );

  const seenChapterIds = new Set(
    completedPreserved.map((t) => t.chapterId).filter((id): id is string => Boolean(id))
  );

  const accepted: StudyTask[] = [...completedPreserved];
  let eveningCursorMin = eveningStartMin + eveningUsedMinutes;
  if (completedPreserved.some((t) => t.blockIndex >= 1)) {
    eveningCursorMin += state.settings.breakMinutes;
  }

  for (const raw of proposedTasks) {
    if (completedIds.has(raw.id)) continue;

    if (!validSubjectIds.has(raw.subjectId)) {
      violations.push(`Rejected unknown subject: ${String(raw.subjectId)}`);
      continue;
    }

    const exam = examBySubject.get(raw.subjectId);
    if (exam && exam.date < targetDate) {
      violations.push(`Skipped ${raw.title}: ${exam.subjectName} exam already passed (${exam.date}).`);
      continue;
    }

    const ch = raw.chapterId ? chapterMap.get(raw.chapterId) : undefined;
    if (raw.chapterId && !ch) {
      violations.push(`Rejected unknown chapterId: ${raw.chapterId}`);
      continue;
    }
    if (ch && seenChapterIds.has(ch.id)) {
      continue;
    }

    let taskType = raw.taskType;
    if (ch && (ch.status === 'Strong' || ch.status === 'Completed') && taskType === 'first_study') {
      taskType = 'exam_prep';
      violations.push(`Adjusted ${ch.id} from first_study to exam_prep because it is already ${ch.status}.`);
    }

    const difficulty: ChapterDifficulty = ch?.difficulty ?? raw.difficulty ?? 'Medium';

    // Max 1 Mathematics chapter per study session/day
    if (raw.subjectId === 'mathematics' && raw.chapterId) {
      if (mathChapterCount >= 1) {
        violations.push(`Deferred ${raw.title}: max 1 Mathematics chapter allowed per session.`);
        remainingBacklog.push({
          subjectId: raw.subjectId,
          chapterId: raw.chapterId,
          title: raw.title,
          reason: 'Max 1 Mathematics chapter per session',
          remainingMinutes: raw.durationMinutes,
        });
        continue;
      }
      mathChapterCount += 1;
    }

    // Telugu belongs in morning slot with realistic dedicated time (45-90m)
    const isTeluguMorning = raw.subjectId === 'telugu' && raw.blockIndex === 0;
    if (raw.subjectId === 'telugu' && raw.blockIndex >= 1) {
      violations.push(`Moved Telugu task "${raw.title}" out of evening into morning rules / backlog.`);
      if (!hasMorningTelugu) {
        const dur = Math.min(90, Math.max(45, raw.durationMinutes || state.settings.teluguMorningMinutes || 60));
        hasMorningTelugu = true;
        if (ch) seenChapterIds.add(ch.id);
        accepted.push({
          ...raw,
          blockIndex: 0,
          durationMinutes: dur,
          timeSlot: `07:30–${addMinutesToTime('07:30', dur)}`,
          taskType,
          difficulty,
          scheduledDate: targetDate,
          originalDate: raw.originalDate || targetDate,
        });
      } else {
        remainingBacklog.push({
          subjectId: 'telugu',
          chapterId: raw.chapterId,
          title: raw.title,
          reason: 'Morning Telugu slot already filled',
          remainingMinutes: raw.durationMinutes,
        });
      }
      continue;
    }

    if (isTeluguMorning) {
      if (hasMorningTelugu) {
        remainingBacklog.push({
          subjectId: 'telugu',
          chapterId: raw.chapterId,
          title: raw.title,
          reason: 'Morning Telugu slot already allocated',
          remainingMinutes: raw.durationMinutes,
        });
        continue;
      }
      const dur = Math.min(90, Math.max(45, raw.durationMinutes || state.settings.teluguMorningMinutes || 60));
      hasMorningTelugu = true;
      if (ch) seenChapterIds.add(ch.id);
      accepted.push({
        ...raw,
        blockIndex: 0,
        durationMinutes: dur,
        timeSlot: `07:30–${addMinutesToTime('07:30', dur)}`,
        taskType,
        difficulty,
        scheduledDate: targetDate,
        originalDate: raw.originalDate || targetDate,
      });
      continue;
    }

    // Evening block constraints
    if (difficulty === 'Hard' && eveningHardCount >= 1) {
      violations.push(`Deferred ${raw.title}: max 1 Hard chapter per evening session.`);
      remainingBacklog.push({
        subjectId: raw.subjectId,
        chapterId: raw.chapterId,
        title: raw.title,
        reason: 'Avoid stacking multiple Hard chapters in one evening',
        remainingMinutes: raw.durationMinutes,
      });
      continue;
    }

    const breakNeeded = accepted.some((t) => t.blockIndex >= 1) ? state.settings.breakMinutes : 0;
    const capacityLeft = maxEveningCapacity - eveningUsedMinutes;
    const endRoomLeft = eveningEndMin - (eveningCursorMin + breakNeeded);
    const effectiveRoom = Math.min(capacityLeft, endRoomLeft);

    if (effectiveRoom < 25) {
      remainingBacklog.push({
        subjectId: raw.subjectId,
        chapterId: raw.chapterId,
        title: raw.title,
        reason: `Exceeds study window ending at ${state.settings.eveningEnd}`,
        remainingMinutes: raw.durationMinutes,
      });
      continue;
    }

    let finalDuration = Math.max(25, Math.min(120, Math.round(raw.durationMinutes)));
    let splitPart = raw.splitPart;
    let finalTitle = raw.title;

    if (finalDuration > effectiveRoom) {
      const leftover = finalDuration - effectiveRoom;
      finalDuration = effectiveRoom;
      if (!splitPart) {
        splitPart = 'Part 1';
        finalTitle = `${raw.title} (Part 1)`;
      }
      remainingBacklog.push({
        subjectId: raw.subjectId,
        chapterId: raw.chapterId,
        title: `${raw.title} (Remaining ${leftover}m)`,
        reason: `Split to stay inside ${state.settings.eveningStart}–${state.settings.eveningEnd} window`,
        remainingMinutes: leftover,
      });
    }

    const startMin = eveningCursorMin + breakNeeded;
    const startHHMM = `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
    const endHHMM = addMinutesToTime(startHHMM, finalDuration);

    eveningUsedMinutes += finalDuration;
    eveningCursorMin = startMin + finalDuration;
    if (difficulty === 'Hard') eveningHardCount += 1;
    if (ch) seenChapterIds.add(ch.id);

    const eveningCount = accepted.filter((t) => t.blockIndex >= 1).length;
    accepted.push({
      ...raw,
      title: finalTitle,
      blockIndex: Math.min(3, eveningCount + 1),
      durationMinutes: finalDuration,
      timeSlot: `${startHHMM}–${endHHMM}`,
      taskType,
      difficulty,
      splitPart,
      scheduledDate: targetDate,
      originalDate: raw.originalDate || targetDate,
    });
  }

  accepted.sort((a, b) => a.blockIndex - b.blockIndex || a.timeSlot.localeCompare(b.timeSlot));

  return {
    valid: true,
    tasks: accepted,
    remainingBacklog,
    violations,
  };
}
