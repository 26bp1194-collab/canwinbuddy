import { useCallback, useEffect, useState } from "react";

const PLANNING_KEY = "cwb:helper-planning";
const DEFAULTS_KEY = "cwb:quiz-defaults";
const DRAFT_KEY = "cwb:generate-draft";
const TIMING_PREFIX = "cwb:timing:";
const HELPER_KEY = "cwb:helper-state";
const SETTINGS_DRAFT_KEY = "cwb:settings-draft";

/* ---------------- AI Text Helper saved state ---------------- */

export function getHelperState<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HELPER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveHelperState(state: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HELPER_KEY, JSON.stringify(state));
}

export function clearHelperState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HELPER_KEY);
}

/* ---------------- Unsaved settings draft ---------------- */

export function getSettingsDraft<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveSettingsDraft(state: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify(state));
}

export function clearSettingsDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETTINGS_DRAFT_KEY);
}


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

export const CURRICULA = ["SPM", "IGCSE", "A-Levels", "Gaokao", "AP", "SAT", "CBSE", "ICSE"] as const;
export type Curriculum = "none" | (typeof CURRICULA)[number] | "other";
export type CurriculumSetting = { curriculum: Curriculum; customCurriculum: string };

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

export const DEFAULT_SPEC_ADVANCED: StyleSpec = { ...DEFAULT_SPEC, mode: "advanced" };

export type QuizDefaults = {
  count: number;
  difficulty: Difficulty;
  curriculum: Curriculum;
  customCurriculum: string;
  platform: "blooket" | "gimkit" | "gimkit2" | "kahoot";
  language: string;
  /** Defaults used while the Generate page is on Simple */
  spec: StyleSpec;
  /** Defaults used while the Generate page is on Advanced */
  specAdvanced: StyleSpec;
};

export const DEFAULT_QUIZ_DEFAULTS: QuizDefaults = {
  count: 10,
  difficulty: "medium",
  curriculum: "none",
  customCurriculum: "",
  platform: "blooket",
  language: "English",
  spec: DEFAULT_SPEC,
  specAdvanced: DEFAULT_SPEC_ADVANCED,
};


export function getQuizDefaults(): QuizDefaults {
  if (typeof window === "undefined") return DEFAULT_QUIZ_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return DEFAULT_QUIZ_DEFAULTS;
    const stored = JSON.parse(raw) as Partial<QuizDefaults>;
    return {
      ...DEFAULT_QUIZ_DEFAULTS,
      ...stored,
      spec: { ...DEFAULT_SPEC, ...(stored.spec ?? {}), mode: "simple" },
      specAdvanced: { ...DEFAULT_SPEC_ADVANCED, ...(stored.specAdvanced ?? {}), mode: "advanced" },
    };



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

/* ---------------- Generation draft (survives navigation, per tab) ---------------- */

export type GenerateDraft = {
  source: string;
  noteSources?: import("./note-sources").NoteSource[];
  topics?: string;
  notesMode?: "source" | "topics";
  title: string;
  count: number;
  countText?: string;
  difficulty: Difficulty;
  curriculum?: Curriculum;
  customCurriculum?: string;
  spec?: StyleSpec;
  mode?: "simple" | "advanced";
  specs?: { simple: StyleSpec; advanced: StyleSpec };
  subjects?: import("./quiz-context").SubjectEntry[];
  audiences?: import("./quiz-context").AudienceEntry[];
  instructions?: string;
  step?: "notes" | "customisation";
  /** Signature of the user's quiz defaults when the draft was saved. */
  defaultsSig?: string;
};

/** Stable signature of the current default quiz settings. */
export function quizDefaultsSignature(): string {
  const d = getQuizDefaults();
  return JSON.stringify([d.count, d.difficulty, d.curriculum, d.customCurriculum, d.spec, d.specAdvanced]);
}


/* sessionStorage: kept while navigating inside the same tab, fresh in a new tab */
function draftStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getDraft(): GenerateDraft | null {
  try {
    const raw = draftStore()?.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as GenerateDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: GenerateDraft) {
  try {
    draftStore()?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearDraft() {
  try {
    draftStore()?.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
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

/* ---------------- Quick delete (skip the "Are you sure?" step) ---------------- */

const QUICK_QUIZ_KEY = "cwb:quick-delete-quiz";
const QUICK_GROUP_KEY = "cwb:quick-delete-group";

export function getQuickQuizDelete(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(QUICK_QUIZ_KEY) === "on";
}

export function getQuickGroupDelete(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(QUICK_GROUP_KEY) === "on";
}

export function setQuickQuizDeleteValue(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUICK_QUIZ_KEY, value ? "on" : "off");
}

export function setQuickGroupDeleteValue(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUICK_GROUP_KEY, value ? "on" : "off");
}

/** Live values for the History/Group pages (re-reads on mount). */
export function useQuickDelete() {
  const [state, setState] = useState({ quiz: false, group: false });
  useEffect(() => {
    setState({ quiz: getQuickQuizDelete(), group: getQuickGroupDelete() });
    const onStorage = () => setState({ quiz: getQuickQuizDelete(), group: getQuickGroupDelete() });
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return state;
}

/* ---------------- Lack-of-information warning ---------------- */

const SKIP_INFO_KEY = "cwb:skip-info-warning";

export type InfoWarningAction = "back" | "continue";
export type SkipInfoWarning = { enabled: boolean; action: InfoWarningAction };

export const DEFAULT_SKIP_INFO: SkipInfoWarning = { enabled: false, action: "continue" };

export function getSkipInfoWarning(): SkipInfoWarning {
  if (typeof window === "undefined") return DEFAULT_SKIP_INFO;
  try {
    const raw = window.localStorage.getItem(SKIP_INFO_KEY);
    if (!raw) return DEFAULT_SKIP_INFO;
    return { ...DEFAULT_SKIP_INFO, ...(JSON.parse(raw) as Partial<SkipInfoWarning>) };
  } catch {
    return DEFAULT_SKIP_INFO;
  }
}

export function setSkipInfoWarningValue(value: SkipInfoWarning) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SKIP_INFO_KEY, JSON.stringify(value));
}

/* ---------------- Settings snapshot saved with each quiz ---------------- */

export type QuizSettingsSnapshot = {
  count: number;
  difficulty: Difficulty;
  curriculum?: Curriculum;
  customCurriculum?: string;
  mode: "simple" | "advanced";
  spec: StyleSpec;
  subjects?: import("./quiz-context").SubjectEntry[];
  audiences?: import("./quiz-context").AudienceEntry[];
  instructions?: string;
};

const PREFILL_KEY = "cwb:generate-prefill";

export type GeneratePrefill = QuizSettingsSnapshot & { source: string; title: string };

export function setGeneratePrefill(value: GeneratePrefill) {
  try {
    draftStore()?.setItem(PREFILL_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function takeGeneratePrefill(): GeneratePrefill | null {
  try {
    const raw = draftStore()?.getItem(PREFILL_KEY);
    if (!raw) return null;
    draftStore()?.removeItem(PREFILL_KEY);
    return JSON.parse(raw) as GeneratePrefill;
  } catch {
    return null;
  }
}

/* ---------------- Direct setters (used by the Settings save bar) ---------------- */

export function setPlanningEnabledValue(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLANNING_KEY, value ? "on" : "off");
}

export function setQuizDefaults(next: QuizDefaults) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
}
