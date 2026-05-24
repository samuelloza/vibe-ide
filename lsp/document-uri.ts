import type { LanguageDefinition } from '@/types/ide';

export function lspDocumentFileName(language: LanguageDefinition) {
  if (language.id === 'java') return 'Main.java';
  return `main.${language.extension}`;
}

export function workspaceDocumentUri(language: LanguageDefinition) {
  return `file:///workspace/${lspDocumentFileName(language)}`;
}
