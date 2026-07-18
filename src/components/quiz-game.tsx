import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, XCircle, Trophy } from "lucide-react";

import type { Question } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  questions: Question[];
  onClose: () => void;
  title: string;
}

export function QuizGame({ questions, onClose, title }: Props) {
  const shuffled = useMemo(() => [...questions].sort(() => Math.random() - 0.5), [questions]);
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
    >
      <div className="panel w-full max-w-2xl p-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">Playing</p>
            <p className="truncate font-medium">{title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {finished ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-8 text-center">
            <Trophy className="mx-auto h-14 w-14 text-primary" />
            <h2 className="mt-4 font-display text-3xl font-bold">Nice work</h2>
            <p className="mt-2 text-muted-foreground">You scored</p>
            <p className="mt-2 font-display text-5xl font-bold text-primary">
              {score} / {shuffled.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{Math.round((score / shuffled.length) * 100)}% correct</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => { setI(0); setScore(0); setSelected(null); setFinished(false); }}>Play again</Button>
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </motion.div>
        ) : (
          <>
            <Progress value={progress} className="mb-6 h-1.5" />
            <p className="text-sm text-muted-foreground">Question {i + 1} of {shuffled.length}</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mt-2 text-2xl font-semibold leading-tight">{q.question}</h2>
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
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium transition-colors ${cls}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-xs font-bold">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1">{c}</span>
                        {revealed && isCorrect && <Check className="h-4 w-4 text-success" />}
                        {revealed && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive" />}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex justify-end">
              <Button onClick={next} disabled={selected === null}>
                {i + 1 >= shuffled.length ? "Finish" : "Next"}
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
