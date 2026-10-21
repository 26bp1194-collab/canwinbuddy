import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { translateUi } from "@/lib/ai.functions";

export const APP_LANGUAGES = [
  "Arabic",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Dutch",
  "English",
  "French",
  "German",
  "Hindi",
  "Italian",
  "Japanese",
  "Korean",
  "Malay",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
].sort((a, b) => a.localeCompare(b));

const LANG_KEY = "cwb:app-language";
const dictKey = (lang: string) => `cwb:i18n:${lang}`;

type Dict = Record<string, string>;

type Ctx = {
  language: string;
  setLanguage: (lang: string) => void;
  translating: boolean;
  t: (text: string) => string;
};

const I18nContext = createContext<Ctx>({
  language: "English",
  setLanguage: () => {},
  translating: false,
  t: (text) => text,
});

function readDict(lang: string): Dict {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(dictKey(lang)) ?? "{}") as Dict;
  } catch {
    return {};
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState("English");
  const [dict, setDict] = useState<Dict>({});
  const [translating, setTranslating] = useState(false);
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved && saved !== "English") {
      setLang(saved);
      setDict(readDict(saved));
    }
  }, []);

  const flush = useCallback(
    async (lang: string) => {
      if (lang === "English" || inflight.current) return;
      const missing = Array.from(pending.current).slice(0, 200);
      if (missing.length === 0) return;
      missing.forEach((m) => pending.current.delete(m));
      inflight.current = true;
      setTranslating(true);
      try {
        const { translations } = await translateUi({ data: { strings: missing, language: lang } });
        const next: Dict = {};
        missing.forEach((s, i) => (next[s] = translations[i] ?? s));
        setDict((prev) => {
          const merged = { ...prev, ...next };
          window.localStorage.setItem(dictKey(lang), JSON.stringify(merged));
          return merged;
        });
      } catch {
        /* keep English fallback */
      } finally {
        inflight.current = false;
        setTranslating(false);
        if (pending.current.size > 0) void flush(lang);
      }
    },
    [],
  );

  const request = useCallback(
    (text: string, lang: string) => {
      if (lang === "English") return;
      pending.current.add(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(lang), 250);
    },
    [flush],
  );

  const t = useCallback(
    (text: string) => {
      if (language === "English" || !text) return text;
      const hit = dict[text];
      if (hit) return hit;
      request(text, language);
      return text;
    },
    [language, dict, request],
  );

  const setLanguage = useCallback((lang: string) => {
    setLang(lang);
    if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, lang);
    setDict(lang === "English" ? {} : readDict(lang));
    pending.current.clear();
  }, []);

  const value = useMemo(() => ({ language, setLanguage, translating, t }), [language, setLanguage, translating, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Shorthand hook: const t = useT(); t("Settings") */
export function useT() {
  return useI18n().t;
}
