'use client';

import { useCallback } from 'react';
import { errorMessage } from '@/lib/errors';
import { getRun, judgePollingIntervalMs, runCode } from '@/services/judge-api';
import { useIDEStore } from '@/store/ide-store';
import type { ExecutionResult, RunPayload, SubmissionStatusMessage, Testcase, Verdict } from '@/types/ide';

const TERMINAL_PHASES = new Set(['completed', 'error']);
const MAX_RUN_POLLS = 120;

export function useRunAction({
  payload,
  ensureAllowedLanguage,
  setBusyAction,
  notify,
}: {
  readonly payload: RunPayload;
  readonly ensureAllowedLanguage: () => boolean;
  readonly setBusyAction: (action: 'run' | null) => void;
  readonly notify: (message: string) => void;
}) {
  const launchToken = useIDEStore((state) => state.launchToken);
  const setExecution = useIDEStore((state) => state.setExecution);
  const setTestcases = useIDEStore((state) => state.setTestcases);
  const updateTestcase = useIDEStore((state) => state.updateTestcase);

  return useCallback(async () => {
    if (!ensureAllowedLanguage()) return;
    setBusyAction('run');

    const runnableTestcases = (payload.testcases ?? []).filter((testcase) => testcase.input);
    const shouldRunOneByOne = runnableTestcases.length > 0;

    setExecution({ statusKind: undefined, phase: 'queued', verdict: 'Pending', stdout: '', stderr: '', compileErrors: '', logs: ['Ejecución de casos solicitada.'] });

    try {
      if (shouldRunOneByOne) {
        await runTestcasesOneByOne({ payload, launchToken, runnableTestcases, setExecution, setTestcases, updateTestcase });
        notify('Se ejecutaron los casos de prueba.');
        return;
      }

      const response = await runCode(payload, launchToken);
      setExecution(
        response.result
          ? { ...response.result, statusKind: 'run' }
          : {
              id: response.runId,
              statusKind: 'run',
              phase: 'running',
              verdict: 'Pending',
              stdout: '',
              stderr: '',
              compileErrors: '',
              logs: ['Ejecución aceptada por el juez. Esperando resultado.'],
            },
      );
      notify('Ejecutando casos.');
    } catch (error) {
      setExecution({ statusKind: undefined, phase: 'error', verdict: 'Internal Error', logs: [errorMessage(error, 'Error desconocido al ejecutar los casos.')] });
      notify('No se pudieron ejecutar los casos. Revisa la configuración del API del juez.');
    } finally {
      setBusyAction(null);
    }
  }, [ensureAllowedLanguage, launchToken, notify, payload, setBusyAction, setExecution, setTestcases, updateTestcase]);
}

async function runTestcasesOneByOne({
  payload,
  launchToken,
  runnableTestcases,
  setExecution,
  setTestcases,
  updateTestcase,
}: {
  readonly payload: RunPayload;
  readonly launchToken?: string;
  readonly runnableTestcases: readonly Testcase[];
  readonly setExecution: (execution: Partial<ExecutionResult>) => void;
  readonly setTestcases: (testcases: readonly Testcase[]) => void;
  readonly updateTestcase: (id: string, testcase: Partial<Testcase>) => void;
}) {
  const total = runnableTestcases.length;
  const testcaseResults: NonNullable<ExecutionResult['testcaseResults']>[number][] = [];
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const compileErrorParts: string[] = [];
  const logs: string[] = [`Ejecutando ${total} casos de prueba para debug.`];
  const verdicts: Verdict[] = [];

  setTestcases(
    (payload.testcases ?? []).map((testcase) => ({
      ...testcase,
      actualOutput: '',
      status: runnableTestcases.some((item) => item.id === testcase.id) ? 'idle' : testcase.status,
    })),
  );

  for (const [index, testcase] of runnableTestcases.entries()) {
    const caseLabel = testcase.name || `Caso ${index + 1}`;
    updateTestcase(testcase.id, { status: 'running', actualOutput: '', expanded: true });
    setExecution({
      statusKind: undefined,
      phase: 'running',
      verdict: 'Pending',
      logs: [...logs, `Ejecutando ${caseLabel} (${index + 1}/${total}).`],
    });

    const result = await runSingleTestcase(payload, testcase, launchToken);
    const firstCaseResult = result.testcaseResults?.[0];
    const status = firstCaseResult?.status ?? testcaseStatusFromVerdict(result.verdict);
    const actualOutput = firstCaseResult?.actualOutput ?? result.stdout;
    verdicts.push(result.verdict);

    testcaseResults.push({
      id: testcase.id,
      name: testcase.name,
      actualOutput,
      status,
    });

    if (result.stdout) stdoutParts.push(`### ${caseLabel}\n${result.stdout}`);
    if (result.stderr) stderrParts.push(`### ${caseLabel}\n${result.stderr}`);
    if (result.compileErrors) compileErrorParts.push(`### ${caseLabel}\n${result.compileErrors}`);
    logs.push(`${caseLabel}: salida generada`);

    updateTestcase(testcase.id, {
      actualOutput,
      status,
      expanded: true,
    });
  }

  const verdict = aggregateVerdict(verdicts);
  setExecution({
    id: `run-${Date.now()}`,
    statusKind: 'run',
    phase: 'completed',
    verdict,
    stdout: stdoutParts.join('\n\n'),
    stderr: stderrParts.join('\n\n'),
    compileErrors: compileErrorParts.join('\n\n'),
    logs,
    testcaseResults,
  });
}


function debugTestcase(testcase: Testcase): Testcase {
  return {
    ...testcase,
    expectedOutput: undefined,
  };
}

async function runSingleTestcase(payload: RunPayload, testcase: Testcase, launchToken?: string): Promise<ExecutionResult> {
  const response = await runCode(
    {
      ...payload,
      stdin: testcase.input,
      testcases: [debugTestcase(testcase)],
    },
    launchToken,
  );

  if (response.result) return response.result;

  const pollingInterval = await judgePollingIntervalMs();
  if (pollingInterval <= 0) {
    return {
      id: response.runId,
      phase: 'running',
      verdict: 'Pending',
      stdout: '',
      stderr: '',
      compileErrors: '',
      logs: ['El juez aceptó el caso, pero no hay polling configurado para obtener el resultado.'],
    };
  }

  for (let attempt = 0; attempt < MAX_RUN_POLLS; attempt++) {
    await delay(pollingInterval);
    const status = await getRun(response.runId, launchToken);
    if (TERMINAL_PHASES.has(status.phase)) return executionFromStatus(status);
  }

  return {
    id: response.runId,
    phase: 'error',
    verdict: 'Internal Error',
    stdout: '',
    stderr: 'Se agotó el tiempo esperando el resultado del caso de prueba.',
    compileErrors: '',
    logs: ['Timeout esperando el resultado del juez.'],
  };
}

function executionFromStatus(status: SubmissionStatusMessage): ExecutionResult {
  return {
    id: status.submissionId,
    phase: status.phase,
    verdict: status.verdict ?? 'Pending',
    stdout: status.stdout ?? '',
    stderr: status.stderr ?? '',
    compileErrors: status.compileErrors ?? '',
    logs: status.logs ?? [],
    runtimeMs: status.runtimeMs,
    memoryKb: status.memoryKb,
    testcaseResults: status.testcaseResults,
  };
}

function testcaseStatusFromVerdict(verdict: Verdict): Testcase['status'] {
  if (verdict === 'Accepted') return 'passed';
  if (verdict === 'Wrong Answer') return 'failed';
  if (verdict === 'Pending') return 'running';
  return 'error';
}

function aggregateVerdict(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.every((verdict) => verdict === 'Accepted')) return 'Accepted';
  return verdicts.find((verdict) => verdict !== 'Accepted' && verdict !== 'Pending') ?? 'Pending';
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
