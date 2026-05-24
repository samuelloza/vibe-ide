import type { JudgeLanguageOption, LanguageDefinition, LanguageId } from '@/types/ide';

export const DEFAULT_LANGUAGE_ID: LanguageId = 'cpp';

const languageMatchers = [
  { pattern: /\bc\+\+\b|g\+\+|gnu\+\+|gnu c\+\+|clang\+\+|cpp|cxx/, language: 'cpp' },
  { pattern: /\bjava\b|openjdk|jdk/, language: 'java' },
  { pattern: /\bpython\b|pypy/, language: 'python' },
  { pattern: /javascript|node/, language: 'javascript' },
  { pattern: /rust/, language: 'rust' },
  { pattern: /\bgo\b|golang/, language: 'go' },
] as const;

const preferredLanguagePatterns = [
  /\bc\+\+\b|g\+\+|gnu\+\+|gnu c\+\+|clang\+\+|cpp|cxx/,
  /\bjava\b|openjdk|jdk/,
  /\bpython\b|pypy/,
  /javascript|node/,
  /rust/,
  /\bgo\b|golang/,
  /\bc(?!\+\+)/,
  /pascal|free pascal/,
];

export const LANGUAGES = [
  {
    id: 'cpp',
    label: 'C++17',
    monacoLanguage: 'cpp',
    judgeLanguage: 'cpp17',
    extension: 'cpp',
    defaultCode: `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  return 0;
}
`,
  },
  {
    id: 'python',
    label: 'Python 3',
    monacoLanguage: 'python',
    judgeLanguage: 'python3',
    extension: 'py',
    defaultCode: `def main():
    pass


if __name__ == "__main__":
    main()
`,
  },
  {
    id: 'java',
    label: 'Java 17',
    monacoLanguage: 'java',
    judgeLanguage: 'java17',
    extension: 'java',
    defaultCode: `public class Main {
  public static void main(String[] args) throws Exception {

  }
}
`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    judgeLanguage: 'nodejs',
    extension: 'js',
    defaultCode: `function main() {

}

main();
`,
  },
  {
    id: 'rust',
    label: 'Rust',
    monacoLanguage: 'rust',
    judgeLanguage: 'rust',
    extension: 'rs',
    defaultCode: `fn main() {

}
`,
  },
  {
    id: 'go',
    label: 'Go',
    monacoLanguage: 'go',
    judgeLanguage: 'go',
    extension: 'go',
    defaultCode: `package main

func main() {

}
`,
  },
] as const satisfies readonly LanguageDefinition[];

export function isLanguageId(value: string): value is LanguageId {
  return LANGUAGES.some((language) => language.id === value);
}

export function getLanguage(languageId: LanguageId): LanguageDefinition {
  return LANGUAGES.find((language) => language.id === languageId) ?? LANGUAGES[0];
}

export function createDefaultCodeByLanguage(): Record<LanguageId, string> {
  return LANGUAGES.reduce(
    (codeByLanguage, language) => ({ ...codeByLanguage, [language.id]: language.defaultCode }),
    {} as Record<LanguageId, string>,
  );
}

export function defaultCodeFor(languageId: LanguageId): string {
  return getLanguage(languageId).defaultCode;
}


export function languageIdFromJudgeLanguageName(languageName?: string): LanguageId {
  const normalized = String(languageName ?? '').toLowerCase();
  return languageMatchers.find((item) => item.pattern.test(normalized))?.language ?? DEFAULT_LANGUAGE_ID;
}

export function sortJudgeLanguagesForEditor(languages: readonly JudgeLanguageOption[]): JudgeLanguageOption[] {
  return [...languages].sort((left, right) => {
    const leftPriority = preferredLanguagePatterns.findIndex((pattern) => pattern.test(left.name.toLowerCase()));
    const rightPriority = preferredLanguagePatterns.findIndex((pattern) => pattern.test(right.name.toLowerCase()));
    const normalizedLeft = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
    const normalizedRight = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;

    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
  });
}

export function defaultJudgeLanguageId(languages: readonly JudgeLanguageOption[]): string | undefined {
  return sortJudgeLanguagesForEditor(languages)[0]?.languageId.toString();
}

export function judgeLanguageForEditorLanguage(languages: readonly JudgeLanguageOption[], editorLanguage: LanguageId): JudgeLanguageOption | undefined {
  const sorted = sortJudgeLanguagesForEditor(languages);
  return sorted.find((language) => languageIdFromJudgeLanguageName(language.name) === editorLanguage) ?? sorted[0];
}
