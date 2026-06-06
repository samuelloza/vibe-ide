'use client';

import { useEffect, useRef, useState } from 'react';
import { CodeEditor } from '@/components/CodeEditor';
import { BottomPanelArea } from '@/components/ide/BottomPanelArea';
import { ContextStatusBanner } from '@/components/ide/ContextStatusBanner';
import { JudgeResultDialog } from '@/components/ide/JudgeResultDialog';
import { ProblemSidebar } from '@/components/ide/ProblemSidebar';
import { ToastViewport } from '@/components/ide/ToastViewport';
import { WorkspaceHeader } from '@/components/ide/WorkspaceHeader';
import { useExecutionSocket } from '@/hooks/use-execution-socket';
import { useJudgeActions } from '@/hooks/use-judge-actions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useHorizontalPanelResize, useVerticalPanelResize } from '@/hooks/use-panel-resize';
import { useToast } from '@/hooks/use-toast';
import { useVibeLaunchContext } from '@/hooks/use-vibe-launch-context';
import { getLanguage } from '@/lib/language-options';
import { COLOR_THEME_CLASS, PANEL_HEIGHT_BOUNDS, SIDEBAR_WIDTH_BOUNDS } from '@/lib/ui-config';
import { useIDEStore } from '@/store/ide-store';
import type { BottomPanel, ExecutionResult, Testcase, Verdict } from '@/types/ide';

export function IDELayout() {
  const selectedLanguage = useIDEStore((state) => state.selectedLanguage);
  const ui = useIDEStore((state) => state.ui);
  const availableLanguages = useIDEStore((state) => state.availableLanguages);
  const setBottomPanelHeight = useIDEStore((state) => state.setBottomPanelHeight);
  const setSidebarWidth = useIDEStore((state) => state.setSidebarWidth);
  const toggleSidebar = useIDEStore((state) => state.toggleSidebar);
  const resetCode = useIDEStore((state) => state.resetCode);
  const execution = useIDEStore((state) => state.execution);
  const executionId = execution.id;
  const statusKind = execution.statusKind;
  const executionVerdict = execution.verdict;
  const launchToken = useIDEStore((state) => state.launchToken);
  const problem = useIDEStore((state) => state.problem);
  const contextStatus = useIDEStore((state) => state.contextStatus);
  const contextError = useIDEStore((state) => state.contextError);
  const judgeFeatures = useIDEStore((state) => state.judgeFeatures);
  const setTestcases = useIDEStore((state) => state.setTestcases);
  const testcases = useIDEStore((state) => state.testcases);
  const [activePanel, setActivePanel] = useState<BottomPanel>('output');
  const [judgeDialog, setJudgeDialog] = useState<{ title: string; message: string; verdict: Verdict; primaryAction?: 'submit' } | null>(null);
  const { notify } = useToast();
  const lastRunResultRef = useRef<string | undefined>(undefined);
  const lastSubmissionResultRef = useRef<string | undefined>(undefined);
  const judgeActions = useJudgeActions({ notify });
  const language = getLanguage(selectedLanguage, availableLanguages);

  useVibeLaunchContext(notify);
  useExecutionSocket(executionId, launchToken, statusKind, execution.phase);
  useKeyboardShortcuts({ run: judgeActions.run, submit: judgeActions.submit, save: judgeActions.save });

  useEffect(() => {
    if (!executionId || statusKind !== 'run' || !isTerminalExecution(execution) || lastRunResultRef.current === executionId) return;

    lastRunResultRef.current = executionId;
    setTestcases(testcasesWithRunOutput(testcases, execution));
    setActivePanel('testcases');

    if (executionVerdict === 'Accepted') return;

    setJudgeDialog({
      verdict: executionVerdict,
      title: judgeTitle(executionVerdict),
      message: 'No se pudieron ejecutar los casos de prueba. Revisa tu código o el caso de prueba personalizado.',
    });
  }, [execution, executionId, executionVerdict, notify, setTestcases, statusKind, testcases]);

  useEffect(() => {
    if (!executionId || statusKind !== 'submission' || !isTerminalExecution(execution) || lastSubmissionResultRef.current === executionId) return;

    lastSubmissionResultRef.current = executionId;
    setJudgeDialog({
      verdict: executionVerdict,
      title: judgeTitle(executionVerdict),
      message: submissionMessage(executionVerdict),
    });
  }, [execution, executionId, executionVerdict, statusKind]);

  const startBottomPanelResize = useVerticalPanelResize({
    currentHeight: ui.bottomPanelHeight,
    min: PANEL_HEIGHT_BOUNDS.min,
    max: PANEL_HEIGHT_BOUNDS.max,
    onResize: setBottomPanelHeight,
  });

  const startSidebarResize = useHorizontalPanelResize({
    currentWidth: ui.sidebarWidth,
    min: SIDEBAR_WIDTH_BOUNDS.min,
    max: SIDEBAR_WIDTH_BOUNDS.max,
    maxViewportRatio: SIDEBAR_WIDTH_BOUNDS.viewportRatio,
    onResize: setSidebarWidth,
  });

  return (
    <div className={`${COLOR_THEME_CLASS[ui.colorTheme]} min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_36rem),#070b12] text-slate-100`}>
      <ToastViewport />
      <JudgeResultDialog
        open={Boolean(judgeDialog)}
        verdict={judgeDialog?.verdict ?? 'Pending'}
        title={judgeDialog?.title ?? ''}
        message={judgeDialog?.message ?? ''}
        primaryActionLabel={judgeDialog?.primaryAction === 'submit' ? 'Enviar solución' : undefined}
        showVerdictBadge={judgeDialog?.primaryAction !== 'submit'}
        onPrimaryAction={judgeDialog?.primaryAction === 'submit' ? () => {
          setJudgeDialog(null);
          void judgeActions.submit();
        } : undefined}
        onClose={() => setJudgeDialog(null)}
      />
      <div className="flex h-screen min-h-[720px]">
        <ProblemSidebar collapsed={ui.sidebarCollapsed} width={ui.sidebarWidth} problem={problem} onResizeStart={startSidebarResize} />

        <main className="flex min-w-0 flex-1 flex-col p-2 md:p-3">
          <WorkspaceHeader
            fileExtension={language.extension}
            busyAction={judgeActions.busyAction}
            contextStatus={contextStatus}
            judgeFeatures={judgeFeatures}
            onDownload={judgeActions.download}
            onReset={() => resetCode(selectedLanguage)}
            onRun={judgeActions.run}
            onSubmit={judgeActions.submit}
            onToggleSidebar={toggleSidebar}
          />
          <ContextStatusBanner status={contextStatus} error={contextError} />

          <section className="min-h-0 flex-1">
            <CodeEditor />
          </section>

          <div onPointerDown={startBottomPanelResize} className="resize-handle my-2 h-2 rounded-full bg-slate-900 transition hover:bg-sky-500/40" />
          <BottomPanelArea activePanel={activePanel} height={ui.bottomPanelHeight} onPanelChange={setActivePanel} />
        </main>
      </div>
    </div>
  );
}

function isTerminalExecution(execution: ExecutionResult) {
  return execution.phase === 'completed' || execution.phase === 'error';
}

function testcasesWithRunOutput(testcases: readonly Testcase[], execution: ExecutionResult): readonly Testcase[] {
  const testcaseResults = execution.testcaseResults ?? [];
  if (testcaseResults.length) {
    return testcases.map((testcase, index) => {
      const result = testcaseResults.find((item) => item.id === testcase.id) ?? testcaseResults[index];
      if (!result) return testcase;

      return {
        ...testcase,
        actualOutput: result.actualOutput,
        expectedOutput: result.expectedOutput ?? testcase.expectedOutput,
        status: result.status ?? statusFromVerdict(execution.verdict),
        expanded: true,
      };
    });
  }

  if (!execution.stdout && !execution.stderr && !execution.compileErrors) return testcases;

  return testcases.map((testcase, index) => ({
    ...testcase,
    actualOutput: index === 0 ? execution.stdout : testcase.actualOutput,
    status: statusFromVerdict(execution.verdict),
    expanded: index === 0 ? true : testcase.expanded,
  }));
}

function statusFromVerdict(verdict: Verdict): Testcase['status'] {
  if (verdict === 'Accepted') return 'passed';
  if (verdict === 'Wrong Answer') return 'failed';
  if (verdict === 'Pending') return 'running';
  return 'error';
}

function judgeTitle(verdict: Verdict) {
  const titles: Record<Verdict, string> = {
    Accepted: 'Envío aceptado',
    'Wrong Answer': 'Wrong Answer',
    'Compilation Error': 'Error de compilación',
    'Runtime Error': 'Error en ejecución',
    'Time Limit Exceeded': 'Tiempo límite excedido',
    Pending: 'Evaluando...',
    'Internal Error': 'Error interno del juez',
  };

  return titles[verdict];
}

function submissionMessage(verdict: Verdict) {
  if (verdict === 'Accepted') return 'Tu envío fue aceptado por el juez.';
  if (verdict === 'Wrong Answer') return 'El juez rechazó la solución por respuesta incorrecta. Revisa los casos y vuelve a intentarlo.';
  if (verdict === 'Compilation Error') return 'El juez no pudo compilar tu solución. Revisa los errores de compilación.';
  if (verdict === 'Runtime Error') return 'Tu solución falló durante la ejecución. Revisa excepciones, accesos inválidos o formato de entrada.';
  if (verdict === 'Time Limit Exceeded') return 'Tu solución excedió el tiempo límite. Revisa la complejidad del algoritmo.';
  return 'El juez terminó de evaluar tu envío. Revisa los detalles del resultado.';
}
