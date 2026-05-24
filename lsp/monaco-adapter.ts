import type * as Monaco from 'monaco-editor';
import { BrowserLspClient } from '@/lsp/browser-client';
import { getLanguageServerConfig } from '@/lsp/config';
import { workspaceDocumentUri } from '@/lsp/document-uri';
import type { JsonRpcMessage, LspStatusListener } from '@/lsp/types';
import type { LanguageDefinition } from '@/types/ide';

type MonacoEditor = Monaco.editor.IStandaloneCodeEditor;

type LspCompletionItem = {
  readonly label?: string | { readonly label?: string };
  readonly kind?: number;
  readonly detail?: string;
  readonly documentation?: string | { readonly value?: string };
  readonly insertText?: string;
  readonly textEdit?: {
    readonly newText?: string;
    readonly range?: LspRange;
  };
};

type LspRange = {
  readonly start?: { readonly line?: number; readonly character?: number };
  readonly end?: { readonly line?: number; readonly character?: number };
};

export function attachLanguageServer(
  monaco: typeof Monaco,
  editor: MonacoEditor,
  language: LanguageDefinition,
  onStatus: LspStatusListener,
) {
  const config = getLanguageServerConfig(language.id);
  if (!config.enabled) {
    onStatus('disabled', `${config.name} is not configured.`);
    return undefined;
  }

  const model = editor.getModel();
  if (!model) {
    onStatus('disabled', 'Editor model is not ready.');
    return undefined;
  }

  const documentUri = workspaceDocumentUri(language);
  const client = new BrowserLspClient(language, config.route, onStatus);
  const disposeMessageListener = client.onMessage((message) => {
    handleLspMessage(monaco, model, language, message);
  });
  client.connect();

  let version = 1;
  client.notify('textDocument/didOpen', {
    textDocument: {
      uri: documentUri,
      languageId: language.monacoLanguage,
      version,
      text: model.getValue(),
    },
  });

  const contentSubscription = model.onDidChangeContent(() => {
    version += 1;
    client.notify('textDocument/didChange', {
      textDocument: { uri: documentUri, version },
      contentChanges: [{ text: model.getValue() }],
    });
  });

  const completionProvider = ensureLspCompletionProvider(monaco, language, client, documentUri);

  return () => {
    completionProvider.dispose();
    contentSubscription.dispose();
    disposeMessageListener();
    client.notify('textDocument/didClose', { textDocument: { uri: documentUri } });
    client.close();
    monaco.editor.setModelMarkers(model, `lsp-${language.id}`, []);
  };
}

export function ensureLspCompletionProvider(
  monaco: typeof Monaco,
  language: LanguageDefinition,
  client: BrowserLspClient,
  documentUri: string,
) {
  return monaco.languages.registerCompletionItemProvider(language.monacoLanguage, {
    triggerCharacters: ['.', ':', '<', '"', "'", '/', '@'],
    provideCompletionItems: async (model, position, _context) => {
      const fallback = fallbackSuggestions(monaco, model, position, language);

      try {
        const response = await client.request('textDocument/completion', {
          textDocument: { uri: documentUri },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
          context: {
            triggerKind: 1,
          },
        });

        const lspItems = completionItemsFromResult(response.result);
        const suggestions = lspItems.map((item) => completionItemToMonaco(monaco, item, model, position));
        return { suggestions: suggestions.length > 0 ? suggestions : fallback };
      } catch {
        return { suggestions: fallback };
      }
    },
  });
}

function handleLspMessage(monaco: typeof Monaco, model: Monaco.editor.ITextModel, language: LanguageDefinition, message: JsonRpcMessage) {
  if (message.method !== 'textDocument/publishDiagnostics') return;
  const params = asRecord(message.params);
  const diagnostics = Array.isArray(params?.diagnostics) ? params.diagnostics : [];
  const markers = diagnostics.map((diagnostic) => diagnosticToMarker(monaco, diagnostic)).filter((marker): marker is Monaco.editor.IMarkerData => Boolean(marker));
  monaco.editor.setModelMarkers(model, `lsp-${language.id}`, markers);
}

function completionItemsFromResult(result: unknown): LspCompletionItem[] {
  if (Array.isArray(result)) return result as LspCompletionItem[];

  const record = asRecord(result);
  if (Array.isArray(record?.items)) return record.items as LspCompletionItem[];

  return [];
}

function completionItemToMonaco(
  monaco: typeof Monaco,
  item: LspCompletionItem,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem {
  const label = typeof item.label === 'string' ? item.label : item.label?.label ?? item.insertText ?? 'completion';
  const word = model.getWordUntilPosition(position);
  const fallbackRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  return {
    label,
    kind: lspCompletionKind(monaco, item.kind),
    detail: item.detail,
    documentation: completionDocumentation(item.documentation),
    insertText: item.textEdit?.newText ?? item.insertText ?? label,
    range: lspRangeToMonaco(item.textEdit?.range) ?? fallbackRange,
  };
}

function completionDocumentation(value: LspCompletionItem['documentation']) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.value;
}

function lspRangeToMonaco(range?: LspRange): Monaco.IRange | undefined {
  const start = range?.start;
  const end = range?.end;
  if (start?.line === undefined || start.character === undefined || end?.line === undefined || end.character === undefined) return undefined;

  return {
    startLineNumber: start.line + 1,
    startColumn: start.character + 1,
    endLineNumber: end.line + 1,
    endColumn: end.character + 1,
  };
}

function lspCompletionKind(monaco: typeof Monaco, kind?: number) {
  const CompletionItemKind = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 2:
      return CompletionItemKind.Method;
    case 3:
      return CompletionItemKind.Function;
    case 4:
      return CompletionItemKind.Constructor;
    case 5:
      return CompletionItemKind.Field;
    case 6:
      return CompletionItemKind.Variable;
    case 7:
      return CompletionItemKind.Class;
    case 8:
      return CompletionItemKind.Interface;
    case 9:
      return CompletionItemKind.Module;
    case 10:
      return CompletionItemKind.Property;
    case 13:
      return CompletionItemKind.Keyword;
    case 15:
      return CompletionItemKind.Snippet;
    case 17:
      return CompletionItemKind.File;
    case 21:
      return CompletionItemKind.Constant;
    default:
      return CompletionItemKind.Text;
  }
}

function diagnosticToMarker(monaco: typeof Monaco, value: unknown): Monaco.editor.IMarkerData | null {
  const diagnostic = asRecord(value);
  const range = asRecord(diagnostic?.range);
  const start = asRecord(range?.start);
  const end = asRecord(range?.end);
  if (!start || !end) return null;

  return {
    severity: diagnosticSeverity(monaco, Number(diagnostic?.severity ?? 1)),
    message: String(diagnostic?.message ?? 'Language server diagnostic'),
    startLineNumber: Number(start.line ?? 0) + 1,
    startColumn: Number(start.character ?? 0) + 1,
    endLineNumber: Number(end.line ?? start.line ?? 0) + 1,
    endColumn: Number(end.character ?? start.character ?? 0) + 1,
  };
}

function diagnosticSeverity(monaco: typeof Monaco, severity: number) {
  if (severity === 1) return monaco.MarkerSeverity.Error;
  if (severity === 2) return monaco.MarkerSeverity.Warning;
  if (severity === 3) return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Hint;
}

function fallbackSuggestions(monaco: typeof Monaco, model: Monaco.editor.ITextModel, position: Monaco.Position, language: LanguageDefinition): Monaco.languages.CompletionItem[] {
  const word = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  const common = [
    {
      label: 'main',
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: 'main',
      range,
    },
  ];

  if (language.id !== 'java') return common;

  return [
    {
      label: 'Scanner',
      kind: monaco.languages.CompletionItemKind.Class,
      insertText: 'Scanner',
      detail: 'java.util.Scanner',
      range,
    },
    {
      label: 'scanner stdin snippet',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: 'Scanner sc = new Scanner(System.in);',
      detail: 'Create Scanner for standard input',
      range,
    },
    ...common,
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
