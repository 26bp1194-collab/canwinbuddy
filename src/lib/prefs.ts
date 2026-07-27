import { useCallback, useEffect, useState } from "react";

const PLANNING_KEY = "cwb:helper-planning";
const DEFAULTS_KEY = "cwb:quiz-defaults";
const DRAFT_KEY = "cwb:generate-draft";
const TIMING_PREFIX = "cwb:timing:";

/* ---------------- Planning toggle ---------------- */

export function getPlanningEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PLANNING_KEY) !== "off";
}

export function usePlanningEnabled() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(getPlanningEnabled());
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PLANNING_KEY, value ? "on" : "off");
    }
  }, []);

  return { planningEnabled: enabled, setPlanningEnabled: update };
}

/* ---------------- Quiz defaults ---------------- */

export type Difficulty = "easy" | "medium" | "hard";

export type StyleSpec = {
  mode: "simple" | "advanced";
  shortQA: boolean;
  questionLength: number;
  answerLength: number;
  complexity: number;
  obscurity: number;
};

export const DEFAULT_SPEC: StyleSpec = {
  mode: "simple",
  shortQA: false,
  questionLength: 3,
  answerLength: 3,
  complexity: 3,
  obscurity: 3,
};

export type QuizDefaults = {
  count: number;
  difficulty: Difficulty;
  platform: "blooket" | "gimkit" | "gimkit2" | "kahoot";
  language: string;
  spec: StyleSpec;
};

export const DEFAULT_QUIZ_DEFAULTS: QuizDefaults = {
  count: 10,
  difficulty: "medium",
  platform: "blooket",
  language: "English",
  spec: DEFAULT_SPEC,
};


export function getQuizDefaults(): QuizDefaults {
  if (typeof window === "undefined") return DEFAULT_QUIZ_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return DEFAULT_QUIZ_DEFAULTS;
    const stored = JSON.parse(raw) as Partial<QuizDefaults>;
    return { ...DEFAULT_QUIZ_DEFAULTS, ...stored, spec: { ...DEFAULT_SPEC, ...(stored.spec ?? {}) } };

  } catch {
    return DEFAULT_QUIZ_DEFAULTS;
  }
}

export function useQuizDefaults() {
  const [defaults, setDefaults] = useState<QuizDefaults>(DEFAULT_QUIZ_DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDefaults(getQuizDefaults());
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<QuizDefaults>) => {
    setDefaults((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== "undefined") window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { defaults, ready, updateDefaults: update };
}

/* ---------------- Generation draft (survives navigation) ---------------- */

export type GenerateDraft = {
  source: string;
  title: string;
  count: number;
  difficulty: Difficulty;
  spec?: StyleSpec;
};



export function getDraft(): GenerateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as GenerateDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: GenerateDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
}

/* ---------------- Generation timings ---------------- */

export type StepTiming = { label: string; ms: number };

export function saveTimings(id: string, steps: StepTiming[], totalMs: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TIMING_PREFIX + id, JSON.stringify({ steps, totalMs }));
}

export function getTimings(id: string): { steps: StepTiming[]; totalMs: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TIMING_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}
