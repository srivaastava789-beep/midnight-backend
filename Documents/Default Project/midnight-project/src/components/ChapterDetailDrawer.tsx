import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { SUBJECT_MAP } from '../data/seed';
import type {
  ChapterDifficulty,
  ChapterItem,
  ChapterStatus,
  PracticeStatus,
  RevisionTask,
} from '../types/study';
import { formatDisplayDate } from '../utils/date';

interface ChapterDetailDrawerProps {
  chapter: ChapterItem;
  revisions: RevisionTask[];
  activeDate: string;
  onSave: (updated: ChapterItem, triggerRevisionSchedule: boolean) => void;
  onDelete: (chapterId: string) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: ChapterStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'Needs Revision',
  'Strong',
  'Weak',
];

const PRACTICE_OPTIONS: PracticeStatus[] = ['Not Started', 'In Progress', 'Done'];
const DIFFICULTY_OPTIONS: ChapterDifficulty[] = ['Easy', 'Medium', 'Hard', 'Not rated'];

export const ChapterDetailDrawer: React.FC<ChapterDetailDrawerProps> = ({
  chapter,
  revisions,
  activeDate,
  onSave,
  onDelete,
  onClose,
}) => {
  const [chapterName, setChapterName] = useState(chapter.chapterName);
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  const [isWeak, setIsWeak] = useState(chapter.isWeak || chapter.status === 'Weak');
  const [confidence, setConfidence] = useState<number>(chapter.confidence ?? 3);
  const [lastStudiedDate, setLastStudiedDate] = useState<string>(
    chapter.lastStudiedDate ?? ''
  );
  const [plannedStudyDate, setPlannedStudyDate] = useState<string>(
    chapter.plannedStudyDate ?? ''
  );
  const [practiceStatus, setPracticeStatus] = useState<PracticeStatus>(
    chapter.practiceStatus
  );
  const [answerWritingStatus, setAnswerWritingStatus] = useState<PracticeStatus>(
    chapter.answerWritingStatus
  );
  const [difficulty, setDifficulty] = useState<ChapterDifficulty>(chapter.difficulty);
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>(
    chapter.estimatedMinutes !== null ? String(chapter.estimatedMinutes) : ''
  );
  const [mistakes, setMistakes] = useState(chapter.mistakes);
  const [notes, setNotes] = useState(chapter.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const chapterRevs = revisions
    .filter((r) => r.chapterId === chapter.id)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterName.trim()) return;

    const becameCompleted =
      (status === 'Completed' || status === 'Strong') &&
      chapter.status !== 'Completed' &&
      chapter.status !== 'Strong';

    const effectiveStudiedDate =
      lastStudiedDate || (status === 'Completed' || status === 'Strong' ? activeDate : '');

    const parsedEstimate = estimatedMinutes.trim() ? Number(estimatedMinutes) : null;
    const validEstimate =
      parsedEstimate !== null && Number.isFinite(parsedEstimate) && parsedEstimate >= 5
        ? Math.min(240, Math.round(parsedEstimate))
        : null;

    onSave(
      {
        ...chapter,
        chapterName: chapterName.trim(),
        status,
        isWeak: isWeak || status === 'Weak',
        isStateConfirmed: true,
        confidence,
        lastStudiedDate: effectiveStudiedDate || null,
        plannedStudyDate: plannedStudyDate || null,
        practiceStatus,
        answerWritingStatus,
        difficulty,
        estimatedMinutes: validEstimate,
        mistakes: mistakes.trim(),
        notes: notes.trim(),
      },
      becameCompleted || (status === 'Completed' && chapterRevs.length === 0)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-drawer-title"
        className="w-full max-w-xl border-l border-[#262626] bg-[#0A0A0A] h-full flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#262626]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#858585]">
              <span>{chapter.id}</span>
              <span aria-hidden="true">·</span>
              <span>{SUBJECT_MAP[chapter.subjectId]?.name}</span>
              {chapter.subCategory && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{chapter.subCategory}</span>
                </>
              )}
            </div>
            <h2 id="chapter-drawer-title" className="mt-1 font-display text-2xl font-semibold text-white">
              {chapter.chapterName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close chapter detail"
            onClick={onClose}
            className="p-1.5 text-[#858585] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label htmlFor="ch-name" className="block text-xs text-[#858585] mb-1.5">
              Chapter Name
            </label>
            <input
              id="ch-name"
              type="text"
              value={chapterName}
              onChange={(e) => setChapterName(e.target.value)}
              className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="ch-status" className="block text-xs text-[#858585] mb-1.5">
                Study Status
              </label>
              <select
                id="ch-status"
                value={status}
                onChange={(e) => {
                  const next = e.target.value as ChapterStatus;
                  setStatus(next);
                  if ((next === 'Completed' || next === 'Strong') && !lastStudiedDate) {
                    setLastStudiedDate(activeDate);
                  }
                  if (next === 'Strong') setIsWeak(false);
                  if (next === 'Weak') setIsWeak(true);
                }}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ch-difficulty" className="block text-xs text-[#858585] mb-1.5">
                Difficulty
              </label>
              <select
                id="ch-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ChapterDifficulty)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ch-est-minutes" className="block text-xs text-[#858585] mb-1.5">
                Est. Minutes
              </label>
              <input
                id="ch-est-minutes"
                type="number"
                min={5}
                max={240}
                placeholder="Unassigned"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono placeholder:text-[#555555] focus:border-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border border-[#262626] bg-[#111111] p-4">
            <div>
              <div className="text-xs text-[#858585] mb-2">Confidence (1–5)</div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setConfidence(num)}
                    className={`w-8 h-8 font-mono text-xs border transition-colors ${
                      confidence === num
                        ? 'border-white bg-white text-black font-semibold'
                        : 'border-[#262626] bg-black text-[#858585] hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="ch-weak"
                type="checkbox"
                checked={isWeak}
                onChange={(e) => setIsWeak(e.target.checked)}
                className="w-4 h-4 accent-white"
              />
              <label htmlFor="ch-weak" className="text-sm text-white cursor-pointer">
                Flag as Weak Topic
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ch-first-study" className="block text-xs text-[#858585] mb-1.5">
                First Study Completed Date
              </label>
              <input
                id="ch-first-study"
                type="date"
                value={lastStudiedDate}
                onChange={(e) => setLastStudiedDate(e.target.value)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ch-planned-date" className="block text-xs text-[#858585] mb-1.5">
                Planned Study Date
              </label>
              <input
                id="ch-planned-date"
                type="date"
                value={plannedStudyDate}
                onChange={(e) => setPlannedStudyDate(e.target.value)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ch-practice" className="block text-xs text-[#858585] mb-1.5">
                Practice Questions Status
              </label>
              <select
                id="ch-practice"
                value={practiceStatus}
                onChange={(e) => setPracticeStatus(e.target.value as PracticeStatus)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {PRACTICE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ch-answer-writing" className="block text-xs text-[#858585] mb-1.5">
                Answer-Writing Status
              </label>
              <select
                id="ch-answer-writing"
                value={answerWritingStatus}
                onChange={(e) => setAnswerWritingStatus(e.target.value as PracticeStatus)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {PRACTICE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ch-mistakes" className="block text-xs text-[#858585] mb-1.5">
              Mistakes &amp; Trap Log
            </label>
            <textarea
              id="ch-mistakes"
              rows={2}
              value={mistakes}
              onChange={(e) => setMistakes(e.target.value)}
              placeholder="Record recurring formula errors, missed keywords, or calculation traps..."
              className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ch-notes" className="block text-xs text-[#858585] mb-1.5">
              Study Notes
            </label>
            <textarea
              id="ch-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key definitions, diagrams to practice, textbook pages..."
              className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
            />
          </div>

          {/* Revision Timeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#858585]">
                Spaced Revision Timeline (D1 → D3 → D7 → D23)
              </span>
              {chapter.lastRevision && (
                <span className="text-xs font-mono text-[#858585]">
                  Last revised {formatDisplayDate(chapter.lastRevision, false)}
                </span>
              )}
            </div>
            {chapterRevs.length === 0 ? (
              <div className="border border-[#262626] bg-[#111111] p-3 text-xs text-[#858585]">
                Mark status as Completed to automatically generate D1, D3, D7, and D23 revision milestones.
              </div>
            ) : (
              <div className="border border-[#262626] divide-y divide-[#262626]">
                {chapterRevs.map((rev) => (
                  <div
                    key={rev.id}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-white font-medium">{rev.stage}</span>
                      <span className="font-mono text-[#858585]">
                        Due {formatDisplayDate(rev.scheduledDate, false)}
                      </span>
                      {rev.carriedForward && (
                        <span className="text-[#555555]">
                          (orig {formatDisplayDate(rev.originalDueDate, false)})
                        </span>
                      )}
                    </div>
                    <span className={rev.completed ? 'text-white' : 'text-[#858585]'}>
                      {rev.completed ? 'Revised' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#262626]">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-[#858585] hover:text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Delete Portion</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDelete(chapter.id)}
                  className="border border-white bg-white text-black px-3 py-1.5 text-xs font-semibold"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-[#858585] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-[#262626] px-4 py-2 text-xs text-[#858585] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
              >
                Save Portion
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
