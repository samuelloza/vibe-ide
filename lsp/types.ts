export type LspStatus = 'disabled' | 'connecting' | 'connected' | 'error';

export type LspStatusListener = (status: LspStatus, detail: string) => void;

export type JsonRpcMessage = {
  readonly jsonrpc: '2.0';
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
};
