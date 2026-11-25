import { SUBJECT_MAP, SUBJECTS } from '../data/seed.ts';
import type {
  AppState,
  ChapterDifficulty,
  ChapterItem,
  DayPlan,
  ExamItem,
  PracticeTopicItem,
  RecoverySuggestion,
  RevisionTask,
  StudyTask,
  SubjectId,
} from '../types/study.ts';
import {
  addDays,
  addMinutesToTime,
  diffDays,
  getDayOfWeek,
} from '../utils/date.ts';
import { validateAndConstrainDayTasks } from './validator.ts';

export interface UpcomingExamInfo {
  exam: ExamItem;
  daysRemaining: number;
  isToday: boolean;
  isPast: boolean;
}

export function getSortedExams(exams: ExamItem[], activeDate: string): UpcomingExamInfo[] {
  return [...exams]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((exam) => {
      const days = diffDays(exam.date, activeDate);
      return {
        exam,
        daysRemaining: days,
        isToday: days === 0,
        isPast: days < 0,
      };
    });
}

export function getNextExam(exams: ExamItem[], activeDate: string): UpcomingExamInfo | null {
  const upcoming = getSortedExams(exams, activeDate).filter((item) => !item.isPast);
  return upcoming.length > 0 ? upcoming[0] : null;
}

export interface ExamReadinessReport {
  exam: ExamItem;
  daysRemaining: number;
  chapters: ChapterItem[];
  practiceTopics: PracticeTopicItem[];
  completedCount: number;
  totalCount: number;
  strongCount: number;
  weakChapters: ChapterItem[];
  remainingChapters: ChapterItem[];
  practiceDoneCount: number;
  readinessPercent: number;
  suggestedPlan: string[];
}

export function getExamReadiness(
  exam: ExamItem,
  chapters: ChapterItem[],
  practiceTopics: PracticeTopicItem[],
  revisions: RevisionTask[],
  activeDate: string
): ExamReadinessReport {
  const daysRemaining = diffDays(exam.date, activeDate);
  const subjectChapters = chapters.filter((c) => c.subjectId === exam.subjectId);
  const subjectPractice = practiceTopics.filter((p) => p.subjectId === exam.subjectId);

  const completedChapters = subjectChapters.filter(
    (c) => c.status === 'Completed' || c.status === 'Strong'
  );
  const strongCount = subjectChapters.filter((c) => c.status === 'Strong').length;
  const weakChapters = subjectChapters.filter(
    (c) =>
      c.isWeak ||
      c.status === 'Weak' ||
      c.status === 'Needs Revision' ||
      (c.confidence !== null && c.confidence <= 2)
  );
  const remainingChapters = subjectChapters.filter(
    (c) => c.status !== 'Completed' && c.status !== 'Strong'
  );

  let totalUnits = subjectChapters.length;
  let completedUnits = completedChapters.length;

  if (subjectPractice.length > 0) {
    totalUnits += subjectPractice.length;
    completedUnits += subjectPractice.filter(
      (p) => p.status === 'Completed' || p.status === 'Strong' || p.practiceCount > 0
    ).length;
  }

  const practiceDoneCount =
    subjectChapters.filter((c) => c.practiceStatus === 'Done').length +
    subjectPractice.filter(
      (p) => p.practiceCount > 0 || p.status === 'Completed' || p.status === 'Strong'
    ).length;

  const readinessPercent =
    totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100);

  const overdueForSubject = revisions.filter(
    (r) => r.subjectId === exam.subjectId && !r.completed && r.scheduledDate <= activeDate
  );

  const suggestedPlan: string[] = [];
  if (daysRemaining < 0) {
    suggestedPlan.push('Examination completed. Removed from active priority queue.');
  } else {
    if (overdueForSubject.length > 0) {
      suggestedPlan.push(
        `Clear ${overdueForSubject.length} due/overdue spaced revision(s) first.`
      );
    }
    if (weakChapters.length > 0) {
      suggestedPlan.push(
        `Target weak areas: ${weakChapters
          .slice(0, 3)
          .map((w) => w.chapterName)
          .join(', ')}.`
      );
    }
    if (remainingChapters.length > 0) {
      suggestedPlan.push(
        `Finish ${remainingChapters.length} unconfirmed/incomplete portion(s): ${remainingChapters
          .slice(0, 3)
          .map((r) => r.chapterName)
          .join(', ')}${remainingChapters.length > 3 ? '...' : ''}.`
      );
    }
    if (subjectPractice.length > 0) {
      const pendingPractice = subjectPractice.filter(
        (p) => p.status !== 'Completed' && p.status !== 'Strong'
      );
      if (pendingPractice.length > 0) {
        suggestedPlan.push(
          `Timed practice on ${pendingPractice
            .slice(0, 3)
            .map((p) => p.title)
            .join(', ')}.`
        );
      }
    }
    if (daysRemaining <= 4) {
      suggestedPlan.push('Final sprint: Past ICSE specimen papers, timed sections & mistake log review.');
    } else if (daysRemaining <= 10) {
      suggestedPlan.push('Run 75-minute timed question blocks & answer-writing checks.');
    } else {
      suggestedPlan.push('Keep steady rotation pace alongside active recall notes.');
    }
  }

  return {
    exam,
    daysRemaining,
    chapters: subjectChapters,
    practiceTopics: subjectPractice,
    completedCount: completedChapters.length,
    totalCount: subjectChapters.length,
    strongCount,
    weakChapters,
    remainingChapters,
    practiceDoneCount,
    readinessPercent,
    suggestedPlan,
  };
}

export function computeSubjectPriority(
  subjectId: SubjectId,
  state: AppState,
  targetDate: string
): number {
  const exam = state.exams.find((e) => e.subjectId === subjectId);
  if (exam && exam.date < targetDate) {
    return 0;
  }

  let score = 20;

  if (exam) {
    const days = diffDays(exam.date, targetDate);
    if (days === 0) score += 120;
    else if (days <= 2) score += 140;
    else if (days <= 5) score += 110;
    else if (days <= 9) score += 80;
    else if (days <= 14) score += 50;
    else if (days <= 20) score += 25;
  }

  const subjectChapters = state.chapters.filter((c) => c.subjectId === subjectId);
  const weakCount = subjectChapters.filter(
    (c) => c.isWeak || c.status === 'Weak' || c.status === 'Needs Revision'
  ).length;
  const incompleteCount = subjectChapters.filter(
    (c) => c.status === 'Not Started' || c.status === 'In Progress'
  ).length;
  const dueRevisions = state.revisions.filter(
    (r) => r.subjectId === subjectId && !r.completed && r.scheduledDate <= targetDate
  ).length;

  score += weakCount * 12;
  score += dueRevisions * 18;
  score += Math.min(incompleteCount, 12) * 3;

  const nonRotationSubjects: SubjectId[] = [
    'english_language',
    'english_literature',
    'geography',
    'commercial_applications',
  ];
  if (exam && nonRotationSubjects.includes(subjectId)) {
    const days = diffDays(exam.date, targetDate);
    if (days >= 0 && days <= 15) {
      score += 45;
    }
  }

  // Boost priority for remembered upcoming unit tests / quizzes
  const upcomingTests = (state.aiMemory ?? []).filter(
    (m) => m.category === 'test' && m.subjectId === subjectId && m.testDate && m.testDate >= targetDate
  );
  for (const t of upcomingTests) {
    const daysToTest = diffDays(t.testDate!, targetDate);
    if (daysToTest <= 1) score += 160;
    else if (daysToTest <= 3) score += 90;
    else if (daysToTest <= 6) score += 35;
  }

  return score;
}

interface CandidateWork {
  subjectId: SubjectId;
  chapterId?: string;
  practiceTopicId?: string;
  revisionId?: string;
  title: string;
  objective: string;
  taskType: StudyTask['taskType'];
  difficulty: ChapterDifficulty;
  priority: number;
}

function selectBestCandidateForSubject(
  subjectId: SubjectId,
  state: AppState,
  targetDate: string,
  excludeIds: Set<string>,
  avoidHard: boolean
): CandidateWork | null {
  const exam = state.exams.find((e) => e.subjectId === subjectId);
  if (exam && exam.date < targetDate) {
    return null;
  }

  const daysUntilExam = exam ? diffDays(exam.date, targetDate) : 30;
  const isFinalSprint = targetDate >= '2026-12-01' || daysUntilExam <= 7;

  // 0. Respect explicit user-selected Next chapter/topic for this subject if valid & not excluded
  const preferredId = state.nextTopicBySubject?.[subjectId];
  if (preferredId && !excludeIds.has(preferredId)) {
    const prefCh = state.chapters.find(
      (c) => c.id === preferredId && c.subjectId === subjectId
    );
    if (prefCh && !(avoidHard && prefCh.difficulty === 'Hard')) {
      const dueRevForPref = state.revisions.find(
        (r) => r.chapterId === prefCh.id && !r.completed && r.scheduledDate <= targetDate
      );
      if (dueRevForPref) {
        return {
          subjectId,
          chapterId: prefCh.id,
          revisionId: dueRevForPref.id,
          title: `${prefCh.id} · ${prefCh.chapterName}`,
          objective: `Next focus (${dueRevForPref.stage}) · Active recall & timed questions`,
          taskType: 'revision',
          difficulty: prefCh.difficulty,
          priority: 110,
        };
      }
      if (prefCh.status !== 'Strong' && prefCh.status !== 'Completed') {
        return {
          subjectId,
          chapterId: prefCh.id,
          title: `${prefCh.id} · ${prefCh.chapterName}`,
          objective: 'Selected next chapter · Concept study, solved examples & textbook practice',
          taskType: prefCh.status === 'Needs Revision' || prefCh.isWeak ? 'revision' : 'first_study',
          difficulty: prefCh.difficulty,
          priority: 105,
        };
      }
    }
  }

  // 1. Due / overdue revisions for this subject
  const dueRev = state.revisions
    .filter(
      (r) =>
        r.subjectId === subjectId &&
        !r.completed &&
        r.scheduledDate <= targetDate &&
        !excludeIds.has(r.chapterId)
    )
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  if (dueRev.length > 0) {
    const rev = dueRev[0];
    const ch = state.chapters.find((c) => c.id === rev.chapterId);
    return {
      subjectId,
      chapterId: rev.chapterId,
      revisionId: rev.id,
      title: `${rev.chapterId} · ${rev.chapterName}`,
      objective: `Spaced Revision (${rev.stage}) · Active recall & timed questions`,
      taskType: 'revision',
      difficulty: ch?.difficulty ?? 'Medium',
      priority: 100,
    };
  }

  // 2. Weak or Needs Revision chapters
  const weakCandidates = state.chapters
    .filter(
      (c) =>
        c.subjectId === subjectId &&
        (c.isWeak || c.status === 'Weak' || c.status === 'Needs Revision') &&
        !excludeIds.has(c.id)
    )
    .sort((a, b) => (a.confidence ?? 2) - (b.confidence ?? 2));

  if (weakCandidates.length > 0) {
    const chosen =
      (avoidHard && weakCandidates.find((c) => c.difficulty !== 'Hard')) || weakCandidates[0];
    return {
      subjectId,
      chapterId: chosen.id,
      title: `${chosen.id} · ${chosen.chapterName}`,
      objective: 'Mistake review, weak-area repair & textbook/worksheet practice',
      taskType: 'revision',
      difficulty: chosen.difficulty,
      priority: 90,
    };
  }

  // 3. English Language practice categories
  if (subjectId === 'english_language') {
    const topics = state.practiceTopics
      .filter((p) => p.subjectId === 'english_language' && !excludeIds.has(p.id))
      .sort((a, b) => a.practiceCount - b.practiceCount);
    if (topics.length > 0) {
      const t = topics[0];
      return {
        subjectId,
        practiceTopicId: t.id,
        title: `English Language · ${t.title}`,
        objective: isFinalSprint
          ? `Timed ICSE ${t.title} practice & format/accuracy review`
          : `${t.title} structured practice & past-paper drill`,
        taskType: 'practice',
        difficulty: 'Medium',
        priority: 85,
      };
    }
  }

  // 4. In Progress chapters
  const inProgress = state.chapters.filter(
    (c) => c.subjectId === subjectId && c.status === 'In Progress' && !excludeIds.has(c.id)
  );
  if (inProgress.length > 0) {
    const chosen =
      (avoidHard && inProgress.find((c) => c.difficulty !== 'Hard')) || inProgress[0];
    return {
      subjectId,
      chapterId: chosen.id,
      title: `${chosen.id} · ${chosen.chapterName}`,
      objective: 'Complete remaining concepts, solved examples & exercise problems',
      taskType: 'first_study',
      difficulty: chosen.difficulty,
      priority: 82,
    };
  }

  // 5. Incomplete / Not Started chapters
  const notStarted = state.chapters.filter(
    (c) => c.subjectId === subjectId && c.status === 'Not Started' && !excludeIds.has(c.id)
  );
  if (notStarted.length > 0) {
    const chosen =
      (avoidHard && notStarted.find((c) => c.difficulty !== 'Hard')) || notStarted[0];
    const objective =
      targetDate <= '2026-11-30'
        ? 'Urgent syllabus catch-up · Core concepts & key question types'
        : isFinalSprint
          ? 'Focused exam prep · Core summary & past-paper questions'
          : 'Concept study, notes & textbook questions';
    return {
      subjectId,
      chapterId: chosen.id,
      title: `${chosen.id} · ${chosen.chapterName}`,
      objective,
      taskType: isFinalSprint ? 'exam_prep' : 'first_study',
      difficulty: chosen.difficulty,
      priority: 75,
    };
  }

  // 6. Extra Literature / Telugu Practice topics
  const extraTopics = state.practiceTopics
    .filter((p) => p.subjectId === subjectId && !excludeIds.has(p.id))
    .sort((a, b) => a.practiceCount - b.practiceCount);
  if (extraTopics.length > 0) {
    const t = extraTopics[0];
    return {
      subjectId,
      practiceTopicId: t.id,
      title: `${SUBJECT_MAP[subjectId].name} · ${t.title}`,
      objective: 'School-exam portion & timed answer-writing practice',
      taskType: 'practice',
      difficulty: 'Medium',
      priority: 70,
    };
  }

  // 7. Completed chapters needing exam-mode timed past paper practice (never first-time study)
  const completedPool = state.chapters
    .filter(
      (c) =>
        c.subjectId === subjectId &&
        (c.status === 'Completed' || c.status === 'Strong') &&
        !excludeIds.has(c.id)
    )
    .sort((a, b) => {
      const aScore = (a.practiceStatus === 'Done' ? 1 : 0) + (a.answerWritingStatus === 'Done' ? 1 : 0);
      const bScore = (b.practiceStatus === 'Done' ? 1 : 0) + (b.answerWritingStatus === 'Done' ? 1 : 0);
      if (aScore !== bScore) return aScore - bScore;
      return (a.lastRevision ?? '').localeCompare(b.lastRevision ?? '');
    });

  if (completedPool.length > 0) {
    const chosen = completedPool[0];
    return {
      subjectId,
      chapterId: chosen.id,
      title: `${chosen.id} · ${chosen.chapterName}`,
      objective: 'Timed past-paper questions, answer writing & active recall check',
      taskType: 'exam_prep',
      difficulty: chosen.difficulty,
      priority: 55,
    };
  }

  return null;
}

export function generateDayPlan(
  state: AppState,
  targetDate: string,
  availableMinutesOverride?: number
): DayPlan {
  const existingPlan = state.plans[targetDate];
  const availableMinutes =
    availableMinutesOverride ??
    existingPlan?.availableMinutes ??
    state.settings.blockDurationMinutes * 2;

  const preservedTasks: StudyTask[] = existingPlan
    ? existingPlan.tasks.filter((t) => t.completed || t.carriedForward || t.taskType === 'custom')
    : [];

  const excludeIds = new Set<string>();
  for (const t of preservedTasks) {
    if (t.chapterId) excludeIds.add(t.chapterId);
    if (t.practiceTopicId) excludeIds.add(t.practiceTopicId);
  }

  const prevDay = addDays(targetDate, -1);
  const prevPlan = state.plans[prevDay];
  if (prevPlan) {
    for (const t of prevPlan.tasks) {
      if (t.completed && t.chapterId) {
        excludeIds.add(t.chapterId);
      }
    }
  }

  const proposedTasks: StudyTask[] = [...preservedTasks];
  const dow = getDayOfWeek(targetDate);
  const rotationPair = state.settings.rotation[dow];

  const examToday = state.exams.find((e) => e.date === targetDate);
  const nextExamInfo = getNextExam(state.exams, targetDate);

  // Morning Telugu slot (Tues/Thurs or within 6 days of Telugu exam, realistic 45-90m dedicated duration)
  const teluguExam = state.exams.find((e) => e.subjectId === 'telugu');
  const teluguActive = !teluguExam || teluguExam.date >= targetDate;
  const daysToTelugu = teluguExam ? diffDays(teluguExam.date, targetDate) : 99;
  const hasMorningAlready = proposedTasks.some((t) => t.blockIndex === 0);

  if (teluguActive && !hasMorningAlready && (dow === 2 || dow === 4 || (daysToTelugu >= 0 && daysToTelugu <= 6))) {
    const teluguTopics = state.practiceTopics
      .filter((p) => p.subjectId === 'telugu' && !excludeIds.has(p.id))
      .sort((a, b) => a.practiceCount - b.practiceCount);
    const prefTelId = state.nextTopicBySubject?.telugu;
    const teluguChapters = state.chapters
      .filter((c) => c.subjectId === 'telugu' && c.status !== 'Strong' && !excludeIds.has(c.id))
      .sort((a, b) => (a.id === prefTelId ? -1 : b.id === prefTelId ? 1 : 0));

    const useTopic = dow === 2 && !prefTelId && teluguTopics.length > 0;
    const morningDuration = Math.min(90, Math.max(45, state.settings.teluguMorningMinutes || 60));

    if (useTopic && teluguTopics.length > 0) {
      const topic = teluguTopics[0];
      excludeIds.add(topic.id);
      proposedTasks.push({
        id: `task-${targetDate}-morn-${Math.random().toString(36).slice(2, 6)}`,
        subjectId: 'telugu',
        practiceTopicId: topic.id,
        title: `Telugu · ${topic.title}`,
        objective: 'Morning language drill · Vocabulary, grammar & written accuracy',
        durationMinutes: morningDuration,
        timeSlot: `07:30–${addMinutesToTime('07:30', morningDuration)}`,
        blockIndex: 0,
        taskType: 'practice',
        completed: false,
        completedAt: null,
        originalDate: targetDate,
        scheduledDate: targetDate,
        carriedForward: false,
        difficulty: 'Easy',
      });
    } else if (teluguChapters.length > 0) {
      const ch = teluguChapters[0];
      excludeIds.add(ch.id);
      const dur = ch.estimatedMinutes ?? morningDuration;
      const clampedDur = Math.min(90, Math.max(45, dur));
      proposedTasks.push({
        id: `task-${targetDate}-morn-${Math.random().toString(36).slice(2, 6)}`,
        subjectId: 'telugu',
        chapterId: ch.id,
        title: `${ch.id} · ${ch.chapterName}`,
        objective: 'Morning Telugu reading, annotations & written-answer recall',
        durationMinutes: clampedDur,
        timeSlot: `07:30–${addMinutesToTime('07:30', clampedDur)}`,
        blockIndex: 0,
        taskType: ch.status === 'Completed' ? 'exam_prep' : 'first_study',
        completed: false,
        completedAt: null,
        originalDate: targetDate,
        scheduledDate: targetDate,
        carriedForward: false,
        difficulty: ch.difficulty,
      });
    }
  }

  // Evening blocks
  const eveningPreserved = proposedTasks.filter((t) => t.blockIndex >= 1);
  const usedMinutes = eveningPreserved.reduce((sum, t) => sum + t.durationMinutes, 0);
  const remainingMinutes = Math.max(0, availableMinutes - usedMinutes);

  if (remainingMinutes >= 25) {
    const desiredBlocks = remainingMinutes >= 90 ? 2 : 1;
    const blockDurations =
      desiredBlocks === 2
        ? [Math.ceil(remainingMinutes / 2), Math.floor(remainingMinutes / 2)]
        : [remainingMinutes];

    const rankedSubjects = SUBJECTS.map((s) => ({
      id: s.id,
      priority: computeSubjectPriority(s.id, state, targetDate),
    }))
      .filter((s) => s.priority > 0)
      .sort((a, b) => b.priority - a.priority);

    const chosenSubjects: SubjectId[] = [];
    const tomorrow = addDays(targetDate, 1);
    const tomorrowExam = state.exams.find((e) => e.date === tomorrow);
    if (tomorrowExam && tomorrowExam.subjectId !== 'telugu') {
      chosenSubjects.push(tomorrowExam.subjectId);
    }

    if (dow === 0) {
      if (
        rankedSubjects.length > 0 &&
        rankedSubjects[0].id !== 'telugu' &&
        !chosenSubjects.includes(rankedSubjects[0].id)
      ) {
        chosenSubjects.push(rankedSubjects[0].id);
      }
      const rotatingLow = rankedSubjects.find(
        (s) =>
          !chosenSubjects.includes(s.id) &&
          ['geography', 'commercial_applications', 'english_literature', 'english_language'].includes(s.id)
      );
      if (rotatingLow) chosenSubjects.push(rotatingLow.id);
    } else if (rotationPair) {
      for (const item of rotationPair) {
        if (item === 'telugu') continue;
        if (item !== 'weakest_priority' && item !== 'rotating_low') {
          const examForRot = state.exams.find((e) => e.subjectId === item);
          if (!examForRot || examForRot.date >= targetDate) {
            if (!chosenSubjects.includes(item)) {
              chosenSubjects.push(item);
            }
          }
        }
      }
    }

    if (nextExamInfo && nextExamInfo.daysRemaining <= 15) {
      const urgentSubjects = rankedSubjects
        .filter((s) => {
          if (s.id === 'telugu') return false;
          const ex = state.exams.find((e) => e.subjectId === s.id);
          return ex && diffDays(ex.date, targetDate) >= 0 && diffDays(ex.date, targetDate) <= 14;
        })
        .map((s) => s.id);

      for (const us of urgentSubjects) {
        if (chosenSubjects.length < 2 && !chosenSubjects.includes(us)) {
          chosenSubjects.push(us);
        }
      }

      if (
        nextExamInfo.daysRemaining <= 5 &&
        nextExamInfo.exam.subjectId !== 'telugu' &&
        !chosenSubjects.includes(nextExamInfo.exam.subjectId)
      ) {
        if (chosenSubjects.length >= 2) {
          chosenSubjects[1] = nextExamInfo.exam.subjectId;
        } else {
          chosenSubjects.unshift(nextExamInfo.exam.subjectId);
        }
      }
    }

    for (const r of rankedSubjects) {
      if (chosenSubjects.length >= desiredBlocks) break;
      if (r.id === 'telugu') continue;
      if (!chosenSubjects.includes(r.id)) {
        chosenSubjects.push(r.id);
      }
    }

    let hasHardAlready = eveningPreserved.some((t) => t.difficulty === 'Hard');
    let mathScheduled = proposedTasks.some((t) => t.subjectId === 'mathematics' && Boolean(t.chapterId));
    let cursorTime = state.settings.eveningStart;
    if (eveningPreserved.length > 0) {
      cursorTime = addMinutesToTime(
        state.settings.eveningStart,
        usedMinutes + state.settings.breakMinutes
      );
    }
    const startBlockIdx = eveningPreserved.length > 0 ? 2 : 1;

    for (let i = 0; i < blockDurations.length; i++) {
      const duration = blockDurations[i];
      let subjectId = chosenSubjects[i] ?? rankedSubjects.find((r) => r.id !== 'telugu')?.id;
      if (!subjectId) break;
      if (subjectId === 'mathematics' && mathScheduled) {
        const alt = rankedSubjects.find((r) => r.id !== 'mathematics' && r.id !== 'telugu' && !chosenSubjects.includes(r.id));
        if (!alt) continue;
        subjectId = alt.id;
      }

      const candidate = selectBestCandidateForSubject(
        subjectId,
        state,
        targetDate,
        excludeIds,
        hasHardAlready
      );
      if (!candidate) continue;

      if (candidate.subjectId === 'mathematics' && candidate.chapterId) {
        mathScheduled = true;
      }
      if (candidate.chapterId) excludeIds.add(candidate.chapterId);
      if (candidate.practiceTopicId) excludeIds.add(candidate.practiceTopicId);
      if (candidate.difficulty === 'Hard') hasHardAlready = true;

      const endTime = addMinutesToTime(cursorTime, duration);
      const blockIndex = Math.min(2, startBlockIdx + i);

      proposedTasks.push({
        id: `task-${targetDate}-b${blockIndex}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        subjectId: candidate.subjectId,
        chapterId: candidate.chapterId,
        practiceTopicId: candidate.practiceTopicId,
        revisionId: candidate.revisionId,
        title: candidate.title,
        objective:
          examToday && examToday.subjectId === candidate.subjectId
            ? 'Light morning active recall only · Stay calm for exam'
            : candidate.objective,
        durationMinutes: duration,
        timeSlot: `${cursorTime}–${endTime}`,
        blockIndex,
        taskType: candidate.taskType,
        completed: false,
        completedAt: null,
        originalDate: targetDate,
        scheduledDate: targetDate,
        carriedForward: false,
        difficulty: candidate.difficulty,
      });

      cursorTime = addMinutesToTime(endTime, state.settings.breakMinutes);
    }
  }

  const validated = validateAndConstrainDayTasks(proposedTasks, state, targetDate, availableMinutes);

  return {
    date: targetDate,
    availableMinutes,
    tasks: validated.tasks,
    workout: existingPlan?.workout ?? {
      completed: false,
      title: 'Evening Mobility & Conditioning',
      durationMinutes: 25,
      notes: '',
    },
    generatedAt: new Date().toISOString(),
    isManuallyAdjusted: false,
    plannedBy: 'local',
    remainingBacklog: validated.remainingBacklog,
  };
}

export function generateScheduleRange(
  state: AppState,
  startDate: string,
  endDate: string
): Record<string, DayPlan> {
  const nextPlans: Record<string, DayPlan> = { ...state.plans };
  let workingState: AppState = { ...state, plans: nextPlans };

  let cursor = startDate;
  while (cursor <= endDate) {
    const existing = nextPlans[cursor];
    if (!existing) {
      const plan = generateDayPlan(workingState, cursor);
      nextPlans[cursor] = plan;
      workingState = { ...workingState, plans: nextPlans };
    }
    cursor = addDays(cursor, 1);
  }
  return nextPlans;
}

export function findMissedWorkAndRevisions(
  state: AppState,
  activeDate: string
): { missedTasks: StudyTask[]; overdueRevisions: RevisionTask[] } {
  const missedTasks: StudyTask[] = [];

  const dates = Object.keys(state.plans).sort();
  for (const d of dates) {
    if (d >= activeDate) continue;
    const plan = state.plans[d];
    for (const task of plan.tasks) {
      if (!task.completed && !task.dismissed) {
        missedTasks.push(task);
      }
    }
  }

  const overdueRevisions = state.revisions
    .filter((r) => !r.completed && r.scheduledDate < activeDate)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return { missedTasks, overdueRevisions };
}

export function generateRecoveryPlan(
  state: AppState,
  activeDate: string
): { suggestions: RecoverySuggestion[]; remainingBacklogCount: number } {
  const { missedTasks, overdueRevisions } = findMissedWorkAndRevisions(state, activeDate);

  const rawItems: Omit<RecoverySuggestion, 'suggestedDate' | 'splitRecommended'>[] = [];
  const coveredChapterIds = new Set<string>();

  for (const task of missedTasks) {
    const subjPriority = computeSubjectPriority(task.subjectId, state, activeDate);
    if (subjPriority === 0) continue;
    if (task.chapterId) coveredChapterIds.add(task.chapterId);

    rawItems.push({
      id: `rec-task-${task.id}`,
      sourceTaskId: task.id,
      kind: 'task',
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      title: task.title,
      objective: task.objective,
      originalDate: task.originalDate,
      durationMinutes: task.durationMinutes,
      priorityScore: subjPriority + (task.taskType === 'revision' ? 30 : 15),
      reason: `Unfinished from ${task.originalDate}`,
      difficulty: task.difficulty,
    });
  }

  for (const rev of overdueRevisions) {
    if (coveredChapterIds.has(rev.chapterId)) continue;
    const subjPriority = computeSubjectPriority(rev.subjectId, state, activeDate);
    if (subjPriority === 0) continue;

    const ch = state.chapters.find((c) => c.id === rev.chapterId);
    rawItems.push({
      id: `rec-rev-${rev.id}`,
      sourceRevisionId: rev.id,
      kind: 'revision',
      subjectId: rev.subjectId,
      chapterId: rev.chapterId,
      title: `${rev.chapterId} · ${rev.chapterName}`,
      objective: `Overdue ${rev.stage} spaced revision`,
      originalDate: rev.originalDueDate,
      durationMinutes: 45,
      priorityScore: subjPriority + 40,
      reason: `Revision ${rev.stage} due ${rev.originalDueDate}`,
      difficulty: ch?.difficulty ?? 'Medium',
    });
  }

  rawItems.sort((a, b) => b.priorityScore - a.priorityScore);

  const dayCapacityLeft: Record<string, number> = {};
  const dayHardCount: Record<string, number> = {};
  const dayMathCount: Record<string, number> = {};

  for (let offset = 0; offset < 7; offset++) {
    const d = addDays(activeDate, offset);
    const plan = state.plans[d];
    const limit = plan?.availableMinutes ?? state.settings.blockDurationMinutes * 2;
    const alreadyCarriedMinutes = (plan?.tasks ?? [])
      .filter((t) => t.carriedForward && !t.completed)
      .reduce((s, t) => s + t.durationMinutes, 0);
    dayCapacityLeft[d] = Math.max(0, limit - alreadyCarriedMinutes);
    dayHardCount[d] = (plan?.tasks ?? []).filter(
      (t) => t.carriedForward && t.difficulty === 'Hard'
    ).length;
    dayMathCount[d] = (plan?.tasks ?? []).filter(
      (t) => t.subjectId === 'mathematics' && Boolean(t.chapterId)
    ).length;
  }

  const suggestions: RecoverySuggestion[] = [];
  let remainingBacklogCount = 0;

  for (const item of rawItems) {
    let assignedDate: string | null = null;
    let splitRecommended = false;

    for (let offset = 0; offset < 7; offset++) {
      const d = addDays(activeDate, offset);
      const exam = state.exams.find((e) => e.subjectId === item.subjectId);
      if (exam && exam.date < d) continue;

      if (item.difficulty === 'Hard' && dayHardCount[d] >= 1) continue;
      if (item.subjectId === 'mathematics' && item.chapterId && dayMathCount[d] >= 1) continue;

      if (dayCapacityLeft[d] >= item.durationMinutes) {
        assignedDate = d;
        dayCapacityLeft[d] -= item.durationMinutes;
        if (item.difficulty === 'Hard') dayHardCount[d] += 1;
        if (item.subjectId === 'mathematics' && item.chapterId) dayMathCount[d] += 1;
        break;
      } else if (dayCapacityLeft[d] >= 35 && item.durationMinutes >= 60) {
        assignedDate = d;
        splitRecommended = true;
        dayCapacityLeft[d] -= Math.ceil(item.durationMinutes / 2);
        if (item.difficulty === 'Hard') dayHardCount[d] += 1;
        if (item.subjectId === 'mathematics' && item.chapterId) dayMathCount[d] += 1;
        break;
      }
    }

    if (assignedDate) {
      suggestions.push({
        ...item,
        suggestedDate: assignedDate,
        splitRecommended,
      });
    } else {
      remainingBacklogCount += 1;
    }
  }

  return { suggestions, remainingBacklogCount };
}

export function applyRecoverySuggestions(
  state: AppState,
  accepted: RecoverySuggestion[]
): AppState {
  if (accepted.length === 0) return state;

  const nextPlans: Record<string, DayPlan> = {};
  for (const [k, v] of Object.entries(state.plans)) {
    nextPlans[k] = {
      ...v,
      tasks: v.tasks.map((t) => ({ ...t })),
    };
  }
  let nextRevisions = state.revisions.map((r) => ({ ...r }));

  for (const sug of accepted) {
    if (sug.kind === 'task' && sug.sourceTaskId) {
      for (const dateKey of Object.keys(nextPlans)) {
        const plan = nextPlans[dateKey];
        const idx = plan.tasks.findIndex((t) => t.id === sug.sourceTaskId);
        if (idx !== -1) {
          plan.tasks[idx] = {
            ...plan.tasks[idx],
            dismissed: true,
          };
          break;
        }
      }
    }

    if (sug.kind === 'revision' && sug.sourceRevisionId) {
      nextRevisions = nextRevisions.map((r) =>
        r.id === sug.sourceRevisionId
          ? {
              ...r,
              scheduledDate: sug.suggestedDate,
              carriedForward: true,
            }
          : r
      );
    }

    const targetPlan =
      nextPlans[sug.suggestedDate] ?? generateDayPlan(state, sug.suggestedDate);

    const targetTasks = [...targetPlan.tasks];
    const blockDuration = sug.splitRecommended
      ? Math.ceil(sug.durationMinutes / 2)
      : sug.durationMinutes;

    const replaceableIndex = targetTasks.findIndex(
      (t) => !t.completed && !t.carriedForward && t.blockIndex >= 1
    );

    const newTask: StudyTask = {
      id: `cf-${sug.id}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId: sug.subjectId,
      chapterId: sug.chapterId,
      revisionId: sug.sourceRevisionId,
      title: sug.splitRecommended ? `${sug.title} (Part 1/2)` : sug.title,
      objective: sug.objective,
      durationMinutes: blockDuration,
      timeSlot:
        replaceableIndex !== -1
          ? targetTasks[replaceableIndex].timeSlot
          : `${state.settings.eveningStart}–${addMinutesToTime(state.settings.eveningStart, blockDuration)}`,
      blockIndex: replaceableIndex !== -1 ? targetTasks[replaceableIndex].blockIndex : 1,
      taskType: sug.kind === 'revision' ? 'revision' : 'first_study',
      completed: false,
      completedAt: null,
      originalDate: sug.originalDate,
      scheduledDate: sug.suggestedDate,
      carriedForward: true,
      splitPart: sug.splitRecommended ? 'Part 1/2' : undefined,
      difficulty: sug.difficulty,
    };

    if (replaceableIndex !== -1) {
      targetTasks[replaceableIndex] = newTask;
    } else {
      targetTasks.push(newTask);
    }

    if (sug.splitRecommended) {
      const part2Date = addDays(sug.suggestedDate, 1);
      const part2Plan = nextPlans[part2Date] ?? generateDayPlan(state, part2Date);
      const part2Duration = Math.floor(sug.durationMinutes / 2);
      const part2Task: StudyTask = {
        ...newTask,
        id: `cf-${sug.id}-p2-${Math.random().toString(36).slice(2, 6)}`,
        title: `${sug.title} (Part 2/2)`,
        durationMinutes: part2Duration,
        scheduledDate: part2Date,
        splitPart: 'Part 2/2',
      };
      const rep2 = part2Plan.tasks.findIndex(
        (t) => !t.completed && !t.carriedForward && t.blockIndex >= 1
      );
      const p2Tasks = [...part2Plan.tasks];
      if (rep2 !== -1) {
        part2Task.timeSlot = p2Tasks[rep2].timeSlot;
        part2Task.blockIndex = p2Tasks[rep2].blockIndex;
        p2Tasks[rep2] = part2Task;
      } else {
        p2Tasks.push(part2Task);
      }
      nextPlans[part2Date] = {
        ...part2Plan,
        tasks: p2Tasks,
        isManuallyAdjusted: true,
      };
    }

    nextPlans[sug.suggestedDate] = {
      ...targetPlan,
      tasks: targetTasks,
      isManuallyAdjusted: true,
    };
  }

  return {
    ...state,
    plans: nextPlans,
    revisions: nextRevisions,
  };
}
