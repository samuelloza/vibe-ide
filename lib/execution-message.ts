import type { ExecutionPhase, ExecutionTestcaseResult, SubmissionStatusMessage, TestcaseStatus, Verdict } from '@/types/ide';

const executionPhases = ['idle', 'queued', 'running', 'completed', 'error'] as const satisfies readonly ExecutionPhase[];
const verdicts = [
  'Accepted',
  'Wrong Answer',
  'Compilation Error',
  'Runtime Error',
  'Time Limit Exceeded',
  'Pending',
  'Internal Error',
] as const satisfies readonly Verdict[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExecutionPhase(value: unknown): value is ExecutionPhase {
  return typeof value === 'string' && executionPhases.some((phase) => phase === value);
}

function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && verdicts.some((verdict) => verdict === value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optionalStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function testcaseStatus(value: unknown, verdict: unknown): TestcaseStatus | undefined {
  if (value === 'passed' || value === 'failed' || value === 'error' || value === 'running' || value === 'idle') return value;
  if (verdict === 'Accepted') return 'passed';
  if (verdict === 'Wrong Answer') return 'failed';
  if (typeof verdict === 'string' && verdict !== 'Pending') return 'error';
  return undefined;
}

function optionalTestcaseResults(value: unknown): readonly ExecutionTestcaseResult[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const results: ExecutionTestcaseResult[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const actualOutput = item.actualOutput ?? item.stdout ?? item.output ?? item.obtainedOutput;
    if (typeof actualOutput !== 'string') continue;

    const id = optionalString(item.id);
    const name = optionalString(item.name);
    const expectedOutput = optionalString(item.expectedOutput);
    const status = testcaseStatus(item.status, item.verdict);

    results.push({
      actualOutput,
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(status ? { status } : {}),
    });
  }

  return results.length ? results : undefined;
}

export function parseSubmissionStatusMessage(value: unknown, fallbackId?: string): SubmissionStatusMessage | undefined {
  if (!isRecord(value) || !isExecutionPhase(value.phase)) return undefined;

  const id = value.submissionId ?? value.runId ?? value.id ?? fallbackId;
  if (typeof id !== 'string' || !id.trim()) return undefined;

  return {
    submissionId: id,
    phase: value.phase,
    verdict: isVerdict(value.verdict) ? value.verdict : undefined,
    stdout: optionalString(value.stdout),
    stderr: optionalString(value.stderr),
    compileErrors: optionalString(value.compileErrors),
    logs: optionalStringArray(value.logs),
    runtimeMs: optionalNumber(value.runtimeMs),
    memoryKb: optionalNumber(value.memoryKb),
    testcaseResults: optionalTestcaseResults(value.testcaseResults ?? value.testcases),
  };
}
