import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed';
import type { RecoverySuggestion } from '../types/study';
import { formatDisplayDate } from '../utils/date';

interface RecoveryModalProps {
  activeDate: string;
  suggestions: RecoverySuggestion[];
  remainingBacklogCount: number;
  aiLoading: boolean;
  aiError: string | null;
  whyThisRecovery: string | null;
  onRequestAIRecovery: () => Promise<{
    suggestions: RecoverySuggestion[];
    whyThisRecovery: string;
    remainingBacklogCount: number;
  } | null>;
  onAcceptAll: (accepted: RecoverySuggestion[]) => void;
  onDismissItem: (sug: RecoverySuggestion) => void;
  onClose: () => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  activeDate,
  suggestions: initialSuggestions,
  remainingBacklogCount: initialBacklogCount,
  aiLoading,
  aiError,
  whyThisRecovery: initialWhy,
  onRequestAIRecovery,
  onAcceptAll,
  onDismissItem,
  onClose,
}) => {
  const [items, setItems] = useState<RecoverySuggestion[]>(initialSuggestions);
  const [backlogCount, setBacklogCount] = useState<number>(initialBacklogCount);
  const [whyText, setWhyText] = useState<string | null>(initialWhy);

  const handleAIReprioritize = async () => {
    const res = await onRequestAIRecovery();
    if (res) {
      setItems(res.suggestions);
      setBacklogCount(res.remainingBacklogCount);
      setWhyText(res.whyThisRecovery);
    }
  };

  const handleDateChange = (id: string, nextDate: string) => {
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, suggestedDate: nextDate } : s))
    );
  };

  const handleDurationChange = (id: string, mins: number) => {
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, durationMinutes: mins } : s))
    );
  };

  const handleToggleSplit = (id: string) => {
    setItems((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, splitRecommended: !s.splitRecommended } : s
      )
    );
  };

  const handleDismiss = (sug: RecoverySuggestion) => {
    setItems((prev) => prev.filter((s) => s.id !== sug.id));
    onDismissItem(sug);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-modal-title"
        className="w-full max-w-2xl border border-[#262626] bg-[#0A0A0A] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#262626]">
          <div>
            <div className="text-xs font-mono text-[#858585]">
              CARRY-FORWARD &amp; RECOVERY · {formatDisplayDate(activeDate)}
            </div>
            <h2 id="recovery-modal-title" className="mt-1 font-display text-2xl font-semibold text-white">
              Recover Missed Work
            </h2>
            <p className="mt-1 text-sm text-[#858585]">
              Prioritized across upcoming sessions without overloading one day or altering past records.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {items.length > 0 && (
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleAIReprioritize}
                className="flex items-center gap-1.5 border border-[#404040] bg-[#111111] px-3 py-1.5 text-xs text-white hover:border-white disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{aiLoading ? 'Analyzing...' : 'Prioritize with Gemini'}</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Close recovery planner"
              onClick={onClose}
              className="p-1.5 text-[#858585] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {aiError && (
            <div className="flex items-start gap-2.5 border border-[#404040] bg-black p-3.5 text-xs text-white">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#858585]" aria-hidden="true" />
              <span>{aiError}</span>
            </div>
          )}

          {whyText && (
            <div className="border border-[#262626] bg-black p-3.5 text-xs text-[#D4D4D4]">
              <span className="font-mono text-[#858585] uppercase mr-2">AI Rationale:</span>
              {whyText}
            </div>
          )}

          {items.length === 0 ? (
            <div className="border border-[#262626] bg-[#111111] p-6 text-center">
              <p className="text-sm text-white">No unfinished tasks or overdue revisions pending recovery.</p>
              <p className="mt-1 text-xs text-[#858585]">You are caught up with your current window.</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="border border-[#262626] bg-[#111111] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                      <span className="text-white font-medium">
                        {SUBJECT_MAP[item.subjectId]?.name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{item.reason}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.difficulty}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">{item.title}</div>
                    <div className="mt-0.5 text-xs text-[#858585]">{item.objective}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Dismiss recovery for ${item.title}`}
                    onClick={() => handleDismiss(item)}
                    className="shrink-0 border border-[#262626] px-2.5 py-1 text-xs text-[#858585] hover:text-white hover:border-white transition-colors"
                  >
                    Dismiss
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#262626]">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`rec-date-${item.id}`} className="text-xs text-[#858585]">
                      Reschedule to
                    </label>
                    <input
                      id={`rec-date-${item.id}`}
                      type="date"
                      value={item.suggestedDate}
                      onChange={(e) => handleDateChange(item.id, e.target.value)}
                      className="border border-[#262626] bg-black px-2.5 py-1 text-xs text-white font-mono focus:border-white focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor={`rec-dur-${item.id}`} className="text-xs text-[#858585]">
                      Minutes
                    </label>
                    <input
                      id={`rec-dur-${item.id}`}
                      type="number"
                      min={20}
                      max={150}
                      value={item.durationMinutes}
                      onChange={(e) => handleDurationChange(item.id, Number(e.target.value))}
                      className="w-16 border border-[#262626] bg-black px-2 py-1 text-xs text-white font-mono tabular-nums focus:border-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSplit(item.id)}
                    className={`border px-2.5 py-1 text-xs transition-colors ${
                      item.splitRecommended
                        ? 'border-white bg-white text-black font-medium'
                        : 'border-[#262626] text-[#858585] hover:text-white'
                    }`}
                  >
                    {item.splitRecommended ? 'Split into 2 parts' : 'Single block'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onAcceptAll([item]);
                      setItems((prev) => prev.filter((s) => s.id !== item.id));
                    }}
                    className="ml-auto flex items-center gap-1 text-xs text-white hover:underline"
                  >
                    <span>Accept this</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}

          {backlogCount > 0 && (
            <div className="border border-[#262626] bg-black p-4 text-xs text-[#858585]">
              <span className="text-white font-medium">Remaining backlog:</span>{' '}
              {backlogCount} lower-priority item(s) held outside the 7-day window so daily sessions stay realistic.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-6 border-t border-[#262626]">
          <button
            type="button"
            onClick={onClose}
            className="border border-[#262626] px-4 py-2 text-xs font-medium text-[#858585] hover:text-white transition-colors"
          >
            Close
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onAcceptAll(items);
                onClose();
              }}
              className="flex items-center gap-1.5 bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Accept Recovery Plan ({items.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
