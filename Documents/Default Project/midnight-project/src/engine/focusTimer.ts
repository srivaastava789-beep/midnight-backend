import { DEFAULT_FOCUS_TIMER_PREFS } from '../data/seed.ts';
import type {
  ActiveTimerState,
  FocusTimerMode,
  FocusTimerPreferences,
  StudyTask,
} from '../types/study.ts';

export const MIN_DAY_FOCUS_MINUTES = 30;
export const MAX_DAY_FOCUS_MINUTES = 1440; // 24 hours max customizable day

export function getEffectiveFocusPrefs(
  prefs?: Partial<FocusTimerPreferences>
): FocusTimerPreferences {
  return {
    ...DEFAULT_FOCUS_TIMER_PREFS,
    ...(prefs ?? {}),
  };
}

export function validateFocusTimerPrefs(
  patch: Partial<FocusTimerPreferences>,
  current: FocusTimerPreferences
): FocusTimerPreferences {
  const merged = { ...current, ...patch };
  const maxDayMinutes = Math.max(
    MIN_DAY_FOCUS_MINUTES,
    Math.min(MAX_DAY_FOCUS_MINUTES, Math.round(Number(merged.maxDayMinutes) || current.maxDayMinutes))
  );
  const countdownMinutes = Math.max(
    1,
    Math.min(maxDayMinutes, Math.round(Number(merged.countdownMinutes) || current.countdownMinutes))
  );
  const pomodoroWorkMinutes = Math.max(
    5,
    Math.min(180, maxDayMinutes, Math.round(Number(merged.pomodoroWorkMinutes) || current.pomodoroWorkMinutes))
  );
  const pomodoroShortBreakMinutes = Math.max(
    1,
    Math.min(60, Math.round(Number(merged.pomodoroShortBreakMinutes) || current.pomodoroShortBreakMinutes))
  );
  const pomodoroLongBreakMinutes = Math.max(
    1,
    Math.min(90, Math.round(Number(merged.pomodoroLongBreakMinutes) || current.pomodoroLongBreakMinutes))
  );
  const pomodoroCyclesBeforeLong = Math.max(
    1,
    Math.min(8, Math.round(Number(merged.pomodoroCyclesBeforeLong) || current.pomodoroCyclesBeforeLong))
  );
  const defaultMode: FocusTimerMode =
    merged.defaultMode === 'stopwatch' ||
    merged.defaultMode === 'pomodoro' ||
    merged.defaultMode === 'countdown'
      ? merged.defaultMode
      : 'countdown';

  const wallpaperId =
    typeof merged.wallpaperId === 'string' && merged.wallpaperId.trim()
      ? merged.wallpaperId.trim()
      : current.wallpaperId || 'auto';

  const rawRotate = Number(merged.wallpaperRotateSeconds);
  const wallpaperRotateSeconds = Number.isFinite(rawRotate)
    ? rawRotate <= 0
      ? 0
      : Math.max(10, Math.min(600, Math.round(rawRotate)))
    : current.wallpaperRotateSeconds ?? 30;

  const rawDim = Number(merged.backgroundDimPercent);
  const backgroundDimPercent = Number.isFinite(rawDim)
    ? Math.max(25, Math.min(85, Math.round(rawDim)))
    : current.backgroundDimPercent ?? 55;

  const clockStyle = merged.clockStyle === 'bold' ? 'bold' : 'minimal';

  return {
    defaultMode,
    countdownMinutes,
    pomodoroWorkMinutes,
    pomodoroShortBreakMinutes,
    pomodoroLongBreakMinutes,
    pomodoroCyclesBeforeLong,
    maxDayMinutes,
    soundEnabled: Boolean(merged.soundEnabled),
    wallpaperId,
    wallpaperRotateSeconds,
    backgroundDimPercent,
    showQuote: merged.showQuote !== undefined ? Boolean(merged.showQuote) : (current.showQuote ?? true),
    clockStyle,
  };
}

export function getRemainingDailyFocusMinutes(
  maxDayMinutes: number,
  loggedTodayMinutes: number
): number {
  return Math.max(0, Math.round(maxDayMinutes) - Math.max(0, Math.round(loggedTodayMinutes)));
}

export interface ClampedTimerResult {
  minutes: number;
  clampedToCap: boolean;
  capReached: boolean;
  remainingDailyMinutes: number;
}

export function clampTimerMinutesToPreferences(
  requestedMinutes: number,
  maxDayMinutes: number,
  loggedTodayMinutes: number
): ClampedTimerResult {
  const safeMax = Math.max(MIN_DAY_FOCUS_MINUTES, Math.min(MAX_DAY_FOCUS_MINUTES, Math.round(maxDayMinutes)));
  const remainingDailyMinutes = getRemainingDailyFocusMinutes(safeMax, loggedTodayMinutes);
  const safeReq = Math.max(1, Math.round(requestedMinutes));

  if (remainingDailyMinutes <= 0) {
    return {
      minutes: 0,
      clampedToCap: true,
      capReached: true,
      remainingDailyMinutes: 0,
    };
  }

  const capped = Math.min(safeReq, remainingDailyMinutes);
  return {
    minutes: capped,
    clampedToCap: capped < safeReq,
    capReached: false,
    remainingDailyMinutes,
  };
}

export function getNextPomodoroTransition(timer: ActiveTimerState): {
  mode: 'focus' | 'short_break' | 'long_break';
  pomodoroCycle: number;
  targetSeconds: number;
} {
  if (timer.mode === 'focus') {
    const isLongBreak =
      timer.pomodoroCyclesBeforeLong > 0 &&
      timer.pomodoroCycle % timer.pomodoroCyclesBeforeLong === 0;
    const nextMode = isLongBreak ? 'long_break' : 'short_break';
    const nextMins = isLongBreak ? timer.longBreakMinutes : timer.breakMinutes;
    return {
      mode: nextMode,
      pomodoroCycle: timer.pomodoroCycle,
      targetSeconds: nextMins * 60,
    };
  }

  return {
    mode: 'focus',
    pomodoroCycle: timer.pomodoroCycle + 1,
    targetSeconds: timer.focusMinutes * 60,
  };
}

export function buildActiveTimerState(options: {
  timerType: FocusTimerMode;
  prefs: FocusTimerPreferences;
  date: string;
  loggedTodayMinutes: number;
  linkedTask?: StudyTask | null;
  overrideCountdownMinutes?: number;
  autoStart?: boolean;
}): ActiveTimerState {
  const {
    timerType,
    prefs,
    date,
    loggedTodayMinutes,
    linkedTask,
    overrideCountdownMinutes,
    autoStart = true,
  } = options;

  const taskTitle = linkedTask?.title ?? 'Standalone Focus Session';
  const objective =
    linkedTask?.objective ??
    (timerType === 'stopwatch'
      ? 'Open-ended stopwatch focus tracked against your daily limit.'
      : timerType === 'pomodoro'
        ? `${prefs.pomodoroWorkMinutes}m focus / ${prefs.pomodoroShortBreakMinutes}m break intervals.`
        : 'Timed countdown focus block.');

  if (timerType === 'stopwatch') {
    const remainingMins = getRemainingDailyFocusMinutes(prefs.maxDayMinutes, loggedTodayMinutes);
    return {
      timerType: 'stopwatch',
      taskId: linkedTask?.id,
      taskTitle,
      subjectId: linkedTask?.subjectId,
      chapterId: linkedTask?.chapterId,
      objective,
      mode: 'focus',
      presetId: 'stopwatch',
      focusMinutes: remainingMins,
      breakMinutes: prefs.pomodoroShortBreakMinutes,
      longBreakMinutes: prefs.pomodoroLongBreakMinutes,
      pomodoroCycle: 1,
      pomodoroCyclesBeforeLong: prefs.pomodoroCyclesBeforeLong,
      isFlowtime: true,
      isRunning: autoStart && remainingMins > 0,
      soundEnabled: prefs.soundEnabled,
      startedAtMs: autoStart && remainingMins > 0 ? Date.now() : null,
      accumulatedSeconds: 0,
      targetSeconds: remainingMins * 60,
      date,
    };
  }

  if (timerType === 'pomodoro') {
    const clamped = clampTimerMinutesToPreferences(
      prefs.pomodoroWorkMinutes,
      prefs.maxDayMinutes,
      loggedTodayMinutes
    );
    const workMins = clamped.minutes > 0 ? clamped.minutes : prefs.pomodoroWorkMinutes;
    const presetId: ActiveTimerState['presetId'] =
      workMins === 25 && prefs.pomodoroShortBreakMinutes === 5
        ? '25_5'
        : workMins === 50 && prefs.pomodoroShortBreakMinutes === 10
          ? '50_10'
          : 'custom';
    return {
      timerType: 'pomodoro',
      taskId: linkedTask?.id,
      taskTitle,
      subjectId: linkedTask?.subjectId,
      chapterId: linkedTask?.chapterId,
      objective,
      mode: 'focus',
      presetId,
      focusMinutes: workMins,
      breakMinutes: prefs.pomodoroShortBreakMinutes,
      longBreakMinutes: prefs.pomodoroLongBreakMinutes,
      pomodoroCycle: 1,
      pomodoroCyclesBeforeLong: prefs.pomodoroCyclesBeforeLong,
      isFlowtime: false,
      isRunning: autoStart && !clamped.capReached,
      soundEnabled: prefs.soundEnabled,
      startedAtMs: autoStart && !clamped.capReached ? Date.now() : null,
      accumulatedSeconds: 0,
      targetSeconds: workMins * 60,
      date,
    };
  }

  // Countdown mode: respects override (e.g. task duration or custom H:M) clamped to customizable day cap
  const rawMinutes =
    overrideCountdownMinutes ?? linkedTask?.durationMinutes ?? prefs.countdownMinutes;
  const clamped = clampTimerMinutesToPreferences(
    rawMinutes,
    prefs.maxDayMinutes,
    loggedTodayMinutes
  );
  const targetMins = clamped.minutes > 0 ? clamped.minutes : rawMinutes;

  return {
    timerType: 'countdown',
    taskId: linkedTask?.id,
    taskTitle,
    subjectId: linkedTask?.subjectId,
    chapterId: linkedTask?.chapterId,
    objective,
    mode: 'focus',
    presetId: 'custom',
    focusMinutes: targetMins,
    breakMinutes: prefs.pomodoroShortBreakMinutes,
    longBreakMinutes: prefs.pomodoroLongBreakMinutes,
    pomodoroCycle: 1,
    pomodoroCyclesBeforeLong: prefs.pomodoroCyclesBeforeLong,
    isFlowtime: false,
    isRunning: autoStart && !clamped.capReached,
    soundEnabled: prefs.soundEnabled,
    startedAtMs: autoStart && !clamped.capReached ? Date.now() : null,
    accumulatedSeconds: 0,
    targetSeconds: targetMins * 60,
    date,
  };
}

export function formatFocusDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatMinutesHm(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}
