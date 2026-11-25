import type {
  AppState,
  ChapterDifficulty,
  ChapterItem,
  ExamItem,
  PracticeTopicItem,
  ScheduleSettings,
  SubjectId,
  SubjectMeta,
  SyllabusAuditIssue,
  TimeEstimateStandard,
} from '../types/study.ts';
import { BASELINE_DATE } from '../utils/date.ts';

export const SUBJECTS: SubjectMeta[] = [
  { id: 'mathematics', name: 'Mathematics', shortName: 'Math', hasChapters: true },
  { id: 'physics', name: 'Physics', shortName: 'Physics', hasChapters: true },
  { id: 'chemistry', name: 'Chemistry', shortName: 'Chem', hasChapters: true },
  { id: 'biology', name: 'Biology', shortName: 'Bio', hasChapters: true },
  { id: 'history_civics', name: 'History & Civics', shortName: 'Hist/Civ', hasChapters: true },
  { id: 'geography', name: 'Geography', shortName: 'Geog', hasChapters: true },
  { id: 'commercial_applications', name: 'Commercial Applications', shortName: 'Comm App', hasChapters: true },
  { id: 'english_literature', name: 'English Literature', shortName: 'Eng Lit', hasChapters: true },
  { id: 'english_language', name: 'English Language', shortName: 'Eng Lang', hasChapters: false },
  { id: 'telugu', name: 'Telugu', shortName: 'Telugu', hasChapters: true },
];

export const SUBJECT_MAP: Record<SubjectId, SubjectMeta> = SUBJECTS.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<SubjectId, SubjectMeta>
);

export const INITIAL_EXAMS: ExamItem[] = [
  { id: 'exam-eng-lang', subjectId: 'english_language', subjectName: 'English Language', date: '2026-12-09', startTime: '09:00', notes: 'First Pre-Final Examination' },
  { id: 'exam-eng-lit', subjectId: 'english_literature', subjectName: 'English Literature', date: '2026-12-10', startTime: '09:00', notes: 'Includes extra school-exam portions' },
  { id: 'exam-math', subjectId: 'mathematics', subjectName: 'Mathematics', date: '2026-12-11', startTime: '09:00', notes: '2h 30m paper · Show all working steps' },
  { id: 'exam-bio', subjectId: 'biology', subjectName: 'Biology', date: '2026-12-14', startTime: '09:00', notes: 'Diagrams & physiological processes' },
  { id: 'exam-geo', subjectId: 'geography', subjectName: 'Geography', date: '2026-12-15', startTime: '09:00', notes: 'Topographical map + India map + units' },
  { id: 'exam-che', subjectId: 'chemistry', subjectName: 'Chemistry', date: '2026-12-16', startTime: '09:00', notes: 'Balanced equations, practical work, observations' },
  { id: 'exam-his', subjectId: 'history_civics', subjectName: 'History & Civics', date: '2026-12-17', startTime: '09:00', notes: 'Combined History (15) & Civics (6)' },
  { id: 'exam-com', subjectId: 'commercial_applications', subjectName: 'Commercial Applications', date: '2026-12-18', startTime: '09:00', notes: 'Case-based & structured answers' },
  { id: 'exam-tel', subjectId: 'telugu', subjectName: 'Telugu', date: '2026-12-19', startTime: '09:00', notes: 'Prose, poetry, grammar & writing' },
  { id: 'exam-phy', subjectId: 'physics', subjectName: 'Physics', date: '2026-12-21', startTime: '09:00', notes: 'Final Pre-Final exam · Numericals & ray diagrams' },
];

export const SYLLABUS_AUDIT_ISSUES: SyllabusAuditIssue[] = [
  {
    id: 'conflict-time-estimates',
    title: 'Conflicting time estimates inside the Difficulty Assessment file',
    details:
      'Section 1 lists Easy: 30m, Medium: 60m, Hard: 90m, whereas Section 12 lists Easy: 15m, Medium: 30–45m, Hard: 60–90m. Chapter minute estimates are left unassigned until you select a standard or edit individual chapters.',
    source: 'CLASS 10 ICSE – COMPLETE CHAPTER DIFFICULTY ASSESSMENT',
  },
  {
    id: 'conflict-phys-bio-counts',
    title: 'Summary count mismatch in Physics & Biology sections',
    details:
      'Physics header lists 5 Easy / 3 Medium / 4 Hard while its chapter-wise ratings list 4 Easy / 3 Medium / 5 Hard. Biology header lists 6 Easy / 5 Medium / 5 Hard while its chapter-wise ratings list 5 Easy / 5 Medium / 6 Hard. Individual chapter ratings from each chapter line were preserved as written.',
    source: 'Sections 4, 5 & 12',
  },
  {
    id: 'note-telugu-06',
    title: 'Telugu chapter 6 wording needs syllabus verification',
    details:
      'Section 11 notes that "తాత్మీత్రి ..." is preserved as recorded and may need verification against your textbook syllabus.',
    source: 'Section 11 (Telugu)',
  },
];

export function getEstimatedMinutesForStandard(
  difficulty: ChapterDifficulty,
  standard: TimeEstimateStandard
): number | null {
  if (standard === 'unassigned' || difficulty === 'Not rated') return null;
  if (standard === 'section1_30_60_90') {
    if (difficulty === 'Easy') return 30;
    if (difficulty === 'Medium') return 60;
    return 90;
  }
  // section12_15_45_90
  if (difficulty === 'Easy') return 15;
  if (difficulty === 'Medium') return 45;
  return 75;
}

function makeChapter(
  id: string,
  subjectId: SubjectId,
  chapterName: string,
  difficulty: ChapterDifficulty,
  subCategory?: 'History' | 'Civics',
  overrides?: Partial<ChapterItem>
): ChapterItem {
  return {
    id,
    subjectId,
    ...(subCategory ? { subCategory } : {}),
    chapterName,
    status: 'Not Started',
    isWeak: false,
    isStateConfirmed: false,
    confidence: null,
    lastStudiedDate: null,
    lastRevision: null,
    revisionDueDate: null,
    mistakes: '',
    practiceStatus: 'Not Started',
    answerWritingStatus: 'Not Started',
    notes: '',
    plannedStudyDate: null,
    difficulty,
    estimatedMinutes: null, // Unassigned until user chooses Section 1, Section 12, or custom
    ...overrides,
  };
}

/**
 * Exact 138 authoritative chapters from "### Mathematics.txt" and
 * "CLASS 10 ICSE – COMPLETE CHAPTER DIFFICULTY ASSESSMENT".
 */
export const INITIAL_CHAPTERS: ChapterItem[] = [
  // MATHEMATICS (27)
  makeChapter('MAT-01', 'mathematics', 'Goods and Services Tax (G.S.T.)', 'Medium'),
  makeChapter('MAT-02', 'mathematics', 'Banking', 'Easy'),
  makeChapter('MAT-03', 'mathematics', 'Shares and Dividend', 'Medium'),
  makeChapter('MAT-04', 'mathematics', 'Linear Inequations', 'Medium'),
  makeChapter('MAT-05', 'mathematics', 'Quadratic Equations', 'Medium'),
  makeChapter('MAT-06', 'mathematics', 'Problems on Quadratic Equations', 'Hard'),
  makeChapter('MAT-07', 'mathematics', 'Ratio and Proportion', 'Medium'),
  makeChapter('MAT-08', 'mathematics', 'Remainder Theorem and Factor Theorem', 'Easy'),
  makeChapter('MAT-09', 'mathematics', 'Matrices', 'Easy'),
  makeChapter('MAT-10', 'mathematics', 'Arithmetic Progression', 'Medium'),
  makeChapter('MAT-11', 'mathematics', 'Geometric Progression', 'Medium'),
  makeChapter('MAT-12', 'mathematics', 'Reflection', 'Easy'),
  makeChapter('MAT-13', 'mathematics', 'Section and Mid-point Formulae', 'Medium'),
  makeChapter('MAT-14', 'mathematics', 'Equation of a Straight Line', 'Hard'),
  makeChapter('MAT-15', 'mathematics', 'Similarity (As a Size Transformation)', 'Hard'),
  makeChapter('MAT-16', 'mathematics', 'Similarity of Triangles', 'Hard'),
  makeChapter('MAT-17', 'mathematics', 'Loci', 'Easy'),
  makeChapter('MAT-18', 'mathematics', 'Angle and Cyclic Properties of a Circle', 'Hard'),
  makeChapter('MAT-19', 'mathematics', 'Tangent Properties of Circles', 'Hard'),
  makeChapter('MAT-20', 'mathematics', 'Constructions', 'Easy'),
  // Mensuration preloaded as Completed
  makeChapter('MAT-21', 'mathematics', 'Volume and Surface Area of Solids', 'Hard', undefined, {
    status: 'Completed',
    isStateConfirmed: true,
    confidence: 4,
    lastStudiedDate: '2026-11-20',
    practiceStatus: 'Done',
    notes: 'Mensuration completed prior to 24 Nov baseline.',
  }),
  // Trigonometry preloaded as current focus
  makeChapter('MAT-22', 'mathematics', 'Trigonometrical Identities', 'Hard', undefined, {
    status: 'In Progress',
    isStateConfirmed: true,
    confidence: 3,
    practiceStatus: 'In Progress',
    notes: 'Current focus: Trigonometry identity proofs.',
  }),
  makeChapter('MAT-23', 'mathematics', 'Heights and Distances', 'Hard', undefined, {
    status: 'In Progress',
    isStateConfirmed: true,
    confidence: 3,
    practiceStatus: 'In Progress',
    notes: 'Current focus: Trigonometry angle of elevation/depression problems.',
  }),
  makeChapter('MAT-24', 'mathematics', 'Graphical Representation of Statistical Data', 'Easy'),
  makeChapter('MAT-25', 'mathematics', 'Measures of Central Tendency (Mean)', 'Easy'),
  makeChapter('MAT-26', 'mathematics', 'Median, Quartiles and Mode', 'Easy'),
  makeChapter('MAT-27', 'mathematics', 'Probability', 'Easy'),

  // PHYSICS (12)
  makeChapter('PHY-01', 'physics', 'Force', 'Easy'),
  makeChapter('PHY-02', 'physics', 'Work, Energy and Power', 'Medium'),
  makeChapter('PHY-03', 'physics', 'Machines', 'Easy'),
  makeChapter('PHY-04', 'physics', 'Refraction of Light at Plane Surfaces', 'Medium'),
  makeChapter('PHY-05', 'physics', 'Refraction through a Lens', 'Medium'),
  makeChapter('PHY-06', 'physics', 'Spectrum', 'Easy'),
  makeChapter('PHY-07', 'physics', 'Sound', 'Easy'),
  makeChapter('PHY-08', 'physics', 'Current Electricity', 'Hard'),
  makeChapter('PHY-09', 'physics', 'Household Circuits', 'Hard'),
  makeChapter('PHY-10', 'physics', 'Electro-magnetism', 'Hard'),
  makeChapter('PHY-11', 'physics', 'Calorimetry', 'Hard'),
  makeChapter('PHY-12', 'physics', 'Radioactivity', 'Hard'),

  // COMMERCIAL APPLICATIONS (12)
  makeChapter('COM-01', 'commercial_applications', 'Markets and Marketing', 'Medium'),
  makeChapter('COM-02', 'commercial_applications', 'Marketing Mix - 4 Ps', 'Medium'),
  makeChapter('COM-03', 'commercial_applications', 'Advertising and Brand Promotion', 'Medium'),
  makeChapter('COM-04', 'commercial_applications', 'Sales and Selling Process', 'Medium'),
  makeChapter('COM-05', 'commercial_applications', 'Generally Accepted Accounting Principles (GAAP)', 'Medium'),
  makeChapter('COM-06', 'commercial_applications', 'Financial Accounting and Reporting', 'Medium'),
  makeChapter('COM-07', 'commercial_applications', 'Banking and Bank Transactions', 'Hard'),
  makeChapter('COM-08', 'commercial_applications', 'Fundamental Concepts of Cost', 'Medium'),
  makeChapter('COM-09', 'commercial_applications', 'Importance of Human Resources', 'Hard'),
  makeChapter('COM-10', 'commercial_applications', 'Recruitment, Selection and Training', 'Hard'),
  makeChapter('COM-11', 'commercial_applications', 'Public Relations', 'Hard'),
  makeChapter('COM-12', 'commercial_applications', 'Issues of the Environment', 'Medium'),

  // BIOLOGY (16)
  makeChapter('BIO-01', 'biology', 'Cell - The Structural and Functional Unit of Life', 'Easy'),
  makeChapter('BIO-02', 'biology', 'Structure of Chromosomes, Cell Cycle and Cell Division', 'Medium'),
  makeChapter('BIO-03', 'biology', 'Genetics - Some Basic Fundamentals', 'Easy'),
  makeChapter('BIO-04', 'biology', 'Absorption by Roots - The Processes Involved', 'Medium'),
  makeChapter('BIO-05', 'biology', 'Transpiration', 'Easy'),
  makeChapter('BIO-06', 'biology', 'Photosynthesis', 'Medium'),
  makeChapter('BIO-07', 'biology', 'Chemical Coordination in Plants', 'Hard'),
  makeChapter('BIO-08', 'biology', 'The Circulatory System', 'Easy'),
  makeChapter('BIO-09', 'biology', 'The Excretory System', 'Easy'),
  makeChapter('BIO-10', 'biology', 'The Nervous System', 'Medium'),
  makeChapter('BIO-11', 'biology', 'Sense Organs', 'Hard'),
  makeChapter('BIO-12', 'biology', 'The Endocrine System', 'Medium'),
  makeChapter('BIO-13', 'biology', 'The Reproductive System', 'Hard'),
  makeChapter('BIO-14', 'biology', 'Human Evolution', 'Hard'),
  makeChapter('BIO-15', 'biology', 'Population - The Increasing Numbers and Rising Problems', 'Hard'),
  makeChapter('BIO-16', 'biology', 'Pollution - A Rising Environmental Problem', 'Hard'),

  // GEOGRAPHY (17)
  makeChapter('GEO-01', 'geography', 'Essentials of Map Reading', 'Easy'),
  makeChapter('GEO-02', 'geography', 'Representation of Relief', 'Easy'),
  makeChapter('GEO-03', 'geography', 'Topographical Maps', 'Easy'),
  makeChapter('GEO-04', 'geography', 'Interpretation of Topographical Maps', 'Easy'),
  makeChapter('GEO-05', 'geography', 'Exercise on Survey Maps', 'Easy'),
  makeChapter('GEO-06', 'geography', 'India : Location, Extent and Physical Features', 'Easy'),
  makeChapter('GEO-07', 'geography', 'Climate', 'Medium'),
  makeChapter('GEO-08', 'geography', 'Soil Resources', 'Easy'),
  makeChapter('GEO-09', 'geography', 'Natural Vegetation', 'Easy'),
  makeChapter('GEO-10', 'geography', 'Water Resources', 'Easy'),
  makeChapter('GEO-11', 'geography', 'Minerals and Energy Resources', 'Hard'),
  makeChapter('GEO-12', 'geography', 'Agriculture - I (Food Crops)', 'Medium'),
  makeChapter('GEO-13', 'geography', 'Agriculture - II (Cash Crops)', 'Medium'),
  makeChapter('GEO-14', 'geography', 'Manufacturing Industries (Agro Based)', 'Medium'),
  makeChapter('GEO-15', 'geography', 'Manufacturing Industries (Mineral Based)', 'Hard'),
  makeChapter('GEO-16', 'geography', 'Transport', 'Medium'),
  makeChapter('GEO-17', 'geography', 'Waste Management', 'Medium'),

  // CHEMISTRY (13)
  makeChapter('CHE-01', 'chemistry', 'Periodic Table, Periodic Properties and Variations of Properties', 'Medium'),
  makeChapter('CHE-02', 'chemistry', 'Chemical Bonding', 'Medium'),
  makeChapter('CHE-03', 'chemistry', 'Acids, Bases and Salts', 'Hard'),
  makeChapter('CHE-04', 'chemistry', 'Analytical Chemistry', 'Easy'),
  makeChapter('CHE-05', 'chemistry', 'Mole Concept and Stoichiometry', 'Hard'),
  makeChapter('CHE-06', 'chemistry', 'Electrolysis', 'Hard'),
  makeChapter('CHE-07', 'chemistry', 'Metallurgy', 'Hard'),
  makeChapter('CHE-08', 'chemistry', 'Study of Compounds A. Hydrogen Chloride', 'Medium'),
  makeChapter('CHE-09', 'chemistry', 'Study of Compounds B. Ammonia', 'Medium'),
  makeChapter('CHE-10', 'chemistry', 'Study of Compounds C. Nitric Acid', 'Medium'),
  makeChapter('CHE-11', 'chemistry', 'Study of Compounds D. Sulphuric Acid', 'Medium'),
  makeChapter('CHE-12', 'chemistry', 'Organic Chemistry', 'Hard'),
  makeChapter('CHE-13', 'chemistry', 'Practical Work', 'Easy'),

  // HISTORY (15)
  makeChapter('HIS-01', 'history_civics', 'The First War of Independence, 1857', 'Medium', 'History'),
  makeChapter('HIS-02', 'history_civics', 'Growth of Nationalism', 'Medium', 'History'),
  makeChapter('HIS-03', 'history_civics', 'First Phase of the Indian National Movement', 'Medium', 'History'),
  makeChapter('HIS-04', 'history_civics', 'Second Phase of the Indian National Movement', 'Medium', 'History'),
  makeChapter('HIS-05', 'history_civics', 'The Muslim League', 'Medium', 'History'),
  makeChapter('HIS-06', 'history_civics', 'Mahatma Gandhi and the National Movement', 'Hard', 'History'),
  makeChapter('HIS-07', 'history_civics', 'The Quit India Movement', 'Hard', 'History'),
  makeChapter('HIS-08', 'history_civics', 'Forward Bloc and INA', 'Hard', 'History'),
  makeChapter('HIS-09', 'history_civics', 'Independence and Partition of India', 'Hard', 'History'),
  makeChapter('HIS-10', 'history_civics', 'The First World War', 'Hard', 'History'),
  makeChapter('HIS-11', 'history_civics', 'Rise of Dictatorships', 'Hard', 'History'),
  makeChapter('HIS-12', 'history_civics', 'The Second World War', 'Hard', 'History'),
  makeChapter('HIS-13', 'history_civics', 'United Nations', 'Medium', 'History'),
  makeChapter('HIS-14', 'history_civics', 'Major Agencies of the United Nations', 'Medium', 'History'),
  makeChapter('HIS-15', 'history_civics', 'Non-Aligned Movement', 'Easy', 'History'),

  // CIVICS (6)
  makeChapter('CIV-01', 'history_civics', 'The Union Parliament - I', 'Easy', 'Civics'),
  makeChapter('CIV-02', 'history_civics', 'The Union Parliament - II', 'Medium', 'Civics'),
  makeChapter('CIV-03', 'history_civics', 'The President and the Vice-President', 'Medium', 'Civics'),
  makeChapter('CIV-04', 'history_civics', 'Prime Minister and Council of Ministers', 'Hard', 'Civics'),
  makeChapter('CIV-05', 'history_civics', 'The Supreme Court', 'Hard', 'Civics'),
  makeChapter('CIV-06', 'history_civics', 'The High Courts and Subordinate Courts', 'Hard', 'Civics'),

  // TELUGU (10)
  makeChapter('TEL-01', 'telugu', 'స్నేహధర్మము (కుచేలోపాఖ్యానము)', 'Hard'),
  makeChapter('TEL-02', 'telugu', 'పారిజాత ప్రసూనము', 'Hard'),
  makeChapter('TEL-03', 'telugu', 'శతక మంజరి', 'Medium'),
  makeChapter('TEL-04', 'telugu', 'మానవత్వం', 'Medium'),
  makeChapter('TEL-05', 'telugu', 'నేనంటాను', 'Medium'),
  makeChapter('TEL-06', 'telugu', 'తాత్మీత్రి ...', 'Hard', undefined, {
    notes: 'Exact wording preserved from uploaded assessment; verify chapter title against syllabus.',
  }),
  makeChapter('TEL-07', 'telugu', 'ఒక బీమకథ', 'Medium'),
  makeChapter('TEL-08', 'telugu', 'స్వాతంత్ర్యద్యమ నేపధ్యంలో ప్రబోధ గీతాలు', 'Medium'),
  makeChapter('TEL-09', 'telugu', 'ఉగాదులూ, ఉపన్యులూ', 'Hard'),
  makeChapter('TEL-10', 'telugu', 'రిక్తహస్తములు', 'Easy'),

  // ENGLISH LITERATURE (10)
  makeChapter('ENG-01', 'english_literature', 'Haunted Houses', 'Medium'),
  makeChapter('ENG-02', 'english_literature', 'The Glove and the Lions', 'Easy'),
  makeChapter('ENG-03', 'english_literature', 'When Great Trees fall', 'Easy'),
  makeChapter('ENG-04', 'english_literature', 'A Considerable Speck', 'Hard'),
  makeChapter('ENG-05', 'english_literature', 'The Power of Music', 'Hard'),
  makeChapter('ENG-06', 'english_literature', 'With the Photographer', 'Easy'),
  makeChapter('ENG-07', 'english_literature', 'The Elevator', 'Medium'),
  makeChapter('ENG-08', 'english_literature', 'The Girl Who Can', 'Medium'),
  makeChapter('ENG-09', 'english_literature', 'The Pedestrian', 'Medium'),
  makeChapter('ENG-10', 'english_literature', 'The Last Lesson', 'Hard'),
];

export const INITIAL_PRACTICE_TOPICS: PracticeTopicItem[] = [
  // English Language practice categories (not chapters)
  { id: 'ELP-01', subjectId: 'english_language', category: 'english_language', title: 'Composition', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Narrative, descriptive, argumentative & picture composition' },
  { id: 'ELP-02', subjectId: 'english_language', category: 'english_language', title: 'Letter Writing', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Formal & informal ICSE format accuracy' },
  { id: 'ELP-03', subjectId: 'english_language', category: 'english_language', title: 'Notice & Email', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Strict ICSE layout, headings & tone' },
  { id: 'ELP-04', subjectId: 'english_language', category: 'english_language', title: 'Comprehension', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Unseen passage, vocabulary & 50-word precis grid' },
  { id: 'ELP-05', subjectId: 'english_language', category: 'english_language', title: 'Grammar', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Prepositions, synthesis, transformation of sentences, tenses' },

  // Julius Caesar Acts III–V tracked separately for school-exam coverage
  { id: 'EXT-LIT-06', subjectId: 'english_literature', category: 'extra_literature', title: 'Julius Caesar Act III (Complete)', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Pre-Final school syllabus Act III' },
  { id: 'EXT-LIT-07', subjectId: 'english_literature', category: 'extra_literature', title: 'Julius Caesar Act IV (Complete)', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Pre-Final school syllabus Act IV' },
  { id: 'EXT-LIT-08', subjectId: 'english_literature', category: 'extra_literature', title: 'Julius Caesar Act V (Complete)', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Pre-Final school syllabus Act V' },

  // Telugu practice topics
  { id: 'TEL-P-01', subjectId: 'telugu', category: 'telugu_practice', title: 'Writing', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Essays & paragraph writing' },
  { id: 'TEL-P-02', subjectId: 'telugu', category: 'telugu_practice', title: 'Letters', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Formal & personal Telugu letters' },
  { id: 'TEL-P-03', subjectId: 'telugu', category: 'telugu_practice', title: 'Grammar', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Sandhi, Samasa, Chandassu, Alankara' },
  { id: 'TEL-P-04', subjectId: 'telugu', category: 'telugu_practice', title: 'Unseen Prose', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Comprehension & inference' },
  { id: 'TEL-P-05', subjectId: 'telugu', category: 'telugu_practice', title: 'Synonyms', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Paryaya padalu' },
  { id: 'TEL-P-06', subjectId: 'telugu', category: 'telugu_practice', title: 'Antonyms', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Vyatireka padalu' },
  { id: 'TEL-P-07', subjectId: 'telugu', category: 'telugu_practice', title: 'Word Separation', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Padavibhajana' },
  { id: 'TEL-P-08', subjectId: 'telugu', category: 'telugu_practice', title: 'Spelling Corrections', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Varnashuddhi & akshara doshalu' },
  { id: 'TEL-P-09', subjectId: 'telugu', category: 'telugu_practice', title: 'Poetry & Prose Sections', status: 'Not Started', confidence: null, lastPracticedDate: null, practiceCount: 0, mistakes: '', notes: 'Context & annotations' },
];

export const DEFAULT_FOCUS_TIMER_PREFS = {
  defaultMode: 'countdown' as const,
  countdownMinutes: 45,
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroCyclesBeforeLong: 4,
  maxDayMinutes: 480,
  soundEnabled: false,
  wallpaperId: 'auto',
  wallpaperRotateSeconds: 30,
  backgroundDimPercent: 55,
  showQuote: true,
  clockStyle: 'minimal' as const,
};

export const DEFAULT_SETTINGS: ScheduleSettings = {
  eveningStart: '17:30',
  eveningEnd: '20:00',
  blockDurationMinutes: 75,
  breakMinutes: 10,
  teluguMorningMinutes: 60,
  timeEstimateStandard: 'unassigned',
  rotation: {
    1: ['mathematics', 'physics'],
    2: ['biology', 'telugu'],
    3: ['chemistry', 'history_civics'],
    4: ['mathematics', 'telugu'],
    5: ['physics', 'biology'],
    6: ['chemistry', 'history_civics'],
    0: ['weakest_priority', 'rotating_low'],
  },
  focusTimerPrefs: { ...DEFAULT_FOCUS_TIMER_PREFS },
};

export const STUDY_QUOTES: string[] = [
  'Clarity comes from finishing the next chapter, not worrying about all of them.',
  'Quiet consistency beats frantic cramming every single evening.',
  'One solved exercise with full attention is worth three skimmed pages.',
  'Do the hardest concept first while your mind is sharpest.',
  'Mistakes logged today become guaranteed marks on exam morning.',
  'Keep the desk simple, the timer honest, and the pace steady.',
  'Progress is built in focused blocks, not wishful schedules.',
  'Revise before you forget; practice before you doubt.',
  'Mastery is just unhurried repetition applied to difficult topics.',
  'Finish what is in front of you; tomorrow’s plan will take care of itself.',
  'Read the question carefully—half of ICSE marks live in precision.',
  'Leave no chapter unexamined before the exam window opens.',
  'Small, deliberate sessions compound into calm exam readiness.',
  'Focus on understanding why a step works, not just memorizing it.',
];

export function getDailyQuote(dateStr: string): string {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return STUDY_QUOTES[hash % STUDY_QUOTES.length];
}

export function createInitialAppState(): AppState {
  return {
    version: 2,
    baselineDate: BASELINE_DATE,
    chapters: INITIAL_CHAPTERS.map((c) => ({ ...c })),
    practiceTopics: INITIAL_PRACTICE_TOPICS.map((p) => ({ ...p })),
    exams: INITIAL_EXAMS.map((e) => ({ ...e })),
    revisions: [],
    plans: {},
    formulas: [],
    settings: {
      ...DEFAULT_SETTINGS,
      rotation: { ...DEFAULT_SETTINGS.rotation },
      focusTimerPrefs: { ...DEFAULT_FOCUS_TIMER_PREFS },
    },
    nextTopicBySubject: {
      mathematics: 'MAT-22',
    },
    focusSessions: [],
    aiMemory: [],
  };
}
