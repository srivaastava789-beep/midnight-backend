import type { AppState, ChapterItem, SubjectId } from '../types/study.ts';
import { SUBJECT_MAP } from '../data/seed.ts';
import { diffDays, formatDisplayDate } from './date.ts';
import { calculateSyllabusStats } from '../engine/analytics.ts';

export function generateChatGPTExport(state: AppState): string {
  const stats = calculateSyllabusStats(state.chapters);
  const activeDate = state.baselineDate || '2026-11-24';

  const lines: string[] = [];
  lines.push('# ICSE CLASS 10 — MIDNIGHT STUDY STATUS EXPORT');
  lines.push(`Generated: ${new Date().toISOString().split('T')[0]} | Active Baseline Date: ${activeDate}`);
  lines.push('Curriculum: CISCE Class 10 (ICSE 2026–2027) | Goal: 90%+ Across All Subjects');
  lines.push('');

  lines.push('## 1. PRE-FINAL EXAMINATION TIMETABLE (09–21 DEC 2026)');
  for (const exam of state.exams) {
    const days = diffDays(exam.date, activeDate);
    const dayLabel = days >= 0 ? `in ${days} days` : 'Exam completed';
    lines.push(`- **${exam.date}** (${dayLabel}): **${exam.subjectName}** (09:00 AM) — ${exam.notes}`);
  }
  lines.push('');

  lines.push('## 2. SYLLABUS COMPLETION SUMMARY (138 PORTIONS TOTAL)');
  const notStartedPortions = Math.max(
    0,
    stats.totalPortions -
      stats.completedPortions -
      stats.inProgressPortions -
      stats.weakPortions -
      stats.needsRevisionPortions
  );
  lines.push(`- Total portions: ${stats.totalPortions}`);
  lines.push(`- Completed: ${stats.completedPortions} (${stats.overallCompletionPercent}%)`);
  lines.push(`- In Progress: ${stats.inProgressPortions}`);
  lines.push(`- Weak / Needs Revision: ${stats.weakPortions}`);
  lines.push(`- Not Started: ${notStartedPortions}`);
  lines.push('');

  lines.push('## 3. CHAPTER-BY-CHAPTER BREAKDOWN BY SUBJECT');
  const subjects: SubjectId[] = [
    'mathematics',
    'physics',
    'chemistry',
    'biology',
    'history_civics',
    'geography',
    'commercial_applications',
    'english_literature',
    'english_language',
    'telugu',
  ];

  for (const subjId of subjects) {
    const meta = SUBJECT_MAP[subjId];
    const chs = state.chapters.filter((c) => c.subjectId === subjId);
    if (chs.length === 0) continue;

    const completed = chs.filter((c) => c.status === 'Completed' || c.status === 'Strong').length;
    lines.push(`### ${meta.name} (${completed}/${chs.length} completed)`);

    for (const c of chs) {
      let mark = '[ ]';
      if (c.status === 'Completed' || c.status === 'Strong') mark = '[x]';
      else if (c.status === 'In Progress') mark = '[-]';
      else if (c.status === 'Weak' || c.status === 'Needs Revision') mark = '[!]';

      let details = `${c.id} · ${c.chapterName} (${c.status} | ${c.difficulty})`;
      if (c.completedParts && c.completedParts.length > 0) {
        details += ` · Done: ${c.completedParts.join(', ')}`;
      }
      if (c.remainingParts && c.remainingParts.length > 0) {
        details += ` · Left: ${c.remainingParts.join(', ')}`;
      }
      if (c.confidence) {
        details += ` · Confidence: ${c.confidence}/5`;
      }
      if (c.mistakes) {
        details += ` · Mistakes: "${c.mistakes}"`;
      }
      if (c.notes) {
        details += ` · Notes: "${c.notes}"`;
      }

      lines.push(`${mark} ${details}`);
    }
    lines.push('');
  }

  // Active Spaced Revisions
  const dueRevs = state.revisions.filter((r) => !r.completed);
  if (dueRevs.length > 0) {
    lines.push('## 4. ACTIVE SPACED REVISIONS QUEUE (D1, D3, D7, D23)');
    for (const r of dueRevs.slice(0, 15)) {
      lines.push(`- ${r.scheduledDate} (${r.stage}): ${r.chapterId} · ${r.chapterName} (${SUBJECT_MAP[r.subjectId]?.name})`);
    }
    lines.push('');
  }

  // AI Memory & Upcoming Tests
  if (state.aiMemory && state.aiMemory.length > 0) {
    lines.push('## 5. UPCOMING TESTS & STUDY CONSTRAINTS (REMEMBERED)');
    for (const mem of state.aiMemory) {
      if (mem.category === 'test' && mem.testDate) {
        lines.push(`- [TEST] ${mem.testDate} (Prep: ${mem.prepDate ?? 'D-1'}): ${mem.content}`);
      } else {
        lines.push(`- [${mem.category.toUpperCase()}] ${mem.content}`);
      }
    }
    lines.push('');
  }

  // Current Study Plan Snapshot
  const todayPlan = state.plans[activeDate];
  if (todayPlan && todayPlan.tasks.length > 0) {
    lines.push(`## 6. TODAY'S STUDY PLAN (${formatDisplayDate(activeDate, true)})`);
    for (const t of todayPlan.tasks) {
      lines.push(`- ${t.timeSlot} (${t.durationMinutes}m): ${t.title} [${t.completed ? 'COMPLETED' : 'PENDING'}] — ${t.objective}`);
    }
    lines.push('');
  }

  lines.push('## 7. INSTRUCTIONS FOR CHATGPT / EXTERNAL AI TUTOR');
  lines.push('You are acting as an expert ICSE Class 10 tutor.');
  lines.push('1. Use the above real syllabus status and exam dates to quiz me, explain difficult concepts, and provide past-paper practice.');
  lines.push('2. If I mention finishing a chapter or subtopic, confirm what parts I finished and what remains.');
  lines.push('3. When I ask for a summary to take back to MIDNIGHT, format your response with clean bullet points listing completed chapters, in-progress sub-parts (Parts A/B vs C/D), upcoming tests, and any schedule constraints.');

  return lines.join('\n');
}

export function generateChatGPTImportPrompt(): string {
  return `You are summarizing my ICSE Class 10 study progress so I can sync it back into my MIDNIGHT study planner app.

Based on our conversation history, please provide a comprehensive, structured status update covering:

1. COMPLETED CHAPTERS:
List every chapter I have finished, with its subject and exact chapter name or code (e.g. Mathematics MAT-21 Volume and Surface Area of Solids, Physics PHY-01 Force).

2. IN-PROGRESS CHAPTERS & SUB-PARTS:
List chapters I am currently working on, specifying which parts are completed (e.g. Parts A & B) and which parts are left to study (e.g. Parts C & D).

3. WEAK AREAS & MISTAKES:
List chapters or topics where I have low confidence, struggle with numericals/proofs, or need extra revision.

4. UPCOMING SCHOOL TESTS:
List any upcoming class tests or pre-final exams with Subject, Test Date (YYYY-MM-DD), and syllabus/chapters covered.

5. STUDY WINDOW & SCHEDULE CONSTRAINTS:
List any daily time limits (e.g. "Wednesdays 90m max"), ad-hoc commitments (e.g. "School meeting at 6 PM tomorrow"), or pacing preferences.

Format your response clearly with bullet points so MIDNIGHT AI can parse and apply the updates automatically.`;
}

export function exportStateAsJson(state: AppState): string {
  return JSON.stringify(
    {
      version: state.version,
      exportedAt: new Date().toISOString(),
      baselineDate: state.baselineDate,
      chapters: state.chapters.map((c) => ({
        id: c.id,
        subjectId: c.subjectId,
        chapterName: c.chapterName,
        status: c.status,
        difficulty: c.difficulty,
        completedParts: c.completedParts,
        remainingParts: c.remainingParts,
        confidence: c.confidence,
        mistakes: c.mistakes,
        notes: c.notes,
        lastStudiedDate: c.lastStudiedDate,
      })),
      aiMemory: state.aiMemory,
      plans: state.plans,
      settings: state.settings,
    },
    null,
    2
  );
}

export interface DirectImportPreview {
  detectedChapters: Array<{
    id: string;
    name: string;
    subjectId: SubjectId;
    status: ChapterItem['status'];
    completedParts?: string[];
    remainingParts?: string[];
  }>;
  detectedTests: Array<{
    subject: string;
    date?: string;
    syllabus: string;
  }>;
  detectedConstraints: string[];
}

export function parseDirectImportPreview(text: string, state: AppState): DirectImportPreview {
  const lower = text.toLowerCase();
  const detectedChapters: DirectImportPreview['detectedChapters'] = [];
  const detectedTests: DirectImportPreview['detectedTests'] = [];
  const detectedConstraints: string[] = [];

  // Scan for chapter IDs like PHY-01, MAT-22, etc.
  for (const ch of state.chapters) {
    const idRegex = new RegExp(`\\b${ch.id}\\b`, 'i');
    const nameWords = ch.chapterName.toLowerCase().split(/[\s,·-]+/).filter((w) => w.length >= 4);
    const matchesId = idRegex.test(text);
    const matchesName = nameWords.length >= 2 && nameWords.filter((w) => lower.includes(w)).length >= Math.min(2, nameWords.length);

    if (matchesId || matchesName) {
      let status: ChapterItem['status'] = 'Completed';
      const snippet = text.slice(Math.max(0, text.indexOf(ch.id) - 40), text.indexOf(ch.id) + 120).toLowerCase();

      if (snippet.includes('in progress') || snippet.includes('reading') || snippet.includes('working on') || snippet.includes('left') || snippet.includes('part')) {
        status = 'In Progress';
      } else if (snippet.includes('weak') || snippet.includes('needs revision') || snippet.includes('struggling') || snippet.includes('revision')) {
        status = 'Weak';
      }

      // Check subparts
      const completedParts: string[] = [];
      const remainingParts: string[] = [];

      if (/part\s*a/i.test(snippet) && (snippet.includes('done') || snippet.includes('finish') || snippet.includes('completed'))) {
        completedParts.push('Part A');
      }
      if (/part\s*b/i.test(snippet) && (snippet.includes('done') || snippet.includes('finish') || snippet.includes('completed'))) {
        completedParts.push('Part B');
      }
      if (/part\s*c/i.test(snippet) && (snippet.includes('left') || snippet.includes('remaining') || snippet.includes('pending'))) {
        remainingParts.push('Part C');
      }
      if (/part\s*d/i.test(snippet) && (snippet.includes('left') || snippet.includes('remaining') || snippet.includes('pending'))) {
        remainingParts.push('Part D');
      }

      detectedChapters.push({
        id: ch.id,
        name: ch.chapterName,
        subjectId: ch.subjectId,
        status,
        ...(completedParts.length > 0 ? { completedParts } : {}),
        ...(remainingParts.length > 0 ? { remainingParts } : {}),
      });
    }
  }

  // Scan for test dates
  const dateRegex = /\b(2026-\d{2}-\d{2}|\d{1,2}\s+(?:nov|dec|november|december))\b/gi;
  const dateMatches = text.match(dateRegex);
  if (dateMatches) {
    for (const d of dateMatches) {
      if (lower.includes('test') || lower.includes('exam') || lower.includes('quiz')) {
        detectedTests.push({
          subject: 'Detected upcoming test',
          date: d,
          syllabus: 'Extracted from imported context',
        });
      }
    }
  }

  // Scan for time constraints
  if (lower.includes('wednesday') && (lower.includes('min') || lower.includes('90m') || lower.includes('60m'))) {
    detectedConstraints.push('Wednesday study window limit detected');
  }
  if (lower.includes('meeting') || lower.includes('busy') || lower.includes('event')) {
    detectedConstraints.push('Ad-hoc meeting or schedule disruption detected');
  }

  return {
    detectedChapters: detectedChapters.slice(0, 20),
    detectedTests: detectedTests.slice(0, 5),
    detectedConstraints,
  };
}
