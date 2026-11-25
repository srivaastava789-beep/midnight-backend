import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SUBJECTS } from '../data/seed';
import {
  ChapterDifficulty,
  ChapterItem,
  StudyTask,
  SubjectId,
  TaskType,
} from '../types/study';

interface TaskEditorModalProps {
  initialTask?: StudyTask | null;
  defaultDate: string;
  chapters: ChapterItem[];
  onSave: (task: StudyTask, targetDate: string) => void;
  onClose: () => void;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  initialTask,
  defaultDate,
  chapters,
  onSave,
  onClose,
}) => {
  const [subjectId, setSubjectId] = useState<SubjectId>(
    initialTask?.subjectId ?? 'mathematics'
  );
  const [chapterId, setChapterId] = useState<string>(initialTask?.chapterId ?? '');
  const [title, setTitle] = useState<string>(initialTask?.title ?? '');
  const [objective, setObjective] = useState<string>(
    initialTask?.objective ?? 'Focused study & practice questions'
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    initialTask?.durationMinutes ?? 75
  );
  const [timeSlot, setTimeSlot] = useState<string>(
    initialTask?.timeSlot ?? '17:30–18:45'
  );
  const [scheduledDate, setScheduledDate] = useState<string>(
    initialTask?.scheduledDate ?? defaultDate
  );
  const [taskType, setTaskType] = useState<TaskType>(
    initialTask?.taskType ?? 'custom'
  );
  const [difficulty, setDifficulty] = useState<ChapterDifficulty>(
    initialTask?.difficulty ?? 'Medium'
  );
  const [error, setError] = useState<string>('');

  const subjectChapters = chapters.filter((c) => c.subjectId === subjectId);

  const handleChapterChange = (nextChapterId: string) => {
    setChapterId(nextChapterId);
    const ch = chapters.find((c) => c.id === nextChapterId);
    if (ch) {
      setTitle(`${ch.id} · ${ch.chapterName}`);
      setDifficulty(ch.difficulty);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a task title or select a chapter.');
      return;
    }
    if (durationMinutes < 10 || durationMinutes > 240) {
      setError('Duration must be between 10 and 240 minutes.');
      return;
    }

    const origDate = initialTask?.originalDate ?? scheduledDate;
    const isMoved = scheduledDate !== origDate;

    const savedTask: StudyTask = {
      id: initialTask?.id ?? `task-${scheduledDate}-${Math.random().toString(36).slice(2, 7)}`,
      subjectId,
      chapterId: chapterId || undefined,
      practiceTopicId: initialTask?.practiceTopicId,
      revisionId: initialTask?.revisionId,
      title: title.trim(),
      objective: objective.trim() || 'Focused practice',
      durationMinutes,
      timeSlot: timeSlot.trim() || '17:30–18:45',
      blockIndex: initialTask?.blockIndex ?? (timeSlot.startsWith('0') ? 0 : 1),
      taskType,
      completed: initialTask?.completed ?? false,
      completedAt: initialTask?.completedAt ?? null,
      originalDate: origDate,
      scheduledDate,
      carriedForward: initialTask?.carriedForward || isMoved,
      splitPart: initialTask?.splitPart,
      difficulty,
    };

    onSave(savedTask, scheduledDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        className="w-full max-w-lg border border-[#262626] bg-[#0A0A0A] p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
          <h2 id="task-editor-title" className="font-display text-xl font-semibold text-white">
            {initialTask ? 'Edit Study Task' : 'Add Study Task'}
          </h2>
          <button
            type="button"
            aria-label="Close task editor"
            onClick={onClose}
            className="p-1.5 text-[#858585] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-subject" className="block text-xs text-[#858585] mb-1.5">
                Subject
              </label>
              <select
                id="task-subject"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value as SubjectId);
                  setChapterId('');
                }}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="task-date" className="block text-xs text-[#858585] mb-1.5">
                Scheduled Date
              </label>
              <input
                id="task-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
              />
            </div>
          </div>

          {subjectChapters.length > 0 && (
            <div>
              <label htmlFor="task-chapter" className="block text-xs text-[#858585] mb-1.5">
                Link Syllabus Chapter (Optional)
              </label>
              <select
                id="task-chapter"
                value={chapterId}
                onChange={(e) => handleChapterChange(e.target.value)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                <option value="">Custom / General Topic</option>
                {subjectChapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.chapterName} ({c.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="task-title" className="block text-xs text-[#858585] mb-1.5">
              Task Title / Chapter
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="e.g., MAT-20 · Trigonometrical Identities"
              className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="task-objective" className="block text-xs text-[#858585] mb-1.5">
              Task Objective
            </label>
            <input
              id="task-objective"
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g., Prove 15 identities & solve past-paper questions"
              className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="task-duration" className="block text-xs text-[#858585] mb-1.5">
                Duration (min)
              </label>
              <input
                id="task-duration"
                type="number"
                min={10}
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono tabular-nums focus:border-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="task-timeslot" className="block text-xs text-[#858585] mb-1.5">
                Time Slot
              </label>
              <input
                id="task-timeslot"
                type="text"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                placeholder="17:30–18:45"
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="task-type" className="block text-xs text-[#858585] mb-1.5">
                Session Type
              </label>
              <select
                id="task-type"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                <option value="first_study">First Study</option>
                <option value="revision">Revision</option>
                <option value="practice">Practice</option>
                <option value="exam_prep">Exam Prep</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-white border border-[#404040] bg-[#111111] px-3 py-2">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#262626] px-4 py-2 text-xs font-medium text-[#858585] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
            >
              {initialTask ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
