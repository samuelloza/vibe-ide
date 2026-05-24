import type { JsonRpcMessage, LspStatusListener } from '@/lsp/types';
import type { LanguageDefinition } from '@/types/ide';

type MessageListener = (message: JsonRpcMessage) => void;

type PendingRequest = {
  readonly resolve: (message: JsonRpcMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CONNECT_ATTEMPTS = 4;
const CONNECT_RETRY_DELAY_MS = 750;

export class BrowserLspClient {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly listeners = new Set<MessageListener>();
  private readonly pendingMessages: JsonRpcMessage[] = [];
  private readonly pendingRequests = new Map<number | string, PendingRequest>();
  private connectAttempt = 0;
  private closedByClient = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  constructor(
    private readonly language: LanguageDefinition,
    private readonly route: string,
    private readonly onStatus: LspStatusListener,
  ) {}

  connect() {
    this.closedByClient = false;
    this.openSocket();
  }

  private openSocket() {
    this.connectAttempt += 1;
    this.onStatus('connecting', `Connecting ${this.language.label} language server...`);
    const socket = new WebSocket(this.websocketUrl());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.initialized = false;
      this.onStatus('connected', `${this.language.label} language server connected.`);
      this.initialize();
    });

    socket.addEventListener('message', (event) => {
      const parsed = safeParseMessage(event.data);
      if (!parsed) return;
      this.resolvePendingRequest(parsed);
      this.listeners.forEach((listener) => listener(parsed));
    });

    socket.addEventListener('error', () => {
      if (this.closedByClient) return;
      this.onStatus('connecting', `${this.language.label} language server connection failed. Retrying...`);
    });

    socket.addEventListener('close', (event) => {
      if (this.socket === socket) this.socket = null;

      if (this.closedByClient) {
        this.rejectPendingRequests(`${this.language.label} language server closed.`);
        return;
      }

      const detail = closeDetail(this.language.label, event);
      this.rejectPendingRequests(detail);

      if (this.scheduleReconnect()) {
        this.onStatus('connecting', `${detail} Retrying...`);
        return;
      }

      this.onStatus('error', detail);
    });
  }

  close() {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
    this.rejectPendingRequests(`${this.language.label} language server closed.`);
  }

  onMessage(listener: MessageListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(method: string, params?: unknown) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  request(method: string, params?: unknown): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    const request = { jsonrpc: '2.0', id, method, params } as const;

    const response = new Promise<JsonRpcMessage>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`${this.language.label} LSP request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(id, { resolve, reject, timeoutId });
    });

    this.send(request);
    return response;
  }

  private initialize() {
    void this.request('initialize', {
      processId: null,
      rootUri: 'file:///workspace',
      workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              insertReplaceSupport: false,
              labelDetailsSupport: true,
            },
            contextSupport: true,
          },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: { configuration: false, workspaceFolders: true },
      },
    }).then(() => {
      this.connectAttempt = 0;
      this.initialized = true;
      this.notify('initialized', {});
      this.flushPendingMessages();
    }).catch((error) => {
      if (this.closedByClient || this.reconnectTimer) return;
      this.onStatus('error', error instanceof Error ? error.message : 'Language server initialization failed.');
    });
  }

  private send(message: JsonRpcMessage) {
    if (message.method !== 'initialize' && !this.initialized) {
      this.pendingMessages.push(message);
      return;
    }

    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(message);
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private flushPendingMessages() {
    while (this.pendingMessages.length > 0) {
      this.send(this.pendingMessages.shift()!);
    }
  }

  private resolvePendingRequest(message: JsonRpcMessage) {
    if (message.id === undefined) return;
    const pending = this.pendingRequests.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
      return;
    }

    pending.resolve(message);
  }

  private scheduleReconnect() {
    if (this.connectAttempt >= MAX_CONNECT_ATTEMPTS || this.reconnectTimer) return false;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByClient) this.openSocket();
    }, CONNECT_RETRY_DELAY_MS);
    return true;
  }

  private rejectPendingRequests(message: string) {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      this.pendingRequests.delete(id);
    }
  }

  private websocketUrl() {
    const url = new URL(this.route, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }
}

function safeParseMessage(value: unknown): JsonRpcMessage | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as JsonRpcMessage;
    return parsed && parsed.jsonrpc === '2.0' ? parsed : null;
  } catch {
    return null;
  }
}

function closeDetail(languageLabel: string, event: CloseEvent) {
  const reason = event.reason?.trim();
  const suffix = reason ? `: ${reason}` : event.code ? ` (code ${event.code})` : '';
  return `${languageLabel} language server disconnected${suffix}.`;
}
