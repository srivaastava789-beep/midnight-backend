import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  Minimize2,
  Palette,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed.ts';
import {
  FOCUS_THEMES,
  FocusBackgroundTheme,
  getFocusThemeById,
  getRandomFocusTheme,
} from '../data/focusThemes.ts';
import {
  getRandomMotivationalQuote,
  MotivationalQuote,
} from '../data/motivationalQuotes.ts';
import {
  buildActiveTimerState,
  clampTimerMinutesToPreferences,
  formatFocusDuration,
  formatMinutesHm,
  getNextPomodoroTransition,
  getRemainingDailyFocusMinutes,
  validateFocusTimerPrefs,
} from '../engine/focusTimer.ts';
import type {
  ActiveTimerState,
  FocusSession,
  FocusTimerMode,
  FocusTimerPreferences,
  StudyTask,
} from '../types/study.ts';

interface FocusViewProps {
  activeDate: string;
  tasks: StudyTask[];
  loggedTodayMinutes: number;
  prefs: FocusTimerPreferences;
  activeTimer: ActiveTimerState | null;
  zenMode: boolean;
  onToggleZenMode: () => void;
  onBackToToday: () => void;
  onUpdatePrefs: (next: FocusTimerPreferences) => void;
  onUpdateTimer: (next: ActiveTimerState | null) => void;
  onLogFocusSession: (session: FocusSession) => void;
}

function playSubtleChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(528, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.95);
  } catch {
    // Ignore Web Audio autoplay blocks gracefully
  }
}

const MODE_LABELS: Record<FocusTimerMode, string> = {
  countdown: 'Countdown',
  stopwatch: 'Stopwatch',
  pomodoro: 'Pomodoro',
};

export const FocusView: React.FC<FocusViewProps> = ({
  activeDate,
  tasks,
  loggedTodayMinutes,
  prefs,
  activeTimer,
  zenMode,
  onToggleZenMode,
  onBackToToday,
  onUpdatePrefs,
  onUpdateTimer,
  onLogFocusSession,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [showSetup, setShowSetup] = useState(false);
  const [linkedTaskId, setLinkedTaskId] = useState<string>(activeTimer?.taskId ?? '');
  const [customGoal, setCustomGoal] = useState<string>('');
  const [themeIdx, setThemeIdx] = useState<number>(0);
  const [currentQuote, setCurrentQuote] = useState<MotivationalQuote>(() =>
    getRandomMotivationalQuote()
  );
  const completedChimeFired = useRef(false);

  // Sync linked task if user arrived via Start focus button
  useEffect(() => {
    if (activeTimer?.taskId !== undefined) {
      setLinkedTaskId(activeTimer.taskId);
    }
  }, [activeTimer?.taskId]);

  // Timer tick interval
  useEffect(() => {
    if (!activeTimer?.isRunning) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [activeTimer?.isRunning]);

  // Theme auto-rotation every 30s when wallpaperId === 'auto'
  useEffect(() => {
    if (prefs.wallpaperId !== 'auto') return;
    const intervalSeconds = prefs.wallpaperRotateSeconds > 0 ? prefs.wallpaperRotateSeconds : 30;
    const id = window.setInterval(() => {
      setThemeIdx((prev) => (prev + 1) % FOCUS_THEMES.length);
    }, intervalSeconds * 1000);
    return () => window.clearInterval(id);
  }, [prefs.wallpaperId, prefs.wallpaperRotateSeconds]);

  // Sync manual theme selection
  useEffect(() => {
    if (prefs.wallpaperId && prefs.wallpaperId !== 'auto' && prefs.wallpaperId !== 'none') {
      const idx = FOCUS_THEMES.findIndex((t) => t.id === prefs.wallpaperId);
      if (idx >= 0) setThemeIdx(idx);
    }
  }, [prefs.wallpaperId]);

  // Keyboard shortcuts (Space = Play/Pause, Esc = exit setup/zen, F = toggle zen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleStartOrToggle();
      } else if (e.key === 'Escape') {
        if (showSetup) {
          setShowSetup(false);
        } else if (zenMode) {
          onToggleZenMode();
        }
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        onToggleZenMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const activeTheme: FocusBackgroundTheme = useMemo(() => {
    if (prefs.wallpaperId === 'none') {
      return {
        id: 'none',
        name: 'Midnight Black',
        tag: 'Solid Black',
        cssStyle: { backgroundColor: '#000000' },
        overlayClass: 'bg-black/90',
      };
    }
    if (prefs.wallpaperId === 'auto') {
      return FOCUS_THEMES[themeIdx % FOCUS_THEMES.length];
    }
    return getFocusThemeById(prefs.wallpaperId) || FOCUS_THEMES[0];
  }, [prefs.wallpaperId, themeIdx]);

  const currentMode: FocusTimerMode = activeTimer?.timerType ?? prefs.defaultMode;
  const remainingDailyMinutes = getRemainingDailyFocusMinutes(prefs.maxDayMinutes, loggedTodayMinutes);
  const dailyCapReached = remainingDailyMinutes <= 0;

  const selectedLinkedTask = useMemo(
    () => tasks.find((t) => t.id === (activeTimer?.taskId ?? linkedTaskId)) ?? null,
    [tasks, activeTimer?.taskId, linkedTaskId]
  );

  const elapsedSeconds = useMemo(() => {
    if (!activeTimer) return 0;
    const runningExtra =
      activeTimer.isRunning && activeTimer.startedAtMs
        ? Math.max(0, Math.floor((nowMs - activeTimer.startedAtMs) / 1000))
        : 0;
    return activeTimer.accumulatedSeconds + runningExtra;
  }, [activeTimer, nowMs]);

  const displaySeconds = useMemo(() => {
    if (!activeTimer) {
      if (currentMode === 'stopwatch') return 0;
      if (currentMode === 'pomodoro') {
        const clamped = clampTimerMinutesToPreferences(
          prefs.pomodoroWorkMinutes,
          prefs.maxDayMinutes,
          loggedTodayMinutes
        );
        return (clamped.minutes > 0 ? clamped.minutes : prefs.pomodoroWorkMinutes) * 60;
      }
      const clamped = clampTimerMinutesToPreferences(
        prefs.countdownMinutes,
        prefs.maxDayMinutes,
        loggedTodayMinutes
      );
      return (clamped.minutes > 0 ? clamped.minutes : prefs.countdownMinutes) * 60;
    }

    if (activeTimer.timerType === 'stopwatch') {
      return activeTimer.targetSeconds > 0
        ? Math.min(elapsedSeconds, activeTimer.targetSeconds)
        : elapsedSeconds;
    }
    return Math.max(0, activeTimer.targetSeconds - elapsedSeconds);
  }, [activeTimer, currentMode, elapsedSeconds, loggedTodayMinutes, prefs]);

  const isTargetReached = Boolean(
    activeTimer &&
      activeTimer.targetSeconds > 0 &&
      elapsedSeconds >= activeTimer.targetSeconds &&
      elapsedSeconds > 0
  );

  // Stop timer smoothly when target reaches 0
  useEffect(() => {
    if (!activeTimer || !activeTimer.isRunning || !isTargetReached) return;
    if (activeTimer.soundEnabled && !completedChimeFired.current) {
      completedChimeFired.current = true;
      playSubtleChime();
    }
    onUpdateTimer({
      ...activeTimer,
      isRunning: false,
      startedAtMs: null,
      accumulatedSeconds: activeTimer.targetSeconds,
    });
  }, [activeTimer, isTargetReached, onUpdateTimer]);

  const logElapsedIfNeeded = (timer: ActiveTimerState, secs: number) => {
    const mins = Math.round(secs / 60);
    if (mins < 1) return;
    if (timer.mode !== 'focus') return;
    onLogFocusSession({
      id: `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      date: timer.date,
      taskId: timer.taskId,
      subjectId: timer.subjectId,
      chapterId: timer.chapterId,
      taskTitle: timer.taskTitle,
      mode: timer.timerType === 'stopwatch' ? 'flowtime' : 'focus',
      timerType: timer.timerType,
      durationMinutes: mins,
      startedAt: new Date(Date.now() - secs * 1000).toISOString(),
      endedAt: new Date().toISOString(),
    });
  };

  const handleSelectMode = (nextMode: FocusTimerMode) => {
    const nextPrefs = validateFocusTimerPrefs({ defaultMode: nextMode }, prefs);
    onUpdatePrefs(nextPrefs);

    if (activeTimer) {
      if (elapsedSeconds >= 60 && activeTimer.mode === 'focus') {
        logElapsedIfNeeded(activeTimer, elapsedSeconds);
      }
      completedChimeFired.current = false;
      const fresh = buildActiveTimerState({
        timerType: nextMode,
        prefs: nextPrefs,
        date: activeDate,
        loggedTodayMinutes,
        linkedTask: selectedLinkedTask,
        autoStart: false,
      });
      onUpdateTimer(fresh);
    }
  };

  const handleStartOrToggle = () => {
    const now = Date.now();
    if (!activeTimer) {
      completedChimeFired.current = false;
      const effectiveTask = selectedLinkedTask
        ? selectedLinkedTask
        : customGoal.trim()
          ? ({
              id: `custom-${Date.now()}`,
              subjectId: 'mathematics',
              title: customGoal.trim(),
              objective: 'Deep focus',
              durationMinutes: prefs.countdownMinutes,
              timeSlot: '17:30–18:45',
              blockIndex: 1,
              taskType: 'first_study',
              completed: false,
              completedAt: null,
              originalDate: activeDate,
              scheduledDate: activeDate,
              carriedForward: false,
              difficulty: 'Medium',
            } as StudyTask)
          : null;

      const fresh = buildActiveTimerState({
        timerType: prefs.defaultMode,
        prefs,
        date: activeDate,
        loggedTodayMinutes,
        linkedTask: effectiveTask,
        autoStart: true,
      });
      onUpdateTimer(fresh);
      setShowSetup(false);
      return;
    }

    if (activeTimer.isRunning) {
      const runningExtra = activeTimer.startedAtMs
        ? Math.max(0, Math.floor((now - activeTimer.startedAtMs) / 1000))
        : 0;
      onUpdateTimer({
        ...activeTimer,
        isRunning: false,
        startedAtMs: null,
        accumulatedSeconds: activeTimer.accumulatedSeconds + runningExtra,
      });
    } else {
      completedChimeFired.current = false;
      onUpdateTimer({
        ...activeTimer,
        isRunning: true,
        startedAtMs: now,
        accumulatedSeconds: isTargetReached ? 0 : activeTimer.accumulatedSeconds,
      });
      setShowSetup(false);
    }
  };

  const handleReset = () => {
    completedChimeFired.current = false;
    if (!activeTimer) return;
    onUpdateTimer({
      ...activeTimer,
      isRunning: false,
      startedAtMs: null,
      accumulatedSeconds: 0,
    });
  };

  const handleEndSession = () => {
    if (!activeTimer) return;
    logElapsedIfNeeded(activeTimer, elapsedSeconds);
    completedChimeFired.current = false;
    onUpdateTimer(null);
  };

  const handleAdvancePomodoro = () => {
    if (!activeTimer || activeTimer.timerType !== 'pomodoro') return;
    if (elapsedSeconds >= 60 && activeTimer.mode === 'focus') {
      logElapsedIfNeeded(activeTimer, elapsedSeconds);
    }
    const transition = getNextPomodoroTransition(activeTimer);
    completedChimeFired.current = false;
    onUpdateTimer({
      ...activeTimer,
      mode: transition.mode,
      pomodoroCycle: transition.pomodoroCycle,
      isRunning: false,
      startedAtMs: null,
      accumulatedSeconds: 0,
      targetSeconds: transition.targetSeconds,
    });
  };

  const handleNextTheme = () => {
    setThemeIdx((prev) => (prev + 1) % FOCUS_THEMES.length);
    const nextTheme = FOCUS_THEMES[(themeIdx + 1) % FOCUS_THEMES.length];
    onUpdatePrefs(validateFocusTimerPrefs({ wallpaperId: nextTheme.id }, prefs));
  };

  const handleNextQuote = () => {
    setCurrentQuote((prev) => getRandomMotivationalQuote(prev.id));
  };

  // Progress computation
  const totalTargetSec = activeTimer ? activeTimer.targetSeconds : prefs.countdownMinutes * 60;
  const progressPct =
    totalTargetSec > 0
      ? currentMode === 'stopwatch'
        ? Math.min(100, Math.round((elapsedSeconds / (prefs.maxDayMinutes * 60)) * 100))
        : Math.min(100, Math.round(((totalTargetSec - displaySeconds) / totalTargetSec) * 100))
      : 0;

  const isFocusing = Boolean(activeTimer);

  return (
    <div
      data-testid="focus-view-root"
      className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden select-none transition-all duration-700"
      style={activeTheme.cssStyle}
    >
      {/* Background Image Layer if present */}
      {activeTheme.photoUrl && (
        <img
          src={activeTheme.photoUrl}
          alt={activeTheme.name}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: 0.6 }}
        />
      )}

      {/* Atmospheric Vignette & Scrim Overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-colors duration-700 ${activeTheme.overlayClass}`}
      />

      {/* =========================================================================
          FULL-SCREEN FOCUS MODE (ZEN MODE)
          Strict Rule: ONLY the motivational quote at top, timer in center, minimal
          timer controls, and one tiny exit icon in the corner. NO dashboard, NO text.
          ========================================================================= */}
      {zenMode ? (
        <div className="relative z-10 flex-1 flex flex-col justify-between p-6 sm:p-10">
          {/* Tiny discreet exit full-screen icon in corner */}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="focus-toggle-zen"
              onClick={onToggleZenMode}
              title="Exit full-screen focus (Esc or F)"
              aria-label="Exit full-screen focus"
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/90 text-white/50 hover:text-white border border-white/10 flex items-center justify-center transition-all opacity-40 hover:opacity-100"
            >
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* 1. Motivational Quote at the Top: Bold, Prominent, Main Attraction */}
          <div className="w-full max-w-2xl mx-auto text-center px-4 min-h-[76px] sm:min-h-[88px] flex flex-col items-center justify-center space-y-1.5 pt-2">
            <h1
              data-testid="motivational-quote-focus"
              className="text-xl sm:text-2xl md:text-3xl font-medium text-white tracking-tight leading-snug text-balance drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]"
            >
              “{currentQuote.text}”
            </h1>
            {currentQuote.author && (
              <p className="text-xs font-mono text-white/90 tracking-wider">
                — {currentQuote.author}
              </p>
            )}
          </div>

          {/* 2. Timer Underneath Quote: Centered, Aesthetic Cinematic Typography */}
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4 space-y-5 min-h-[160px]">
            <div
              data-testid="focus-timer-clock"
              className="font-mono text-7xl sm:text-8xl lg:text-[108px] font-normal tracking-tight text-white tabular-nums leading-none select-none drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)]"
            >
              {formatFocusDuration(displaySeconds)}
            </div>

            {/* Delicate Progress Line */}
            <div className="w-64 sm:w-80 h-1 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Minimal Rounded Icon Controls Only */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                type="button"
                data-testid="focus-timer-toggle"
                onClick={handleStartOrToggle}
                title={activeTimer?.isRunning ? 'Pause timer (Space)' : 'Start focus (Space)'}
                aria-label={activeTimer?.isRunning ? 'Pause' : 'Start'}
                className="w-13 h-13 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition-transform active:scale-95 shadow-xl"
              >
                {activeTimer?.isRunning ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {activeTimer && (
                <>
                  <button
                    type="button"
                    data-testid="focus-timer-reset"
                    onClick={handleReset}
                    title="Reset interval"
                    aria-label="Reset timer"
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white border border-white/20 flex items-center justify-center transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="focus-timer-end"
                    onClick={handleEndSession}
                    title="End & log session"
                    aria-label="End session"
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white border border-white/20 flex items-center justify-center transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </>
              )}

              {currentMode === 'pomodoro' && activeTimer && (
                <button
                  type="button"
                  data-testid="pomodoro-next-phase"
                  onClick={handleAdvancePomodoro}
                  title="Skip to next phase"
                  aria-label="Advance pomodoro"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white border border-white/20 flex items-center justify-center transition-all"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Minimal Bottom Bar */}
          <div className="flex items-center justify-between text-xs text-white/50 px-2 font-mono">
            <span>{activeTheme.name}</span>
            <span>Esc to exit</span>
          </div>
        </div>
      ) : (
        /* =========================================================================
            STANDARD WORKSPACE FOCUS ENVIRONMENT
            Clean, aesthetic, motivational backdrop with bold quote at top,
            centered timer, and compact rounded icon-only controls.
           ========================================================================= */
        <div className="relative z-10 flex-1 flex flex-col justify-between p-6 sm:p-10">
          {/* Top Bar: Discreet navigation & aesthetic icons */}
          <header className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBackToToday}
              title="Return to Today dashboard"
              aria-label="Return to Today"
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white/80 hover:text-white border border-white/15 flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Quick Rounded Icon Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNextTheme}
                title={`Change atmosphere (${activeTheme.name})`}
                aria-label="Change wallpaper theme"
                className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white/80 hover:text-white border border-white/15 flex items-center justify-center transition-all"
              >
                <Palette className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleNextQuote}
                title="Shuffle motivational quote"
                aria-label="Next quote"
                className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white/80 hover:text-white border border-white/15 flex items-center justify-center transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs(validateFocusTimerPrefs({ soundEnabled: !prefs.soundEnabled }, prefs))
                }
                title={prefs.soundEnabled ? 'Chime sound on' : 'Chime sound off'}
                aria-label="Toggle chime sound"
                className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white/80 hover:text-white border border-white/15 flex items-center justify-center transition-all"
              >
                {prefs.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                data-testid="toggle-timer-prefs"
                onClick={() => setShowSetup(true)}
                title="Focus timer configuration"
                aria-label="Focus timer settings"
                className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white/80 hover:text-white border border-white/15 flex items-center justify-center transition-all"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                type="button"
                data-testid="focus-toggle-zen"
                onClick={onToggleZenMode}
                title="Enter full-screen focus (F)"
                aria-label="Full-screen focus"
                className="w-9 h-9 rounded-full bg-white text-black hover:bg-neutral-200 flex items-center justify-center transition-all shadow-md ml-1"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* 1. Motivational Quote: Bold, Prominent Centerpiece at Top */}
          <div className="w-full max-w-2xl mx-auto text-center px-4 min-h-[76px] sm:min-h-[88px] flex flex-col items-center justify-center space-y-1.5 pt-2">
            <h1
              data-testid="motivational-quote-focus"
              className="text-xl sm:text-2xl md:text-3xl font-medium text-white tracking-tight leading-snug text-balance drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]"
            >
              “{currentQuote.text}”
            </h1>
            {currentQuote.author && (
              <p className="text-xs font-mono text-white/90 tracking-wider">
                — {currentQuote.author}
              </p>
            )}
          </div>

          {/* 2. Timer Underneath Quote (Second Attraction) */}
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4 space-y-5 min-h-[160px]">
            {/* Subtle Task / Subject Pill */}
            {selectedLinkedTask ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 border border-white/15 backdrop-blur-md text-xs font-medium text-white/90">
                <span className="font-mono text-white/60">
                  {SUBJECT_MAP[selectedLinkedTask.subjectId]?.name ?? selectedLinkedTask.subjectId}
                </span>
                <span aria-hidden="true" className="text-white/30">·</span>
                <span className="truncate max-w-xs">{selectedLinkedTask.title}</span>
              </div>
            ) : customGoal.trim() ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 border border-white/15 backdrop-blur-md text-xs font-medium text-white/90">
                <span>{customGoal.trim()}</span>
              </div>
            ) : null}

            {/* Cinematic Timer Digits */}
            <div
              data-testid="focus-timer-clock"
              className="font-mono text-7xl sm:text-8xl lg:text-[108px] font-normal tracking-tight text-white tabular-nums leading-none select-none drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)]"
            >
              {formatFocusDuration(displaySeconds)}
            </div>

            {/* Delicate Progress Track */}
            <div className="w-64 sm:w-80 h-1 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Mode Indicator & Session Info */}
            <div className="flex items-center gap-3 text-xs font-mono text-white/70">
              <span className="uppercase tracking-wider">{currentMode}</span>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span>
                {currentMode === 'pomodoro'
                  ? `${activeTimer?.mode === 'short_break' ? 'Short Break' : activeTimer?.mode === 'long_break' ? 'Long Break' : 'Focus Phase'} (Cycle ${activeTimer?.pomodoroCycle ?? 1})`
                  : activeTimer
                    ? `${Math.round(elapsedSeconds / 60)}m elapsed · ${loggedTodayMinutes}m today`
                    : `${formatMinutesHm(remainingDailyMinutes)} remaining today`}
              </span>
            </div>

            {/* 3. Minimal Compact Rounded Icon-Only Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                data-testid="focus-timer-toggle"
                onClick={handleStartOrToggle}
                title={activeTimer?.isRunning ? 'Pause timer (Space)' : 'Start focus (Space)'}
                aria-label={activeTimer?.isRunning ? 'Pause' : 'Start'}
                className="w-13 h-13 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition-transform active:scale-95 shadow-xl"
              >
                {activeTimer?.isRunning ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {activeTimer && (
                <>
                  <button
                    type="button"
                    data-testid="focus-timer-reset"
                    onClick={handleReset}
                    title="Reset interval"
                    aria-label="Reset timer"
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white border border-white/20 flex items-center justify-center transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="focus-timer-end"
                    onClick={handleEndSession}
                    title="End & log focus session"
                    aria-label="End session"
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white border border-white/20 flex items-center justify-center transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </>
              )}

              {currentMode === 'pomodoro' && activeTimer && (
                <button
                  type="button"
                  data-testid="pomodoro-next-phase"
                  onClick={handleAdvancePomodoro}
                  title="Advance Pomodoro interval"
                  aria-label="Advance pomodoro"
                  className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white border border-white/20 flex items-center justify-center transition-all"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Atmosphere Footer */}
          <footer className="flex items-center justify-between text-xs text-white/50 font-mono">
            <span className="truncate max-w-xs">{activeTheme.name}</span>
            <span>Logged today: {loggedTodayMinutes}m</span>
          </footer>
        </div>
      )}

      {/* =========================================================================
          4. FOCUS SETUP SCREEN (MODAL / POPOVER)
          Clean, minimal, fast configuration before starting:
          - Task / Goal name
          - Mode (Countdown, Stopwatch, Pomodoro)
          - Durations (directly within inline controls)
          - Background Theme Selection
          - Start Focus Button
          ========================================================================= */}
      {showSetup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-setup-heading"
          data-testid="timer-prefs-panel"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
        >
          <div className="relative w-full max-w-lg border border-[#333333] bg-[#0A0A0A] p-6 sm:p-8 rounded-none shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#262626] pb-4">
              <div>
                <div className="text-[10px] font-mono text-[#858585] uppercase tracking-wider">
                  Session Setup
                </div>
                <h2 id="focus-setup-heading" className="text-xl font-semibold text-white">
                  Focus Environment
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSetup(false)}
                title="Close setup"
                aria-label="Close setup"
                className="w-8 h-8 rounded-none bg-[#1A1A1A] text-[#858585] hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Task Name / What I want to accomplish */}
            <div className="space-y-2">
              <label htmlFor="focus-goal-input" className="block text-xs font-mono text-[#A3A3A3] uppercase">
                What do you want to accomplish?
              </label>
              {tasks.length > 0 ? (
                <div className="space-y-2">
                  <select
                    id="focus-goal-input"
                    value={linkedTaskId}
                    onChange={(e) => {
                      setLinkedTaskId(e.target.value);
                      if (e.target.value) setCustomGoal('');
                    }}
                    className="w-full border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-xs text-white rounded-none focus:border-white focus:outline-none"
                  >
                    <option value="">Choose from today's plan...</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {SUBJECT_MAP[t.subjectId]?.name ?? t.subjectId} · {t.title} ({t.durationMinutes}m)
                      </option>
                    ))}
                  </select>

                  {!linkedTaskId && (
                    <input
                      type="text"
                      placeholder="Or type a custom goal (e.g. Chapter 8 numericals)..."
                      value={customGoal}
                      onChange={(e) => setCustomGoal(e.target.value)}
                      className="w-full border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-xs text-white rounded-none focus:border-white focus:outline-none placeholder:text-[#555555]"
                    />
                  )}
                </div>
              ) : (
                <input
                  id="focus-goal-input"
                  type="text"
                  placeholder="e.g. Solve 10 trigonometry problems..."
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  className="w-full border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-xs text-white rounded-none focus:border-white focus:outline-none placeholder:text-[#555555]"
                />
              )}
            </div>

            {/* Timer Mode Selection */}
            <div className="space-y-2">
              <span className="block text-xs font-mono text-[#A3A3A3] uppercase">
                Timer Mode
              </span>
              <div
                role="tablist"
                aria-label="Timer Mode"
                className="grid grid-cols-3 gap-2 bg-[#141414] p-1.5 rounded-none border border-[#262626]"
              >
                {(['countdown', 'stopwatch', 'pomodoro'] as FocusTimerMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={currentMode === mode}
                    data-testid={`timer-mode-${mode}`}
                    onClick={() => handleSelectMode(mode)}
                    className={`py-2 text-xs font-medium rounded-none transition-colors ${
                      currentMode === mode
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-[#858585] hover:text-white'
                    }`}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode-Specific Compact Configuration */}
            {currentMode === 'countdown' && (
              <div className="space-y-2 pt-1 border-t border-[#262626]">
                <div className="flex items-center justify-between text-xs font-mono text-[#858585]">
                  <span>FOCUS DURATION</span>
                  <span className="text-white">{formatMinutesHm(prefs.countdownMinutes)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[25, 45, 60, 75, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        onUpdatePrefs(validateFocusTimerPrefs({ countdownMinutes: mins }, prefs))
                      }
                      className={`px-3 py-1.5 text-xs font-mono rounded-none border ${
                        prefs.countdownMinutes === mins
                          ? 'border-white bg-white text-black font-medium'
                          : 'border-[#262626] bg-[#141414] text-[#858585] hover:text-white'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentMode === 'pomodoro' && (
              <div className="space-y-3 pt-1 border-t border-[#262626]">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#858585]">WORK</label>
                    <select
                      value={prefs.pomodoroWorkMinutes}
                      onChange={(e) =>
                        onUpdatePrefs(
                          validateFocusTimerPrefs({ pomodoroWorkMinutes: Number(e.target.value) }, prefs)
                        )
                      }
                      className="w-full border border-[#262626] bg-[#141414] p-2 text-xs text-white rounded-none"
                    >
                      <option value="25">25m</option>
                      <option value="30">30m</option>
                      <option value="45">45m</option>
                      <option value="50">50m</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#858585]">BREAK</label>
                    <select
                      value={prefs.pomodoroShortBreakMinutes}
                      onChange={(e) =>
                        onUpdatePrefs(
                          validateFocusTimerPrefs(
                            { pomodoroShortBreakMinutes: Number(e.target.value) },
                            prefs
                          )
                        )
                      }
                      className="w-full border border-[#262626] bg-[#141414] p-2 text-xs text-white rounded-none"
                    >
                      <option value="5">5m</option>
                      <option value="10">10m</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#858585]">LONG BREAK</label>
                    <select
                      value={prefs.pomodoroLongBreakMinutes}
                      onChange={(e) =>
                        onUpdatePrefs(
                          validateFocusTimerPrefs(
                            { pomodoroLongBreakMinutes: Number(e.target.value) },
                            prefs
                          )
                        )
                      }
                      className="w-full border border-[#262626] bg-[#141414] p-2 text-xs text-white rounded-none"
                    >
                      <option value="15">15m</option>
                      <option value="20">20m</option>
                      <option value="30">30m</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Background Atmosphere Selection */}
            <div className="space-y-2 pt-1 border-t border-[#262626]">
              <div className="flex items-center justify-between text-xs font-mono text-[#858585]">
                <span>ATMOSPHERE BACKGROUND</span>
                <span className="text-white">{activeTheme.name}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {FOCUS_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      onUpdatePrefs(validateFocusTimerPrefs({ wallpaperId: theme.id }, prefs));
                    }}
                    className={`p-2 text-left text-xs rounded-none border transition-all ${
                      prefs.wallpaperId === theme.id
                        ? 'border-white bg-[#1A1A1A] text-white font-medium'
                        : 'border-[#262626] bg-[#111111] text-[#858585] hover:text-white'
                    }`}
                  >
                    <div className="truncate font-semibold">{theme.name}</div>
                    <div className="text-[10px] text-[#555555] truncate">{theme.tag}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Focus CTA */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStartOrToggle}
                className="w-full py-3 bg-white text-black font-semibold text-sm rounded-full hover:bg-neutral-200 transition-all shadow-xl flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Focus Session</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
