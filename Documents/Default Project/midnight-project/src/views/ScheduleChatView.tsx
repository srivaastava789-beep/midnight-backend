import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed';
import { getNextExam } from '../engine/planner';
import type { AppState, ScheduleChatMessage } from '../types/study';
import { addDays, formatDisplayDate, getWeekdayName } from '../utils/date';
import {
  exportStateAsJson,
  generateChatGPTExport,
  generateChatGPTImportPrompt,
  parseDirectImportPreview,
} from '../utils/aiBridge';

interface ScheduleChatViewProps {
  state: AppState;
  activeDate: string;
  messages: ScheduleChatMessage[];
  loading: boolean;
  error: string | null;
  onSendMessage: (message: string) => void;
  onUndoMessage: (messageId: string) => void;
  onRemoveMemory: (memoryId: string) => void;
  onClearChat: () => void;
  onOpenPlanner: () => void;
}

const STARTER_PROMPTS = [
  'I only completed Part A and Part B of PHY-08. Schedule Part C and Part D tomorrow.',
  'Tomorrow I have a 6 PM school meeting; shorten my evening window to 45m.',
  'Chemistry Acids & Salts test on 28 Nov 2026 — prepare 1 day before.',
  'Explain Fleming’s Left Hand Rule and typical ICSE numericals.',
];

const SAMPLE_CHATGPT_SUMMARY = `Here is my current ICSE Class 10 study progress:
- Completed Chapters:
  * Mathematics: MAT-21 Volume and Surface Area of Solids
  * Physics: PHY-01 Force
- In-Progress Chapters with Sub-parts:
  * Physics: PHY-08 Current Electricity (Completed: Part A, Part B | Left to study: Part C, Part D)
  * Mathematics: MAT-22 Trigonometrical Identities (Completed: Part A | Left: Part B, Part C)
- Upcoming Tests:
  * Physics test on Current Electricity on 28 Nov 2026
- Daily Schedule Constraints:
  * Every Wednesday I only have 90m maximum for study
  * Tomorrow school meeting at 6 PM so only 45m available`;

export const ScheduleChatView: React.FC<ScheduleChatViewProps> = ({
  state,
  activeDate,
  messages,
  loading,
  error,
  onSendMessage,
  onUndoMessage,
  onRemoveMemory,
  onClearChat,
  onOpenPlanner,
}) => {
  const [input, setInput] = useState('');
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportTab, setExportTab] = useState<'prompt' | 'json'>('prompt');
  const [importTab, setImportTab] = useState<'instructions' | 'paste'>('instructions');
  const [importText, setImportText] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  const upcomingDates = Array.from({ length: 4 }, (_, i) => addDays(activeDate, i));
  const nextExam = getNextExam(state.exams, activeDate);

  // Chapters with recorded subtopic parts
  const chaptersWithSubparts = state.chapters.filter(
    (c) => (c.completedParts && c.completedParts.length > 0) || (c.remainingParts && c.remainingParts.length > 0)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || loading) return;
      setInput('');
      onSendMessage(trimmed);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadExport = () => {
    const content = exportTab === 'prompt' ? generateChatGPTExport(state) : exportStateAsJson(state);
    const ext = exportTab === 'prompt' ? 'md' : 'json';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `midnight_icse_study_progress_${activeDate}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) return;
    setShowImportModal(false);
    setImportText('');
    onSendMessage(`Import my ICSE Class 10 study progress:\n\n${trimmed}`);
  };

  const importPreview = parseDirectImportPreview(importText, state);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#1F293D] pb-5">
        <div>
          <div className="text-xs font-mono text-white uppercase tracking-wider font-medium">
            MIDNIGHT
          </div>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Study AI
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            title="Export for ChatGPT"
            aria-label="Export for ChatGPT"
            onClick={() => setShowExportModal(true)}
            className="flex items-center justify-center w-9 h-9 border border-[#1F293D] bg-[#0A0E17] text-slate-300 hover:border-white/60 hover:text-white rounded-xl transition-colors"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Import from ChatGPT"
            aria-label="Import from ChatGPT"
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center w-9 h-9 border border-[#1F293D] bg-[#0A0E17] text-slate-300 hover:border-white/60 hover:text-white rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            data-testid="toggle-gemini-memory-drawer"
            title="Open Gemini Memory & Context"
            aria-label="Gemini memory"
            onClick={() => setShowMemoryDrawer(true)}
            className="flex items-center gap-1.5 border border-[#1F293D] bg-[#0A0E17] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-white/60 hover:text-white rounded-xl transition-colors"
          >
            <Brain className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            <span>Memory ({(state.aiMemory ?? []).length})</span>
          </button>

          <button
            type="button"
            onClick={onOpenPlanner}
            title="Open Planner"
            aria-label="Open Planner"
            className="flex items-center justify-center w-9 h-9 border border-[#1F293D] bg-[#0A0E17] text-slate-400 hover:border-slate-300 hover:text-white rounded-xl transition-colors"
          >
            <Calendar className="w-4 h-4" aria-hidden="true" />
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              title="Clear chat thread"
              aria-label="Clear chat"
              className="flex items-center justify-center w-9 h-9 border border-[#1F293D] bg-[#0A0E17] text-slate-400 hover:border-slate-400/60 hover:text-slate-400 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* Main Single-Column Focused Canvas */}
      <section
        aria-label="Gemini study and schedule chat"
        className="max-w-4xl mx-auto border border-[#1F293D] bg-[#0A0E17] rounded-2xl flex flex-col min-h-[580px] overflow-hidden shadow-xl"
      >
        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[600px]">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/30 flex items-center justify-center text-white shadow-lg">
                <Sparkles className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h2 className="font-display text-xl font-semibold text-white">
                  MIDNIGHT
                </h2>
                <p className="text-xs font-mono text-white tracking-wide font-medium">
                  Less noise. More focus.
                </p>
                <p className="pt-2 text-xs text-slate-400 leading-relaxed">
                  Ask conceptual questions, report partial chapter completion (e.g. Parts A &amp; B done), announce upcoming tests, or adapt your timetable.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  data-testid={`chat-message-${msg.role}`}
                  className={`border px-5 py-4 rounded-2xl transition-all ${
                    msg.role === 'user'
                      ? 'border-[#1F293D] bg-[#0F1626] ml-8 sm:ml-16 text-white'
                      : 'border-[#1F293D] bg-[#06080F] mr-4 sm:mr-10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <span className={msg.role === 'assistant' ? 'text-white font-semibold' : ''}>
                      {msg.role === 'user' ? 'You' : 'MIDNIGHT AI'}
                    </span>
                    {msg.isOutOfScope && (
                      <span className="text-slate-300/80">Non-academic prompt</span>
                    )}
                  </div>

                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </p>

                  {msg.appliedChanges && msg.appliedChanges.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#1F293D] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-white">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {msg.undone
                              ? 'Changes reverted'
                              : `Applied ${msg.appliedChanges.length} update${msg.appliedChanges.length === 1 ? '' : 's'}`}
                          </span>
                        </span>

                        {msg.snapshotBefore && !msg.undone && (
                          <button
                            type="button"
                            onClick={() => onUndoMessage(msg.id)}
                            className="inline-flex items-center gap-1.5 border border-[#1F293D] bg-[#0A0E17] px-2.5 py-1 text-xs text-slate-300 hover:border-slate-300 hover:text-white rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            <span>Undo</span>
                          </button>
                        )}
                      </div>

                      <ul className={`space-y-1 text-xs font-mono ${msg.undone ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                        {msg.appliedChanges.map((change, idx) => (
                          <li key={idx}>· {change}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.rejectedChanges && msg.rejectedChanges.length > 0 && (
                    <div className="mt-2 text-xs font-mono text-slate-300/80">
                      {msg.rejectedChanges.map((rej, idx) => (
                        <div key={idx}>Note: {rej}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="border border-[#1F293D] bg-[#06080F] px-5 py-4 mr-10 rounded-2xl">
                  <div className="text-[11px] font-mono text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Thinking...</span>
                  </div>
                  <p className="mt-1.5 text-xs font-mono text-slate-400">
                    Analyzing study context, updating syllabus, and rebalancing schedule...
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 border border-slate-800/40 bg-slate-900/20 px-4 py-3 text-xs text-white rounded-xl"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-slate-200">Gemini response interrupted</div>
                <p className="mt-0.5 text-slate-300/80">{error}</p>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Composer */}
        <form onSubmit={handleSubmit} className="border-t border-[#1F293D] bg-[#06080F] p-4 flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="schedule-chat-input" className="sr-only">
              Ask Gemini anything about your study, syllabus, subtopics, or schedule
            </label>
            <textarea
              id="schedule-chat-input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a study question, announce a test, report partial chapter completion, or paste notes..."
              className="w-full resize-none border border-[#1F293D] bg-[#0A0E17] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 rounded-xl focus:border-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 bg-white text-slate-950 font-semibold px-5 py-3 text-xs rounded-xl hover:bg-[#858585] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 shadow-md shadow-black/30"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{loading ? 'Sending...' : 'Send'}</span>
          </button>
        </form>
      </section>

      {/* Slide-over Gemini Memory Drawer */}
      {showMemoryDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-drawer-title"
          className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md bg-[#0A0E17] border-l border-[#1F293D] h-full p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#1F293D]">
                <div>
                  <div className="text-[10px] font-mono text-white uppercase tracking-wider font-semibold">
                    Saved Retention
                  </div>
                  <h2 id="memory-drawer-title" className="text-xl font-semibold text-white">
                    Gemini Memory
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMemoryDrawer(false)}
                  title="Close memory drawer"
                  aria-label="Close memory drawer"
                  className="w-8 h-8 rounded-full bg-[#06080F] border border-[#1F293D] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Gemini Persistent Memory & Test Prep Queue */}
              <div
                data-testid="gemini-memory-panel"
                className="space-y-3"
              >
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>ACTIVE MEMORY</span>
                  <span className="tabular-nums">{(state.aiMemory ?? []).length} saved</span>
                </div>

                {(state.aiMemory ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed bg-[#06080F] border border-[#1F293D] p-3.5 rounded-xl">
                    No memories saved yet. Share daily updates, test dates, or schedule constraints in the chat to store them here.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#1F293D] border border-[#1F293D] rounded-xl bg-[#06080F] overflow-hidden">
                    {(state.aiMemory ?? []).map((mem) => {
                      const prepDate = mem.testDate ? addDays(mem.testDate, -1) : null;
                      const subjShort = mem.subjectId
                        ? SUBJECT_MAP[mem.subjectId]?.shortName ?? mem.subjectId
                        : null;
                      return (
                        <li
                          key={mem.id}
                          data-testid="gemini-memory-item"
                          className="flex items-start justify-between gap-3 p-3.5 text-xs hover:bg-[#0F1626] transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                              <span className="text-white font-semibold uppercase">
                                {mem.category === 'test'
                                  ? 'Test'
                                  : mem.category === 'preference'
                                    ? 'Pref'
                                    : 'Update'}
                              </span>
                              {subjShort && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-300">{subjShort}</span>
                                </>
                              )}
                              {mem.testDate && prepDate && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-200">
                                    {formatDisplayDate(mem.testDate, false)} (Prep {formatDisplayDate(prepDate, false)})
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-slate-200 leading-snug">{mem.content}</p>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove memory: ${mem.content}`}
                            onClick={() => onRemoveMemory(mem.id)}
                            className="p-1 text-slate-500 hover:text-slate-400 shrink-0 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Subtopics In Progress */}
              {chaptersWithSubparts.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[#1F293D]">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>PARTIAL CHAPTERS</span>
                    <span className="tabular-nums">{chaptersWithSubparts.length} active</span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {chaptersWithSubparts.slice(0, 6).map((ch) => (
                      <li key={ch.id} className="border border-[#1F293D] bg-[#06080F] p-3 rounded-xl space-y-1">
                        <div className="flex items-center justify-between font-mono text-[11px] text-white">
                          <span className="font-semibold text-white">{ch.id}</span>
                          <span className="text-slate-400">{SUBJECT_MAP[ch.subjectId]?.shortName}</span>
                        </div>
                        <div className="truncate text-slate-200 font-medium">{ch.chapterName}</div>
                        {ch.completedParts && ch.completedParts.length > 0 && (
                          <div className="text-[11px] font-mono text-white/90">
                            Completed: {ch.completedParts.join(', ')}
                          </div>
                        )}
                        {ch.remainingParts && ch.remainingParts.length > 0 && (
                          <div className="text-[11px] font-mono text-slate-200/90">
                            Left to study: {ch.remainingParts.join(', ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#1F293D] text-center">
              <button
                type="button"
                onClick={() => setShowMemoryDrawer(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-xl transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export to ChatGPT Modal */}
      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="relative w-full max-w-3xl border border-[#262626] bg-[#0A0A0A] p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#262626]">
              <div>
                <h2 id="export-modal-title" className="text-lg font-semibold text-white">
                  Export Study Status for ChatGPT / Claude
                </h2>
                <p className="text-xs text-[#858585] mt-0.5">
                  Copy this comprehensive status prompt and paste it into ChatGPT. It understands all 138 portions, exam dates, revisions, and remaining parts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-[#858585] hover:text-white p-1"
                aria-label="Close export dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
              <button
                type="button"
                onClick={() => setExportTab('prompt')}
                className={`px-3 py-1.5 text-xs font-mono ${
                  exportTab === 'prompt' ? 'bg-white text-black font-semibold' : 'text-[#858585] hover:text-white'
                }`}
              >
                ChatGPT Tutor Prompt (.md)
              </button>
              <button
                type="button"
                onClick={() => setExportTab('json')}
                className={`px-3 py-1.5 text-xs font-mono ${
                  exportTab === 'json' ? 'bg-white text-black font-semibold' : 'text-[#858585] hover:text-white'
                }`}
              >
                Structured JSON Backup
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-[#262626] bg-black p-4 font-mono text-xs text-[#D4D4D4] whitespace-pre-wrap leading-relaxed max-h-[380px]">
              {exportTab === 'prompt' ? generateChatGPTExport(state) : exportStateAsJson(state)}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#262626]">
              <div className="text-xs font-mono text-[#858585]">
                {copyFeedback ? (
                  <span className="text-white flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>{copyFeedback}</span>
                  </span>
                ) : (
                  <span>Ready to paste directly into ChatGPT</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="flex items-center gap-1.5 border border-[#262626] px-3.5 py-2 text-xs text-[#D4D4D4] hover:text-white hover:border-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      exportTab === 'prompt' ? generateChatGPTExport(state) : exportStateAsJson(state),
                      'Copied study state to clipboard!'
                    )
                  }
                  className="flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy for ChatGPT</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import from ChatGPT Modal */}
      {showImportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="relative w-full max-w-3xl border border-[#262626] bg-[#0A0A0A] p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#262626]">
              <div>
                <h2 id="import-modal-title" className="text-lg font-semibold text-white">
                  Import Study Progress from ChatGPT / AI
                </h2>
                <p className="text-xs text-[#858585] mt-0.5">
                  Two easy steps: copy the extraction prompt to ChatGPT, then paste its response here. Gemini will update your syllabus and study plan automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-[#858585] hover:text-white p-1"
                aria-label="Close import dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
              <button
                type="button"
                onClick={() => setImportTab('instructions')}
                className={`px-3 py-1.5 text-xs font-mono ${
                  importTab === 'instructions'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#858585] hover:text-white'
                }`}
              >
                Step 1: Copy ChatGPT Prompt
              </button>
              <button
                type="button"
                onClick={() => setImportTab('paste')}
                className={`px-3 py-1.5 text-xs font-mono ${
                  importTab === 'paste'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#858585] hover:text-white'
                }`}
              >
                Step 2: Paste &amp; Sync Into MIDNIGHT
              </button>
            </div>

            {importTab === 'instructions' ? (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <p className="text-xs text-[#A3A3A3] leading-relaxed">
                  Copy this prompt and send it to your existing ChatGPT conversation. ChatGPT will summarize everything you completed, in-progress sub-parts (Parts A/B vs C/D), upcoming tests, and constraints.
                </p>
                <div className="border border-[#262626] bg-black p-4 font-mono text-xs text-[#D4D4D4] whitespace-pre-wrap leading-relaxed max-h-[280px] overflow-y-auto">
                  {generateChatGPTImportPrompt()}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(generateChatGPTImportPrompt(), 'Copied extraction prompt!')
                    }
                    className="flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Prompt for ChatGPT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportTab('paste')}
                    className="flex items-center gap-1.5 border border-[#262626] px-4 py-2 text-xs text-white hover:border-white"
                  >
                    <span>Next: Paste Response →</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between text-xs text-[#858585]">
                  <span>Paste ChatGPT&rsquo;s response or raw study progression:</span>
                  <button
                    type="button"
                    onClick={() => setImportText(SAMPLE_CHATGPT_SUMMARY)}
                    className="text-white hover:underline font-mono"
                  >
                    Use Sample Progression
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste ChatGPT's summary here (e.g. 'Completed MAT-21, PHY-08 parts A and B done, Chemistry test on 28 Nov...')"
                  className="w-full flex-1 border border-[#262626] bg-black p-3.5 text-xs text-white placeholder-[#555555] font-mono focus:border-white focus:outline-none resize-none min-h-[160px]"
                />

                {/* Live Heuristic Detection Preview */}
                {importText.trim().length > 10 && (
                  <div className="border border-[#262626] bg-[#0A0A0A] p-3 text-xs space-y-1.5">
                    <div className="text-[11px] font-mono text-[#858585] uppercase tracking-wider">
                      Live Context Detection Preview
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                      <span className="text-white">
                        {importPreview.detectedChapters.length} chapter
                        {importPreview.detectedChapters.length === 1 ? '' : 's'} detected
                      </span>
                      {importPreview.detectedTests.length > 0 && (
                        <>
                          <span className="text-[#555555]">·</span>
                          <span className="text-white">
                            {importPreview.detectedTests.length} test
                            {importPreview.detectedTests.length === 1 ? '' : 's'} detected
                          </span>
                        </>
                      )}
                      {importPreview.detectedConstraints.length > 0 && (
                        <>
                          <span className="text-[#555555]">·</span>
                          <span className="text-white">
                            {importPreview.detectedConstraints.length} constraint
                            {importPreview.detectedConstraints.length === 1 ? '' : 's'} detected
                          </span>
                        </>
                      )}
                    </div>
                    {importPreview.detectedChapters.length > 0 && (
                      <div className="text-[11px] font-mono text-[#858585] truncate">
                        Chapters: {importPreview.detectedChapters.map((c) => c.id).join(', ')}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="border border-[#262626] px-4 py-2 text-xs text-[#858585] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!importText.trim() || loading}
                    onClick={handleApplyImport}
                    className="flex items-center gap-1.5 bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4] disabled:opacity-40"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sync Progress with Gemini</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
