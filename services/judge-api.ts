import { requestJson } from '@/services/http-client';
import type { ExecutionResult, JudgeLanguageOption, RunPayload, SubmissionPayload, SubmissionStatusMessage, Verdict } from '@/types/ide';

const API_BASE_URL = process.env.NEXT_PUBLIC_JUDGE_API_URL ?? 'https://juezvirtual.com.bo/api';

type RunResponse = {
  readonly runId: string;
  readonly result?: ExecutionResult;
};

type SubmitResponse = {
  readonly submissionId: string;
};

type PublicSubmitResponse = {
  readonly solutionId: number;
};

type PublicLanguageResponse = {
  readonly languageId: number;
  readonly name: string;
};

type AssignmentDetailResponse = {
  readonly assignment: {
    readonly statusKey?: string;
    readonly statusLabel?: string;
  };
};

type ContestReportResponse = {
  readonly status?: string;
};

type PublicSubmissionStatusResponse = {
  readonly solutionId: number;
  readonly statusLabel?: string;
  readonly statusKey?: string;
  readonly generalStatusKey?: string;
  readonly isFinal?: boolean;
  readonly timeMs?: number;
  readonly memoryKb?: number;
  readonly compileMessage?: string;
  readonly runtimeMessage?: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

function endpoint(path: string) {
  return `${trimTrailingSlash(API_BASE_URL)}${path}`;
}

function authHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const token = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('accessToken='))
    ?.split('=')
    .slice(1)
    .join('=');

  return token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : {};
}

export async function fetchLanguages(): Promise<JudgeLanguageOption[]> {
  return requestJson<PublicLanguageResponse[]>(endpoint('/public/languages'), {
    credentials: 'include',
    headers: authHeaders(),
  });
}

export async function getSubmissionBlockedReason(context: { readonly courseId?: string; readonly assignmentId?: string; readonly contestId?: string }): Promise<string | null> {
  if (context.courseId && context.assignmentId) {
    const courseId = Number(context.courseId);
    const assignmentId = Number(context.assignmentId);
    if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(assignmentId) || assignmentId <= 0) return null;

    const response = await requestJson<AssignmentDetailResponse>(endpoint(`/academic/sites/1/courses/${courseId}/assignments/${assignmentId}`), {
      credentials: 'include',
      headers: authHeaders(),
    });

    switch (response.assignment.statusKey) {
      case 'inactive':
        return 'Esta tarea está inactiva y no acepta envíos.';
      case 'upcoming':
        return 'Esta tarea todavía no acepta envíos.';
      case 'finished':
        return 'Esta tarea ya finalizó y no acepta envíos.';
      default:
        return null;
    }
  }

  if (context.contestId) {
    const contestId = Number(context.contestId);
    if (!Number.isInteger(contestId) || contestId <= 0) return null;

    const response = await requestJson<ContestReportResponse>(endpoint(`/public/contests/${contestId}/report?siteId=1`), {
      credentials: 'include',
      headers: authHeaders(),
    });

    switch (response.status) {
      case 'UPCOMING':
        return 'Este concurso todavía no acepta envíos.';
      case 'FINISHED':
        return 'Este concurso ya finalizó y no acepta envíos.';
      default:
        return null;
    }
  }

  return null;
}

export async function runCode(payload: RunPayload): Promise<RunResponse> {
  return {
    runId: crypto.randomUUID(),
    result: {
      phase: 'completed',
      verdict: 'Pending',
      stdout: '',
      stderr: '',
      compileErrors: '',
      logs: [
        'El backend actual no expone un endpoint público de ejecución rápida (/run).',
        'Usa "Enviar" para mandar la solución al juez oficial.',
      ],
    },
  };
}

export async function submitCode(payload: SubmissionPayload): Promise<SubmitResponse> {
  const response = await requestJson<PublicSubmitResponse>(endpoint('/public/submit'), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify({
      problemId: payload.problemId ? Number(payload.problemId) : undefined,
      contestProblemId: payload.contestProblemId || undefined,
      sourceCode: payload.sourceCode,
      languageId: payload.languageId ? Number(payload.languageId) : undefined,
      contestId: payload.contestId ? Number(payload.contestId) : undefined,
      courseId: payload.courseId ? Number(payload.courseId) : undefined,
      assignmentId: payload.assignmentId ? Number(payload.assignmentId) : undefined,
      fileName: `main.${payload.language}`,
    }),
  });

  return { submissionId: String(response.solutionId) };
}

export async function getSubmission(submissionId: string): Promise<SubmissionStatusMessage> {
  const response = await requestJson<PublicSubmissionStatusResponse>(endpoint(`/public/submissions/${submissionId}`), {
    credentials: 'include',
    headers: authHeaders(),
  });

  return {
    submissionId: String(response.solutionId),
    phase: response.isFinal ? 'completed' : 'running',
    verdict: mapVerdict(response.statusKey, response.statusLabel),
    stdout: '',
    stderr: response.runtimeMessage ?? '',
    compileErrors: response.compileMessage ?? '',
    logs: [response.statusLabel ?? response.statusKey ?? 'Submission status received.'],
    runtimeMs: response.timeMs,
    memoryKb: response.memoryKb,
  };
}

export function judgeWebSocketUrl(submissionId: string) {
  const configured = process.env.NEXT_PUBLIC_JUDGE_WS_URL;
  if (configured) return `${trimTrailingSlash(configured)}/submission/${submissionId}`;

  let httpUrl: URL;
  try {
    httpUrl = new URL(API_BASE_URL);
  } catch {
    throw new Error('NEXT_PUBLIC_JUDGE_API_URL must be an absolute http(s) URL when NEXT_PUBLIC_JUDGE_WS_URL is not set.');
  }

  httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${trimTrailingSlash(httpUrl.toString())}/submission/${submissionId}`;
}

function mapVerdict(statusKey?: string, statusLabel?: string): Verdict {
  const normalized = `${statusKey ?? ''} ${statusLabel ?? ''}`.toLowerCase();
  if (normalized.includes('accept')) return 'Accepted';
  if (normalized.includes('wrong')) return 'Wrong Answer';
  if (normalized.includes('compil')) return 'Compilation Error';
  if (normalized.includes('runtime')) return 'Runtime Error';
  if (normalized.includes('time')) return 'Time Limit Exceeded';
  if (normalized.includes('error')) return 'Internal Error';
  return 'Pending';
}
