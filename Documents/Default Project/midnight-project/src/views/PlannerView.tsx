import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Edit3,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SUBJECT_MAP, SUBJECTS } from '../data/seed';
import { getSortedExams } from '../engine/planner';
import type {
  AppState,
  ExamItem,
  ScheduleSettings,
  StudyTask,
  SubjectId,
} from '../types/study';
import {
  addDays,
  formatDisplayDate,
  getDayOfWeek,
  getMonthDaysGrid,
  getWeekDates,
  getWeekdayName,
  parseISODate,
} from '../utils/date';

interface PlannerViewProps {
  state: AppState;
  activeDate: string;
  missedWorkCount: number;
  aiLoading: boolean;
  aiError: string | null;
  onToggleTask: (date: string, taskId: string) => void;
  onDeleteTask: (date: string, taskId: string) => void;
  onEditTask: (task: StudyTask) => void;
  onAddTask: (date: string) => void;
  onStartFocus: (task: StudyTask) => void;
  onRegenerateDay: (date: string, availableMinutes: number) => void;
  onGenerateAIDay: (date: string, availableMinutes: number) => void;
  onOpenRecovery: () => void;
  onOpenExam: (exam: ExamItem) => void;
  onUpdateSettings: (settings: ScheduleSettings) => void;
  onSetNextTopic: (subjectId: SubjectId, chapterId: string | null) => void;
  onOpenChapterById: (chapterId: string) => void;
}

type PlannerMode = 'daily' | 'weekly' | 'monthly';

export const PlannerView: React.FC<PlannerViewProps> = ({
  state,
  activeDate,
  missedWorkCount,
  aiLoading,
  aiError,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  onAddTask,
  onStartFocus,
  onRegenerateDay,
  onGenerateAIDay,
  onOpenRecovery,
  onOpenExam,
  onUpdateSettings,
  onSetNextTopic,
  onOpenChapterById,
}) => {
  const [mode, setMode] = useState<PlannerMode>('weekly');
  const [selectedDate, setSelectedDate] = useState<string>(activeDate);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month0: number }>(() => {
    const { year, month } = parseISODate(activeDate);
    return { year, month0: month - 1 };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showNextTopics, setShowNextTopics] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [draftSettings, setDraftSettings] = useState<ScheduleSettings>(state.settings);

  const selectedPlan = state.plans[selectedDate];
  const selectedTasks = selectedPlan?.tasks ?? [];
  const weekDates = getWeekDates(selectedDate);
  const monthGrid = getMonthDaysGrid(calendarMonth.year, calendarMonth.month0);
  const sortedExams = getSortedExams(state.exams, activeDate);

  const monthTitle = new Date(calendarMonth.year, calendarMonth.month0, 1).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  );

  const shiftMonth = (delta: number) => {
    const dt = new Date(calendarMonth.year, calendarMonth.month0 + delta, 1);
    setCalendarMonth({ year: dt.getFullYear(), month0: dt.getMonth() });
  };

  const getDateIndicators = (dateStr: string) => {
    const plan = state.plans[dateStr];
    const hasPlanned = (plan?.tasks.length ?? 0) > 0;
    const hasCarryForward = (plan?.tasks ?? []).some((t) => t.carriedForward && !t.completed);
    const hasRevision = state.revisions.some(
      (r) => !r.completed && r.scheduledDate === dateStr
    );
    const examOnDay = state.exams.find((e) => e.date === dateStr);
    return { hasPlanned, hasCarryForward, hasRevision, examOnDay };
  };

  const getRotationLabel = (dateStr: string) => {
    const dow = getDayOfWeek(dateStr);
    const pair = state.settings.rotation[dow];
    if (!pair) return 'Flexible';
    return pair
      .map((item) => {
        if (item === 'weakest_priority') return 'Weakest Priority';
        if (item === 'rotating_low') return 'Rotating Prep';
        return SUBJECT_MAP[item]?.shortName ?? item;
      })
      .join(' + ');
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(draftSettings);
    setShowSettings(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#262626] pb-6">
        <div>
          <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
            Adaptive Schedule · 24 Nov – 21 Dec 2026
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
            Study Planner
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-[#262626] bg-[#0A0A0A] p-0.5">
            {(['daily', 'weekly', 'monthly'] as PlannerMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium capitalize whitespace-nowrap ${
                  mode === m ? 'bg-white text-black' : 'text-[#858585] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowNextTopics((v) => !v);
              setShowSettings(false);
            }}
            className={`flex items-center gap-1.5 border px-3 py-2 text-xs whitespace-nowrap ${
              showNextTopics
                ? 'border-white bg-[#171717] text-white'
                : 'border-[#262626] bg-[#0A0A0A] text-[#858585] hover:text-white hover:border-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Next Topics</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDraftSettings(state.settings);
              setShowSettings((v) => !v);
              setShowNextTopics(false);
            }}
            className={`flex items-center gap-1.5 border px-3 py-2 text-xs whitespace-nowrap ${
              showSettings
                ? 'border-white bg-[#171717] text-white'
                : 'border-[#262626] bg-[#0A0A0A] text-[#858585] hover:text-white hover:border-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Rotation &amp; Hours</span>
          </button>

          {missedWorkCount > 0 && (
            <button
              type="button"
              onClick={onOpenRecovery}
              className="flex items-center gap-1.5 bg-white text-black px-3.5 py-2 text-xs font-semibold hover:bg-[#D4D4D4] whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Recover ({missedWorkCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Editable Next Chapter/Topic Priority Selector */}
      {showNextTopics && (
        <section className="border border-[#262626] bg-[#0A0A0A] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Next Chapter / Topic per Subject
              </h2>
              <p className="text-xs text-[#858585]">
                Both Gemini AI planning and baseline generation prioritize your selected next chapter for each subject.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNextTopics(false)}
              className="text-xs text-[#858585] hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SUBJECTS.filter((s) => s.hasChapters).map((subj) => {
              const subjChapters = state.chapters.filter((c) => c.subjectId === subj.id);
              const currentNext = state.nextTopicBySubject?.[subj.id] ?? '';
              return (
                <div key={subj.id} className="border border-[#262626] bg-[#111111] p-3 space-y-1.5">
                  <label htmlFor={`next-topic-${subj.id}`} className="block text-xs font-medium text-white">
                    {subj.name}
                  </label>
                  <select
                    id={`next-topic-${subj.id}`}
                    value={currentNext}
                    onChange={(e) => onSetNextTopic(subj.id, e.target.value || null)}
                    className="w-full border border-[#262626] bg-black px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Auto (Planner picks highest priority)</option>
                    {subjChapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} · {c.chapterName} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Editable Rotation & Hours Panel */}
      {showSettings && (
        <form
          onSubmit={handleSaveSettings}
          className="border border-[#262626] bg-[#0A0A0A] p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">
              Editable Study Window &amp; Weekly Rotation
            </h2>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-xs text-[#858585] hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-start" className="block text-xs text-[#858585] mb-1">
                Evening Start
              </label>
              <input
                id="set-start"
                type="time"
                value={draftSettings.eveningStart}
                onChange={(e) =>
                  setDraftSettings({ ...draftSettings, eveningStart: e.target.value })
                }
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label htmlFor="set-end" className="block text-xs text-[#858585] mb-1">
                Evening End
              </label>
              <input
                id="set-end"
                type="time"
                value={draftSettings.eveningEnd}
                onChange={(e) =>
                  setDraftSettings({ ...draftSettings, eveningEnd: e.target.value })
                }
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label htmlFor="set-block" className="block text-xs text-[#858585] mb-1">
                Block Duration (min)
              </label>
              <input
                id="set-block"
                type="number"
                min={30}
                max={120}
                value={draftSettings.blockDurationMinutes}
                onChange={(e) =>
                  setDraftSettings({
                    ...draftSettings,
                    blockDurationMinutes: Number(e.target.value),
                  })
                }
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label htmlFor="set-telugu" className="block text-xs text-[#858585] mb-1">
                Morning Telugu (min)
              </label>
              <input
                id="set-telugu"
                type="number"
                min={45}
                max={90}
                value={draftSettings.teluguMorningMinutes}
                onChange={(e) =>
                  setDraftSettings({
                    ...draftSettings,
                    teluguMorningMinutes: Number(e.target.value),
                  })
                }
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((dow) => {
              const dayNames = ['Sun', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const pair = draftSettings.rotation[dow];
              return (
                <div key={dow} className="border border-[#262626] bg-[#111111] p-3 space-y-2">
                  <div className="text-xs font-mono text-white">{dayNames[dow]}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={`${dayNames[dow]} subject 1`}
                      value={pair[0]}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          rotation: {
                            ...draftSettings.rotation,
                            [dow]: [e.target.value as SubjectId, pair[1]],
                          },
                        })
                      }
                      className="border border-[#262626] bg-black px-2 py-1.5 text-xs text-white"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shortName}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${dayNames[dow]} subject 2`}
                      value={pair[1]}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          rotation: {
                            ...draftSettings.rotation,
                            [dow]: [pair[0], e.target.value as SubjectId],
                          },
                        })
                      }
                      className="border border-[#262626] bg-black px-2 py-1.5 text-xs text-white"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
            >
              Save Schedule Settings
            </button>
          </div>
        </form>
      )}

      {/* Monthly Calendar View */}
      {mode === 'monthly' && (
        <section className="border border-[#262626] bg-[#0A0A0A] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                className="border border-[#262626] p-1.5 text-[#858585] hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="font-display text-lg font-semibold text-white min-w-40 text-center">
                {monthTitle}
              </h2>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
                className="border border-[#262626] p-1.5 text-[#858585] hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#858585]">
              <span>● Planned</span>
              <span>○ Revision</span>
              <span>■ Exam</span>
              <span>→ Carried Forward</span>
            </div>
          </div>

          <div className="grid grid-cols-7 border-t border-l border-[#262626]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="border-r border-b border-[#262626] py-2 text-center text-xs font-mono text-[#555555]"
              >
                {d}
              </div>
            ))}
            {monthGrid.map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="border-r border-b border-[#262626] min-h-20 bg-black/50"
                  />
                );
              }
              const { hasPlanned, hasCarryForward, hasRevision, examOnDay } =
                getDateIndicators(dateStr);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === activeDate;
              const dayNum = Number(dateStr.split('-')[2]);

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`border-r border-b border-[#262626] min-h-20 p-2 text-left flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#171717] ring-1 ring-inset ring-white'
                      : 'hover:bg-[#111111]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isToday ? 'text-white font-semibold underline' : 'text-[#858585]'
                      }`}
                    >
                      {dayNum}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-white">
                      {hasPlanned && <span title="Planned work">●</span>}
                      {hasRevision && <span title="Revision due">○</span>}
                      {hasCarryForward && <span title="Carried forward">→</span>}
                    </div>
                  </div>
                  {examOnDay && (
                    <div className="mt-1 truncate text-[10px] font-mono text-white">
                      ■ {SUBJECT_MAP[examOnDay.subjectId]?.shortName}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Weekly Strip View */}
      {mode === 'weekly' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
                className="border border-[#262626] p-1.5 text-[#858585] hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-white tabular-nums">
                {formatDisplayDate(weekDates[0], false)} – {formatDisplayDate(weekDates[6])}
              </span>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
                className="border border-[#262626] p-1.5 text-[#858585] hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(activeDate)}
              className="text-xs text-[#858585] hover:text-white"
            >
              Jump to Baseline ({formatDisplayDate(activeDate, false)})
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {weekDates.map((d) => {
              const plan = state.plans[d];
              const exam = state.exams.find((e) => e.date === d);
              const isSelected = d === selectedDate;
              const isToday = d === activeDate;
              const tasks = plan?.tasks ?? [];
              const subjectNames = Array.from(
                new Set(tasks.map((t) => SUBJECT_MAP[t.subjectId]?.shortName ?? t.subjectId))
              );
              const completedCount = tasks.filter((t) => t.completed).length;

              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`p-3 text-left rounded-none border transition-all flex flex-col justify-between min-h-[110px] ${
                    isSelected
                      ? 'border-white bg-[#1a1a1a] shadow-none'
                      : 'border-[#262626] bg-[#0A0A0A] hover:border-white hover:bg-[#111111]'
                  }`}
                >
                  <div className="w-full">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className={isToday ? 'text-white font-semibold' : 'text-[#D0D0D0]'}>
                        {getWeekdayName(d, true)}
                      </span>
                      <span className="text-[#858585] tabular-nums">
                        {formatDisplayDate(d, false)}
                      </span>
                    </div>

                    {exam && (
                      <div className="mt-1.5 inline-block text-[10px] font-mono font-medium text-white bg-[#1A1A1A] px-1.5 py-0.5 rounded-none border border-[#333333] truncate max-w-full">
                        Exam · {SUBJECT_MAP[exam.subjectId]?.shortName ?? exam.subjectName}
                      </div>
                    )}

                    {/* Subjects at a glance */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {subjectNames.length > 0 ? (
                        subjectNames.map((subj) => (
                          <span
                            key={subj}
                            className="text-[11px] font-medium text-[#D0D0D0] bg-[#111111] border border-[#262626] px-2 py-0.5 rounded-none truncate"
                          >
                            {subj}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#555555] italic">No tasks</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-1.5 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#858585] tabular-nums w-full">
                    <span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
                    {tasks.length > 0 && completedCount === tasks.length && (
                      <span className="text-white font-medium">✓ Done</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Selected Date Detail Panel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 border border-[#262626] bg-[#0A0A0A] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#262626]">
            <div>
              <div className="text-xs font-mono text-[#858585]">
                {getWeekdayName(selectedDate)} · {getRotationLabel(selectedDate)}
                {selectedPlan?.plannedBy === 'gemini' ? ' · AI planned' : ''}
              </div>
              <h2 className="mt-1 font-display text-2xl font-semibold text-white">
                {formatDisplayDate(selectedDate)}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Select planner date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="border border-[#262626] bg-[#111111] px-2.5 py-1.5 text-xs text-white font-mono"
              />
              {selectedPlan?.whyThisPlan && (
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  className="border border-[#262626] px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
                >
                  {showWhy ? 'Hide rationale' : 'Why this plan?'}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onRegenerateDay(selectedDate, selectedPlan?.availableMinutes ?? 150)
                }
                className="flex items-center gap-1.5 border border-[#262626] px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Baseline</span>
              </button>
              <button
                type="button"
                disabled={aiLoading}
                data-testid="planner-generate-ai"
                onClick={() =>
                  onGenerateAIDay(selectedDate, selectedPlan?.availableMinutes ?? 150)
                }
                className="flex items-center gap-1.5 border border-[#404040] bg-[#111111] px-3 py-1.5 text-xs text-white hover:border-white disabled:opacity-50 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{aiLoading ? 'Planning...' : 'Plan with Gemini'}</span>
              </button>
              <button
                type="button"
                onClick={() => onAddTask(selectedDate)}
                className="flex items-center gap-1.5 bg-white text-black px-3.5 py-1.5 text-xs font-semibold hover:bg-[#D4D4D4] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {aiError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 border border-[#404040] bg-black px-4 py-3 text-xs text-white"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#858585]" aria-hidden="true" />
              <div>
                <div className="font-medium">Gemini planning error</div>
                <div className="text-[#858585] mt-0.5">{aiError}</div>
              </div>
            </div>
          )}

          {showWhy && selectedPlan?.whyThisPlan && (
            <div className="border border-[#262626] bg-black p-4 text-xs text-[#D4D4D4] leading-relaxed">
              <span className="font-mono text-[#858585] uppercase mr-2">Why this plan:</span>
              {selectedPlan.whyThisPlan}
            </div>
          )}

          {selectedTasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[#858585]">No tasks generated for {formatDisplayDate(selectedDate)}.</p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => onGenerateAIDay(selectedDate, 150)}
                  className="bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] disabled:opacity-50"
                >
                  Generate with Gemini
                </button>
                <button
                  type="button"
                  onClick={() => onRegenerateDay(selectedDate, 150)}
                  className="border border-[#262626] px-4 py-2 text-xs text-white hover:border-white"
                >
                  Generate Local Baseline
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#262626] border border-[#262626]">
              {selectedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 p-4 ${task.completed ? 'opacity-55' : ''}`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={task.completed}
                    aria-label={`Toggle ${task.title}`}
                    onClick={() => onToggleTask(selectedDate, task.id)}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
                      task.completed
                        ? 'border-white bg-white text-black'
                        : 'border-[#555555] bg-black text-transparent hover:border-white'
                    }`}
                  >
                    <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                      <span className="font-mono text-white">{task.timeSlot}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{task.durationMinutes}m</span>
                      <span aria-hidden="true">·</span>
                      <span>{SUBJECT_MAP[task.subjectId]?.name}</span>
                      {task.taskType === 'exam_prep' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-white uppercase tracking-wider text-[11px]">
                            Test Prep
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
                    {task.chapterId ? (
                      <button
                        type="button"
                        onClick={() => onOpenChapterById(task.chapterId!)}
                        className={`mt-1 text-left text-sm font-medium hover:underline ${
                          task.completed ? 'line-through text-[#858585]' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </button>
                    ) : (
                      <div
                        className={`mt-1 text-sm font-medium ${
                          task.completed ? 'line-through text-[#858585]' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-[#858585]">{task.objective}</div>
                    {task.aiReason && (
                      <div className="mt-1 text-[11px] font-mono text-[#555555]">
                        Reason: {task.aiReason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!task.completed && (
                      <button
                        type="button"
                        aria-label={`Start focus on ${task.title}`}
                        onClick={() => onStartFocus(task)}
                        className="p-1.5 text-[#858585] hover:text-white"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Edit ${task.title}`}
                      onClick={() => onEditTask(task)}
                      className="p-1.5 text-[#555555] hover:text-white"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => onDeleteTask(selectedDate, task.id)}
                      className="p-1.5 text-[#555555] hover:text-white"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedPlan?.remainingBacklog && selectedPlan.remainingBacklog.length > 0 && (
            <div className="border border-[#262626] bg-black p-4 space-y-1.5">
              <div className="text-xs font-mono text-[#858585] uppercase">
                Remaining Backlog (Deferred to stay inside {state.settings.eveningStart}–{state.settings.eveningEnd})
              </div>
              {selectedPlan.remainingBacklog.map((b, idx) => (
                <div key={idx} className="text-xs text-[#858585]">
                  <span className="text-white">{b.title}</span> · {b.reason}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exam Timetable Sidebar */}
        <aside className="lg:col-span-4 border border-[#262626] bg-[#0A0A0A] p-5">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#262626]">
            <h2 className="text-xs font-mono text-[#858585] tracking-wide truncate">
              Exam Timetable
            </h2>
            <span className="text-xs font-mono text-[#555555] shrink-0 whitespace-nowrap">
              09–21 Dec
            </span>
          </div>

          <div className="mt-2 divide-y divide-[#262626]">
            {sortedExams.map(({ exam, daysRemaining, isPast }) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => onOpenExam(exam)}
                className={`w-full flex items-center justify-between py-2.5 text-left hover:bg-[#111111] px-2 -mx-2 ${
                  isPast ? 'opacity-45' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {exam.subjectName}
                  </div>
                  <div className="text-xs font-mono text-[#555555]">
                    {formatDisplayDate(exam.date, false)} · {exam.startTime}
                  </div>
                </div>
                <span className="font-mono text-xs text-[#858585] tabular-nums shrink-0 ml-2">
                  {isPast ? 'Done' : daysRemaining === 0 ? 'Today' : `${daysRemaining}d`}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
};
