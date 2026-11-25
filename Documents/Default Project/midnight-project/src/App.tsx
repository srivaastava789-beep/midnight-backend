import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckSquare,
  History,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Sigma,
  Timer,
} from 'lucide-react';
import { ChapterDetailDrawer } from './components/ChapterDetailDrawer';
import { ExamDetailModal } from './components/ExamDetailModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { RecoveryModal } from './components/RecoveryModal';
import { TaskEditorModal } from './components/TaskEditorModal';
import { getEstimatedMinutesForStandard } from './data/seed';
import { calculateDaySummary } from './engine/analytics';
import { buildActiveTimerState, getEffectiveFocusPrefs } from './engine/focusTimer';
import {
  applyRecoverySuggestions,
  findMissedWorkAndRevisions,
  generateDayPlan,
  generateRecoveryPlan,
  getNextExam,
} from './engine/planner';
import {
  categorizeRevisions,
  completeRevisionTask,
  CompleteRevisionPayload,
  getNextDueDateForChapter,
  rescheduleRevisionTask,
  scheduleRevisionsForChapter,
} from './engine/revision';
import { applyScheduleOperations } from './engine/scheduleMutator';
import type {
  ActiveTimerState,
  AppState,
  ChapterItem,
  ExamItem,
  FocusSession,
  FocusTimerPreferences,
  FormulaItem,
  PracticeTopicItem,
  RecoverySuggestion,
  RevisionTask,
  ScheduleChatMessage,
  ScheduleSettings,
  StudyTask,
  SubjectId,
  TimeEstimateStandard,
} from './types/study';
import {
  requestGeminiDayPlan,
  requestGeminiRecovery,
  requestGeminiScheduleChat,
} from './utils/aiClient';
import { formatDisplayDate, getEffectiveTodayISO } from './utils/date';
import {
  buildSeededState,
  loadActiveTimer,
  loadAppState,
  saveActiveTimer,
  saveAppState,
} from './utils/storage';
import { FocusView } from './views/FocusView';
import { FormulaBankView } from './views/FormulaBankView';
import { HistoryView } from './views/HistoryView';
import { PlannerView } from './views/PlannerView';
import { RevisionView } from './views/RevisionView';
import { ScheduleChatView } from './views/ScheduleChatView';
import { SyllabusView } from './views/SyllabusView';
import { TodayView } from './views/TodayView';

type SectionId =
  | 'today'
  | 'focus'
  | 'planner'
  | 'schedule_chat'
  | 'syllabus'
  | 'revision'
  | 'formulas'
  | 'history';

const NAV_ITEMS: { id: SectionId; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'today', label: 'TODAY', shortLabel: 'Today', icon: CheckSquare },
  { id: 'focus', label: 'FOCUS', shortLabel: 'Focus', icon: Timer },
  { id: 'planner', label: 'PLANNER', shortLabel: 'Planner', icon: Calendar },
  { id: 'schedule_chat', label: 'STUDY AI', shortLabel: 'Study AI', icon: MessageSquare },
  { id: 'syllabus', label: 'SYLLABUS', shortLabel: 'Syllabus', icon: BookOpen },
  { id: 'revision', label: 'REVISION', shortLabel: 'Revision', icon: Repeat },
  { id: 'formulas', label: 'FORMULA BANK', shortLabel: 'Formulas', icon: Sigma },
  { id: 'history', label: 'HISTORY', shortLabel: 'History', icon: History },
];

const CHAT_STORAGE_KEY = 'midnight_schedule_chat_v1';

function loadScheduleChatHistory(): ScheduleChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduleChatMessage[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeSection, setActiveSection] = useState<SectionId>('today');
  const activeDate = useMemo(() => getEffectiveTodayISO(), []);

  // Modals / Drawers
  const [taskModal, setTaskModal] = useState<{ task: StudyTask | null; date: string } | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Connected Focus Studio state (persisted across reloads; rendered in FOCUS tab)
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState | null>(() => loadActiveTimer());
  const [focusZenMode, setFocusZenMode] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('midnight_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('midnight_sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  // Server-side Gemini AI states
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);
  const [aiRecoveryLoading, setAiRecoveryLoading] = useState(false);
  const [aiRecoveryError, setAiRecoveryError] = useState<string | null>(null);
  const [aiRecoveryWhy, setAiRecoveryWhy] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ScheduleChatMessage[]>(() => loadScheduleChatHistory());
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    saveActiveTimer(activeTimer);
  }, [activeTimer]);

  useEffect(() => {
    try {
      // Keep last 30 turns cleanly bounded in localStorage
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.slice(-30)));
    } catch {
      // ignore storage quota failures
    }
  }, [chatMessages]);

  // Ensure activeDate has a generated baseline plan if missing
  useEffect(() => {
    if (!state.plans[activeDate]) {
      setState((prev) => {
        if (prev.plans[activeDate]) return prev;
        return {
          ...prev,
          plans: {
            ...prev.plans,
            [activeDate]: generateDayPlan(prev, activeDate),
          },
        };
      });
    }
  }, [activeDate, state.plans]);

  const nextExam = useMemo(() => getNextExam(state.exams, activeDate), [state.exams, activeDate]);

  const { missedTasks, overdueRevisions } = useMemo(
    () => findMissedWorkAndRevisions(state, activeDate),
    [state, activeDate]
  );
  const missedWorkCount = missedTasks.length + overdueRevisions.length;

  const recoveryPlan = useMemo(
    () => (showRecoveryModal ? generateRecoveryPlan(state, activeDate) : { suggestions: [], remainingBacklogCount: 0 }),
    [showRecoveryModal, state, activeDate]
  );

  const dueRevCount = useMemo(() => {
    const cat = categorizeRevisions(state.revisions, activeDate);
    return cat.today.length + cat.overdue.length;
  }, [state.revisions, activeDate]);

  const selectedExam = useMemo(
    () => state.exams.find((e) => e.id === selectedExamId) ?? null,
    [state.exams, selectedExamId]
  );

  const selectedChapter = useMemo(
    () => state.chapters.find((c) => c.id === selectedChapterId) ?? null,
    [state.chapters, selectedChapterId]
  );

  // Connected Focus Studio launcher: opens Focus tab in full-bleed Focus Mode
  const handleStartFocus = (task: StudyTask) => {
    setActiveSection('focus');
    setFocusZenMode(true);
    if (activeTimer && activeTimer.taskId === task.id) {
      return;
    }
    const prefs = getEffectiveFocusPrefs(state.settings.focusTimerPrefs);
    const loggedToday = calculateDaySummary(state.plans[activeDate], state, activeDate).focusMinutesLogged;
    const nextTimer = buildActiveTimerState({
      timerType: prefs.defaultMode,
      prefs,
      date: activeDate,
      loggedTodayMinutes: loggedToday,
      linkedTask: task,
      autoStart: true,
    });
    setActiveTimer(nextTimer);
  };

  const handleUpdateFocusPrefs = (nextPrefs: FocusTimerPreferences) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        focusTimerPrefs: nextPrefs,
      },
    }));
  };

  const handleLogFocusSession = (session: FocusSession) => {
    setState((prev) => ({
      ...prev,
      focusSessions: [session, ...(prev.focusSessions ?? [])],
    }));
  };

  // On-demand Gemini AI day planning
  const handleGenerateAIDay = async (date: string, availableMinutes: number) => {
    setAiPlanLoading(true);
    setAiPlanError(null);
    try {
      const result = await requestGeminiDayPlan(state, date, availableMinutes);
      setState((prev) => {
        const existing = prev.plans[date];
        return {
          ...prev,
          plans: {
            ...prev.plans,
            [date]: {
              date,
              availableMinutes,
              tasks: result.tasks,
              workout: existing?.workout ?? {
                completed: false,
                title: 'Evening Mobility & Conditioning',
                durationMinutes: 25,
                notes: '',
              },
              generatedAt: new Date().toISOString(),
              isManuallyAdjusted: false,
              plannedBy: 'gemini',
              whyThisPlan: result.whyThisPlan,
              remainingBacklog: result.remainingBacklog,
            },
          },
        };
      });
    } catch (err) {
      setAiPlanError(
        err instanceof Error
          ? err.message
          : 'Failed to generate AI plan. Existing schedule preserved.'
      );
    } finally {
      setAiPlanLoading(false);
    }
  };

  // On-demand Gemini AI recovery prioritization
  const handleRequestAIRecovery = async () => {
    setAiRecoveryLoading(true);
    setAiRecoveryError(null);
    try {
      const result = await requestGeminiRecovery(
        state,
        activeDate,
        missedTasks,
        overdueRevisions
      );
      setAiRecoveryWhy(result.whyThisRecovery);
      return result;
    } catch (err) {
      setAiRecoveryError(
        err instanceof Error
          ? err.message
          : 'Failed to prioritize recovery with Gemini.'
      );
      return null;
    } finally {
      setAiRecoveryLoading(false);
    }
  };

  // Schedule-only Gemini chat handler
  const handleSendScheduleChat = async (userText: string) => {
    const userMsg: ScheduleChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: userText,
      createdAt: new Date().toISOString(),
    };
    const historyForApi = chatMessages.map((m) => ({ role: m.role, text: m.text }));
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await requestGeminiScheduleChat(state, activeDate, historyForApi, userText);
      let appliedChanges: string[] = [];
      let rejectedChanges: string[] = [];
      let snapshotBefore: ScheduleChatMessage['snapshotBefore'];

      if (!response.isOutOfScope && response.operations.length > 0) {
        snapshotBefore = {
          chapters: JSON.parse(JSON.stringify(state.chapters)) as AppState['chapters'],
          revisions: JSON.parse(JSON.stringify(state.revisions)) as AppState['revisions'],
          plans: JSON.parse(JSON.stringify(state.plans)) as AppState['plans'],
          settings: JSON.parse(JSON.stringify(state.settings)) as AppState['settings'],
          nextTopicBySubject: { ...(state.nextTopicBySubject ?? {}) },
          aiMemory: JSON.parse(JSON.stringify(state.aiMemory ?? [])) as AppState['aiMemory'],
        };
        const result = applyScheduleOperations(state, response.operations, activeDate);
        appliedChanges = result.appliedChanges;
        rejectedChanges = result.rejectedChanges;
        if (appliedChanges.length > 0) {
          setState(result.nextState);
        } else {
          snapshotBefore = undefined;
        }
      }

      const assistantMsg: ScheduleChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        text: response.assistantMessage,
        createdAt: new Date().toISOString(),
        isOutOfScope: response.isOutOfScope,
        appliedChanges,
        rejectedChanges,
        snapshotBefore,
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : 'Failed to reach Gemini schedule assistant.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleUndoScheduleChat = (messageId: string) => {
    const target = chatMessages.find((m) => m.id === messageId);
    if (!target?.snapshotBefore || target.undone) return;
    const snap = target.snapshotBefore;
    setState((prev) => ({
      ...prev,
      chapters: snap.chapters ?? prev.chapters,
      revisions: snap.revisions ?? prev.revisions,
      plans: snap.plans,
      settings: snap.settings,
      nextTopicBySubject: snap.nextTopicBySubject,
      aiMemory: snap.aiMemory ?? prev.aiMemory ?? [],
    }));
    setChatMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, undone: true } : m))
    );
  };

  const handleRemoveMemory = (memoryId: string) => {
    setState((prev) => ({
      ...prev,
      aiMemory: (prev.aiMemory ?? []).filter((m) => m.id !== memoryId),
    }));
  };

  const handleToggleTask = (date: string, taskId: string) => {
    setState((prev) => {
      const plan = prev.plans[date];
      if (!plan) return prev;
      const targetTask = plan.tasks.find((t) => t.id === taskId);
      if (!targetTask) return prev;

      const nextCompleted = !targetTask.completed;
      const nextTasks = plan.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: nextCompleted,
              completedAt: nextCompleted ? new Date().toISOString() : null,
            }
          : t
      );

      let nextChapters = prev.chapters;
      let nextRevisions = prev.revisions;
      let nextPracticeTopics = prev.practiceTopics;

      if (nextCompleted && targetTask.chapterId) {
        const ch = prev.chapters.find((c) => c.id === targetTask.chapterId);
        if (ch) {
          if (targetTask.taskType === 'first_study' && ch.status !== 'Completed' && ch.status !== 'Strong') {
            nextRevisions = scheduleRevisionsForChapter(ch, date, prev.revisions);
            nextChapters = prev.chapters.map((c) =>
              c.id === ch.id
                ? {
                    ...c,
                    status: 'Completed',
                    isStateConfirmed: true,
                    lastStudiedDate: date,
                    revisionDueDate: getNextDueDateForChapter(ch.id, nextRevisions),
                  }
                : c
            );
          } else if (targetTask.revisionId) {
            const res = completeRevisionTask(
              targetTask.revisionId,
              prev.chapters,
              prev.revisions,
              {
                completedDate: date,
                confidence: ch.confidence ?? 4,
                mistakes: '',
                practiceDone: true,
                answerWritingDone: ch.answerWritingStatus === 'Done',
              }
            );
            nextChapters = res.chapters;
            nextRevisions = res.revisions;
          }
        }
      }

      if (nextCompleted && targetTask.practiceTopicId) {
        nextPracticeTopics = prev.practiceTopics.map((pt) =>
          pt.id === targetTask.practiceTopicId
            ? {
                ...pt,
                practiceCount: pt.practiceCount + 1,
                lastPracticedDate: date,
                status: pt.status === 'Not Started' ? 'In Progress' : pt.status,
              }
            : pt
        );
      }

      return {
        ...prev,
        chapters: nextChapters,
        revisions: nextRevisions,
        practiceTopics: nextPracticeTopics,
        plans: {
          ...prev.plans,
          [date]: {
            ...plan,
            tasks: nextTasks,
          },
        },
      };
    });
  };

  const handleReorderTask = (date: string, taskId: string, direction: 'up' | 'down') => {
    setState((prev) => {
      const plan = prev.plans[date];
      if (!plan) return prev;
      const idx = plan.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= plan.tasks.length) return prev;

      const copy = [...plan.tasks];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);

      return {
        ...prev,
        plans: {
          ...prev.plans,
          [date]: {
            ...plan,
            tasks: copy,
            isManuallyAdjusted: true,
          },
        },
      };
    });
  };

  const handleDeleteTask = (date: string, taskId: string) => {
    setState((prev) => {
      const plan = prev.plans[date];
      if (!plan) return prev;
      return {
        ...prev,
        plans: {
          ...prev.plans,
          [date]: {
            ...plan,
            tasks: plan.tasks.filter((t) => t.id !== taskId),
            isManuallyAdjusted: true,
          },
        },
      };
    });
  };

  const handleSaveTask = (task: StudyTask, targetDate: string) => {
    setState((prev) => {
      const nextPlans = { ...prev.plans };

      if (taskModal?.task && taskModal.task.scheduledDate !== targetDate) {
        const oldDate = taskModal.task.scheduledDate;
        const oldPlan = nextPlans[oldDate];
        if (oldPlan) {
          nextPlans[oldDate] = {
            ...oldPlan,
            tasks: oldPlan.tasks.filter((t) => t.id !== task.id),
          };
        }
      }

      const destPlan = nextPlans[targetDate] ?? generateDayPlan(prev, targetDate);
      const exists = destPlan.tasks.some((t) => t.id === task.id);
      const nextTasks = exists
        ? destPlan.tasks.map((t) => (t.id === task.id ? task : t))
        : [...destPlan.tasks, task];

      nextPlans[targetDate] = {
        ...destPlan,
        tasks: nextTasks,
        isManuallyAdjusted: true,
      };

      return {
        ...prev,
        plans: nextPlans,
      };
    });
    setTaskModal(null);
  };

  const handleRegenerateDay = (date: string, availableMinutes: number) => {
    setAiPlanError(null);
    setState((prev) => {
      const nextPlan = generateDayPlan(prev, date, availableMinutes);
      return {
        ...prev,
        plans: {
          ...prev.plans,
          [date]: nextPlan,
        },
      };
    });
  };

  const handleUpdateWorkout = (
    date: string,
    patch: Partial<{ completed: boolean; title: string; durationMinutes: number; notes: string }>
  ) => {
    setState((prev) => {
      const existing = prev.plans[date] ?? generateDayPlan(prev, date);
      return {
        ...prev,
        plans: {
          ...prev.plans,
          [date]: {
            ...existing,
            workout: {
              ...existing.workout,
              ...patch,
            },
          },
        },
      };
    });
  };

  const handleAcceptRecovery = (accepted: RecoverySuggestion[]) => {
    setState((prev) => applyRecoverySuggestions(prev, accepted));
  };

  const handleDismissRecoveryItem = (sug: RecoverySuggestion) => {
    setState((prev) => {
      if (sug.kind === 'task' && sug.sourceTaskId) {
        const nextPlans = { ...prev.plans };
        for (const d of Object.keys(nextPlans)) {
          const plan = nextPlans[d];
          if (plan.tasks.some((t) => t.id === sug.sourceTaskId)) {
            nextPlans[d] = {
              ...plan,
              tasks: plan.tasks.map((t) =>
                t.id === sug.sourceTaskId ? { ...t, dismissed: true } : t
              ),
            };
          }
        }
        return { ...prev, plans: nextPlans };
      }
      return prev;
    });
  };

  const handleQuickChapterStatus = (
    chapterId: string,
    action: 'Completed' | 'In Progress' | 'Weak' | 'Strong'
  ) => {
    setState((prev) => {
      const target = prev.chapters.find((c) => c.id === chapterId);
      if (!target) return prev;

      let nextRevisions = prev.revisions;
      let nextChapters = prev.chapters;

      if (action === 'Completed' || action === 'Strong') {
        const studyDate = target.lastStudiedDate ?? activeDate;
        nextRevisions = scheduleRevisionsForChapter(target, studyDate, prev.revisions);
        const nextDue = getNextDueDateForChapter(target.id, nextRevisions);
        nextChapters = prev.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                status: action,
                isWeak: false,
                isStateConfirmed: true,
                confidence: action === 'Strong' ? 5 : c.confidence ?? 4,
                lastStudiedDate: studyDate,
                revisionDueDate: nextDue,
              }
            : c
        );
      } else if (action === 'Weak') {
        nextChapters = prev.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                status: 'Weak',
                isWeak: true,
                isStateConfirmed: true,
                confidence: c.confidence && c.confidence <= 2 ? c.confidence : 2,
              }
            : c
        );
      } else {
        nextChapters = prev.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                status: 'In Progress',
                isStateConfirmed: true,
              }
            : c
        );
      }

      return {
        ...prev,
        chapters: nextChapters,
        revisions: nextRevisions,
      };
    });
  };

  const handleSaveChapterDetail = (updated: ChapterItem, triggerRevisionSchedule: boolean) => {
    setState((prev) => {
      let nextRevisions = prev.revisions;
      if (triggerRevisionSchedule) {
        nextRevisions = scheduleRevisionsForChapter(
          updated,
          updated.lastStudiedDate ?? activeDate,
          prev.revisions
        );
      }
      const nextDue = getNextDueDateForChapter(updated.id, nextRevisions);
      return {
        ...prev,
        revisions: nextRevisions,
        chapters: prev.chapters.map((c) =>
          c.id === updated.id ? { ...updated, revisionDueDate: nextDue } : c
        ),
      };
    });
    setSelectedChapterId(null);
  };

  const handleUpdateChapterInline = (updated: ChapterItem) => {
    setState((prev) => ({
      ...prev,
      chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const handleSetNextTopic = (subjectId: SubjectId, chapterId: string | null) => {
    setState((prev) => {
      const next = { ...(prev.nextTopicBySubject ?? {}) };
      if (!chapterId) {
        delete next[subjectId];
      } else {
        next[subjectId] = chapterId;
      }
      return {
        ...prev,
        nextTopicBySubject: next,
      };
    });
  };

  const handleApplyTimeStandard = (standard: TimeEstimateStandard) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        timeEstimateStandard: standard,
      },
      chapters: prev.chapters.map((ch) => ({
        ...ch,
        estimatedMinutes: getEstimatedMinutesForStandard(ch.difficulty, standard),
      })),
    }));
  };

  const handleDeleteChapter = (chapterId: string) => {
    setState((prev) => ({
      ...prev,
      chapters: prev.chapters.filter((c) => c.id !== chapterId),
      revisions: prev.revisions.filter((r) => r.chapterId !== chapterId),
    }));
    setSelectedChapterId(null);
  };

  const handleAddChapter = (chapter: ChapterItem) => {
    setState((prev) => ({
      ...prev,
      chapters: [...prev.chapters, chapter],
    }));
  };

  const handleCompleteRevision = (revisionId: string, payload: CompleteRevisionPayload) => {
    setState((prev) => {
      const res = completeRevisionTask(revisionId, prev.chapters, prev.revisions, payload);
      return {
        ...prev,
        chapters: res.chapters,
        revisions: res.revisions,
      };
    });
  };

  const handleQuickCompleteRevision = (rev: RevisionTask, confidence: number) => {
    handleCompleteRevision(rev.id, {
      completedDate: activeDate,
      confidence,
      mistakes: '',
      practiceDone: true,
      answerWritingDone: false,
    });
  };

  const handleRescheduleRevision = (revisionId: string, newDate: string) => {
    setState((prev) => ({
      ...prev,
      revisions: rescheduleRevisionTask(revisionId, newDate, prev.revisions),
    }));
  };

  const handleFlagWeakChapter = (chapterId: string) => {
    setState((prev) => ({
      ...prev,
      chapters: prev.chapters.map((c) =>
        c.id === chapterId
          ? {
              ...c,
              isWeak: !c.isWeak,
              status: !c.isWeak ? 'Needs Revision' : c.status,
              isStateConfirmed: true,
            }
          : c
      ),
    }));
  };

  const handleUpdateExam = (updated: ExamItem) => {
    setState((prev) => ({
      ...prev,
      exams: prev.exams.map((e) => (e.id === updated.id ? updated : e)),
    }));
  };

  const handleUpdateSettings = (settings: ScheduleSettings) => {
    setState((prev) => {
      const updatedState: AppState = { ...prev, settings };
      const nextPlans = { ...prev.plans };
      for (const dateKey of Object.keys(nextPlans)) {
        if (dateKey >= activeDate && !nextPlans[dateKey].isManuallyAdjusted) {
          const hasCompleted = nextPlans[dateKey].tasks.some((t) => t.completed);
          if (!hasCompleted) {
            nextPlans[dateKey] = generateDayPlan(updatedState, dateKey);
          }
        }
      }
      return {
        ...updatedState,
        plans: nextPlans,
      };
    });
  };

  const isFocusZen = activeSection === 'focus' && focusZenMode;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row">
      {/* PC-First Compact Left Navigation Rail (1280px–1440px+ desktop) */}
      {!isFocusZen && (
      <aside
        data-testid="desktop-sidebar"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 border-r border-[#262626] bg-black py-7 justify-between transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-16 px-2.5' : 'lg:w-60 px-5'
        }`}
      >
        <div className="space-y-8">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-label="Expand sidebar"
                title="Expand sidebar"
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 text-[#858585] hover:text-white border border-[#262626] bg-[#0A0A0A] hover:border-white transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-xl font-bold tracking-tight text-white">
                  MIDNIGHT
                </div>
                <p className="mt-1 text-xs text-[#858585]">Less noise. More focus.</p>
              </div>
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 text-[#858585] hover:text-white border border-transparent hover:border-[#262626] transition-colors shrink-0"
              >
                <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <nav aria-label="Main navigation" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={sidebarCollapsed ? item.shortLabel : undefined}
                  aria-label={sidebarCollapsed ? item.shortLabel : undefined}
                  onClick={() => {
                    setActiveSection(item.id);
                    if (item.id !== 'focus') setFocusZenMode(false);
                  }}
                  className={`w-full flex items-center text-xs tracking-wide ${
                    sidebarCollapsed ? 'justify-center px-2 py-2.5 relative' : 'justify-between px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-[#111111] text-white font-semibold border border-[#262626]'
                      : 'text-[#858585] hover:text-white border border-transparent'
                  }`}
                >
                  {sidebarCollapsed ? (
                    <>
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {item.id === 'revision' && dueRevCount > 0 && (
                        <span className="absolute top-1 right-1.5 font-mono text-[9px] text-white tabular-nums leading-none">
                          {dueRevCount}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-3 whitespace-nowrap">
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      {item.id === 'revision' && dueRevCount > 0 && (
                        <span className="font-mono text-[11px] text-white tabular-nums">
                          {dueRevCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-6 border-t border-[#262626]">
          {activeTimer && (
            sidebarCollapsed ? (
              <button
                type="button"
                title={`${activeTimer.taskTitle} (${activeTimer.isRunning ? 'Running' : 'Paused'})`}
                aria-label="Open active focus timer"
                onClick={() => {
                  setActiveSection('focus');
                  setFocusZenMode(true);
                }}
                className="w-full flex items-center justify-center border border-[#404040] bg-[#111111] p-2.5 text-white hover:border-white"
              >
                <Timer className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('focus');
                  setFocusZenMode(true);
                }}
                className="w-full flex items-center justify-between border border-[#404040] bg-[#111111] px-3.5 py-2.5 text-xs text-white hover:border-white"
              >
                <span className="flex items-center gap-2 truncate">
                  <Timer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{activeTimer.taskTitle}</span>
                </span>
                <span className="font-mono text-[11px] shrink-0">
                  {activeTimer.isRunning ? 'Running' : 'Paused'}
                </span>
              </button>
            )
          )}

          {nextExam && (
            sidebarCollapsed ? (
              <button
                type="button"
                title={`Next Exam: ${nextExam.exam.subjectName} · ${formatDisplayDate(nextExam.exam.date)}`}
                aria-label={`Next exam ${nextExam.exam.subjectName}`}
                onClick={() => setSelectedExamId(nextExam.exam.id)}
                className="w-full flex flex-col items-center justify-center border border-[#262626] bg-[#0A0A0A] py-2 text-center hover:border-white"
              >
                <span className="font-mono text-[11px] font-semibold text-white tabular-nums">
                  {nextExam.daysRemaining === 0 ? '0d' : `${nextExam.daysRemaining}d`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedExamId(nextExam.exam.id)}
                className="w-full text-left border border-[#262626] bg-[#0A0A0A] p-3.5 hover:border-white"
              >
                <div className="text-[11px] font-mono text-[#858585]">NEXT EXAM</div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {nextExam.exam.subjectName}
                  </span>
                  <span className="font-mono text-sm font-semibold text-white tabular-nums shrink-0">
                    {nextExam.daysRemaining === 0 ? 'Today' : `${nextExam.daysRemaining}d`}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-[#555555]">
                  {formatDisplayDate(nextExam.exam.date)}
                </div>
              </button>
            )
          )}

          {!sidebarCollapsed && <PWAInstallButton />}
        </div>
      </aside>
      )}

      {/* Tablet Quick-Check Top Bar (No mobile phone layout or bottom nav) */}
      {!isFocusZen && (
      <header className="lg:hidden border-b border-[#262626] bg-black px-6 py-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg font-bold tracking-tight text-white">
              MIDNIGHT
            </span>
            <span className="text-xs text-[#555555]">Quick Check</span>
          </div>
          {nextExam && (
            <button
              type="button"
              onClick={() => setSelectedExamId(nextExam.exam.id)}
              className="text-xs font-mono text-[#858585] hover:text-white tabular-nums"
            >
              Next: {nextExam.exam.subjectName} · {nextExam.daysRemaining}d
            </button>
          )}
        </div>
        <nav aria-label="Tablet quick navigation" className="flex flex-wrap items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveSection(item.id);
                  if (item.id !== 'focus') setFocusZenMode(false);
                }}
                className={`px-3 py-1.5 text-xs ${
                  isActive
                    ? 'bg-white text-black font-semibold'
                    : 'border border-[#262626] text-[#858585] hover:text-white'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>
      </header>
      )}

      {/* Main Content Area */}
      <main
        className={
          isFocusZen
            ? 'flex-1'
            : `flex-1 pb-12 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'}`
        }
      >
        <div
          className={
            isFocusZen
              ? 'h-screen w-screen'
              : activeSection === 'focus'
                ? 'mx-auto max-w-6xl px-6 sm:px-10 lg:px-12 py-6 lg:py-8'
                : 'mx-auto max-w-5xl px-6 sm:px-10 lg:px-12 py-8 lg:py-10'
          }
        >
          {activeSection === 'today' && (
            <TodayView
              state={state}
              activeDate={activeDate}
              missedWorkCount={missedWorkCount}
              aiLoading={aiPlanLoading}
              aiError={aiPlanError}
              onStartFocus={handleStartFocus}
              onToggleTask={handleToggleTask}
              onReorderTask={handleReorderTask}
              onDeleteTask={handleDeleteTask}
              onEditTask={(task) => setTaskModal({ task, date: task.scheduledDate })}
              onAddTask={() => setTaskModal({ task: null, date: activeDate })}
              onRegenerateToday={(mins) => handleRegenerateDay(activeDate, mins)}
              onGenerateAIToday={(mins) => handleGenerateAIDay(activeDate, mins)}
              onOpenRecovery={() => setShowRecoveryModal(true)}
              onOpenExam={(exam) => setSelectedExamId(exam.id)}
              onOpenChapterById={(id) => setSelectedChapterId(id)}
              onOpenRevisionSection={() => setActiveSection('revision')}
              onQuickCompleteRevision={handleQuickCompleteRevision}
              onUpdateWorkout={handleUpdateWorkout}
            />
          )}

          {activeSection === 'focus' && (
            <FocusView
              activeDate={activeDate}
              tasks={state.plans[activeDate]?.tasks ?? []}
              loggedTodayMinutes={
                calculateDaySummary(state.plans[activeDate], state, activeDate)
                  .focusMinutesLogged
              }
              prefs={getEffectiveFocusPrefs(state.settings.focusTimerPrefs)}
              activeTimer={activeTimer}
              zenMode={focusZenMode}
              onToggleZenMode={() => setFocusZenMode((v) => !v)}
              onBackToToday={() => {
                setFocusZenMode(false);
                setActiveSection('today');
              }}
              onUpdatePrefs={handleUpdateFocusPrefs}
              onUpdateTimer={setActiveTimer}
              onLogFocusSession={handleLogFocusSession}
            />
          )}

          {activeSection === 'planner' && (
            <PlannerView
              state={state}
              activeDate={activeDate}
              missedWorkCount={missedWorkCount}
              aiLoading={aiPlanLoading}
              aiError={aiPlanError}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onEditTask={(task) => setTaskModal({ task, date: task.scheduledDate })}
              onAddTask={(date) => setTaskModal({ task: null, date })}
              onStartFocus={handleStartFocus}
              onRegenerateDay={handleRegenerateDay}
              onGenerateAIDay={handleGenerateAIDay}
              onOpenRecovery={() => setShowRecoveryModal(true)}
              onOpenExam={(exam) => setSelectedExamId(exam.id)}
              onUpdateSettings={handleUpdateSettings}
              onSetNextTopic={handleSetNextTopic}
              onOpenChapterById={(id) => setSelectedChapterId(id)}
            />
          )}

          {activeSection === 'schedule_chat' && (
            <ScheduleChatView
              state={state}
              activeDate={activeDate}
              messages={chatMessages}
              loading={chatLoading}
              error={chatError}
              onSendMessage={handleSendScheduleChat}
              onUndoMessage={handleUndoScheduleChat}
              onRemoveMemory={handleRemoveMemory}
              onClearChat={() => {
                setChatMessages([]);
                setChatError(null);
              }}
              onOpenPlanner={() => setActiveSection('planner')}
            />
          )}

          {activeSection === 'syllabus' && (
            <SyllabusView
              state={state}
              activeDate={activeDate}
              onQuickStatus={handleQuickChapterStatus}
              onOpenChapter={(ch) => setSelectedChapterId(ch.id)}
              onAddChapter={handleAddChapter}
              onUpdateChapter={handleUpdateChapterInline}
              onSetNextTopic={handleSetNextTopic}
              onApplyTimeStandard={handleApplyTimeStandard}
              onUpdatePracticeTopic={(topic: PracticeTopicItem) =>
                setState((prev) => ({
                  ...prev,
                  practiceTopics: prev.practiceTopics.map((p) =>
                    p.id === topic.id ? topic : p
                  ),
                }))
              }
              onAddPracticeTopic={(topic: PracticeTopicItem) =>
                setState((prev) => ({
                  ...prev,
                  practiceTopics: [...prev.practiceTopics, topic],
                }))
              }
              onDeletePracticeTopic={(topicId: string) =>
                setState((prev) => ({
                  ...prev,
                  practiceTopics: prev.practiceTopics.filter((p) => p.id !== topicId),
                }))
              }
            />
          )}

          {activeSection === 'revision' && (
            <RevisionView
              state={state}
              activeDate={activeDate}
              onCompleteRevision={handleCompleteRevision}
              onRescheduleRevision={handleRescheduleRevision}
              onFlagWeakChapter={handleFlagWeakChapter}
              onOpenChapterById={(id) => setSelectedChapterId(id)}
              onOpenRecovery={() => setShowRecoveryModal(true)}
            />
          )}

          {activeSection === 'formulas' && (
            <FormulaBankView
              state={state}
              onAddFormula={(f: FormulaItem) =>
                setState((prev) => ({ ...prev, formulas: [f, ...prev.formulas] }))
              }
              onUpdateFormula={(f: FormulaItem) =>
                setState((prev) => ({
                  ...prev,
                  formulas: prev.formulas.map((x) => (x.id === f.id ? f : x)),
                }))
              }
              onDeleteFormula={(id: string) =>
                setState((prev) => ({
                  ...prev,
                  formulas: prev.formulas.filter((x) => x.id !== id),
                }))
              }
            />
          )}

          {activeSection === 'history' && (
            <HistoryView
              state={state}
              activeDate={activeDate}
              onImportState={(imported) => setState(imported)}
              onResetAllData={() => setState(buildSeededState())}
            />
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      {taskModal && (
        <TaskEditorModal
          initialTask={taskModal.task}
          defaultDate={taskModal.date}
          chapters={state.chapters}
          onSave={handleSaveTask}
          onClose={() => setTaskModal(null)}
        />
      )}

      {selectedExam && (
        <ExamDetailModal
          exam={selectedExam}
          activeDate={activeDate}
          chapters={state.chapters}
          practiceTopics={state.practiceTopics}
          revisions={state.revisions}
          onUpdateExam={handleUpdateExam}
          onOpenChapter={(ch) => {
            setSelectedExamId(null);
            setSelectedChapterId(ch.id);
          }}
          onClose={() => setSelectedExamId(null)}
        />
      )}

      {selectedChapter && (
        <ChapterDetailDrawer
          chapter={selectedChapter}
          revisions={state.revisions}
          activeDate={activeDate}
          onSave={handleSaveChapterDetail}
          onDelete={handleDeleteChapter}
          onClose={() => setSelectedChapterId(null)}
        />
      )}

      {showRecoveryModal && (
        <RecoveryModal
          activeDate={activeDate}
          suggestions={recoveryPlan.suggestions}
          remainingBacklogCount={recoveryPlan.remainingBacklogCount}
          aiLoading={aiRecoveryLoading}
          aiError={aiRecoveryError}
          whyThisRecovery={aiRecoveryWhy}
          onRequestAIRecovery={handleRequestAIRecovery}
          onAcceptAll={handleAcceptRecovery}
          onDismissItem={handleDismissRecoveryItem}
          onClose={() => setShowRecoveryModal(false)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
