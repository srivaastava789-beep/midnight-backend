import React, { useState } from 'react';
import { Calendar, Check, Edit3, X } from 'lucide-react';
import { getExamReadiness } from '../engine/planner';
import {
  ChapterItem,
  ExamItem,
  PracticeTopicItem,
  RevisionTask,
} from '../types/study';
import { formatDisplayDate } from '../utils/date';

interface ExamDetailModalProps {
  exam: ExamItem;
  activeDate: string;
  chapters: ChapterItem[];
  practiceTopics: PracticeTopicItem[];
  revisions: RevisionTask[];
  onUpdateExam: (updated: ExamItem) => void;
  onOpenChapter: (chapter: ChapterItem) => void;
  onClose: () => void;
}

export const ExamDetailModal: React.FC<ExamDetailModalProps> = ({
  exam,
  activeDate,
  chapters,
  practiceTopics,
  revisions,
  onUpdateExam,
  onOpenChapter,
  onClose,
}) => {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(exam.date);
  const [startTime, setStartTime] = useState(exam.startTime);
  const [notes, setNotes] = useState(exam.notes);

  const report = getExamReadiness(exam, chapters, practiceTopics, revisions, activeDate);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    onUpdateExam({
      ...exam,
      date,
      startTime: startTime || '09:00',
      notes: notes.trim(),
    });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-detail-title"
        className="w-full max-w-2xl border border-[#262626] bg-[#0A0A0A] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#262626]">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#858585] tabular-nums">
              <span>{formatDisplayDate(exam.date)}</span>
              <span aria-hidden="true">·</span>
              <span>{exam.startTime}</span>
              <span aria-hidden="true">·</span>
              <span>
                {report.daysRemaining < 0
                  ? 'Completed'
                  : report.daysRemaining === 0
                    ? 'Exam Today'
                    : `${report.daysRemaining}d remaining`}
              </span>
            </div>
            <h2 id="exam-detail-title" className="mt-1.5 font-display text-2xl font-semibold text-white">
              {exam.subjectName}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-1.5 border border-[#262626] px-3 py-1.5 text-xs text-[#858585] hover:text-white hover:border-white transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{editing ? 'Cancel Edit' : 'Edit Date'}</span>
            </button>
            <button
              type="button"
              aria-label="Close exam details"
              onClick={onClose}
              className="p-1.5 text-[#858585] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {editing && (
            <form onSubmit={handleSave} className="border border-[#262626] bg-[#111111] p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="exam-date-input" className="block text-xs text-[#858585] mb-1">
                    Exam Date
                  </label>
                  <input
                    id="exam-date-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-[#262626] bg-black px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="exam-time-input" className="block text-xs text-[#858585] mb-1">
                    Start Time
                  </label>
                  <input
                    id="exam-time-input"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-[#262626] bg-black px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="exam-notes-input" className="block text-xs text-[#858585] mb-1">
                  Exam Notes
                </label>
                <input
                  id="exam-notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-[#262626] bg-black px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Save Exam Schedule</span>
                </button>
              </div>
            </form>
          )}

          {/* Readiness Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#262626] border border-[#262626]">
            <div className="bg-[#0A0A0A] p-4">
              <div className="text-xs text-[#858585]">Readiness</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                {report.readinessPercent}%
              </div>
            </div>
            <div className="bg-[#0A0A0A] p-4">
              <div className="text-xs text-[#858585]">Portions Ready</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                {report.chapters.length > 0
                  ? `${report.completedCount}/${report.totalCount}`
                  : `${report.practiceDoneCount}/${report.practiceTopics.length}`}
              </div>
            </div>
            <div className="bg-[#0A0A0A] p-4">
              <div className="text-xs text-[#858585]">Weak Topics</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                {report.weakChapters.length}
              </div>
            </div>
            <div className="bg-[#0A0A0A] p-4">
              <div className="text-xs text-[#858585]">Practice Done</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                {report.practiceDoneCount}
              </div>
            </div>
          </div>

          {/* Suggested Revision Plan */}
          <div>
            <h3 className="text-xs font-medium text-[#858585] tracking-wide mb-2.5">
              Suggested Revision Plan
            </h3>
            <ul className="space-y-2 border border-[#262626] bg-[#111111] p-4">
              {report.suggestedPlan.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-white">
                  <span className="font-mono text-xs text-[#858585] mt-0.5 tabular-nums">
                    0{idx + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Syllabus Portions */}
          {report.chapters.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-medium text-[#858585] tracking-wide">
                  Exam Syllabus ({report.remainingChapters.length} remaining)
                </h3>
                <span className="text-xs text-[#555555]">Click any chapter to inspect</span>
              </div>
              <div className="border border-[#262626] divide-y divide-[#262626]">
                {report.chapters.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onOpenChapter(ch)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#111111] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-[#858585] shrink-0">{ch.id}</span>
                      <span className="text-sm text-white truncate">{ch.chapterName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-[#858585]">
                      {ch.isWeak && <span className="text-white font-medium">Weak</span>}
                      <span>{ch.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Practice Topics / Extra Portions */}
          {report.practiceTopics.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-[#858585] tracking-wide mb-2.5">
                Practice Categories & Additional Portions
              </h3>
              <div className="border border-[#262626] divide-y divide-[#262626]">
                {report.practiceTopics.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-white">{pt.title}</span>
                    <span className="text-xs font-mono text-[#858585] tabular-nums">
                      {pt.status} · {pt.practiceCount} sessions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {exam.notes && (
            <div className="flex items-center gap-2 text-xs text-[#858585] pt-2 border-t border-[#262626]">
              <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{exam.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
