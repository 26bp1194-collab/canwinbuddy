import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, XCircle, Pencil, Trash2, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import type { ResultDetail } from "@/components/quiz-game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ResultRow = {
  id: string;
  name: string;
  total: number;
  correct: number;
  incorrect: number;
  details: unknown;
  created_at: string;
};

export function QuizResultsDialog({
  open,
  onOpenChange,
  quizSetId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quizSetId: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["quiz-results", quizSetId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_results")
        .select("id, name, total, correct, incorrect, details, created_at")
        .eq("quiz_set_id", quizSetId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ResultRow[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["quiz-results", quizSetId] });

  const rename = async (id: string) => {
    const name = draftName.trim();
    setEditId(null);
    if (!name) return;
    const { error } = await supabase.from("quiz_results").update({ name }).eq("id", id);
    if (error) toast.error(t("Couldn't rename these results"));
    else await refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("quiz_results").delete().eq("id", id);
    if (error) toast.error(t("Couldn't delete these results"));
    else {
      setOpenId(null);
      await refresh();
    }
  };

  const current = data?.find((r) => r.id === openId) ?? null;
  const details: ResultDetail[] = Array.isArray(current?.details) ? (current!.details as ResultDetail[]) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{t("Quiz results")}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t("Every time you played this quiz, with what you got right and wrong.")}
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)} className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back")}
            </Button>
            <p className="font-medium">{current.name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(current.created_at).toLocaleString()} · {current.correct} {t("correct")} · {current.incorrect}{" "}
              {t("incorrect")}
            </p>
            <ul className="mt-4 space-y-3">
              {details.map((r, idx) => (
                <li key={idx} className="rounded-xl border border-border bg-secondary/40 p-3">
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
                      {t("You answered")}: <span className="text-foreground">{r.choices?.[r.chosenIndex]}</span>
                      {!r.correct && (
                        <>
                          {" · "}
                          {t("Correct")}: <span className="text-foreground">{r.choices?.[r.correctIndex]}</span>
                        </>
                      )}
                    </span>
                  </p>
                  {r.explanation && <p className="mt-2 text-xs leading-relaxed">{r.explanation}</p>}
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-4 text-destructive" onClick={() => remove(current.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> {t("Delete")}
            </Button>
          </div>
        ) : isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">{t("Loading…")}</p>
        ) : !data?.length ? (
          <p className="py-6 text-sm text-muted-foreground">{t("You haven't played this quiz yet.")}</p>
        ) : (
          <ul className="space-y-2">
            {data.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  {editId === r.id ? (
                    <Input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => rename(r.id)}
                      onKeyDown={(e) => e.key === "Enter" && rename(r.id)}
                      className="h-8"
                    />
                  ) : (
                    <p className="truncate text-sm font-medium">{r.name || t("Quiz results")}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()} · {r.correct}/{r.total} {t("correct")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                  {r.correct}
                </span>
                <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                  {r.incorrect}
                </span>
                <button
                  onClick={() => {
                    setEditId(r.id);
                    setDraftName(r.name);
                  }}
                  aria-label={t("Rename")}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOpenId(r.id)}
                  aria-label={t("Open")}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
