'use client';

import { useEffect } from 'react';
import {
  defaultJudgeLanguageId,
  judgeLanguageForEditorLanguage,
  languageIdFromJudgeLanguageName,
  sortJudgeLanguagesForEditor,
} from '@/lib/language-options';
import { COLOR_THEMES, isColorTheme } from '@/lib/ui-config';
import { fetchLanguages } from '@/services/judge-api';
import { useIDEStore } from '@/store/ide-store';

const selectClass =
  'h-10 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-sky-400';

export function LanguageSelector() {
  const selectedLanguage = useIDEStore((state) => state.selectedLanguage);
  const judge = useIDEStore((state) => state.judge);
  const judgeLanguages = useIDEStore((state) => state.judgeLanguages);
  const colorTheme = useIDEStore((state) => state.ui.colorTheme);
  const setLanguage = useIDEStore((state) => state.setLanguage);
  const setJudgeContext = useIDEStore((state) => state.setJudgeContext);
  const setJudgeLanguages = useIDEStore((state) => state.setJudgeLanguages);
  const setColorTheme = useIDEStore((state) => state.setColorTheme);
  const orderedLanguages = sortJudgeLanguagesForEditor(judgeLanguages);

  useEffect(() => {
    let mounted = true;
    fetchLanguages()
      .then((languages) => {
        if (!mounted) return;
        setJudgeLanguages(languages);
        const selected = judge.languageId ? languages.find((language) => String(language.languageId) === judge.languageId) : undefined;
        const nextLanguageId = selected?.languageId.toString() ?? judgeLanguageForEditorLanguage(languages, selectedLanguage)?.languageId.toString() ?? defaultJudgeLanguageId(languages);
        if (nextLanguageId && nextLanguageId !== judge.languageId) setJudgeContext({ languageId: nextLanguageId });
      })
      .catch(() => {
        // Keep the editor usable with its built-in language defaults when the public API is unavailable.
      });

    return () => {
      mounted = false;
    };
  }, [judge.languageId, selectedLanguage, setJudgeContext, setJudgeLanguages]);

  const selectedJudgeLanguageId = judge.languageId ?? defaultJudgeLanguageId(orderedLanguages) ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
      <label className="flex items-center gap-2">
        <span className="hidden font-medium md:inline">Lenguaje</span>
        <select
          value={selectedJudgeLanguageId}
          onChange={(event) => {
            const judgeLanguage = orderedLanguages.find((language) => String(language.languageId) === event.target.value);
            setJudgeContext({ languageId: event.target.value });
            setLanguage(languageIdFromJudgeLanguageName(judgeLanguage?.name));
          }}
          className={selectClass}
        >
          {orderedLanguages.length > 0 ? (
            orderedLanguages.map((language) => (
              <option key={language.languageId} value={language.languageId}>
                {language.name} ({language.languageId})
              </option>
            ))
          ) : (
            <option value="">Cargando lenguajes...</option>
          )}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="hidden font-medium md:inline">Tema</span>
        <select
          value={colorTheme}
          onChange={(event) => {
            if (isColorTheme(event.target.value)) setColorTheme(event.target.value);
          }}
          className={selectClass}
        >
          {COLOR_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
