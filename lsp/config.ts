import type { LanguageId } from '@/types/ide';

export type LanguageServerConfig = {
  readonly language: LanguageId;
  readonly name: string;
  readonly route: string;
  readonly enabled: boolean;
};

export const LANGUAGE_SERVER_CONFIG: Readonly<Record<LanguageId, LanguageServerConfig>> = {
  cpp: { language: 'cpp', name: 'clangd', route: '/api/lsp/cpp', enabled: true },
  python: { language: 'python', name: 'Pyright', route: '/api/lsp/python', enabled: true },
  java: { language: 'java', name: 'JDT LS', route: '/api/lsp/java', enabled: true },
  javascript: { language: 'javascript', name: 'TypeScript LS', route: '/api/lsp/js', enabled: true },
  rust: { language: 'rust', name: 'rust-analyzer', route: '/api/lsp/rust', enabled: true },
  go: { language: 'go', name: 'gopls', route: '/api/lsp/go', enabled: true },
};

export function getLanguageServerConfig(language: LanguageId): LanguageServerConfig {
  return LANGUAGE_SERVER_CONFIG[language];
}
