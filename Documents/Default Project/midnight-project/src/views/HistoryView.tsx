import React, { useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed';
import { calculateDaySummary, calculateWeeklyAnalytics } from '../engine/analytics';
import { SubjectFocusD3Chart } from '../components/SubjectFocusD3Chart';
import type { AppState } from '../types/study';
import { formatDisplayDate, getWeekdayName } from '../utils/date';
import { migrateAppState, validateBackupPayload } from '../utils/storage';

interface HistoryViewProps {
  state: AppState;
  activeDate: string;
  onImportState: (next: AppState) => void;
  onResetAllData: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  state,
  activeDate,
  onImportState,
  onResetAllData,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(activeDate);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const historyDates = useMemo(() => {
    const keys = Object.keys(state.plans)
      .filter((d) => d <= activeDate)
      .sort((a, b) => b.localeCompare(a));
    return keys.length > 0 ? keys : [activeDate];
  }, [state.plans, activeDate]);

  const selectedPlan = state.plans[selectedDate];
  const selectedSummary = useMemo(
    () => calculateDaySummary(selectedPlan, state, selectedDate),
    [selectedPlan, state, selectedDate]
  );

  const selectedFocusSessions = useMemo(
    () => (state.focusSessions ?? []).filter((s) => s.date === selectedDate),
    [state.focusSessions, selectedDate]
  );

  const weekly = useMemo(
    () => calculateWeeklyAnalytics(state, activeDate),
    [state, activeDate]
  );

  const maxSubjectMinutes = Math.max(
    1,
    ...weekly.subjectMinutes.map((s) => s.minutes)
  );

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `midnight-backup-${activeDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateBackupPayload(parsed)) {
        setImportFeedback('Invalid backup file format.');
        return;
      }
      onImportState(migrateAppState(parsed));
      setImportFeedback('Backup imported and restored cleanly.');
    } catch {
      setImportFeedback('Could not read JSON backup file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <ErrorBoundary fallback={<div className="p-6 text-center">
      <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
        History Section Error
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold text-white">
        History & Analytics temporarily unavailable
      </h3>
      <p className="text-xs text-[#555555] mt-2 max-w-md mx-auto">
        The history section encountered a rendering error. Please refresh the page or try another section.
      </p>
    </div>}>
      <div className="space-y-10">
      <header className="border-b border-[#262626] pb-6">
        <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
          Preserved Logs &amp; Weekly Insights
        </div>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
          History &amp; Analytics
        </h1>
      </header>

      {/* Weekly Analytics */}
      <section aria-labelledby="weekly-analytics-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="weekly-analytics-heading" className="font-display text-xl font-semibold text-white">
            7-Day Study Summary
          </h2>
          <span className="font-mono text-xs text-[#858585] tabular-nums">
            {formatDisplayDate(weekly.startDate, false)} – {formatDisplayDate(weekly.endDate)}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#262626] border border-[#262626]">
          <div className="bg-[#0A0A0A] p-5">
            <div className="text-xs text-[#858585]">Completed Study Time</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
              {weekly.totalCompletedMinutes}m
            </div>
            <div className="mt-0.5 text-xs font-mono text-[#555555] tabular-nums">
              {weekly.totalFocusMinutesLogged}m timer · {weekly.totalPlannedMinutes}m planned
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-5">
            <div className="text-xs text-[#858585]">Task Completion</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
              {weekly.completionPercent}%
            </div>
            <div className="mt-0.5 text-xs font-mono text-[#555555] tabular-nums">
              {weekly.completedTasks} / {weekly.totalTasks} blocks
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-5">
            <div className="text-xs text-[#858585]">Revision Consistency</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
              {weekly.revisionConsistencyPercent}%
            </div>
            <div className="mt-0.5 text-xs font-mono text-[#555555] tabular-nums">
              {weekly.revisionsCompleted} completed
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-5">
            <div className="text-xs text-[#858585]">Flagged Weak Topics</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
              {weekly.weakTopics.length}
            </div>
            <div className="mt-0.5 text-xs text-[#555555]">
              Queued for extra recall
            </div>
          </div>
        </div>

        {/* 30-Day D3 Subject Focus Progress Chart */}
        <SubjectFocusD3Chart state={state} activeDate={activeDate} />

        {/* Subject Balance & Weak Topics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-[#262626] bg-[#0A0A0A] p-5 space-y-3">
            <h3 className="text-xs font-mono text-[#858585] uppercase tracking-wider">
              Subject Balance (Completed &amp; Focus Minutes)
            </h3>
            {weekly.subjectMinutes.length === 0 ? (
              <p className="text-xs text-[#555555] py-4">
                Complete study blocks or log focus timer sessions to record subject time distribution.
              </p>
            ) : (
              <div className="space-y-3 pt-1">
                {weekly.subjectMinutes.map((item) => (
                  <div key={item.subjectId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white">{item.subjectName}</span>
                      <span className="font-mono text-[#858585] tabular-nums">
                        {item.minutes} min
                      </span>
                    </div>
                    <div className="h-1 w-full bg-[#262626]">
                      <div
                        className="h-full bg-white"
                        style={{ width: `${Math.round((item.minutes / maxSubjectMinutes) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-[#262626] bg-[#0A0A0A] p-5 space-y-3">
            <h3 className="text-xs font-mono text-[#858585] uppercase tracking-wider">
              Active Weak Topics &amp; Focus Areas
            </h3>
            {weekly.weakTopics.length === 0 ? (
              <p className="text-xs text-[#555555] py-4">
                No weak chapters flagged right now. Flag any difficult chapter from Syllabus or Revision.
              </p>
            ) : (
              <div className="divide-y divide-[#262626] border-t border-[#262626] -mx-5 -mb-5">
                {weekly.weakTopics.slice(0, 6).map((ch) => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between px-5 py-2.5 text-xs"
                  >
                    <span className="text-white truncate">
                      {ch.id} · {ch.chapterName}
                    </span>
                    <span className="font-mono text-[#858585] shrink-0 ml-2">
                      {SUBJECT_MAP[ch.subjectId]?.shortName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Daily Historical Snapshot Browser */}
      <section aria-labelledby="daily-history-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="daily-history-heading" className="font-display text-xl font-semibold text-white">
              Daily Plan Archive
            </h2>
            <p className="text-xs text-[#858585]">
              Original dates and daily records are preserved intact and never overwritten by future rescheduling.
            </p>
          </div>
          <input
            type="date"
            aria-label="Inspect historical date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="border border-[#262626] bg-[#0A0A0A] px-3 py-1.5 text-xs text-white font-mono"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 border border-[#262626] divide-y divide-[#262626] bg-[#0A0A0A] max-h-80 overflow-y-auto">
            {historyDates.map((d) => {
              const s = calculateDaySummary(state.plans[d], state, d);
              const isSelected = d === selectedDate;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                    isSelected ? 'bg-[#171717]' : 'hover:bg-[#111111]'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {formatDisplayDate(d)}
                    </div>
                    <div className="text-xs text-[#555555]">
                      {getWeekdayName(d)}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums">
                    <div className="text-white">{s.completionPercent}%</div>
                    <div className="text-[#858585]">
                      {s.completedMinutes}/{s.plannedMinutes}m
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 border border-[#262626] bg-[#0A0A0A] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#262626]">
              <div>
                <div className="text-xs font-mono text-[#858585]">
                  {getWeekdayName(selectedDate)}
                </div>
                <h3 className="font-display text-lg font-semibold text-white">
                  {formatDisplayDate(selectedDate)}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#858585] tabular-nums">
                <span>
                  Tasks: {selectedSummary.completedTasks}/{selectedSummary.totalTasks}
                </span>
                <span>·</span>
                <span>
                  Time: {selectedSummary.completedMinutes}/{selectedSummary.plannedMinutes}m
                </span>
                {selectedSummary.focusMinutesLogged > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-white">
                      Timer: {selectedSummary.focusMinutesLogged}m
                    </span>
                  </>
                )}
                <span>·</span>
                <span>Revisions: {selectedSummary.revisionsCompleted}</span>
                <span>·</span>
                <span>Workout: {selectedSummary.workoutCompleted ? 'Done' : 'Open'}</span>
              </div>
            </div>

            {!selectedPlan || selectedPlan.tasks.length === 0 ? (
              <p className="text-xs text-[#858585] py-4">
                No study tasks logged for this date. Unplanned days are never penalized.
              </p>
            ) : (
              <div className="divide-y divide-[#262626] -mx-5">
                {selectedPlan.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs"
                  >
                    <div>
                      <div className="font-mono text-[#858585]">
                        {t.timeSlot} · {SUBJECT_MAP[t.subjectId]?.name}
                        {t.carriedForward && ` · Carried from ${formatDisplayDate(t.originalDate, false)}`}
                        {t.dismissed && ' · Rescheduled via recovery'}
                      </div>
                      <div
                        className={`mt-0.5 text-sm font-medium ${
                          t.completed ? 'text-[#858585] line-through' : 'text-white'
                        }`}
                      >
                        {t.title}
                      </div>
                    </div>
                    <span className="font-mono text-[#858585] tabular-nums">
                      {t.completed ? 'Completed' : t.dismissed ? 'Moved' : 'Pending'} · {t.durationMinutes}m
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selectedFocusSessions.length > 0 && (
              <div className="pt-3 border-t border-[#262626] space-y-2">
                <div className="text-xs font-mono text-[#858585] uppercase">
                  Focus Timer Sessions Logged
                </div>
                <div className="divide-y divide-[#262626] bg-black/50 -mx-5 -mb-5 border-t border-[#262626]">
                  {selectedFocusSessions.map((sess) => (
                    <div
                      key={sess.id}
                      data-testid="history-focus-session"
                      className="flex items-center justify-between px-5 py-2.5 text-xs"
                    >
                      <span className="text-white">{sess.taskTitle}</span>
                      <span className="font-mono text-[#858585] tabular-nums">
                        {sess.timerType === 'stopwatch'
                          ? 'Stopwatch'
                          : sess.timerType === 'pomodoro'
                            ? 'Pomodoro'
                            : sess.timerType === 'countdown'
                              ? 'Countdown'
                              : sess.mode === 'flowtime'
                                ? 'Flowtime'
                                : 'Focus'}{' '}
                        · {sess.durationMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Data Backup & Reset */}
      <section className="border border-[#262626] bg-[#0A0A0A] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-white">
          Backup &amp; Local Storage
        </h2>
        <p className="text-xs text-[#858585]">
          All plans, syllabus updates, revisions, formulas, focus logs, and history save automatically in your browser. Export a JSON backup anytime.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSON Backup</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 border border-[#262626] px-4 py-2 text-xs text-white hover:border-white"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import JSON Backup</span>
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="ml-auto flex items-center gap-1.5 border border-[#262626] px-3 py-2 text-xs text-[#858585] hover:text-white hover:border-white"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset All Data</span>
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-white">Reset to 24 Nov baseline?</span>
              <button
                type="button"
                onClick={() => {
                  onResetAllData();
                  setConfirmClear(false);
                }}
                className="flex items-center gap-1 bg-white text-black px-3 py-1.5 text-xs font-semibold"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Confirm Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-xs text-[#858585] hover:text-white px-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {importFeedback && (
          <p className="text-xs text-white border border-[#404040] bg-[#111111] px-3 py-2">
            {importFeedback}
          </p>
        )}
      </section>
    </div>
    </ErrorBoundary>
  );
};
