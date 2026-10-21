import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Shuffle, RotateCcw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Question } from "@/lib/ai.functions";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/flashcards/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Flashcards — CanWinBuddy" },
      { name: "description", content: "Flip through your quiz questions and answers as flashcards and track what you know." },
      { property: "og:title", content: "Flashcards — CanWinBuddy" },
      { property: "og:description", content: "Study your quiz as flip cards: Know it or Still learning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: `/flashcards/${params.id}` },
    ],
  }),
  component: FlashcardsPage,
});

type Card = { i: number; q: string; a: string };

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FlashcardsPage() {
  const { id } = Route.useParams();
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["quiz-set", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_sets").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const all: Card[] = useMemo(() => {
    const qs = (data?.questions as unknown as Question[]) ?? [];
    return qs.map((q, i) => ({ i, q: q.question, a: getCorrectIndexes(q).map((c) => q.choices[c]).join("\n") }));
  }, [data]);

  const [pool, setPool] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<Record<number, "know" | "learning">>({});
  const [done, setDone] = useState(false);

  const start = useCallback((cards: Card[], doShuffle: boolean) => {
    setPool(cards);
    setDeck(doShuffle ? shuffled(cards) : cards);
    setPos(0); setFlipped(false); setMarks({}); setDone(false);
  }, []);

  useEffect(() => { if (all.length) start(all, false); }, [all, start]);

  const toggleShuffle = (v: boolean) => {
    setShuffle(v);
    setDeck(v ? shuffled(pool) : pool);
    setPos(0); setFlipped(false);
  };

  const go = useCallback((d: number) => {
    setFlipped(false);
    setPos((p) => {
      const n = p + d;
      if (n >= deck.length) { setDone(true); return p; }
      return Math.max(0, n);
    });
  }, [deck.length]);

  const mark = (m: "know" | "learning") => {
    const c = deck[pos];
    if (!c) return;
    setMarks((s) => ({ ...s, [c.i]: m }));
    go(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, done]);

  const know = Object.values(marks).filter((m) => m === "know").length;
  const learning = Object.values(marks).filter((m) => m === "learning").length;
  const learningCards = pool.filter((c) => marks[c.i] === "learning");
  const card = deck[pos];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-1 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/export/$id" params={{ id }}><ArrowLeft className="mr-1 h-4 w-4" /> {t("Back to quiz")}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Shuffle className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="fc-shuffle" className="text-sm">{t("Shuffle")}</Label>
          <Switch id="fc-shuffle" checked={shuffle} onCheckedChange={toggleShuffle} disabled={done} />
        </div>
      </div>

      <h1 className="truncate text-xl font-semibold">{data?.title ?? t("Flashcards")}</h1>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !all.length ? (
        <p className="text-muted-foreground">{t("This quiz has no questions.")}</p>
      ) : done ? (
        <div className="space-y-4 rounded-2xl border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold">{t("Summary")}</h2>
          <div className="flex justify-center gap-6 text-sm">
            <div><div className="text-2xl font-bold text-primary">{know}</div>{t("Know it")}</div>
            <div><div className="text-2xl font-bold">{learning}</div>{t("Still learning")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {learningCards.length > 0 && (
              <Button onClick={() => start(learningCards, shuffle)}>{t("Study the ones I'm still learning")}</Button>
            )}
            <Button variant="secondary" onClick={() => start(all, shuffle)}><RotateCcw className="mr-2 h-4 w-4" />{t("Start again")}</Button>
          </div>
        </div>
      ) : card ? (
        <>
          <p className="text-center text-sm text-muted-foreground">{pos + 1} / {deck.length}</p>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="block w-full [perspective:1200px]"
            aria-label={t("Flip card")}
          >
            <div className={cn("relative min-h-[260px] w-full transition-transform duration-500 [transform-style:preserve-3d]", flipped && "[transform:rotateY(180deg)]")}>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-card p-6 text-center shadow-sm [backface-visibility:hidden]">
                <span className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">{t("Question")}</span>
                <p className="text-lg font-medium break-words">{card.q}</p>
                <span className="mt-4 text-xs text-muted-foreground">{t("Tap or press Space to flip")}</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border bg-accent p-6 text-center text-accent-foreground shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="mb-3 text-xs uppercase tracking-wide opacity-70">{t("Answer")}</span>
                <p className="text-lg font-semibold break-words">{card.a}</p>
              </div>
            </div>
          </button>
          {flipped && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => mark("know")}>{t("Know it")}</Button>
              <Button variant="secondary" onClick={() => mark("learning")}>{t("Still learning")}</Button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => go(-1)} disabled={pos === 0}><ChevronLeft className="mr-1 h-4 w-4" />{t("Previous")}</Button>
            <span className="text-xs text-muted-foreground">{t("Know it")}: {know} · {t("Still learning")}: {learning}</span>
            <Button variant="outline" onClick={() => go(1)}>{t("Next")}<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
