import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, XCircle, Trophy } from "lucide-react";

import { type Question } from "@/lib/ai.functions";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  questions: Question[];
  onClose: () => void;
  title: string;
  guest?: boolean;
}

export function QuizGame({ questions, onClose, title }: Props) {
  const t = useT();
  const [seed, setSeed] = useState(0);
  const shuffled = useMemo(() => {
    void seed;
    return [...questions]
      .sort(() => Math.random() - 0.5)
      .map((q) => {
        /* Randomise answer positions so locations can't be memorised */
        const order = q.choices.map((_, idx) => idx).sort(() => Math.random() - 0.5);
        return {
          ...q,
          choices: order.map((idx) => q.choices[idx]),
          correctIndex: Math.max(0, order.indexOf(q.correctIndex)),
        };
      });
  }, [questions, seed]);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = shuffled[i];
  const progress = ((i + (selected !== null ? 1 : 0)) / shuffled.length) * 100;

  const pick = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    if (idx === q.correctIndex) setScore((s) => s + 1);
  };

  const next = () => {
    if (i + 1 >= shuffled.length) {
      setFinished(true);
    } else {
      setI((n) => n + 1);
      setSelected(null);
    }
  };

  const replay = () => {
    setI(0);
    setScore(0);
    setSelected(null);
    setFinished(false);
    setSeed((s) => s + 1);
  };

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
          <button onClick={onClose} aria-label={t("Close")} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {finished ? (
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
              <Button onClick={replay}>{t("Play again")}</Button>
              <Button variant="secondary" onClick={onClose}>{t("Close")}</Button>
            </div>
          </motion.div>
        ) : (
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
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {q.choices.map((c, idx) => {
                    const isCorrect = idx === q.correctIndex;
                    const isSelected = idx === selected;
                    const revealed = selected !== null;
                    const cls = revealed
                      ? isCorrect
                        ? "border-success/60 bg-success/15 text-foreground"
                        : isSelected
                          ? "border-destructive/60 bg-destructive/15 text-foreground"
                          : "border-border bg-secondary/40 text-muted-foreground"
                      : "border-border bg-secondary hover:border-primary/60 hover:bg-accent";
                    return (
                      <motion.button
                        key={idx}
                        onClick={() => pick(idx)}
                        whileHover={selected === null ? { scale: 1.02 } : undefined}
                        whileTap={selected === null ? { scale: 0.98 } : undefined}
                        disabled={selected !== null}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-colors sm:p-4 ${cls}`}
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
              <Button onClick={next} disabled={selected === null} className="w-full sm:w-auto">
                {i + 1 >= shuffled.length ? t("Finish") : t("Next")}
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
