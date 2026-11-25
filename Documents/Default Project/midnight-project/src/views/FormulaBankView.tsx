import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Layers,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { MathRenderer } from '../components/MathRenderer';
import { SUBJECT_MAP, SUBJECTS } from '../data/seed';
import { AppState, FormulaItem, SubjectId } from '../types/study';

interface FormulaBankViewProps {
  state: AppState;
  onAddFormula: (formula: FormulaItem) => void;
  onUpdateFormula: (formula: FormulaItem) => void;
  onDeleteFormula: (formulaId: string) => void;
}

const LATEX_SNIPPETS = [
  { label: 'a/b', snippet: '\\frac{a}{b}' },
  { label: '√x', snippet: '\\sqrt{x}' },
  { label: 'x²', snippet: 'x^{2}' },
  { label: 'xₙ', snippet: 'x_{n}' },
  { label: 'θ', snippet: '\\theta' },
  { label: 'π', snippet: '\\pi' },
  { label: 'Δ', snippet: '\\Delta' },
  { label: 'α', snippet: '\\alpha' },
  { label: 'β', snippet: '\\beta' },
  { label: 'λ', snippet: '\\lambda' },
  { label: 'Ω', snippet: '\\Omega' },
  { label: '±', snippet: '\\pm' },
];

export const FormulaBankView: React.FC<FormulaBankViewProps> = ({
  state,
  onAddFormula,
  onUpdateFormula,
  onDeleteFormula,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Mastered' | 'Needs Revision' | 'favorites'>('all');

  const [editingFormula, setEditingFormula] = useState<FormulaItem | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // Editor state
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState<SubjectId>('mathematics');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [latex, setLatex] = useState('');
  const [symbols, setSymbols] = useState('');
  const [example, setExample] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'Mastered' | 'Needs Revision'>('Needs Revision');
  const [favorite, setFavorite] = useState(false);
  const [formError, setFormError] = useState('');

  // Flashcard mode
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const filteredFormulas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.formulas.filter((f) => {
      if (subjectFilter !== 'all' && f.subjectId !== subjectFilter) return false;
      if (statusFilter === 'favorites' && !f.favorite) return false;
      if (
        (statusFilter === 'Mastered' || statusFilter === 'Needs Revision') &&
        f.status !== statusFilter
      ) {
        return false;
      }
      if (q) {
        return (
          f.name.toLowerCase().includes(q) ||
          f.chapter.toLowerCase().includes(q) ||
          f.topic.toLowerCase().includes(q) ||
          f.latex.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.formulas, searchQuery, subjectFilter, statusFilter]);

  const openNewEditor = () => {
    setEditingFormula(null);
    setName('');
    setSubjectId('mathematics');
    setChapter('');
    setTopic('');
    setLatex('');
    setSymbols('');
    setExample('');
    setNotes('');
    setStatus('Needs Revision');
    setFavorite(false);
    setFormError('');
    setShowEditor(true);
  };

  const openEditEditor = (f: FormulaItem) => {
    setEditingFormula(f);
    setName(f.name);
    setSubjectId(f.subjectId);
    setChapter(f.chapter);
    setTopic(f.topic);
    setLatex(f.latex);
    setSymbols(f.symbols);
    setExample(f.example);
    setNotes(f.notes);
    setStatus(f.status);
    setFavorite(f.favorite);
    setFormError('');
    setShowEditor(true);
  };

  const handleDuplicate = (f: FormulaItem) => {
    const now = new Date().toISOString();
    onAddFormula({
      ...f,
      id: `fml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${f.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !latex.trim()) {
      setFormError('Formula name and LaTeX expression are required.');
      return;
    }

    const now = new Date().toISOString();
    if (editingFormula) {
      onUpdateFormula({
        ...editingFormula,
        name: name.trim(),
        subjectId,
        chapter: chapter.trim(),
        topic: topic.trim(),
        latex: latex.trim(),
        symbols: symbols.trim(),
        example: example.trim(),
        notes: notes.trim(),
        status,
        favorite,
        updatedAt: now,
      });
    } else {
      onAddFormula({
        id: `fml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        name: name.trim(),
        subjectId,
        chapter: chapter.trim(),
        topic: topic.trim(),
        latex: latex.trim(),
        symbols: symbols.trim(),
        example: example.trim(),
        notes: notes.trim(),
        status,
        favorite,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShowEditor(false);
  };

  const subjectChapters = state.chapters.filter((c) => c.subjectId === subjectId);
  const currentCard = filteredFormulas[cardIndex % Math.max(1, filteredFormulas.length)];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#262626] pb-6">
        <div>
          <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
            Personal LaTeX Reference Library
          </div>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-white">
            Formula Bank
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filteredFormulas.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFlashcardMode(!flashcardMode);
                setCardIndex(0);
                setCardFlipped(false);
              }}
              className={`flex items-center gap-1.5 border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                flashcardMode
                  ? 'border-white bg-white text-black'
                  : 'border-[#262626] bg-[#0A0A0A] text-[#858585] hover:text-white hover:border-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{flashcardMode ? 'Exit Flashcards' : 'Flashcard Review'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={openNewEditor}
            className="flex items-center gap-1.5 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Formula</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[#555555] absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search formulas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search formula name, chapter, topic, or LaTeX..."
            className="w-full border border-[#262626] bg-[#0A0A0A] pl-9 pr-3 py-2 text-sm text-white placeholder:text-[#555555] focus:border-white focus:outline-none"
          />
        </div>

        <select
          aria-label="Filter formulas by subject"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
        >
          <option value="all">All Subjects</option>
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter formulas by status"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as 'all' | 'Mastered' | 'Needs Revision' | 'favorites'
            )
          }
          className="border border-[#262626] bg-[#0A0A0A] px-3 py-2 text-xs text-white"
        >
          <option value="all">All Statuses</option>
          <option value="Needs Revision">Needs Revision</option>
          <option value="Mastered">Mastered</option>
          <option value="favorites">Favorites Only</option>
        </select>
      </div>

      {/* Flashcard Quick Review Mode */}
      {flashcardMode && currentCard && (
        <section className="border border-[#262626] bg-[#0A0A0A] p-6 sm:p-10 space-y-6">
          <div className="flex items-center justify-between text-xs font-mono text-[#858585]">
            <span>
              FLASHCARD {(cardIndex % filteredFormulas.length) + 1} / {filteredFormulas.length}
            </span>
            <span>
              {SUBJECT_MAP[currentCard.subjectId]?.name}
              {currentCard.chapter ? ` · ${currentCard.chapter}` : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCardFlipped(!cardFlipped)}
            className="w-full min-h-56 border border-[#262626] bg-[#111111] p-8 flex flex-col items-center justify-center text-center hover:border-[#404040] transition-colors"
          >
            {!cardFlipped ? (
              <div>
                <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
                  {currentCard.topic || 'Tap to reveal formula'}
                </div>
                <div className="mt-3 font-display text-2xl sm:text-3xl font-semibold text-white">
                  {currentCard.name}
                </div>
                <div className="mt-4 text-xs text-[#555555]">Click card to flip</div>
              </div>
            ) : (
              <div className="w-full space-y-4">
                <MathRenderer latex={currentCard.latex} />
                {currentCard.symbols && (
                  <p className="text-xs text-[#858585] max-w-xl mx-auto">
                    {currentCard.symbols}
                  </p>
                )}
                {currentCard.example && (
                  <p className="text-xs font-mono text-[#555555] max-w-xl mx-auto">
                    Example: {currentCard.example}
                  </p>
                )}
              </div>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCardIndex((prev) =>
                    prev === 0 ? filteredFormulas.length - 1 : prev - 1
                  );
                  setCardFlipped(false);
                }}
                className="flex items-center gap-1 border border-[#262626] px-3 py-2 text-xs text-white hover:border-white"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCardIndex((prev) => (prev + 1) % filteredFormulas.length);
                  setCardFlipped(false);
                }}
                className="flex items-center gap-1 border border-[#262626] px-3 py-2 text-xs text-white hover:border-white"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateFormula({ ...currentCard, status: 'Needs Revision' })
                }
                className={`border px-3 py-2 text-xs ${
                  currentCard.status === 'Needs Revision'
                    ? 'border-white bg-white text-black font-semibold'
                    : 'border-[#262626] text-[#858585] hover:text-white'
                }`}
              >
                Needs Revision
              </button>
              <button
                type="button"
                onClick={() => onUpdateFormula({ ...currentCard, status: 'Mastered' })}
                className={`border px-3 py-2 text-xs ${
                  currentCard.status === 'Mastered'
                    ? 'border-white bg-white text-black font-semibold'
                    : 'border-[#262626] text-[#858585] hover:text-white'
                }`}
              >
                Mastered
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Formula List or Empty State */}
      {!flashcardMode && (
        <>
          {state.formulas.length === 0 ? (
            <div className="border border-[#262626] bg-[#0A0A0A] p-12 text-center">
              <h2 className="font-display text-xl font-semibold text-white">
                Your Formula Bank is empty
              </h2>
              <p className="mt-2 max-w-md mx-auto text-sm text-[#858585]">
                No fabricated formulas are preloaded. Add your own Mathematics, Physics, or Chemistry formulas with full LaTeX rendering for fractions, roots, and Greek symbols.
              </p>
              <button
                type="button"
                onClick={openNewEditor}
                className="mt-5 inline-flex items-center gap-1.5 bg-white text-black px-5 py-2.5 text-xs font-semibold hover:bg-[#D4D4D4] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Your First Formula</span>
              </button>
            </div>
          ) : filteredFormulas.length === 0 ? (
            <div className="border border-[#262626] bg-[#0A0A0A] p-8 text-center text-sm text-[#858585]">
              No formulas match your search or filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFormulas.map((f) => (
                <article
                  key={f.id}
                  data-testid="formula-card"
                  className="border border-[#262626] bg-[#0A0A0A] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#858585]">
                          <span>{SUBJECT_MAP[f.subjectId]?.name}</span>
                          {f.chapter && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{f.chapter}</span>
                            </>
                          )}
                          {f.topic && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{f.topic}</span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-1 font-display text-lg font-semibold text-white">
                          {f.name}
                        </h3>
                      </div>

                      <button
                        type="button"
                        aria-label={f.favorite ? `Unfavorite ${f.name}` : `Favorite ${f.name}`}
                        onClick={() => onUpdateFormula({ ...f, favorite: !f.favorite })}
                        className="p-1 text-[#858585] hover:text-white"
                      >
                        <Star
                          className="w-4 h-4"
                          fill={f.favorite ? '#FFFFFF' : 'none'}
                        />
                      </button>
                    </div>

                    <div className="mt-4 bg-[#111111] px-4 py-3.5">
                      <MathRenderer latex={f.latex} />
                    </div>

                    {f.symbols && (
                      <div className="mt-3 text-xs text-[#858585]">
                        <span className="text-[#555555]">Symbols: </span>
                        {f.symbols}
                      </div>
                    )}
                    {f.example && (
                      <div className="mt-1.5 text-xs text-[#858585]">
                        <span className="text-[#555555]">Example: </span>
                        {f.example}
                      </div>
                    )}
                    {f.notes && (
                      <div className="mt-1.5 text-xs text-[#555555]">{f.notes}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#262626]">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFormula({
                          ...f,
                          status: f.status === 'Mastered' ? 'Needs Revision' : 'Mastered',
                        })
                      }
                      className={`border px-2.5 py-1 text-xs transition-colors whitespace-nowrap ${
                        f.status === 'Mastered'
                          ? 'border-white bg-white text-black font-medium'
                          : 'border-[#262626] text-[#858585] hover:text-white'
                      }`}
                    >
                      {f.status}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Duplicate ${f.name}`}
                        onClick={() => handleDuplicate(f)}
                        className="p-1.5 text-[#555555] hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${f.name}`}
                        onClick={() => openEditEditor(f)}
                        className="p-1.5 text-[#555555] hover:text-white"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${f.name}`}
                        onClick={() => onDeleteFormula(f.id)}
                        className="p-1.5 text-[#555555] hover:text-white"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Formula Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="formula-editor-title"
            className="w-full max-w-xl border border-[#262626] bg-[#0A0A0A] p-6 max-h-[90vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <h2 id="formula-editor-title" className="font-display text-xl font-semibold text-white">
                {editingFormula ? 'Edit Formula' : 'Add Formula'}
              </h2>
              <button
                type="button"
                aria-label="Close formula editor"
                onClick={() => setShowEditor(false)}
                className="p-1 text-[#858585] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fml-name" className="block text-xs text-[#858585] mb-1">
                  Formula Name
                </label>
                <input
                  id="fml-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFormError('');
                  }}
                  placeholder="e.g., Quadratic Formula"
                  className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="fml-subject" className="block text-xs text-[#858585] mb-1">
                  Subject
                </label>
                <select
                  id="fml-subject"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value as SubjectId)}
                  className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fml-chapter" className="block text-xs text-[#858585] mb-1">
                  Chapter
                </label>
                <input
                  id="fml-chapter"
                  list="formula-chapter-suggestions"
                  type="text"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder="e.g., Quadratic Equations"
                  className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                />
                <datalist id="formula-chapter-suggestions">
                  {subjectChapters.map((c) => (
                    <option key={c.id} value={`${c.id} · ${c.chapterName}`} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="fml-topic" className="block text-xs text-[#858585] mb-1">
                  Topic
                </label>
                <input
                  id="fml-topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Roots of equation"
                  className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="fml-latex" className="text-xs text-[#858585]">
                  LaTeX Formula
                </label>
                <span className="text-[11px] font-mono text-[#555555]">Live KaTeX preview</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {LATEX_SNIPPETS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setLatex((prev) => `${prev}${prev ? ' ' : ''}${s.snippet}`)}
                    className="border border-[#262626] bg-[#111111] px-2 py-1 text-xs font-mono text-[#858585] hover:text-white hover:border-white"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <textarea
                id="fml-latex"
                rows={2}
                value={latex}
                onChange={(e) => {
                  setLatex(e.target.value);
                  setFormError('');
                }}
                placeholder="e.g., x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white font-mono focus:border-white focus:outline-none"
              />
              <div className="mt-2 border border-[#262626] bg-black px-4 py-3 min-h-14 flex items-center justify-center">
                <MathRenderer latex={latex} />
              </div>
            </div>

            <div>
              <label htmlFor="fml-symbols" className="block text-xs text-[#858585] mb-1">
                Symbol Meanings
              </label>
              <input
                id="fml-symbols"
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="e.g., a, b, c = coefficients of ax^2 + bx + c = 0"
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fml-example" className="block text-xs text-[#858585] mb-1">
                Example / Application
              </label>
              <input
                id="fml-example"
                type="text"
                value={example}
                onChange={(e) => setExample(e.target.value)}
                placeholder="e.g., Used when middle-term splitting is not integral"
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label htmlFor="fml-status" className="block text-xs text-[#858585] mb-1">
                  Mastery Status
                </label>
                <select
                  id="fml-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'Mastered' | 'Needs Revision')
                  }
                  className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white"
                >
                  <option value="Needs Revision">Needs Revision</option>
                  <option value="Mastered">Mastered</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-white pt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                  className="w-4 h-4 accent-white"
                />
                <span>Mark as Favorite</span>
              </label>
            </div>

            <div>
              <label htmlFor="fml-notes" className="block text-xs text-[#858585] mb-1">
                Notes
              </label>
              <input
                id="fml-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Units, edge cases, or sign conventions..."
                className="w-full border border-[#262626] bg-[#111111] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              />
            </div>

            {formError && (
              <p className="text-xs text-white border border-[#404040] bg-[#111111] px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[#262626]">
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="border border-[#262626] px-4 py-2 text-xs text-[#858585] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black px-5 py-2 text-xs font-semibold hover:bg-[#D4D4D4]"
              >
                {editingFormula ? 'Save Formula' : 'Add Formula'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
