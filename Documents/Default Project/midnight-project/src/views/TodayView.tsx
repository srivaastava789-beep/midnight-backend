import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit3,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { MoonHero } from '../components/MoonHero';
import { MotivationalQuoteCard } from '../components/MotivationalQuoteCard';
import { SUBJECT_MAP } from '../data/seed';
import { calculateDaySummary } from '../engine/analytics';
import { getNextExam } from '../engine/planner';
import { categorizeRevisions } from '../engine/revision';
import type {
  AppState,
  ExamItem,
  RevisionTask,
  StudyTask,
} from '../types/study';
import {
  formatDisplayDate,
  formatFullDisplayDate,
  getTimeGreeting,
  getWeekdayName,
} from '../utils/date';

interface TodayViewProps {
  state: AppState;
  activeDate: string;
  missedWorkCount: number;
  aiLoading: boolean;
  aiError: string | null;
  onStartFocus: (task: StudyTask) => void;
  onToggleTask: (date: string, taskId: string) => void;
  onReorderTask: (date: string, taskId: string, direction: 'up' | 'down') => void;
  onDeleteTask: (date: string, taskId: string) => void;
  onEditTask: (task: StudyTask) => void;
  onAddTask: () => void;
  onRegenerateToday: (availableMinutes: number) => void;
  onGenerateAIToday: (availableMinutes: number) => void;
  onOpenRecovery: () => void;
  onOpenExam: (exam: ExamItem) => void;
  onOpenChapterById: (chapterId: string) => void;
  onOpenRevisionSection: () => void;
  onQuickCompleteRevision: (rev: RevisionTask, confidence: number) => void;
  onUpdateWorkout: (
    date: string,
    patch: Partial<{ completed: boolean; title: string; durationMinutes: number; notes: string }>
  ) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  state,
  activeDate,
  missedWorkCount,
  aiLoading,
  aiError,
  onStartFocus,
  onToggleTask,
  onReorderTask,
  onDeleteTask,
  onEditTask,
  onAddTask,
  onRegenerateToday,
  onGenerateAIToday,
  onOpenRecovery,
  onOpenExam,
  onOpenChapterById,
  onOpenRevisionSection,
  onQuickCompleteRevision,
  onUpdateWorkout,
}) => {
  const plan = state.plans[activeDate];
  const tasks = plan?.tasks ?? [];
  const summary = calculateDaySummary(plan, state, activeDate);
  const nextExam = getNextExam(state.exams, activeDate);
  const categorizedRevs = categorizeRevisions(state.revisions, activeDate);
  const dueRevsToday = categorizedRevs.today;
  const overdueRevs = categorizedRevs.overdue;

  // Progressive disclosure: collapsed by default so initial screen is calm and focused
  const [planExpanded, setPlanExpanded] = useState(false);
  const [workoutExpanded, setWorkoutExpanded] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [editingWindow, setEditingWindow] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState<number>(
    plan?.availableMinutes ?? state.settings.blockDurationMinutes * 2
  );
  const [editingWorkout, setEditingWorkout] = useState(false);

  const greeting = getTimeGreeting();
  const weekday = getWeekdayName(activeDate);
  const fullDate = formatFullDisplayDate(activeDate);

  // Determine the single next scheduled task
  const nextFocusTask = tasks.find((t) => !t.completed) ?? null;

  const morningTasks = tasks.filter((t) => t.blockIndex === 0);
  const eveningTasks = tasks.filter((t) => t.blockIndex >= 1);

  const handleApplyWindow = (e: React.FormEvent) => {
    e.preventDefault();
    onRegenerateToday(windowMinutes);
    setEditingWindow(false);
  };

  const renderTimelineItem = (task: StudyTask, idx: number, totalListLen: number) => {
    const subjectName = SUBJECT_MAP[task.subjectId]?.name ?? task.subjectId;
    const isNext = nextFocusTask?.id === task.id;
    return (
      <div
        key={task.id}
        data-testid="study-task-row"
        className={`group flex items-start gap-4 px-5 py-4 transition-colors ${
          task.completed
            ? 'opacity-50'
            : isNext
              ? 'bg-[#111111]'
              : 'bg-[#0A0A0A] hover:bg-[#111111]/60'
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'completed'}`}
          onClick={() => onToggleTask(activeDate, task.id)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
            task.completed
              ? 'border-white bg-white text-black'
              : 'border-[#555555] bg-black text-transparent hover:border-white'
          }`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#858585]">
            <span className="font-mono text-white tabular-nums">{task.timeSlot}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{task.durationMinutes}m</span>
            <span aria-hidden="true">·</span>
            <span>{subjectName}</span>
            {isNext && !task.completed && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-white uppercase tracking-wider text-[11px]">
                  Up Next
                </span>
              </>
            )}
            {task.difficulty !== 'Not rated' && (
              <>
                <span aria-hidden="true">·</span>
                <span>{task.difficulty}</span>
              </>
            )}
            {task.carriedForward && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-white">
                  Carried from {formatDisplayDate(task.originalDate, false)}
                </span>
              </>
            )}
          </div>

          <div className="mt-1 flex items-baseline justify-between gap-3">
            {task.chapterId ? (
              <button
                type="button"
                onClick={() => onOpenChapterById(task.chapterId!)}
                className={`text-left text-base font-medium hover:underline ${
                  task.completed ? 'line-through text-[#858585]' : 'text-white'
                }`}
              >
                {task.title}
              </button>
            ) : (
              <span
                className={`text-base font-medium ${
                  task.completed ? 'line-through text-[#858585]' : 'text-white'
                }`}
              >
                {task.title}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-sm text-[#858585]">{task.objective}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!task.completed && (
            <button
              type="button"
              aria-label={`Focus on "${task.title}"`}
              onClick={() => onStartFocus(task)}
              className="mr-1 flex items-center gap-1 border border-[#262626] bg-black px-2.5 py-1 text-xs text-white hover:border-white"
            >
              <Play className="w-3 h-3" aria-hidden="true" />
              <span>Focus</span>
            </button>
          )}
          <button
            type="button"
            aria-label={`Move "${task.title}" up`}
            disabled={idx === 0}
            onClick={() => onReorderTask(activeDate, task.id, 'up')}
            className="p-1.5 text-[#555555] hover:text-white disabled:opacity-30"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move "${task.title}" down`}
            disabled={idx === totalListLen - 1}
            onClick={() => onReorderTask(activeDate, task.id, 'down')}
            className="p-1.5 text-[#555555] hover:text-white disabled:opacity-30"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Edit "${task.title}"`}
            onClick={() => onEditTask(task)}
            className="p-1.5 text-[#555555] hover:text-white"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete "${task.title}"`}
            onClick={() => onDeleteTask(activeDate, task.id)}
            className="p-1.5 text-[#555555] hover:text-white"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Moonlit Editorial Hero */}
      <header className="relative overflow-hidden border border-[#262626] bg-[#0A0A0A] px-6 py-8 sm:px-10 sm:py-10 rounded-none">
        <MoonHero />

        <div className="relative z-10 flex flex-col gap-6">
          {/* Compact header row with small next-exam countdown */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#858585] uppercase tracking-wider">
              <span className="text-white font-semibold">MIDNIGHT</span>
              <span aria-hidden="true">·</span>
              <span>{weekday}</span>
              <span aria-hidden="true">·</span>
              <span>{fullDate}</span>
              <span aria-hidden="true">·</span>
              <span>{greeting}</span>
            </div>

            {nextExam && (
              <button
                type="button"
                onClick={() => onOpenExam(nextExam.exam)}
                className="flex items-center gap-2 border border-[#262626] bg-[#111111] px-3 py-1.5 text-xs font-mono text-[#D0D0D0] hover:border-white hover:text-white rounded-none tabular-nums transition-colors"
              >
                <span className="text-[#858585]">NEXT EXAM</span>
                <span className="text-white font-medium">{nextExam.exam.subjectName}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-medium">
                  {nextExam.daysRemaining === 0 ? 'TODAY' : `${nextExam.daysRemaining}d`}
                </span>
              </button>
            )}
          </div>

          <div className="max-w-xl lg:max-w-lg space-y-4">
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.08] tracking-tight text-white">
              Make today count.
            </h1>
            <MotivationalQuoteCard activeDate={activeDate} variant="today-hero" />
          </div>
        </div>
      </header>

      {/* Primary Next Focus Area + Thin Progress Line */}
      <section aria-labelledby="next-focus-heading" className="border border-[#262626] bg-[#0A0A0A] p-6 sm:p-8 space-y-6 rounded-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-mono text-white/90 uppercase tracking-wider font-semibold" id="next-focus-heading">
            Next focus
          </div>
          {nextFocusTask && (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 tabular-nums">
              <span>{nextFocusTask.timeSlot}</span>
              <span aria-hidden="true">·</span>
              <span>{nextFocusTask.durationMinutes} min</span>
            </div>
          )}
        </div>

        {nextFocusTask ? (
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                <span className="text-white font-medium">
                  {SUBJECT_MAP[nextFocusTask.subjectId]?.name ?? nextFocusTask.subjectId}
                </span>
                {nextFocusTask.difficulty !== 'Not rated' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{nextFocusTask.difficulty}</span>
                  </>
                )}
                {nextFocusTask.carriedForward && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Carried from {formatDisplayDate(nextFocusTask.originalDate, false)}</span>
                  </>
                )}
              </div>

              {nextFocusTask.chapterId ? (
                <button
                  type="button"
                  onClick={() => onOpenChapterById(nextFocusTask.chapterId!)}
                  className="block text-left font-display text-2xl sm:text-3xl font-semibold text-white hover:underline"
                >
                  {nextFocusTask.title}
                </button>
              ) : (
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                  {nextFocusTask.title}
                </h2>
              )}

              <p className="text-sm sm:text-base text-[#858585] max-w-2xl">
                {nextFocusTask.objective}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                data-testid="start-focus-cta"
                onClick={() => onStartFocus(nextFocusTask)}
                className="flex items-center gap-2 bg-white text-slate-950 font-semibold px-6 py-3 text-sm rounded-xl hover:bg-[#858585] transition-colors whitespace-nowrap shadow-md shadow-black/40"
              >
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                <span>Start focus</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleTask(activeDate, nextFocusTask.id)}
                className="flex items-center gap-2 border border-[#1F293D] bg-[#06080F] px-4 py-3 text-xs font-medium text-slate-300 hover:border-slate-400 hover:text-white rounded-xl transition-colors whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mark done</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">
                {tasks.length === 0 ? 'No tasks scheduled yet.' : 'Today’s study blocks are complete.'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {tasks.length === 0
                  ? 'Generate a balanced plan with Gemini or add a focused study block.'
                  : 'Log any extra revision or review your notes quietly.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => onGenerateAIToday(plan?.availableMinutes ?? 150)}
                className="flex items-center gap-2 bg-white text-slate-950 px-5 py-2.5 text-xs font-semibold rounded-xl hover:bg-[#858585] disabled:opacity-50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{aiLoading ? 'Planning...' : 'Generate AI plan'}</span>
              </button>
              <button
                type="button"
                onClick={onAddTask}
                className="flex items-center gap-1.5 border border-[#1F293D] bg-[#06080F] px-4 py-2.5 text-xs text-slate-200 hover:border-slate-400 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add task</span>
              </button>
            </div>
          </div>
        )}

        {/* Thin Progress Line & Concise Summary */}
        <div className="pt-4 border-t border-[#1F293D] space-y-2.5">
          <div
            className="h-1 w-full bg-[#1F293D] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={summary.completionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-white transition-all duration-300 rounded-full"
              style={{ width: `${summary.completionPercent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 tabular-nums">
            <span data-testid="today-progress-summary">
              {summary.completedTasks} of {summary.totalTasks} tasks · {summary.completedMinutes} of{' '}
              {summary.plannedMinutes} min
              {summary.focusMinutesLogged > 0 ? ` (${summary.focusMinutesLogged}m timer logged)` : ''}
            </span>
            <span data-testid="today-completion-pct" className="text-white font-semibold">
              {summary.completionPercent}%
            </span>
          </div>
        </div>
      </section>

      {/* AI Error Banner (when Gemini fails or key missing — never fake output) */}
      {aiError && (
        <div
          role="alert"
          className="flex items-start gap-3 border border-[#404040] bg-[#0A0A0A] px-5 py-4 text-xs text-white"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#A3A3A3]" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-medium">Gemini planner unavailable</div>
            <p className="text-[#858585]">{aiError}</p>
          </div>
        </div>
      )}

      {/* Missed Work Recovery Notice (shown only when relevant) */}
      {missedWorkCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#404040] bg-[#0A0A0A] px-5 py-4">
          <div>
            <div className="text-sm font-medium text-white">
              {missedWorkCount} unfinished item{missedWorkCount === 1 ? '' : 's'} or overdue revision{missedWorkCount === 1 ? '' : 's'} pending recovery
            </div>
            <div className="mt-0.5 text-xs text-[#858585]">
              Nothing was marked failed. Rebalance across upcoming blocks without overloading today.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenRecovery}
            className="shrink-0 flex items-center gap-2 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Recover missed work</span>
          </button>
        </div>
      )}

      {/* Compact Revision Summary — ONLY shown when revisions are due today or overdue */}
      {(dueRevsToday.length > 0 || overdueRevs.length > 0) && (
        <section
          aria-labelledby="today-revisions-heading"
          className="border border-[#1F293D] bg-[#0A0E17] px-6 py-4 space-y-3 rounded-2xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="today-revisions-heading" className="text-sm font-medium text-white">
                Spaced revisions requiring attention
              </h2>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {dueRevsToday.length} due today · {overdueRevs.length} overdue
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenRevisionSection}
              className="flex items-center gap-1 text-xs text-white hover:text-[#858585] transition-colors"
            >
              <span>Open Revision Queue</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {dueRevsToday.length > 0 && (
            <div className="border-t border-[#1F293D] pt-3 space-y-2">
              {dueRevsToday.slice(0, 3).map((rev) => (
                <div
                  key={rev.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onOpenChapterById(rev.chapterId)}
                    className="text-left text-slate-200 hover:text-white transition-colors"
                  >
                    <span className="font-mono text-white mr-2">{rev.stage}</span>
                    {rev.chapterId} · {rev.chapterName}
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 mr-1">Confidence:</span>
                    {[3, 4, 5].map((conf) => (
                      <button
                        key={conf}
                        type="button"
                        onClick={() => onQuickCompleteRevision(rev, conf)}
                        className="border border-[#1F293D] bg-[#06080F] px-2.5 py-0.5 font-mono text-slate-300 hover:border-white/60 hover:text-white rounded transition-colors"
                      >
                        {conf}/5
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Collapsed Today's Plan (Progressive Disclosure) */}
      <section aria-labelledby="todays-plan-toggle" className="border border-[#1F293D] bg-[#0A0E17] rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <button
            id="todays-plan-toggle"
            type="button"
            aria-expanded={planExpanded}
            data-testid="toggle-todays-plan"
            onClick={() => setPlanExpanded((v) => !v)}
            className="flex items-center gap-3 text-left group"
          >
            {planExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#858585] group-hover:text-white" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#858585] group-hover:text-white" aria-hidden="true" />
            )}
            <div>
              <span className="font-display text-lg font-semibold text-white">
                Today&apos;s plan
              </span>
              <span className="ml-3 font-mono text-xs text-[#858585] tabular-nums">
                {tasks.length} task{tasks.length === 1 ? '' : 's'} planned · {summary.plannedMinutes} min
                {plan?.plannedBy === 'gemini' ? ' · AI planned' : ''}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPlanExpanded((v) => !v)}
            className="text-xs text-[#858585] hover:text-white"
          >
            {planExpanded ? 'Collapse schedule' : 'Expand schedule'}
          </button>
        </div>

        {planExpanded && (
          <div className="border-t border-[#262626] p-6 space-y-5">
            {/* Schedule Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-mono text-[#858585] tabular-nums">
                Evening window {state.settings.eveningStart}–{state.settings.eveningEnd} ·{' '}
                {plan?.availableMinutes ?? 150} min target
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {plan?.whyThisPlan && (
                  <button
                    type="button"
                    onClick={() => setWhyExpanded((v) => !v)}
                    className="border border-[#262626] bg-black px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
                  >
                    {whyExpanded ? 'Hide rationale' : 'Why this plan?'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingWindow((v) => !v)}
                  className="flex items-center gap-1.5 border border-[#262626] bg-black px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Time Window</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerateToday(plan?.availableMinutes ?? 150)}
                  className="flex items-center gap-1.5 border border-[#262626] bg-black px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset Baseline</span>
                </button>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => onGenerateAIToday(plan?.availableMinutes ?? 150)}
                  className="flex items-center gap-1.5 border border-[#404040] bg-[#111111] px-3 py-1.5 text-xs text-white hover:border-white disabled:opacity-50 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{aiLoading ? 'Generating...' : 'Regenerate with Gemini'}</span>
                </button>
                <button
                  type="button"
                  onClick={onAddTask}
                  className="flex items-center gap-1.5 bg-white text-black px-3.5 py-1.5 text-xs font-semibold hover:bg-[#D4D4D4] whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>

            {whyExpanded && plan?.whyThisPlan && (
              <div className="border border-[#262626] bg-black p-4 text-xs text-[#D4D4D4] leading-relaxed">
                <span className="font-mono text-[#858585] uppercase mr-2">Rationale:</span>
                {plan.whyThisPlan}
              </div>
            )}

            {editingWindow && (
              <form
                onSubmit={handleApplyWindow}
                className="flex flex-wrap items-center gap-3 border border-[#262626] bg-[#111111] p-4"
              >
                <label htmlFor="today-window-mins" className="text-xs text-[#858585]">
                  Available evening study minutes:
                </label>
                <input
                  id="today-window-mins"
                  type="number"
                  min={30}
                  max={300}
                  step={15}
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  className="w-20 border border-[#262626] bg-black px-2.5 py-1 text-xs text-white font-mono tabular-nums focus:border-white focus:outline-none"
                />
                <div className="flex items-center gap-1.5">
                  {[60, 90, 120, 150].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWindowMinutes(preset)}
                      className={`border px-2 py-1 text-xs font-mono tabular-nums ${
                        windowMinutes === preset
                          ? 'border-white bg-white text-black'
                          : 'border-[#262626] text-[#858585] hover:text-white'
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  className="ml-auto bg-white text-black px-3.5 py-1.5 text-xs font-semibold hover:bg-[#D4D4D4]"
                >
                  Apply &amp; Replan
                </button>
              </form>
            )}

            {/* Coherent Sequence / Timeline */}
            {tasks.length === 0 ? (
              <div className="border border-[#262626] bg-black p-6 text-center text-sm text-[#858585]">
                No tasks scheduled for today.
              </div>
            ) : (
              <div className="border border-[#262626] divide-y divide-[#262626] bg-black">
                {morningTasks.map((t) =>
                  renderTimelineItem(t, tasks.findIndex((x) => x.id === t.id), tasks.length)
                )}

                {eveningTasks.map((t, i) => {
                  const globalIdx = tasks.findIndex((x) => x.id === t.id);
                  return (
                    <React.Fragment key={t.id}>
                      {renderTimelineItem(t, globalIdx, tasks.length)}
                      {i === 0 && eveningTasks.length > 1 && (
                        <div className="flex items-center justify-between px-5 py-2.5 bg-[#050505] text-xs text-[#555555]">
                          <span>Short Break · Step away from desk, hydrate, reset focus</span>
                          <span className="font-mono tabular-nums">
                            {state.settings.breakMinutes}m
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {plan?.remainingBacklog && plan.remainingBacklog.length > 0 && (
              <div className="border border-[#262626] bg-black p-4 space-y-2">
                <div className="text-xs font-mono text-[#858585] uppercase">
                  Remaining backlog outside today&apos;s window
                </div>
                <ul className="space-y-1 text-xs text-[#858585]">
                  {plan.remainingBacklog.map((b, i) => (
                    <li key={i}>
                      <span className="text-white">{b.title}</span> — {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Discreet Collapsed Workout Section (Separate from study metrics) */}
      <section aria-labelledby="workout-toggle" className="border border-[#262626] bg-[#0A0A0A]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <button
            id="workout-toggle"
            type="button"
            aria-expanded={workoutExpanded}
            data-testid="toggle-workout"
            onClick={() => setWorkoutExpanded((v) => !v)}
            className="flex items-center gap-3 text-left group"
          >
            {workoutExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#555555] group-hover:text-white" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#555555] group-hover:text-white" aria-hidden="true" />
            )}
            <Dumbbell className="w-3.5 h-3.5 text-[#555555]" aria-hidden="true" />
            <span className="text-xs font-mono text-[#858585] uppercase tracking-wider">
              Workout (Separate)
            </span>
            <span className="text-xs text-[#555555] font-mono tabular-nums">
              {plan?.workout.completed ? 'Done' : 'Open'} · {plan?.workout.durationMinutes ?? 25}m
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkoutExpanded((v) => !v)}
            className="text-xs text-[#555555] hover:text-white"
          >
            {workoutExpanded ? 'Hide' : 'Show'}
          </button>
        </div>

        {workoutExpanded && (
          <div className="border-t border-[#262626] px-6 py-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={plan?.workout.completed ?? false}
                  aria-label="Mark workout completed"
                  onClick={() =>
                    onUpdateWorkout(activeDate, { completed: !(plan?.workout.completed ?? false) })
                  }
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
                    plan?.workout.completed
                      ? 'border-white bg-white text-black'
                      : 'border-[#555555] bg-black text-transparent hover:border-white'
                  }`}
                >
                  <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                </button>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      plan?.workout.completed ? 'line-through text-[#858585]' : 'text-white'
                    }`}
                  >
                    {plan?.workout.title ?? 'Evening Mobility & Conditioning'}
                  </div>
                  <div className="mt-0.5 text-xs font-mono text-[#555555] tabular-nums">
                    {plan?.workout.durationMinutes ?? 25} min · Tracked independently of study metrics
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingWorkout((v) => !v)}
                className="text-xs text-[#858585] hover:text-white"
              >
                {editingWorkout ? 'Done' : 'Edit'}
              </button>
            </div>

            {editingWorkout && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <input
                  type="text"
                  aria-label="Workout title"
                  value={plan?.workout.title ?? ''}
                  onChange={(e) => onUpdateWorkout(activeDate, { title: e.target.value })}
                  className="sm:col-span-2 border border-[#262626] bg-[#111111] px-2.5 py-1.5 text-xs text-white focus:border-white focus:outline-none"
                />
                <input
                  type="number"
                  aria-label="Workout duration minutes"
                  min={5}
                  max={180}
                  value={plan?.workout.durationMinutes ?? 25}
                  onChange={(e) =>
                    onUpdateWorkout(activeDate, { durationMinutes: Number(e.target.value) })
                  }
                  className="border border-[#262626] bg-[#111111] px-2.5 py-1.5 text-xs text-white font-mono focus:border-white focus:outline-none"
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
