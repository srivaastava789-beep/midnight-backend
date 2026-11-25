import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialAppState,
  getEstimatedMinutesForStandard,
  SYLLABUS_AUDIT_ISSUES,
} from '../data/seed.ts';
import {
  applyRecoverySuggestions,
  computeSubjectPriority,
  generateDayPlan,
  generateRecoveryPlan,
  generateScheduleRange,
  getExamReadiness,
  getNextExam,
} from './planner.ts';
import {
  categorizeRevisions,
  completeRevisionTask,
  rescheduleRevisionTask,
  scheduleRevisionsForChapter,
} from './revision.ts';
import { applyScheduleOperations } from './scheduleMutator.ts';
import {
  calculateDaySummary,
  calculateSyllabusStats,
  calculateWeeklyAnalytics,
} from './analytics.ts';
import {
  buildActiveTimerState,
  clampTimerMinutesToPreferences,
  formatFocusDuration,
  getEffectiveFocusPrefs,
  getNextPomodoroTransition,
  validateFocusTimerPrefs,
} from './focusTimer.ts';
import { validateAndConstrainDayTasks } from './validator.ts';
import { migrateAppState } from '../utils/storage.ts';
import { addDays, diffDays } from '../utils/date.ts';
import {
  generateChatGPTExport,
  parseDirectImportPreview,
} from '../utils/aiBridge.ts';
import {
  getDailyMotivationalQuote,
  getFilteredQuotes,
  getNextMotivationalQuote,
  MOTIVATIONAL_QUOTES,
} from '../data/motivationalQuotes.ts';

test('Authoritative 138-chapter syllabus preserves exact counts, Telugu script, difficulty labels, and unassigned time estimates', () => {
  const state = createInitialAppState();
  assert.equal(state.chapters.length, 138);

  const stats = calculateSyllabusStats(state.chapters);
  assert.equal(stats.totalPortions, 138);
  assert.equal(stats.completedPortions, 1); // MAT-21 Volume and Surface Area of Solids

  const mensuration = state.chapters.find((c) => c.id === 'MAT-21');
  assert.equal(mensuration?.chapterName, 'Volume and Surface Area of Solids');
  assert.equal(mensuration?.status, 'Completed');
  assert.equal(mensuration?.difficulty, 'Hard');

  const trig1 = state.chapters.find((c) => c.id === 'MAT-22');
  const trig2 = state.chapters.find((c) => c.id === 'MAT-23');
  assert.equal(trig1?.status, 'In Progress');
  assert.equal(trig2?.status, 'In Progress');

  const tel06 = state.chapters.find((c) => c.id === 'TEL-06');
  assert.equal(tel06?.chapterName, 'తాత్మీత్రి ...');
  assert.equal(tel06?.difficulty, 'Hard');

  // Time estimates left unassigned by default due to Section 1 vs Section 12 conflict
  assert.equal(state.settings.timeEstimateStandard, 'unassigned');
  assert.ok(state.chapters.every((c) => c.estimatedMinutes === null));
  assert.ok(SYLLABUS_AUDIT_ISSUES.length >= 2);
  assert.equal(getEstimatedMinutesForStandard('Hard', 'section1_30_60_90'), 90);
  assert.equal(getEstimatedMinutesForStandard('Easy', 'section12_15_45_90'), 15);
});

test('Non-destructive v1 -> v2 migration preserves completed Mensuration, user notes, formulas, and revisions', () => {
  const v1MockState = {
    version: 1,
    baselineDate: '2026-11-24',
    chapters: [
      {
        id: 'MAT-17',
        subjectId: 'mathematics',
        chapterName: 'Cylinder',
        status: 'Completed',
        isWeak: false,
        isStateConfirmed: true,
        confidence: 5,
        lastStudiedDate: '2026-11-20',
        lastRevision: null,
        revisionDueDate: '2026-11-27',
        mistakes: 'Forgot 2pi*r*h',
        practiceStatus: 'Done',
        answerWritingStatus: 'Not Started',
        notes: 'Keep units in cm',
        plannedStudyDate: null,
        difficulty: 'Standard',
      },
      {
        id: 'PHY-01',
        subjectId: 'physics',
        chapterName: 'Force',
        status: 'Completed',
        isWeak: true,
        isStateConfirmed: true,
        confidence: 2,
        lastStudiedDate: '2026-11-22',
        lastRevision: null,
        revisionDueDate: '2026-11-25',
        mistakes: 'Torque sign',
        practiceStatus: 'In Progress',
        answerWritingStatus: 'Not Started',
        notes: 'Check clockwise convention',
        plannedStudyDate: null,
        difficulty: 'Light',
      },
    ],
    practiceTopics: [],
    exams: createInitialAppState().exams,
    revisions: [
      {
        id: 'rev-1',
        chapterId: 'MAT-17',
        subjectId: 'mathematics',
        chapterName: 'Cylinder',
        stage: 'D7',
        originalDueDate: '2026-11-27',
        scheduledDate: '2026-11-27',
        completed: false,
        completedDate: null,
        confidence: 4,
        mistakes: '',
        practiceDone: true,
        answerWritingDone: false,
        carriedForward: false,
      },
    ],
    plans: {},
    formulas: [
      {
        id: 'f-1',
        name: 'Ohm Law',
        subjectId: 'physics',
        chapter: 'Current Electricity',
        topic: 'Circuits',
        latex: 'V = IR',
        symbols: 'V voltage',
        example: '12V',
        notes: '',
        status: 'Mastered',
        favorite: true,
        createdAt: '2026-11-24T00:00:00Z',
        updatedAt: '2026-11-24T00:00:00Z',
      },
    ],
    settings: {
      eveningStart: '17:30',
      eveningEnd: '20:00',
      blockDurationMinutes: 75,
      breakMinutes: 10,
      teluguMorningMinutes: 30,
      rotation: createInitialAppState().settings.rotation,
    },
  };

  const migrated = migrateAppState(v1MockState);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.chapters.length, 138);
  assert.equal(migrated.formulas.length, 1);

  const mat21 = migrated.chapters.find((c) => c.id === 'MAT-21');
  assert.equal(mat21?.status, 'Completed');
  assert.equal(mat21?.mistakes, 'Forgot 2pi*r*h');
  assert.equal(mat21?.difficulty, 'Hard'); // Authoritative rating preserved

  const phy01 = migrated.chapters.find((c) => c.id === 'PHY-01');
  assert.equal(phy01?.isWeak, true);
  assert.equal(phy01?.notes, 'Check clockwise convention');
  assert.equal(phy01?.difficulty, 'Easy');

  // Revision chapterId remapped to MAT-21
  assert.equal(migrated.revisions[0].chapterId, 'MAT-21');
});

test('Hard scheduling validator enforces window boundaries, max 1 Math chapter, post-exam cutoff, and completed preservation', () => {
  const base = createInitialAppState();
  // Pre-mark one completed task on 2026-12-10
  base.plans['2026-12-10'] = {
    date: '2026-12-10',
    availableMinutes: 150,
    tasks: [
      {
        id: 'done-1',
        subjectId: 'physics',
        chapterId: 'PHY-01',
        title: 'PHY-01 · Force',
        objective: 'Already completed',
        durationMinutes: 45,
        timeSlot: '17:30–18:15',
        blockIndex: 1,
        taskType: 'first_study',
        completed: true,
        completedAt: '2026-12-10T18:15:00Z',
        originalDate: '2026-12-10',
        scheduledDate: '2026-12-10',
        carriedForward: false,
        difficulty: 'Easy',
      },
    ],
    workout: { completed: false, title: 'Mobility', durationMinutes: 25, notes: '' },
    generatedAt: '2026-12-10T07:00:00Z',
    isManuallyAdjusted: false,
  };

  // English Language exam was 2026-12-09 (< 2026-12-10) -> must be dropped
  // Two Math chapters -> second must be deferred to backlog
  // Completed MAT-21 proposed as first_study -> coerced to exam_prep
  // Exceeding remaining minutes -> split/deferred into remainingBacklog
  const proposed = [
    {
      id: 'p-eng',
      subjectId: 'english_language' as const,
      title: 'English Language · Composition',
      objective: 'Post-exam task should drop',
      durationMinutes: 60,
      timeSlot: '17:30–18:30',
      blockIndex: 1,
      taskType: 'practice' as const,
      completed: false,
      completedAt: null,
      originalDate: '2026-12-10',
      scheduledDate: '2026-12-10',
      carriedForward: false,
      difficulty: 'Medium' as const,
    },
    {
      id: 'p-math1',
      subjectId: 'mathematics' as const,
      chapterId: 'MAT-21',
      title: 'MAT-21 · Volume and Surface Area of Solids',
      objective: 'Review solids',
      durationMinutes: 75,
      timeSlot: '18:25–19:40',
      blockIndex: 2,
      taskType: 'first_study' as const,
      completed: false,
      completedAt: null,
      originalDate: '2026-12-10',
      scheduledDate: '2026-12-10',
      carriedForward: false,
      difficulty: 'Hard' as const,
    },
    {
      id: 'p-math2',
      subjectId: 'mathematics' as const,
      chapterId: 'MAT-22',
      title: 'MAT-22 · Trigonometrical Identities',
      objective: 'Second math chapter should defer',
      durationMinutes: 60,
      timeSlot: '19:40–20:40',
      blockIndex: 2,
      taskType: 'first_study' as const,
      completed: false,
      completedAt: null,
      originalDate: '2026-12-10',
      scheduledDate: '2026-12-10',
      carriedForward: false,
      difficulty: 'Hard' as const,
    },
    {
      id: 'p-tel-eve',
      subjectId: 'telugu' as const,
      chapterId: 'TEL-01',
      title: 'TEL-01 · స్నేహధర్మము',
      objective: 'Should move to morning slot',
      durationMinutes: 60,
      timeSlot: '19:00–20:00',
      blockIndex: 2,
      taskType: 'first_study' as const,
      completed: false,
      completedAt: null,
      originalDate: '2026-12-10',
      scheduledDate: '2026-12-10',
      carriedForward: false,
      difficulty: 'Hard' as const,
    },
  ];

  const res = validateAndConstrainDayTasks(proposed, base, '2026-12-10', 150);
  assert.equal(res.valid, true);
  assert.ok(res.tasks.some((t) => t.id === 'done-1' && t.completed));
  assert.ok(!res.tasks.some((t) => t.subjectId === 'english_language'));
  const mathTasks = res.tasks.filter((t) => t.subjectId === 'mathematics' && t.chapterId);
  assert.equal(mathTasks.length, 1);
  assert.equal(mathTasks[0].taskType, 'exam_prep');
  const teluguTask = res.tasks.find((t) => t.subjectId === 'telugu');
  assert.equal(teluguTask?.blockIndex, 0);
  assert.ok(teluguTask && teluguTask.durationMinutes >= 45);
  assert.ok(res.remainingBacklog.some((b) => b.chapterId === 'MAT-22'));
});

test('Spaced revision engine creates D1, D3, D7, D23 tasks and escalates weak chapters', () => {
  const state = createInitialAppState();
  const phy01 = state.chapters.find((c) => c.id === 'PHY-01')!;
  const revisions = scheduleRevisionsForChapter(phy01, '2026-11-24', state.revisions);

  assert.equal(revisions.length, 4);
  assert.deepEqual(
    revisions.map((r) => [r.stage, r.originalDueDate]),
    [
      ['D1', '2026-11-25'],
      ['D3', '2026-11-27'],
      ['D7', '2026-12-01'],
      ['D23', '2026-12-17'],
    ]
  );

  const rescheduled = rescheduleRevisionTask(revisions[0].id, '2026-11-26', revisions);
  assert.equal(rescheduled[0].originalDueDate, '2026-11-25');
  assert.equal(rescheduled[0].scheduledDate, '2026-11-26');
  assert.equal(rescheduled[0].carriedForward, true);

  const afterComplete = completeRevisionTask(rescheduled[0].id, state.chapters, rescheduled, {
    completedDate: '2026-11-26',
    confidence: 2,
    mistakes: 'Forgot sign convention for moment of force',
    practiceDone: true,
    answerWritingDone: false,
  });

  const updatedPhy = afterComplete.chapters.find((c) => c.id === 'PHY-01')!;
  assert.equal(updatedPhy.isWeak, true);
  assert.equal(updatedPhy.status, 'Needs Revision');
  const extraRev = afterComplete.revisions.find(
    (r) => r.chapterId === 'PHY-01' && r.stage === 'Extra'
  );
  assert.ok(extraRev);
  assert.equal(extraRev.scheduledDate, '2026-11-28');

  const categorized = categorizeRevisions(afterComplete.revisions, '2026-11-28');
  assert.equal(categorized.overdue.length, 1);
  assert.equal(categorized.today.length, 1);
});

test('Adaptive planner respects exam countdowns, morning Telugu realistic duration, nextTopic, and focus timer logging', () => {
  const state = createInitialAppState();

  const nextExam = getNextExam(state.exams, '2026-11-24');
  assert.equal(nextExam?.exam.subjectId, 'english_language');
  assert.equal(nextExam?.daysRemaining, 15);

  const tuePlan = generateDayPlan(state, '2026-11-24');
  const morningTasks = tuePlan.tasks.filter((t) => t.blockIndex === 0);
  const eveningTasks = tuePlan.tasks.filter((t) => t.blockIndex >= 1);
  assert.equal(morningTasks.length, 1);
  assert.equal(morningTasks[0].subjectId, 'telugu');
  assert.ok(morningTasks[0].durationMinutes >= 45);
  assert.equal(eveningTasks.length, 2);

  const hardEvening = eveningTasks.filter((t) => t.difficulty === 'Hard');
  assert.ok(hardEvening.length <= 1);

  const engLangPriorityAfter = computeSubjectPriority('english_language', state, '2026-12-10');
  assert.equal(engLangPriorityAfter, 0);

  // Focus timer session logging updates summary & weekly analytics without auto-completing task
  state.plans['2026-11-24'] = tuePlan;
  state.focusSessions.push({
    id: 'fs-test-1',
    date: '2026-11-24',
    taskId: eveningTasks[0].id,
    subjectId: eveningTasks[0].subjectId,
    chapterId: eveningTasks[0].chapterId,
    taskTitle: eveningTasks[0].title,
    mode: 'focus',
    durationMinutes: 25,
    startedAt: '2026-11-24T17:30:00Z',
    endedAt: '2026-11-24T17:55:00Z',
  });

  const daySummary = calculateDaySummary(state.plans['2026-11-24'], state, '2026-11-24');
  assert.equal(daySummary.focusMinutesLogged, 25);
  assert.equal(daySummary.completedMinutes, 25);
  assert.equal(daySummary.completedTasks, 0);

  const weekly = calculateWeeklyAnalytics(state, '2026-11-24');
  assert.equal(weekly.totalFocusMinutesLogged, 25);
  assert.equal(weekly.totalCompletedMinutes, 25);
});

test('Carry-forward recovery preserves originalDate and distributes missed work without stacking', () => {
  const state = createInitialAppState();
  state.plans = generateScheduleRange(state, '2026-11-24', '2026-11-28');

  const recovery = generateRecoveryPlan(state, '2026-11-25');
  assert.ok(recovery.suggestions.length >= 2);
  assert.ok(recovery.suggestions.every((s) => s.originalDate === '2026-11-24'));

  const updatedState = applyRecoverySuggestions(state, recovery.suggestions);
  const nov25Tasks = updatedState.plans['2026-11-25'].tasks;
  const carried = nov25Tasks.filter((t) => t.carriedForward);
  assert.ok(carried.length >= 1);
  assert.equal(carried[0].originalDate, '2026-11-24');
  assert.equal(carried[0].scheduledDate, '2026-11-25');
  assert.ok(updatedState.plans['2026-11-24'].tasks.length >= 2);
});

test('Exam readiness calculates real chapter counts and date diffs accurately', () => {
  const state = createInitialAppState();
  const mathExam = state.exams.find((e) => e.subjectId === 'mathematics')!;
  const report = getExamReadiness(
    mathExam,
    state.chapters,
    state.practiceTopics,
    state.revisions,
    '2026-11-24'
  );
  assert.equal(report.totalCount, 27);
  assert.equal(report.completedCount, 1);
  assert.equal(report.remainingChapters.length, 26);
  assert.equal(diffDays('2026-12-11', '2026-11-24'), 17);
  assert.equal(addDays('2026-11-24', 23), '2026-12-17');
});

test('Schedule mutator applies valid chat operations and rejects post-exam moves', () => {
  const state = createInitialAppState();
  state.plans = generateScheduleRange(state, '2026-11-24', '2026-11-26');
  const nov24Evening = state.plans['2026-11-24'].tasks.find((t) => t.blockIndex >= 1)!;
  const nov25Second = state.plans['2026-11-25'].tasks.filter((t) => t.blockIndex >= 1)[1];

  const res = applyScheduleOperations(
    state,
    [
      {
        type: 'remove_task',
        date: '2026-11-25',
        taskId: nov25Second.id,
        summary: 'Cleared second block on 25 Nov',
      },
      {
        type: 'move_task',
        fromDate: '2026-11-24',
        toDate: '2026-11-25',
        taskId: nov24Evening.id,
        summary: 'Moved task to 25 Nov',
      },
      {
        type: 'add_task',
        date: '2026-11-24',
        subjectId: 'physics',
        chapterId: 'PHY-01',
        title: 'PHY-01 · Force',
        objective: 'Moment of force numericals',
        durationMinutes: 60,
        blockIndex: 1,
        taskType: 'first_study',
        summary: 'Added Physics Force to 24 Nov',
      },
      {
        type: 'set_next_topic',
        subjectId: 'physics',
        chapterId: 'PHY-02',
        summary: 'Set Physics next topic to PHY-02',
      },
      {
        type: 'add_task',
        date: '2026-12-10',
        subjectId: 'english_language',
        title: 'Post-exam invalid task',
        objective: 'Should reject after 09 Dec exam',
        durationMinutes: 45,
        blockIndex: 1,
        taskType: 'practice',
        summary: 'Invalid post-exam task',
      },
    ],
    '2026-11-24'
  );

  assert.equal(res.appliedChanges.length, 4);
  assert.equal(res.rejectedChanges.length, 1);
  assert.ok(!res.nextState.plans['2026-11-24'].tasks.some((t) => t.id === nov24Evening.id));
  assert.ok(res.nextState.plans['2026-11-25'].tasks.some((t) => t.id === nov24Evening.id));
  assert.ok(res.nextState.plans['2026-11-24'].tasks.some((t) => t.chapterId === 'PHY-01'));
  assert.equal(res.nextState.nextTopicBySubject.physics, 'PHY-02');
});

test('Focus timer respects Countdown/Stopwatch/Pomodoro modes, customizable daily max up to 24h, and user preferences', () => {
  const state = createInitialAppState();
  const initialEveningStart = state.settings.eveningStart;
  const initialRotation = JSON.stringify(state.settings.rotation);

  const prefs = validateFocusTimerPrefs(
    {
      defaultMode: 'pomodoro',
      countdownMinutes: 90,
      pomodoroWorkMinutes: 50,
      pomodoroShortBreakMinutes: 10,
      pomodoroLongBreakMinutes: 20,
      pomodoroCyclesBeforeLong: 3,
      maxDayMinutes: 1440,
      soundEnabled: false,
    },
    getEffectiveFocusPrefs(state.settings.focusTimerPrefs)
  );

  assert.equal(prefs.maxDayMinutes, 1440);
  assert.equal(prefs.pomodoroWorkMinutes, 50);
  assert.equal(prefs.soundEnabled, false);

  // Starting a timer for a task in Pomodoro mode must honor user's 50/10 preference and silence
  const sampleTask = generateDayPlan(state, '2026-11-24').tasks[0];
  const pomoTimer = buildActiveTimerState({
    timerType: prefs.defaultMode,
    prefs,
    date: '2026-11-24',
    loggedTodayMinutes: 0,
    linkedTask: sampleTask,
    autoStart: false,
  });
  assert.equal(pomoTimer.timerType, 'pomodoro');
  assert.equal(pomoTimer.focusMinutes, 50);
  assert.equal(pomoTimer.breakMinutes, 10);
  assert.equal(pomoTimer.soundEnabled, false);
  assert.equal(pomoTimer.pomodoroCycle, 1);

  // Cycle transitions: cycle 1 -> short break, cycle 3 -> long break
  const afterC1 = getNextPomodoroTransition(pomoTimer);
  assert.equal(afterC1.mode, 'short_break');
  assert.equal(afterC1.targetSeconds, 10 * 60);

  const c3Timer = { ...pomoTimer, pomodoroCycle: 3 };
  const afterC3 = getNextPomodoroTransition(c3Timer);
  assert.equal(afterC3.mode, 'long_break');
  assert.equal(afterC3.targetSeconds, 20 * 60);

  // Daily cap clamping protects customizable day ceiling
  const clamped = clampTimerMinutesToPreferences(120, 240, 200);
  assert.equal(clamped.minutes, 40);
  assert.equal(clamped.clampedToCap, true);
  assert.equal(clamped.capReached, false);

  const exhausted = clampTimerMinutesToPreferences(30, 240, 240);
  assert.equal(exhausted.minutes, 0);
  assert.equal(exhausted.capReached, true);

  // Standalone timer without a linked task works cleanly in Stopwatch mode
  const stopwatchTimer = buildActiveTimerState({
    timerType: 'stopwatch',
    prefs,
    date: '2026-11-24',
    loggedTodayMinutes: 120,
    linkedTask: null,
    autoStart: true,
  });
  assert.equal(stopwatchTimer.timerType, 'stopwatch');
  assert.equal(stopwatchTimer.taskId, undefined);
  assert.equal(stopwatchTimer.taskTitle, 'Standalone Focus Session');
  assert.equal(stopwatchTimer.targetSeconds, (1440 - 120) * 60);
  assert.equal(formatFocusDuration(3665), '01:01:05');

  // Schedule settings remain untouched
  assert.equal(state.settings.eveningStart, initialEveningStart);
  assert.equal(JSON.stringify(state.settings.rotation), initialRotation);

  // Wallpaper & rotation prefs validate cleanly
  const wallPrefs = validateFocusTimerPrefs(
    {
      wallpaperId: 'mist_peaks',
      wallpaperRotateSeconds: 30,
      backgroundDimPercent: 60,
      showQuote: true,
      clockStyle: 'bold',
    },
    prefs
  );
  assert.equal(wallPrefs.wallpaperId, 'mist_peaks');
  assert.equal(wallPrefs.wallpaperRotateSeconds, 30);
  assert.equal(wallPrefs.backgroundDimPercent, 60);
  assert.equal(wallPrefs.clockStyle, 'bold');
});

test('Gemini memory and 1-day-before test prep scheduler saves memory, shifts priority, and places prep block on D-1', () => {
  const state = createInitialAppState();
  state.plans = generateScheduleRange(state, '2026-11-24', '2026-11-29');

  // Pre-complete one task on 2026-11-27 to ensure completed tasks are never wiped
  const prepDayTasks = state.plans['2026-11-27'].tasks;
  if (prepDayTasks.length > 0) {
    prepDayTasks[0] = {
      ...prepDayTasks[0],
      completed: true,
      completedAt: '2026-11-27T08:30:00Z',
    };
  }

  const res = applyScheduleOperations(
    state,
    [
      {
        type: 'save_memory',
        category: 'daily_update',
        content: 'Completed MAT-22 identities today; Wednesdays only have 90m free.',
        summary: 'Saved Wednesday time update',
      },
      {
        type: 'save_memory',
        category: 'test',
        subjectId: 'chemistry',
        testDate: '2026-11-28',
        prepDate: '2026-11-27',
        syllabus: 'CHE-03 Acids, Bases & Salts',
        content: 'Chemistry unit test on Acids, Bases & Salts on 28 Nov 2026',
        summary: 'Remembered Chemistry test on 28 Nov',
      },
      {
        type: 'schedule_test_prep',
        testDate: '2026-11-28',
        subjectId: 'chemistry',
        chapterId: 'CHE-03',
        syllabus: 'Acids, Bases & Salts',
        durationMinutes: 75,
        summary: 'Prepared 1-day-before Chemistry test prep block on 27 Nov',
      },
    ],
    '2026-11-24'
  );

  assert.equal(res.appliedChanges.length, 3);
  assert.equal(res.nextState.aiMemory.length, 2);
  const testMem = res.nextState.aiMemory.find((m) => m.category === 'test');
  assert.equal(testMem?.testDate, '2026-11-28');
  assert.equal(testMem?.prepDate, '2026-11-27');

  // Prep task must exist directly inside 2026-11-27 (D-1) tasks, alongside preserved completed task
  const nov27 = res.nextState.plans['2026-11-27'];
  assert.ok(nov27.tasks.some((t) => t.subjectId === 'chemistry' && t.taskType === 'exam_prep'));
  if (prepDayTasks.length > 0) {
    assert.ok(nov27.tasks.some((t) => t.id === prepDayTasks[0].id && t.completed));
  }

  // Remembered upcoming test boosts priority in planner
  const chemScoreNov26 = computeSubjectPriority('chemistry', res.nextState, '2026-11-26');
  const chemScoreWithout = computeSubjectPriority('chemistry', state, '2026-11-26');
  assert.ok(chemScoreNov26 > chemScoreWithout);

  // Removing memory removes it cleanly
  const removed = applyScheduleOperations(
    res.nextState,
    [{ type: 'remove_memory', matchText: 'Wednesdays', summary: 'Removed Wednesday note' }],
    '2026-11-24'
  );
  assert.equal(removed.nextState.aiMemory.length, 1);
});

test('applyScheduleOperations normalizes display-cased and abbreviated subjectIds on test prep and memory ops', () => {
  const state = createInitialAppState();
  state.plans = generateScheduleRange(state, '2026-11-24', '2026-11-29');

  const res = applyScheduleOperations(
    state,
    [
      {
        type: 'save_memory',
        category: 'test',
        subjectId: 'Physics' as unknown as typeof state.chapters[number]['subjectId'],
        testDate: '2026-11-28',
        syllabus: 'Current Electricity PHY-08',
        content: 'Physics test on Current Electricity on 28 Nov 2026',
        summary: 'Saved Physics test memory',
      },
      {
        type: 'schedule_test_prep',
        testDate: '2026-11-28',
        subjectId: 'Physics' as unknown as typeof state.chapters[number]['subjectId'],
        chapterId: 'PHY-08',
        syllabus: 'Current Electricity',
        durationMinutes: 75,
        summary: 'Scheduled Physics test prep 1 day before',
      },
    ],
    '2026-11-24'
  );

  assert.equal(res.rejectedChanges.length, 0);
  assert.equal(res.appliedChanges.length, 2);
  const mem = res.nextState.aiMemory.find((m) => m.category === 'test');
  assert.equal(mem?.subjectId, 'physics');
  assert.equal(mem?.prepDate, '2026-11-27');

  const nov27 = res.nextState.plans['2026-11-27'];
  assert.ok(
    nov27.tasks.some(
      (t) => t.subjectId === 'physics' && t.chapterId === 'PHY-08' && t.taskType === 'exam_prep'
    )
  );
});

test('update_chapter_progress tracks Parts A/B completed vs C/D remaining and schedules continuation block', () => {
  const state = createInitialAppState();
  state.plans = generateScheduleRange(state, '2026-11-24', '2026-11-26');

  const res = applyScheduleOperations(
    state,
    [
      {
        type: 'update_chapter_progress',
        chapterId: 'PHY-08',
        status: 'In Progress',
        completedParts: ['Part A', 'Part B'],
        remainingParts: ['Part C', 'Part D'],
        scheduleRemainingDate: '2026-11-25',
        durationMinutes: 45,
        summary: 'PHY-08 Parts A-B completed; Parts C-D scheduled tomorrow',
      },
    ],
    '2026-11-24'
  );

  assert.equal(res.rejectedChanges.length, 0);
  const phy08 = res.nextState.chapters.find((c) => c.id === 'PHY-08');
  assert.equal(phy08?.status, 'In Progress');
  assert.deepEqual(phy08?.completedParts, ['Part A', 'Part B']);
  assert.deepEqual(phy08?.remainingParts, ['Part C', 'Part D']);

  const nov25 = res.nextState.plans['2026-11-25'];
  const contTask = nov25.tasks.find(
    (t) => t.chapterId === 'PHY-08' && t.remainingParts?.includes('Part C')
  );
  assert.ok(contTask);
  assert.ok(contTask.title.includes('Part C'));
});

test('batch_update_chapters updates multiple chapters and triggers revision schedule for completed items', () => {
  const state = createInitialAppState();
  const res = applyScheduleOperations(
    state,
    [
      {
        type: 'batch_update_chapters',
        updates: [
          { chapterId: 'PHY-01', status: 'Completed', confidence: 5 },
          { chapterId: 'CHE-01', status: 'Weak', confidence: 2, notes: 'Revise periodic trends' },
        ],
        summary: 'Imported 2 chapter updates',
      },
    ],
    '2026-11-24'
  );

  assert.equal(res.rejectedChanges.length, 0);
  const phy01 = res.nextState.chapters.find((c) => c.id === 'PHY-01');
  const che01 = res.nextState.chapters.find((c) => c.id === 'CHE-01');
  assert.equal(phy01?.status, 'Completed');
  assert.equal(che01?.status, 'Weak');
  assert.equal(che01?.isWeak, true);
  assert.ok(res.nextState.revisions.some((r) => r.chapterId === 'PHY-01'));
});

test('aiBridge export and direct import preview handle sub-parts, syllabus stats, and test dates', () => {
  const state = createInitialAppState();
  const phy08 = state.chapters.find((c) => c.id === 'PHY-08');
  if (phy08) {
    phy08.status = 'In Progress';
    phy08.completedParts = ['Part A', 'Part B'];
    phy08.remainingParts = ['Part C', 'Part D'];
  }

  const exported = generateChatGPTExport(state);
  assert.ok(exported.includes('ICSE CLASS 10 — MIDNIGHT STUDY STATUS EXPORT'));
  assert.ok(exported.includes('PHY-08'));
  assert.ok(exported.includes('Done: Part A, Part B'));
  assert.ok(exported.includes('Left: Part C, Part D'));

  const preview = parseDirectImportPreview(
    'Finished Part A and Part B of PHY-08 Current Electricity. Part C and Part D remaining. Physics test on 2026-11-28.',
    state
  );
  assert.ok(preview.detectedChapters.some((c) => c.id === 'PHY-08'));
  assert.ok(preview.detectedTests.some((t) => t.date === '2026-11-28'));
});

test('motivationalQuotes strictly contain study, growth, and workout categories and support cycling', () => {
  assert.ok(MOTIVATIONAL_QUOTES.length >= 30);
  assert.ok(
    MOTIVATIONAL_QUOTES.every(
      (q) =>
        (q.category === 'study' || q.category === 'growth' || q.category === 'workout') &&
        q.text.trim().length > 0 &&
        q.text.trim().length <= 120
    )
  );
  assert.ok(getFilteredQuotes('study').every((q) => q.category === 'study'));
  assert.ok(getFilteredQuotes('growth').every((q) => q.category === 'growth'));
  assert.ok(getFilteredQuotes('workout').every((q) => q.category === 'workout'));

  const first = getDailyMotivationalQuote('2026-11-24', 'workout');
  assert.equal(first.category, 'workout');
  const next = getNextMotivationalQuote(first.id, 'workout');
  assert.equal(next.category, 'workout');
  assert.notEqual(next.id, first.id);
});



