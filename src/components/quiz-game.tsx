import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, XCircle, Trophy, RotateCcw, ListChecks, Loader2 } from "lucide-react";

import { type Question, explainWrongAnswers } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { getCorrectIndexes, isRightPick, reorderChoices } from "@/lib/question-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type ResultDetail = {
  question: string;
  choices: string[];
  correctIndex: number;
  chosenIndex: number;
  /** Two-answer questions only: both correct indexes and the learner's picks */
  correctIndexes?: number[];
  chosenIndexes?: number[];
  correct: boolean;
  explanation?: string;
};

interface Props {
  questions: Question[];
  onClose: () => void;
  title: string;
  guest?: boolean;
  /** When set (and not a guest), finished sessions are saved to your results history. */
  quizSetId?: string;
  sourceText?: string;
  onSaved?: () => void;
}

/** Correct and chosen answer texts for a result row (works for old single-answer rows). */
export function resultTexts(r: ResultDetail) {
  const pick = (list: number[]) => list.map((i) => r.choices?.[i]).filter((c): c is string => typeof c === "string");
  return {
    correct: pick(r.correctIndexes?.length ? r.correctIndexes : [r.correctIndex]),
    chosen: pick(r.chosenIndexes?.length ? r.chosenIndexes : [r.chosenIndex]),
  };
}

export function QuizGame({ questions, onClose, title, guest, quizSetId, sourceText, onSaved }: Props) {
  const t = useT();
  const [seed, setSeed] = useState(0);
  const [savedOrder, setSavedOrder] = useState<Question[] | null>(null);
  const [ready, setReady] = useState(false);
  const sessionKey = `cwb:play:${quizSetId ?? (guest ? `guest:${title}` : title)}`;
  const shuffled = useMemo(() => {
    if (savedOrder) return savedOrder;
    void seed;
    return [...questions]
      .sort(() => Math.random() - 0.5)
      .map((q) => {
        /* Randomise answer positions so locations can't be memorised */
        const order = q.choices.map((_, idx) => idx).sort(() => Math.random() - 0.5);
        return reorderChoices(q, order);
      });
  }, [questions, seed, savedOrder]);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<ResultDetail[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [detailing, setDetailing] = useState(false);
  const [details, setDetails] = useState<ResultDetail[]>([]);
  /* Picks for "Select 2" questions before Check answer */
  const [picks, setPicks] = useState<number[]>([]);

  const q = shuffled[i];
  const correctSet = q ? getCorrectIndexes(q) : [];
  const multi = correctSet.length > 1;
  const progress = ((i + (selected !== null ? 1 : 0)) / shuffled.length) * 100;
  const started = answers.length > 0 || selected !== null || picks.length > 0;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(sessionKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          signature: string; order: Question[]; i: number; selected: number | null;
          score: number; answers: ResultDetail[]; picks?: number[];
        };
        if (saved.signature === JSON.stringify(questions) && saved.order.length === questions.length && saved.i >= 0 && saved.i < questions.length) {
          setSavedOrder(saved.order);
          setI(saved.i);
          setSelected(saved.selected);
          setScore(saved.score);
          setAnswers(Array.isArray(saved.answers) ? saved.answers : []);
          setPicks(Array.isArray(saved.picks) ? saved.picks : []);
        } else window.localStorage.removeItem(sessionKey);
      }
    } catch { /* invalid or unavailable session storage */ }
    setReady(true);
  }, [sessionKey, questions]);

  useEffect(() => {
    if (!ready || finished || !started) return;
    try {
      window.localStorage.setItem(sessionKey, JSON.stringify({ signature: JSON.stringify(questions), order: shuffled, i, selected, score, answers, picks }));
    } catch { /* storage may be unavailable */ }
  }, [ready, finished, started, sessionKey, questions, shuffled, i, selected, score, answers, picks]);

  const pick = (idx: number) => {
    if (selected !== null) return;
    if (multi) {
      setPicks((p) => (p.includes(idx) ? p.filter((x) => x !== idx) : p.length >= 2 ? p : [...p, idx]));
      return;
    }
    setSelected(idx);
    if (correctSet.includes(idx)) setScore((s) => s + 1);
  };

  const checkAnswer = () => {
    if (selected !== null || picks.length !== 2) return;
    setSelected(picks[0]);
    if (isRightPick(q, picks)) setScore((s) => s + 1);
  };

  const saveSession = async (rows: ResultDetail[], correct: number) => {
    if (guest || !quizSetId) return;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { count } = await supabase
        .from("quiz_results")
        .select("id", { count: "exact", head: true })
        .eq("quiz_set_id", quizSetId);
      const n = (count ?? 0) + 1;
      const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
      await supabase.from("quiz_results").insert({
        user_id: uid,
        quiz_set_id: quizSetId,
        name: `${n}${suffix} quiz results`,
        total: rows.length,
        correct,
        incorrect: rows.length - correct,
        details: JSON.parse(JSON.stringify(rows)),
      });
      onSaved?.();
    } catch {
      /* results history is best-effort */
    }
  };

  const next = () => {
    if (selected === null) return;
    const row: ResultDetail = {
      question: q.question,
      choices: q.choices,
      correctIndex: correctSet[0] ?? q.correctIndex,
      chosenIndex: selected,
      ...(multi ? { correctIndexes: correctSet, chosenIndexes: picks } : {}),
      correct: multi ? isRightPick(q, picks) : correctSet.includes(selected),
      explanation: undefined,
    };
    const rows = [...answers, row];
    setAnswers(rows);
    if (i + 1 >= shuffled.length) {
      try { window.localStorage.removeItem(sessionKey); } catch { /* ignore */ }
      setFinished(true);
      void saveSession(rows, rows.filter((r) => r.correct).length);
    } else {
      setI((n) => n + 1);
      setSelected(null);
      setPicks([]);
    }
  };

  const replay = () => {
    try { window.localStorage.removeItem(sessionKey); } catch { /* ignore */ }
    setSavedOrder(null);
    setI(0);
    setScore(0);
    setSelected(null);
    setPicks([]);
    setFinished(false);
    setAnswers([]);
    setDetails([]);
    setShowDetails(false);
    setSeed((s) => s + 1);
  };

  const seeResults = async () => {
    setShowDetails(true);
    if (details.length) return;
    const wrong = answers.filter((a) => !a.correct);
    if (!wrong.length) {
      setDetails(answers);
      return;
    }
    setDetailing(true);
    try {
      const { explanations } = await explainWrongAnswers({
        data: {
          sourceText,
          items: wrong.map((a) => {
            const tx = resultTexts(a);
            return { question: a.question, correct: tx.correct.join(" AND "), chosen: tx.chosen.join(" AND ") };
          }),
        },
      });
      let k = 0;
      setDetails(answers.map((a) => (a.correct ? a : { ...a, explanation: explanations[k++] ?? a.explanation })));
    } catch {
      setDetails(answers);
    } finally {
      setDetailing(false);
    }
  };

  const rows = details.length ? details : answers;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/95 p-3 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="panel my-auto w-full max-w-2xl p-4 sm:p-8">
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{t("Playing")}</p>
            <p className="truncate font-medium">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!finished && started && (
              <Button size="sm" variant="secondary" onClick={replay}>
                <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">{t("Reset quiz")}</span>
              </Button>
            )}
            <button onClick={onClose} aria-label={t("Close")} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {finished ? (
          showDetails ? (
            <div className="py-2">
              <h2 className="font-display text-xl font-bold sm:text-2xl">{t("Your results")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {score} / {shuffled.length} {t("correct")}
              </p>
              {detailing && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("Thinking…")}
                </p>
              )}
              <ul className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                {rows.map((r, idx) => (
                  <li key={idx} className="rounded-xl border border-border bg-secondary/40 p-3 text-left">
                    <p className="text-sm font-medium">
                      <span className="mr-2 text-primary">{idx + 1}.</span>
                      {r.question}
                    </p>
                    <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                      {r.correct ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span>
                        {t("You answered")}: <span className="text-foreground">{resultTexts(r).chosen.join(", ")}</span>
                        {!r.correct && (
                          <>
                            {" · "}
                            {t("Correct")}: <span className="text-foreground">{resultTexts(r).correct.join(", ")}</span>
                          </>
                        )}
                      </span>
                    </p>
                    {r.explanation && <p className="mt-2 text-xs leading-relaxed">{r.explanation}</p>}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col justify-end gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => setShowDetails(false)}>{t("Back")}</Button>
                <Button onClick={replay}>{t("Play again")}</Button>
              </div>
            </div>
          ) : (
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-4 text-center sm:py-8">
              <Trophy className="mx-auto h-12 w-12 text-primary sm:h-14 sm:w-14" />
              <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{t("Nice work")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("You scored")}</p>
              <p className="mt-2 font-display text-4xl font-bold text-primary sm:text-5xl">
                {score} / {shuffled.length}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {Math.round((score / shuffled.length) * 100)}% {t("correct")}
              </p>

              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Button onClick={seeResults}>
                  <ListChecks className="mr-2 h-4 w-4" /> {t("See results")}
                </Button>
                <Button variant="secondary" onClick={replay}>{t("Play again")}</Button>
                <Button variant="ghost" onClick={onClose}>{t("Close")}</Button>
              </div>
            </motion.div>
          )
        ) : !q ? null : (
          <>
            <Progress value={progress} className="mb-6 h-1.5" />
            <p className="text-sm text-muted-foreground">
              {t("Question")} {i + 1} {t("of")} {shuffled.length}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mt-2 text-lg font-semibold leading-tight sm:text-2xl">{q.question}</h2>
                {multi && (
                  <span className="mt-2 inline-block rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {t("Select 2")}
                  </span>
                )}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {q.choices.map((c, idx) => {
                    const isCorrect = correctSet.includes(idx);
                    const isSelected = multi ? picks.includes(idx) : idx === selected;
                    const revealed = selected !== null;
                    const cls = revealed
                      ? isCorrect
                        ? "border-success/60 bg-success/15 text-foreground"
                        : isSelected
                          ? "border-destructive/60 bg-destructive/15 text-foreground"
                          : "border-border bg-secondary/40 text-muted-foreground"
                      : isSelected
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-secondary hover:border-primary/60 hover:bg-accent";
                    const span = q.choices.length === 3 && idx === 2 ? "sm:col-span-2" : "";
                    return (
                      <motion.button
                        key={idx}
                        onClick={() => pick(idx)}
                        whileHover={selected === null ? { scale: 1.02 } : undefined}
                        whileTap={selected === null ? { scale: 0.98 } : undefined}
                        disabled={selected !== null}
                        aria-pressed={multi && !revealed ? isSelected : undefined}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-colors sm:p-4 ${cls} ${span}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-xs font-bold">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{c}</span>
                        {revealed && isCorrect && <Check className="h-4 w-4 shrink-0 text-success" />}
                        {revealed && isSelected && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex justify-end">
              {multi && selected === null ? (
                <Button onClick={checkAnswer} disabled={picks.length !== 2} className="w-full sm:w-auto">
                  {t("Check answer")}
                </Button>
              ) : (
                <Button onClick={next} disabled={selected === null} className="w-full sm:w-auto">
                  {i + 1 >= shuffled.length ? t("Finish") : t("Next")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
