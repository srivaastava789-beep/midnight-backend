import React, { useMemo, useState } from 'react';
import { Check, Flag, RotateCcw } from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed';
import { categorizeRevisions } from '../engine/revision';
import { CompleteRevisionPayload } from '../engine/revision';
import { AppState, RevisionStage, RevisionTask } from '../types/study';
import { addDays, formatDisplayDate } from '../utils/date';

interface RevisionViewProps {
  state: AppState;
  activeDate: string;
  onCompleteRevision: (revisionId: string, payload: CompleteRevisionPayload) => void;
  onRescheduleRevision: (revisionId: string, newDate: string) => void;
  onFlagWeakChapter: (chapterId: string) => void;
  onOpenChapterById: (chapterId: string) => void;
  onOpenRecovery: () => void;
}

type RevisionQueueTab =
  | 'today'
  | 'overdue'
  | 'upcoming'
  | 'D1'
  | 'D3'
  | 'D7'
  | 'D23';

export const RevisionView: React.FC<RevisionViewProps> = ({
  state,
  activeDate,
  onCompleteRevision,
  onRescheduleRevision,
  onFlagWeakChapter,
  onOpenChapterById,
  onOpenRecovery,
}) => {
  const [tab, setTab] = useState<RevisionQueueTab>('today');
  const [activeRevModal, setActiveRevModal] = useState<RevisionTask | null>(null);
  const [confidence, setConfidence] = useState<number>(4);
  const [mistakes, setMistakes] = useState<string>('');
  const [practiceDone, setPracticeDone] = useState<boolean>(true);
  const [answerWritingDone, setAnswerWritingDone] = useState<boolean>(false);

  const categorized = useMemo(
    () => categorizeRevisions(state.revisions, activeDate),
    [state.revisions, activeDate]
  );

  const currentItems: RevisionTask[] = useMemo(() => {
    switch (tab) {
      case 'today':
        return categorized.today;
      case 'overdue':
        return categorized.overdue;
      case 'upcoming':
        return categorized.upcoming;
      case 'D1':
      case 'D3':
      case 'D7':
      case 'D23':
        return categorized.byStage[tab as RevisionStage];
      default:
        return categorized.today;
    }
  }, [tab, categorized]);

  const openCompletionDialog = (rev: RevisionTask) => {
    setActiveRevModal(rev);
    setConfidence(rev.confidence ?? 4);
    setMistakes('');
    setPracticeDone(rev.practiceDone);
    setAnswerWritingDone(rev.answerWritingDone);
  };

  const handleConfirmRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRevModal) return;
    onCompleteRevision(activeRevModal.id, {
      completedDate: activeDate,
      confidence,
      mistakes,
      practiceDone,
      answerWritingDone,
    });
    setActiveRevModal(null);
  };

  const tabs: { id: RevisionQueueTab; label: string; count: number }[] = [
    { id: 'today', label: 'Today', count: categorized.today.length },
    { id: 'overdue', label: 'Overdue', count: categorized.overdue.length },
    { id: 'upcoming', label: 'Upcoming', count: categorized.upcoming.length },
    { id: 'D1', label: 'D1', count: categorized.byStage.D1.length },
    { id: 'D3', label: 'D3', count: categorized.byStage.D3.length },
    { id: 'D7', label: 'D7', count: categorized.byStage.D7.length },
    { id: 'D23', label: 'D23', count: categorized.byStage.D23.length },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#262626] pb-6">
        <div>
          <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
            Spaced Recall System · D1 → D3 → D7 → D23
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
            Revision Queue
          </h1>
        </div>

        {categorized.overdue.length > 0 && (
          <button
            type="button"
            onClick={onOpenRecovery}
            className="self-start sm:self-auto flex items-center gap-2 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Auto-Recover Overdue ({categorized.overdue.length})</span>
          </button>
        )}
      </div>

      {/* Queue Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
              tab === t.id
                ? 'bg-white text-black'
                : 'border border-[#262626] bg-[#0A0A0A] text-[#858585] hover:text-white'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Queue Items */}
      {currentItems.length === 0 ? (
        <div className="border border-[#262626] bg-[#0A0A0A] p-8 text-center">
          <p className="text-sm text-white">No pending revisions in {tab.toUpperCase()}.</p>
          <p className="mt-1 text-xs text-[#858585]">
            Complete first study of any syllabus chapter to schedule D1, D3, D7, and D23 intervals automatically.
          </p>
        </div>
      ) : (
        <div className="border border-[#262626] divide-y divide-[#262626] bg-[#0A0A0A]">
          {currentItems.map((rev) => {
            const chapter = state.chapters.find((c) => c.id === rev.chapterId);
            return (
              <div
                key={rev.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 hover:bg-[#111111] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                    <span className="font-mono text-white font-semibold">{rev.stage}</span>
                    <span aria-hidden="true">·</span>
                    <span>{SUBJECT_MAP[rev.subjectId]?.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Scheduled {formatDisplayDate(rev.scheduledDate, false)}
                    </span>
                    {rev.originalDueDate !== rev.scheduledDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#555555]">
                          Orig due {formatDisplayDate(rev.originalDueDate, false)}
                        </span>
                      </>
                    )}
                    {chapter && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{chapter.isWeak ? 'Weak' : chapter.status}</span>
                      </>
                    )}
                    {chapter?.confidence && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Conf {chapter.confidence}/5</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenChapterById(rev.chapterId)}
                    className="mt-1 text-left text-base font-medium text-white hover:underline"
                  >
                    {rev.chapterId} · {rev.chapterName}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input
                    type="date"
                    aria-label={`Reschedule ${rev.chapterId} ${rev.stage}`}
                    value={rev.scheduledDate}
                    onChange={(e) =>
                      e.target.value && onRescheduleRevision(rev.id, e.target.value)
                    }
                    className="border border-[#262626] bg-black px-2 py-1 text-xs text-[#858585] font-mono focus:border-white focus:text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onRescheduleRevision(rev.id, addDays(activeDate, 1))}
                    className="border border-[#262626] px-2.5 py-1 text-xs text-[#858585] hover:text-white hover:border-white whitespace-nowrap"
                  >
                    +1d
                  </button>
                  <button
                    type="button"
                    onClick={() => onFlagWeakChapter(rev.chapterId)}
                    className={`flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors whitespace-nowrap ${
                      chapter?.isWeak
                        ? 'border-white text-white'
                        : 'border-[#262626] text-[#858585] hover:text-white hover:border-white'
                    }`}
                  >
                    <Flag className="w-3 h-3" aria-hidden="true" />
                    <span>{chapter?.isWeak ? 'Weak' : 'Flag Weak'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCompletionDialog(rev)}
                    className="flex items-center gap-1.5 bg-white text-black px-3.5 py-1.5 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Mark Revised</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Revision History (Compact) */}
      {categorized.completed.length > 0 && (
        <section className="pt-4">
          <h2 className="text-xs font-mono text-[#858585] uppercase tracking-wider mb-3">
            Recently Completed Revisions ({categorized.completed.length})
          </h2>
          <div className="border border-[#262626] divide-y divide-[#262626] bg-[#0A0A0A]">
            {categorized.completed.slice(0, 8).map((rev) => (
              <div
                key={rev.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-[#858585]"
              >
                <div className="flex items-center gap-2 text-white">
                  <span className="font-mono">{rev.stage}</span>
                  <span>·</span>
                  <span>
                    {rev.chapterId} {rev.chapterName}
                  </span>
                </div>
                <div className="font-mono tabular-nums">
                  Done {rev.completedDate ? formatDisplayDate(rev.completedDate, false) : ''} · Conf{' '}
                  {rev.confidence ?? '-'}/5
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Revision Completion Modal */}
      {activeRevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form
            onSubmit={handleConfirmRevision}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rev-complete-title"
            className="w-full max-w-md border border-[#262626] bg-[#0A0A0A] p-6 space-y-5"
          >
            <div>
              <div className="text-xs font-mono text-[#858585]">
                {activeRevModal.stage} REVISION · {SUBJECT_MAP[activeRevModal.subjectId]?.name}
              </div>
              <h2 id="rev-complete-title" className="mt-1 font-display text-xl font-semibold text-white">
                {activeRevModal.chapterId} · {activeRevModal.chapterName}
              </h2>
            </div>

            <div>
              <div className="text-xs text-[#858585] mb-2">
                Recall Confidence (1–5) — Confidence ≤ 2 auto-schedules extra review
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setConfidence(num)}
                    className={`flex-1 py-2 border font-mono text-xs transition-colors ${
                      confidence === num
                        ? 'border-white bg-white text-black font-semibold'
                        : 'border-[#262626] bg-[#111111] text-[#858585] hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={practiceDone}
                  onChange={(e) => setPracticeDone(e.target.checked)}
                  className="w-4 h-4 accent-white"
                />
                <span>Practice questions solved</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={answerWritingDone}
                  onChange={(e) => setAnswerWritingDone(e.target.checked)}
                  className="w-4 h-4 accent-white"
                />
                <span>Answer-writing / keywords checked</span>
              </label>
            </div>

            <div>
              <label htmlFor="rev-mistakes" className="block text-xs text-[#858585] mb-1.5">
                Mistakes Noted (optional — logging mistakes schedules Extra review)
              </label>
              <textarea
                id="rev-mistakes"
                rows={2}
                value={mistakes}
                onChange={(e) => setMistakes(e.target.value)}
                placeholder="Any missed step, formula sign, or keyword..."
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#262626]">
              <button
                type="button"
                onClick={() => setActiveRevModal(null)}
                className="border border-[#262626] px-4 py-2 text-xs text-[#858585] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
              >
                Save Revision
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
