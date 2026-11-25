import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { SUBJECT_MAP, SUBJECTS, SYLLABUS_AUDIT_ISSUES } from '../data/seed';
import { calculateSyllabusStats } from '../engine/analytics';
import type {
  AppState,
  ChapterDifficulty,
  ChapterItem,
  ChapterStatus,
  PracticeTopicItem,
  SubjectId,
  TimeEstimateStandard,
} from '../types/study';
import { formatDisplayDate } from '../utils/date';

interface SyllabusViewProps {
  state: AppState;
  activeDate: string;
  onQuickStatus: (chapterId: string, action: 'Completed' | 'In Progress' | 'Weak' | 'Strong') => void;
  onOpenChapter: (chapter: ChapterItem) => void;
  onAddChapter: (chapter: ChapterItem) => void;
  onUpdateChapter: (chapter: ChapterItem) => void;
  onSetNextTopic: (subjectId: SubjectId, chapterId: string | null) => void;
  onApplyTimeStandard: (standard: TimeEstimateStandard) => void;
  onUpdatePracticeTopic: (topic: PracticeTopicItem) => void;
  onAddPracticeTopic: (topic: PracticeTopicItem) => void;
  onDeletePracticeTopic: (topicId: string) => void;
}

type SubjectTab = SubjectId | 'all' | 'practice_trackers';
type StatusFilter =
  | 'All'
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Needs Revision'
  | 'Strong'
  | 'Weak'
  | 'Unconfirmed';

export const SyllabusView: React.FC<SyllabusViewProps> = ({
  state,
  activeDate,
  onQuickStatus,
  onOpenChapter,
  onAddChapter,
  onUpdateChapter,
  onSetNextTopic,
  onApplyTimeStandard,
  onUpdatePracticeTopic,
  onAddPracticeTopic,
  onDeletePracticeTopic,
}) => {
  const [subjectTab, setSubjectTab] = useState<SubjectTab>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  // Add Chapter Form state
  const [newSubj, setNewSubj] = useState<SubjectId>('mathematics');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDiff, setNewDiff] = useState<ChapterDifficulty>('Medium');
  const [newSubCat, setNewSubCat] = useState<'History' | 'Civics'>('History');

  // Add Practice Topic state
  const [newTopicCategory, setNewTopicCategory] = useState<
    'english_language' | 'telugu_practice' | 'extra_literature'
  >('extra_literature');
  const [newTopicTitle, setNewTopicTitle] = useState('');

  const stats = useMemo(() => calculateSyllabusStats(state.chapters), [state.chapters]);

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.chapters.filter((ch) => {
      if (subjectTab !== 'all' && subjectTab !== 'practice_trackers' && ch.subjectId !== subjectTab) {
        return false;
      }
      if (statusFilter === 'Weak' && !ch.isWeak && ch.status !== 'Weak') return false;
      if (statusFilter === 'Unconfirmed' && ch.isStateConfirmed) return false;
      if (
        statusFilter !== 'All' &&
        statusFilter !== 'Weak' &&
        statusFilter !== 'Unconfirmed' &&
        ch.status !== statusFilter
      ) {
        return false;
      }
      if (q) {
        const subjName = SUBJECT_MAP[ch.subjectId]?.name.toLowerCase() ?? '';
        return (
          ch.chapterName.toLowerCase().includes(q) ||
          ch.id.toLowerCase().includes(q) ||
          subjName.includes(q)
        );
      }
      return true;
    });
  }, [state.chapters, subjectTab, statusFilter, searchQuery]);

  const handleCreateChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const generatedId =
      newCode.trim().toUpperCase() ||
      `${newSubj.slice(0, 3).toUpperCase()}-${String(
        state.chapters.filter((c) => c.subjectId === newSubj).length + 1
      ).padStart(2, '0')}`;

    onAddChapter({
      id: generatedId,
      subjectId: newSubj,
      ...(newSubj === 'history_civics' ? { subCategory: newSubCat } : {}),
      chapterName: newName.trim(),
      status: 'Not Started',
      isWeak: false,
      isStateConfirmed: true,
      confidence: null,
      lastStudiedDate: null,
      lastRevision: null,
      revisionDueDate: null,
      mistakes: '',
      practiceStatus: 'Not Started',
      answerWritingStatus: 'Not Started',
      notes: '',
      plannedStudyDate: null,
      difficulty: newDiff,
      estimatedMinutes: null,
    });
    setNewCode('');
    setNewName('');
    setShowAddChapter(false);
  };

  const handleCreatePracticeTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;
    const subjectId: PracticeTopicItem['subjectId'] =
      newTopicCategory === 'english_language'
        ? 'english_language'
        : newTopicCategory === 'telugu_practice'
          ? 'telugu'
          : 'english_literature';
    onAddPracticeTopic({
      id: `pt-${Date.now().toString(36)}`,
      subjectId,
      category: newTopicCategory,
      title: newTopicTitle.trim(),
      status: 'Not Started',
      confidence: null,
      lastPracticedDate: null,
      practiceCount: 0,
      mistakes: '',
      notes: '',
    });
    setNewTopicTitle('');
  };

  const renderPracticeSection = (
    title: string,
    subtitle: string,
    category: PracticeTopicItem['category']
  ) => {
    const items = state.practiceTopics.filter((p) => p.category === category);
    return (
      <section className="border border-[#262626] bg-[#0A0A0A] p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#262626]">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
            <p className="text-xs text-[#858585]">{subtitle}</p>
          </div>
          <span className="font-mono text-xs text-[#858585] tabular-nums">
            {items.filter((i) => i.status === 'Completed' || i.status === 'Strong').length} / {items.length} ready
          </span>
        </div>

        <div className="divide-y divide-[#262626] border-t border-[#262626] -mx-5 -mb-5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-[#111111]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{item.title}</div>
                <div className="mt-0.5 text-xs text-[#555555]">
                  {item.notes || 'Practice category'}
                  {item.lastPracticedDate && ` · Last practiced ${formatDisplayDate(item.lastPracticedDate, false)}`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  aria-label={`Status for ${item.title}`}
                  value={item.status}
                  onChange={(e) =>
                    onUpdatePracticeTopic({
                      ...item,
                      status: e.target.value as ChapterStatus,
                    })
                  }
                  className="border border-[#262626] bg-[#111111] px-2.5 py-1 text-xs text-white"
                >
                  {['Not Started', 'In Progress', 'Completed', 'Needs Revision', 'Strong'].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    onUpdatePracticeTopic({
                      ...item,
                      practiceCount: item.practiceCount + 1,
                      lastPracticedDate: activeDate,
                      status: item.status === 'Not Started' ? 'In Progress' : item.status,
                    })
                  }
                  className="border border-[#262626] px-2.5 py-1 text-xs font-mono text-white hover:border-white tabular-nums whitespace-nowrap"
                >
                  +1 Practice ({item.practiceCount})
                </button>

                <button
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => onDeletePracticeTopic(item.id)}
                  className="p-1.5 text-[#555555] hover:text-white"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#262626] pb-6">
        <div>
          <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
            ICSE Class 10 Authoritative Master Syllabus · {stats.totalPortions} Chapters
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
            Syllabus &amp; Progress
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowAddChapter(!showAddChapter)}
          className="self-start sm:self-auto flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Chapter</span>
        </button>
      </div>

      {/* Authoritative File Conflict & Audit Notice */}
      <section
        aria-label="Syllabus and difficulty audit notes"
        className="border border-[#262626] bg-[#0A0A0A]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <button
            type="button"
            aria-expanded={auditExpanded}
            data-testid="toggle-syllabus-audit"
            onClick={() => setAuditExpanded((v) => !v)}
            className="flex items-center gap-2.5 text-left"
          >
            {auditExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#858585]" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#858585]" aria-hidden="true" />
            )}
            <AlertTriangle className="w-3.5 h-3.5 text-[#858585]" aria-hidden="true" />
            <span className="text-xs font-medium text-white">
              Source File Audit: {SYLLABUS_AUDIT_ISSUES.length} notes detected (chapter time estimates unassigned until chosen)
            </span>
          </button>

          <div className="flex items-center gap-2">
            <label htmlFor="time-standard-select" className="text-xs text-[#858585]">
              Time standard:
            </label>
            <select
              id="time-standard-select"
              value={state.settings.timeEstimateStandard}
              onChange={(e) => onApplyTimeStandard(e.target.value as TimeEstimateStandard)}
              className="border border-[#262626] bg-[#111111] px-2.5 py-1 text-xs text-white"
            >
              <option value="unassigned">Unassigned (keep blank)</option>
              <option value="section1_30_60_90">Section 1 (30 / 60 / 90m)</option>
              <option value="section12_15_45_90">Section 12 (15 / 45 / 75m)</option>
            </select>
          </div>
        </div>

        {auditExpanded && (
          <div className="border-t border-[#262626] divide-y divide-[#262626] bg-black">
            {SYLLABUS_AUDIT_ISSUES.map((issue) => (
              <div key={issue.id} className="px-5 py-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white">{issue.title}</span>
                  <span className="font-mono text-[#555555]">{issue.source}</span>
                </div>
                <p className="text-[#858585] leading-relaxed">{issue.details}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Chapter Drawer/Inline Form */}
      {showAddChapter && (
        <form
          onSubmit={handleCreateChapter}
          className="border border-[#262626] bg-[#0A0A0A] p-5 space-y-4"
        >
          <div className="text-sm font-medium text-white">Add Custom Syllabus Portion</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              aria-label="New chapter subject"
              value={newSubj}
              onChange={(e) => setNewSubj(e.target.value as SubjectId)}
              className="border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white"
            >
              {SUBJECTS.filter((s) => s.hasChapters).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Code (e.g. MAT-28)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white font-mono"
            />
            <input
              type="text"
              placeholder="Chapter name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="sm:col-span-2 border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                aria-label="Chapter difficulty"
                value={newDiff}
                onChange={(e) => setNewDiff(e.target.value as ChapterDifficulty)}
                className="border border-[#262626] bg-[#111111] px-3 py-1.5 text-xs text-white"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Not rated">Not rated</option>
              </select>
              {newSubj === 'history_civics' && (
                <select
                  aria-label="History or Civics subcategory"
                  value={newSubCat}
                  onChange={(e) => setNewSubCat(e.target.value as 'History' | 'Civics')}
                  className="border border-[#262626] bg-[#111111] px-3 py-1.5 text-xs text-white"
                >
                  <option value="History">History</option>
                  <option value="Civics">Civics</option>
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddChapter(false)}
                className="border border-[#262626] px-3 py-1.5 text-xs text-[#858585] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black px-4 py-1.5 text-xs font-semibold"
              >
                Save Chapter
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Overall Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[#262626] border border-[#262626]">
        <div className="bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#858585]">Master Portions</div>
          <div data-testid="syllabus-total-count" className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
            {stats.totalPortions}
          </div>
        </div>
        <div className="bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#858585]">Completed / Strong</div>
          <div data-testid="syllabus-completed-count" className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
            {stats.completedPortions}
            <span className="ml-1.5 text-xs text-[#858585]">
              ({stats.overallCompletionPercent}%)
            </span>
          </div>
        </div>
        <div className="bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#858585]">In Progress</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
            {stats.inProgressPortions}
          </div>
        </div>
        <div className="bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#858585]">Weak Flagged</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
            {stats.weakPortions}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-[#0A0A0A] p-4">
          <div className="text-xs text-[#858585]">Unconfirmed</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#858585] tabular-nums">
            {stats.unconfirmedPortions}
          </div>
        </div>
      </div>

      {/* Subject Progress Breakdown */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.bySubject.map((sub) => (
          <button
            key={sub.subjectId}
            type="button"
            onClick={() => setSubjectTab(sub.subjectId)}
            className={`border p-4 text-left ${
              subjectTab === sub.subjectId
                ? 'border-white bg-[#111111]'
                : 'border-[#262626] bg-[#0A0A0A] hover:border-[#404040]'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-medium text-white">
              <span>{sub.subjectName}</span>
              <span className="font-mono text-xs tabular-nums">
                {sub.completed}/{sub.total}
              </span>
            </div>
            <div className="mt-2.5 h-0.5 w-full bg-[#262626]">
              <div
                className="h-full bg-white"
                style={{ width: `${sub.completionPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#858585] font-mono tabular-nums">
              <span>{sub.completionPercent}% ready</span>
              <span>{sub.weak > 0 ? `${sub.weak} weak` : `${sub.practiceDone} practiced`}</span>
            </div>
          </button>
        ))}
      </section>

      {/* Subject Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#262626] pb-3">
        <button
          type="button"
          onClick={() => setSubjectTab('all')}
          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
            subjectTab === 'all'
              ? 'bg-white text-black'
              : 'border border-[#262626] text-[#858585] hover:text-white'
          }`}
        >
          All ({stats.totalPortions})
        </button>
        {SUBJECTS.filter((s) => s.hasChapters).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubjectTab(s.id)}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              subjectTab === s.id
                ? 'bg-white text-black'
                : 'border border-[#262626] text-[#858585] hover:text-white'
            }`}
          >
            {s.shortName}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSubjectTab('practice_trackers')}
          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
            subjectTab === 'practice_trackers'
              ? 'bg-white text-black'
              : 'border border-[#262626] text-[#858585] hover:text-white'
          }`}
        >
          Language &amp; Extra Portions ({state.practiceTopics.length})
        </button>
      </div>

      {/* Practice Trackers & School-Exam Literature Tab */}
      {subjectTab === 'practice_trackers' ? (
        <div className="space-y-6">
          <form
            onSubmit={handleCreatePracticeTopic}
            className="flex flex-wrap items-center gap-3 border border-[#262626] bg-[#0A0A0A] p-4"
          >
            <select
              aria-label="Practice tracker category"
              value={newTopicCategory}
              onChange={(e) =>
                setNewTopicCategory(
                  e.target.value as 'english_language' | 'telugu_practice' | 'extra_literature'
                )
              }
              className="border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white"
            >
              <option value="extra_literature">Extra Literature Portion</option>
              <option value="english_language">English Language Category</option>
              <option value="telugu_practice">Telugu Practice Topic</option>
            </select>
            <input
              type="text"
              placeholder="Add new topic or portion title..."
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              className="flex-1 min-w-48 border border-[#262626] bg-[#111111] px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              className="bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
            >
              Add Topic
            </button>
          </form>

          {renderPracticeSection(
            'School-Exam Julius Caesar Portions',
            'Tracked separately for Pre-Final school coverage (Acts III–V).',
            'extra_literature'
          )}
          {renderPracticeSection(
            'English Language Practice Categories',
            'Practice-task categories (not textbook chapters).',
            'english_language'
          )}
          {renderPracticeSection(
            'Telugu Practice Topics',
            'Morning writing, grammar, prose, and vocabulary drills.',
            'telugu_practice'
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search & Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-[#555555] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search syllabus chapters"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chapter ID, name, or subject..."
                className="w-full border border-[#262626] bg-[#0A0A0A] pl-9 pr-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter syllabus by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-xs text-white focus:border-white focus:outline-none"
            >
              {[
                'All',
                'Not Started',
                'In Progress',
                'Completed',
                'Needs Revision',
                'Strong',
                'Weak',
                'Unconfirmed',
              ].map((st) => (
                <option key={st} value={st}>
                  Status: {st}
                </option>
              ))}
            </select>
          </div>

          {/* Chapters List */}
          {filteredChapters.length === 0 ? (
            <div className="border border-[#262626] bg-[#0A0A0A] p-8 text-center text-sm text-[#858585]">
              No chapters match the current filter.
            </div>
          ) : (
            <div className="border border-[#262626] divide-y divide-[#262626] bg-[#0A0A0A]">
              {filteredChapters.map((ch) => {
                const isNextForSubject = state.nextTopicBySubject?.[ch.subjectId] === ch.id;
                return (
                  <div
                    key={ch.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#111111]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                        <span className="font-mono text-white">{ch.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{SUBJECT_MAP[ch.subjectId]?.name}</span>
                        {ch.subCategory && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{ch.subCategory}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <select
                          aria-label={`Difficulty for ${ch.id}`}
                          value={ch.difficulty}
                          onChange={(e) =>
                            onUpdateChapter({
                              ...ch,
                              difficulty: e.target.value as ChapterDifficulty,
                            })
                          }
                          className="border border-[#262626] bg-black px-1.5 py-0.5 text-[11px] text-white"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                          <option value="Not rated">Not rated</option>
                        </select>
                        <span className="font-mono text-[11px] text-[#555555] tabular-nums">
                          {ch.estimatedMinutes ? `${ch.estimatedMinutes}m` : 'Est. unassigned'}
                        </span>
                        {isNextForSubject && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-white uppercase tracking-wider text-[11px]">
                              Next Focus
                            </span>
                          </>
                        )}
                        {!ch.isStateConfirmed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#555555]">Unconfirmed</span>
                          </>
                        )}
                        {(ch.isWeak || ch.status === 'Weak') && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-white font-medium">Weak</span>
                          </>
                        )}
                        {ch.confidence !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">Conf {ch.confidence}/5</span>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenChapter(ch)}
                        className="mt-1 text-left text-sm sm:text-base font-medium text-white hover:underline"
                      >
                        {ch.chapterName}
                      </button>

                      {((ch.completedParts && ch.completedParts.length > 0) ||
                        (ch.remainingParts && ch.remainingParts.length > 0)) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                          {ch.completedParts && ch.completedParts.length > 0 && (
                            <span className="text-[#A3A3A3]">
                              Done: {ch.completedParts.join(', ')}
                            </span>
                          )}
                          {ch.completedParts &&
                            ch.completedParts.length > 0 &&
                            ch.remainingParts &&
                            ch.remainingParts.length > 0 && (
                              <span className="text-[#404040]">·</span>
                            )}
                          {ch.remainingParts && ch.remainingParts.length > 0 && (
                            <span className="text-white">
                              Pending: {ch.remainingParts.join(', ')}
                            </span>
                          )}
                        </div>
                      )}

                      {(ch.lastStudiedDate || ch.revisionDueDate) && (
                        <div className="mt-0.5 text-[11px] font-mono text-[#555555] tabular-nums">
                          {ch.lastStudiedDate &&
                            `Studied ${formatDisplayDate(ch.lastStudiedDate, false)}`}
                          {ch.lastStudiedDate && ch.revisionDueDate && ' · '}
                          {ch.revisionDueDate &&
                            `Next rev ${formatDisplayDate(ch.revisionDueDate, false)}`}
                        </div>
                      )}
                    </div>

                    {/* Unified Hairline Segmented Action Bar */}
                    <div className="inline-flex flex-wrap items-center divide-x divide-[#262626] border border-[#262626] bg-black shrink-0 self-start lg:self-center">
                      <button
                        type="button"
                        aria-label={`Set ${ch.id} as next chapter for ${SUBJECT_MAP[ch.subjectId]?.shortName}`}
                        onClick={() =>
                          onSetNextTopic(ch.subjectId, isNextForSubject ? null : ch.id)
                        }
                        className={`px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                          isNextForSubject
                            ? 'bg-[#171717] text-white font-medium'
                            : 'text-[#858585] hover:text-white'
                        }`}
                      >
                        {isNextForSubject ? 'Next ✓' : 'Set Next'}
                      </button>
                      {(
                        ['Completed', 'In Progress', 'Weak', 'Strong'] as const
                      ).map((action) => {
                        const isActive =
                          (action === 'Weak' && (ch.isWeak || ch.status === 'Weak')) ||
                          (action !== 'Weak' && ch.status === action && ch.isStateConfirmed);
                        return (
                          <button
                            key={action}
                            type="button"
                            aria-label={`Set ${ch.id} to ${action}`}
                            onClick={() => onQuickStatus(ch.id, action)}
                            className={`px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                              isActive
                                ? 'bg-white text-black font-semibold'
                                : 'text-[#858585] hover:text-white'
                            }`}
                          >
                            {action}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => onOpenChapter(ch)}
                        className="px-2.5 py-1.5 text-xs text-white hover:bg-[#171717] whitespace-nowrap"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
