'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CodeEditor } from '@/components/CodeEditor';
import { ExecutionStatus } from '@/components/ExecutionStatus';
import { InputPanel } from '@/components/InputPanel';
import { LanguageSelector } from '@/components/LanguageSelector';
import { OutputPanel } from '@/components/OutputPanel';
import { ProblemStatementContent } from '@/components/ProblemStatement';
import { SubmitButton } from '@/components/SubmitButton';
import { TestcasePanel } from '@/components/TestcasePanel';
import { useExecutionSocket } from '@/hooks/use-execution-socket';
import { useHorizontalPanelResize, useVerticalPanelResize } from '@/hooks/use-panel-resize';
import { useJudgeActions } from '@/hooks/use-judge-actions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useToast } from '@/hooks/use-toast';
import { getLanguage } from '@/lib/language-options';
import {
  BOTTOM_PANELS,
  COLOR_THEME_CLASS,
  PANEL_HEIGHT_BOUNDS,
  SIDEBAR_WIDTH_BOUNDS
} from '@/lib/ui-config';
import { getSubmissionBlockedReason } from '@/services/judge-api';
import { useIDEStore } from '@/store/ide-store';
import type { BottomPanel } from '@/types/ide';
import { useEffect, useMemo, useState } from 'react';

function Toast({ message }: { readonly message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="fixed right-4 top-4 z-50 rounded-xl border border-sky-400/30 bg-slate-950/95 px-4 py-3 text-sm text-sky-100 shadow-glow backdrop-blur"
    >
      {message}
    </motion.div>
  );
}

export function IDELayout() {
  const selectedLanguage = useIDEStore((state) => state.selectedLanguage);
  const problem = useIDEStore((state) => state.problem);
  const ui = useIDEStore((state) => state.ui);
  const setBottomPanelHeight = useIDEStore((state) => state.setBottomPanelHeight);
  const setSidebarWidth = useIDEStore((state) => state.setSidebarWidth);
  const toggleSidebar = useIDEStore((state) => state.toggleSidebar);
  const resetCode = useIDEStore((state) => state.resetCode);
  const executionId = useIDEStore((state) => state.execution.id);
  const [activePanel, setActivePanel] = useState<BottomPanel>('testcases');
  const language = getLanguage(selectedLanguage);
  const colorTheme = ui.colorTheme;
  const sidebarWidth = ui.sidebarWidth;
  const { message: toast, notify } = useToast();
  const judgeActions = useJudgeActions({ notify });
  const { blockedReason: submissionBlockedReason, checking: checkingSubmissionAvailability } = useSubmissionAvailability();
  const submitEnabled = !checkingSubmissionAvailability && !submissionBlockedReason;

  useIdeHandoff();
  useExecutionSocket(executionId);
  useKeyboardShortcuts({
    run: () => notify('El backend actual no expone ejecución rápida (/run). Usa Enviar para mandar al juez oficial.'),
    submit: () => {
      if (submitEnabled) judgeActions.submit();
      else notify(submissionBlockedReason ?? 'Verificando si este contexto acepta envíos.');
    },
    save: judgeActions.save,
  });

  const startBottomPanelResize = useVerticalPanelResize({
    currentHeight: ui.bottomPanelHeight,
    min: PANEL_HEIGHT_BOUNDS.min,
    max: PANEL_HEIGHT_BOUNDS.max,
    onResize: setBottomPanelHeight,
  });

  const startSidebarResize = useHorizontalPanelResize({
    currentWidth: sidebarWidth,
    min: SIDEBAR_WIDTH_BOUNDS.min,
    max: SIDEBAR_WIDTH_BOUNDS.max,
    maxViewportRatio: SIDEBAR_WIDTH_BOUNDS.viewportRatio,
    onResize: setSidebarWidth,
  });

  return (
    <div
      className={`${COLOR_THEME_CLASS[colorTheme]} min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_36rem),#070b12] text-slate-100`}
    >
      <AnimatePresence>{toast ? <Toast message={toast} /> : null}</AnimatePresence>
      <div className="flex h-dvh min-h-0">
        <aside
          style={{ width: ui.sidebarCollapsed ? undefined : sidebarWidth }}
          className={`${ui.sidebarCollapsed ? 'hidden' : 'hidden lg:block'} shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-950/70 p-4 backdrop-blur-xl`}
        >
          <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 shadow-glow">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">Problema</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white">{problem.title}</h1>
          </div>
          <ProblemStatementContent compact />
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs leading-5 text-slate-400">
            <b className="text-slate-200">Atajos</b>
            <br />Ctrl+Shift+Enter Enviar
            <br />Ctrl+S Guardar
          </div>
        </aside>
        {!ui.sidebarCollapsed ? (
          <div
            aria-label="Redimensionar enunciado"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startSidebarResize}
            className="vertical-resize-handle group hidden w-3 shrink-0 items-stretch justify-center bg-slate-950/70 transition hover:bg-sky-500/10 lg:flex"
          >
            <span className="my-3 w-1 rounded-full bg-slate-800 transition group-hover:bg-sky-400/70" />
          </div>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 shadow-panel backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <button onClick={toggleSidebar} className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-bold text-slate-300 hover:border-sky-400 hover:text-sky-200">
                ☰
              </button>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Judge Workspace</p>
                <h2 className="text-lg font-black text-white">main.{language.extension}</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSelector />
              <button onClick={judgeActions.download} className="h-10 rounded-xl border border-slate-800 px-3 text-sm font-semibold text-slate-300 hover:border-sky-400 hover:text-sky-200">
                Descargar
              </button>
              <button onClick={() => resetCode(selectedLanguage)} className="h-10 rounded-xl border border-slate-800 px-3 text-sm font-semibold text-slate-300 hover:border-amber-400 hover:text-amber-200">
                Reset
              </button>
              <ExecutionStatus />
              <span className="hidden max-w-56 text-xs text-slate-500 lg:inline">Ejecución rápida no disponible; usa Enviar.</span>
              {submitEnabled ? <SubmitButton submitting={judgeActions.busyAction === 'submit'} onSubmit={judgeActions.submit} /> : null}
            </div>
          </header>

          {checkingSubmissionAvailability ? (
            <div className="mb-3 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-200">
              Verificando si este contexto acepta envíos...
            </div>
          ) : null}

          {submissionBlockedReason ? (
            <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200">
              {submissionBlockedReason}
            </div>
          ) : null}

          <section className="min-h-0 flex-1">
            <CodeEditor />
          </section>

          <div onPointerDown={startBottomPanelResize} className="resize-handle my-2 h-2 rounded-full bg-slate-900 transition hover:bg-sky-500/40" />

          <section
            style={{ height: ui.bottomPanelHeight, maxHeight: '46dvh' }}
            className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-2 shadow-panel"
          >
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {BOTTOM_PANELS.map((panel) => (
                <button
                  key={panel}
                  onClick={() => setActivePanel(panel)}
                  className={`rounded-xl px-3 py-2 text-sm font-bold capitalize transition ${activePanel === panel ? 'bg-sky-400 text-slate-950' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                >
                  {panel}
                </button>
              ))}
            </div>
            <div className="h-[calc(100%-48px)] min-h-0">
              <AnimatePresence mode="wait">
                <motion.div key={activePanel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="h-full">
                  {activePanel === 'output' ? <OutputPanel /> : null}
                  {activePanel === 'input' ? <InputPanel /> : null}
                  {activePanel === 'testcases' ? <TestcasePanel /> : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}


function useSubmissionAvailability() {
  const judge = useIDEStore((state) => state.judge);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const availabilityKey = useMemo(
    () => [judge.courseId ?? '', judge.assignmentId ?? '', judge.contestId ?? ''].join(':'),
    [judge.assignmentId, judge.contestId, judge.courseId],
  );

  useEffect(() => {
    let mounted = true;
    const hasAvailabilityContext = Boolean((judge.courseId && judge.assignmentId) || judge.contestId);
    setChecking(hasAvailabilityContext);

    getSubmissionBlockedReason(judge)
      .then((reason) => {
        if (!mounted) return;
        setBlockedReason(reason);
      })
      .catch(() => {
        if (mounted) setBlockedReason('No se pudo verificar si este contexto acepta envíos.');
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, [availabilityKey, judge]);

  return { blockedReason, checking } as const;
}

function useIdeHandoff() {
  const setLanguage = useIDEStore((state) => state.setLanguage);
  const setCode = useIDEStore((state) => state.setCode);
  const setProblem = useIDEStore((state) => state.setProblem);
  const setJudgeContext = useIDEStore((state) => state.setJudgeContext);
  const setStdin = useIDEStore((state) => state.setStdin);
  const setTestcases = useIDEStore((state) => state.setTestcases);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffId = params.get('handoff');
    const queryContext = {
      problemId: params.get('problemId') ?? undefined,
      contestId: params.get('contestId') ?? undefined,
      contestProblemId: params.get('contestProblemId') ?? undefined,
      courseId: params.get('courseId') ?? undefined,
      assignmentId: params.get('assignmentId') ?? undefined,
      languageId: params.get('languageId') ?? undefined,
    };
    if (Object.values(queryContext).some(Boolean)) setJudgeContext(queryContext);

    const storedPayload = handoffId ? localStorage.getItem(`vibe-ide-handoff:${handoffId}`) : null;
    const inlinePayload = params.get('payload');
    const decodedPayload = storedPayload ?? (inlinePayload ? decodeBase64Url(inlinePayload) : null);
    if (!decodedPayload) return;

    const payload = parseHandoffPayload(decodedPayload);
    if (!payload) return;

    const language = resolveLanguage(payload.editorLanguage, payload.languageName);
    setLanguage(language);
    setCode(language, payload.sourceCode ?? '');
    setJudgeContext({
      problemId: payload.problemId,
      contestId: payload.contestId ?? undefined,
      contestProblemId: payload.contestProblemId ?? undefined,
      courseId: payload.courseId ?? undefined,
      assignmentId: payload.assignmentId ?? undefined,
      languageId: payload.languageId ?? undefined,
    });

    if (payload.problem) {
      const sampleCases = Array.isArray(payload.problem.sampleCases)
        ? payload.problem.sampleCases.map((sample) => ({
            input: String(sample.input ?? ''),
            output: String(sample.output ?? ''),
          }))
        : [];

      setProblem({
        problemId: String(payload.problem.problemId ?? payload.problemId ?? ''),
        contestId: payload.problem.contestId ? String(payload.problem.contestId) : payload.contestId ?? undefined,
        contestProblemId: payload.problem.contestProblemId ?? payload.contestProblemId ?? undefined,
        title: payload.problem.title || `Problema ${payload.problemId}`,
        description: payload.problem.description ?? '',
        inputSpec: payload.problem.inputSpec ?? '',
        outputSpec: payload.problem.outputSpec ?? '',
        hint: payload.problem.hint ?? '',
        timeLimitSeconds: payload.problem.timeLimitSeconds,
        memoryLimitMb: payload.problem.memoryLimitMb,
        sampleCases,
      });

      setTestcases(
        sampleCases.map((sample, index) => ({
          id: `sample-${index + 1}`,
          name: `Ejemplo ${index + 1}`,
          input: sample.input,
          expectedOutput: sample.output,
          actualOutput: '',
          status: 'idle',
          expanded: index === 0,
        })),
      );

      if (sampleCases[0]?.input) setStdin(sampleCases[0].input);
    }

    if (handoffId) localStorage.removeItem(`vibe-ide-handoff:${handoffId}`);
  }, [setCode, setJudgeContext, setLanguage, setProblem, setStdin, setTestcases]);
}

type HandoffPayload = {
  readonly problemId?: string;
  readonly contestId?: string | null;
  readonly contestProblemId?: string | null;
  readonly courseId?: string | null;
  readonly assignmentId?: string | null;
  readonly languageId?: string | null;
  readonly languageName?: string;
  readonly editorLanguage?: string;
  readonly sourceCode?: string;
  readonly problem?: {
    readonly problemId?: number;
    readonly contestId?: number;
    readonly contestProblemId?: string;
    readonly title?: string;
    readonly description?: string;
    readonly inputSpec?: string;
    readonly outputSpec?: string;
    readonly hint?: string;
    readonly timeLimitSeconds?: number;
    readonly memoryLimitMb?: number;
    readonly sampleCases?: readonly { readonly input?: string; readonly output?: string }[];
  } | null;
};

function parseHandoffPayload(value: string): HandoffPayload | null {
  try {
    const parsed = JSON.parse(value) as HandoffPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function resolveLanguage(editorLanguage?: string, languageName?: string) {
  const normalized = `${editorLanguage ?? ''} ${languageName ?? ''}`.toLowerCase();
  if (normalized.includes('python') || normalized.includes('pypy')) return 'python';
  if (normalized.includes('java') && !normalized.includes('javascript')) return 'java';
  if (normalized.includes('javascript') || normalized.includes('node')) return 'javascript';
  if (normalized.includes('rust')) return 'rust';
  if (normalized.includes('go') || normalized.includes('golang')) return 'go';
  return 'cpp';
}
