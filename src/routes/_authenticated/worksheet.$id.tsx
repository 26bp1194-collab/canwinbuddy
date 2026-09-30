import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, Printer, FileText, KeyRound, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LETTERS, totalMarks, type WorksheetContent, type WorksheetItem } from "@/lib/worksheet-types";

export const Route = createFileRoute("/_authenticated/worksheet/$id")({
  head: () => ({
    meta: [
      { title: "Worksheet — CanWinBuddy" },
      { name: "description", content: "A printable, curriculum-style worksheet with answer key, ready to print, download or fill in." },
      { property: "og:title", content: "Worksheet — CanWinBuddy" },
      { property: "og:description", content: "Curriculum-style worksheet with a separate answer key." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorksheetPage,
});

type Row = { id: string; title: string; subject: string; age: number; curriculum: string; content: WorksheetContent; created_at: string };

function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) | 0;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function WorksheetPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<"sheet" | "key">("sheet");
  const [fill, setFill] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["worksheet", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("worksheets").select("id,title,subject,age,curriculum,content,created_at").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Row;
    },
  });

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-10 text-center">Worksheet not found. <Link to="/history" className="underline">Back to History</Link></div>;

  const c = data.content;
  const total = totalMarks(c);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 md:pb-10">
      <div className="print:hidden">
        <Link to="/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> History
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"><FileText className="h-3 w-3" /> Worksheet</span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{data.title}</h1>
            <p className="text-sm text-muted-foreground">{data.curriculum} · {data.subject} · Age {data.age} · {total} marks</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm"><Download className="mr-2 h-4 w-4" /> Download PDF</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => downloadPdf(data, false)}>Worksheet only</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadPdf(data, true)}>Worksheet + answer key</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border p-1">
            <Button size="sm" variant={tab === "sheet" ? "secondary" : "ghost"} onClick={() => setTab("sheet")}><FileText className="mr-2 h-4 w-4" /> Worksheet</Button>
            <Button size="sm" variant={tab === "key" ? "secondary" : "ghost"} onClick={() => setTab("key")}><KeyRound className="mr-2 h-4 w-4" /> Answer key</Button>
          </div>
          {tab === "sheet" && (
            <div className="flex items-center gap-2">
              <Switch id="fill" checked={fill} onCheckedChange={setFill} />
              <Label htmlFor="fill" className="flex items-center gap-1"><PencilLine className="h-4 w-4" /> Fill in</Label>
            </div>
          )}
        </div>
      </div>

      <article className="mt-6 rounded-2xl border border-border bg-card p-6 text-card-foreground sm:p-10 print:mt-0 print:border-0 print:p-0">
        {tab === "sheet" ? <Sheet row={data} fill={fill} total={total} /> : <AnswerKey row={data} />}
      </article>
    </div>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <div className="mt-2 space-y-5">
      {Array.from({ length: Math.max(1, Math.min(n, 30)) }).map((_, i) => <div key={i} className="h-5 border-b border-dashed border-muted-foreground/40" />)}
    </div>
  );
}

function Sheet({ row, fill, total }: { row: Row; fill: boolean; total: number }) {
  const c = row.content;
  let q = 0;
  return (
    <div>
      <header className="border-b border-border pb-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.header || `${row.curriculum} · ${row.subject}`}</p>
        <h2 className="mt-1 text-xl font-bold">{c.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.duration ? `${c.duration} · ` : ""}Total: {total} marks</p>
        <div className="mt-4 grid gap-3 text-left text-sm sm:grid-cols-3">
          {["Name", "Class", "Date"].map((l) => (
            <div key={l} className="flex items-end gap-2">{l}:{fill ? <Input className="h-8" /> : <span className="flex-1 border-b border-muted-foreground/50" />}</div>
          ))}
        </div>
      </header>
      {c.generalInstructions.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{c.generalInstructions.map((g, i) => <li key={i}>{g}</li>)}</ul>
      )}
      {c.sections.map((s, si) => (
        <section key={si} className="mt-8 break-inside-avoid-page">
          <h3 className="text-lg font-semibold">{s.title}</h3>
          {s.instructions && <p className="mt-1 text-sm italic text-muted-foreground">{s.instructions}</p>}
          <ol className="mt-4 space-y-6">
            {s.items.map((it, ii) => {
              q += 1;
              return <ItemView key={ii} n={q} item={it} fill={fill} seed={`${row.id}-${si}-${ii}`} />;
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ItemView({ n, item, fill, seed }: { n: number; item: WorksheetItem; fill: boolean; seed: string }) {
  const rights = useMemo(() => shuffleStable((item.pairs ?? []).map((p) => p.right), seed), [item.pairs, seed]);
  const lines = item.lines ?? (item.type === "essay" ? 15 : 2);
  return (
    <li className="break-inside-avoid">
      <div className="flex gap-3">
        <span className="font-semibold">{n}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-wrap">{item.prompt}</p>
            <span className="shrink-0 text-xs text-muted-foreground">[{item.marks}]</span>
          </div>
          {item.type === "mcq" && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {(item.choices ?? []).map((ch, i) => (
                <label key={i} className="flex items-start gap-2 text-sm">
                  {fill ? <input type="radio" name={seed} className="mt-1" /> : null}
                  <span className="font-medium">{LETTERS[i]}</span> <span>{ch}</span>
                </label>
              ))}
            </div>
          )}
          {item.type === "true_false" && (
            <div className="mt-2 flex gap-6 text-sm">
              {["True", "False"].map((v) => <label key={v} className="flex items-center gap-2">{fill ? <input type="radio" name={seed} /> : <span className="inline-block h-4 w-4 rounded border border-muted-foreground/60" />}{v}</label>)}
            </div>
          )}
          {item.type === "matching" && (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="space-y-2">{(item.pairs ?? []).map((p, i) => <div key={i} className="flex items-center gap-2">{i + 1}. {p.left} {fill ? <Input className="ml-auto h-7 w-14" /> : <span className="ml-auto w-10 border-b border-muted-foreground/50" />}</div>)}</div>
              <div className="space-y-2">{rights.map((r, i) => <div key={i}>{LETTERS[i] ?? String.fromCharCode(65 + i)}. {r}</div>)}</div>
            </div>
          )}
          {item.type === "fill_blank" && fill && <Input className="mt-2" placeholder="Your answers" />}
          {item.type === "structured" && (
            <div className="mt-3 space-y-4">
              {(item.parts ?? []).map((p, i) => (
                <div key={i}>
                  <div className="flex items-start justify-between gap-3"><p>{p.label} {p.prompt}</p><span className="shrink-0 text-xs text-muted-foreground">[{p.marks}]</span></div>
                  {fill ? <Textarea className="mt-2" rows={Math.max(2, p.lines)} /> : <Lines n={p.lines || 2} />}
                </div>
              ))}
            </div>
          )}
          {(item.type === "short" || item.type === "essay") && (fill ? <Textarea className="mt-2" rows={Math.min(lines, 20)} /> : <Lines n={lines} />)}
        </div>
      </div>
    </li>
  );
}

function AnswerKey({ row }: { row: Row }) {
  let q = 0;
  return (
    <div>
      <h2 className="text-xl font-bold">Answer key — {row.content.title}</h2>
      <p className="text-sm text-muted-foreground">Marking scheme · Total {totalMarks(row.content)} marks</p>
      {row.content.sections.map((s, si) => (
        <section key={si} className="mt-6">
          <h3 className="font-semibold">{s.title}</h3>
          <ol className="mt-2 space-y-3 text-sm">
            {s.items.map((it, ii) => {
              q += 1;
              return (
                <li key={ii} className="flex gap-3">
                  <span className="font-semibold">{q}.</span>
                  <div className="flex-1">
                    <p className="whitespace-pre-wrap">{it.answer}</p>
                    {it.type === "matching" && <p className="mt-1 text-muted-foreground">{(it.pairs ?? []).map((p, i) => `${i + 1}. ${p.left} → ${p.right}`).join(" · ")}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">[{it.marks}]</span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

async function downloadPdf(row: Row, withKey: boolean) {
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48;
    let y = M;
    const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const text = (s: string, size = 11, style: "normal" | "bold" | "italic" = "normal", x = M, width = W - 2 * M) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(s, width) as string[];
      for (const l of lines) { ensure(size * 1.4); doc.text(l, x, y); y += size * 1.4; }
    };
    const answerLines = (n: number) => {
      for (let i = 0; i < Math.min(n, 30); i++) { ensure(22); y += 18; doc.setDrawColor(170); doc.line(M + 18, y, W - M, y); }
      y += 8;
    };
    const c = row.content;
    text(c.header || `${row.curriculum} · ${row.subject}`, 9);
    text(c.title, 16, "bold");
    text(`${c.duration ? c.duration + " · " : ""}Total: ${totalMarks(c)} marks`, 10);
    y += 6;
    text("Name: ______________________   Class: __________   Date: __________", 10);
    y += 4;
    c.generalInstructions.forEach((g) => text(`• ${g}`, 10));
    let q = 0;
    for (const s of c.sections) {
      y += 10;
      text(s.title, 13, "bold");
      if (s.instructions) text(s.instructions, 10, "italic");
      for (const it of s.items) {
        q += 1;
        y += 6;
        text(`${q}. ${it.prompt}  [${it.marks}]`, 11);
        if (it.type === "mcq") (it.choices ?? []).forEach((ch, i) => text(`${LETTERS[i]}. ${ch}`, 10, "normal", M + 18, W - 2 * M - 18));
        if (it.type === "true_false") text("True  /  False", 10, "normal", M + 18);
        if (it.type === "matching") {
          const rights = shuffleStable((it.pairs ?? []).map((p) => p.right), `${row.id}-${c.sections.indexOf(s)}-${s.items.indexOf(it)}`);
          (it.pairs ?? []).forEach((p, i) => text(`${i + 1}. ${p.left} ____      ${LETTERS[i] ?? ""}. ${rights[i]}`, 10, "normal", M + 18));
        }
        if (it.type === "structured") (it.parts ?? []).forEach((p) => { text(`${p.label} ${p.prompt}  [${p.marks}]`, 10, "normal", M + 18); answerLines(p.lines || 2); });
        if (it.type === "short" || it.type === "essay") answerLines(it.lines ?? (it.type === "essay" ? 15 : 2));
      }
    }
    if (withKey) {
      doc.addPage(); y = M;
      text(`Answer key — ${c.title}`, 16, "bold");
      q = 0;
      for (const s of c.sections) {
        y += 8; text(s.title, 12, "bold");
        for (const it of s.items) {
          q += 1;
          text(`${q}. ${it.answer}  [${it.marks}]`, 10);
          if (it.type === "matching") text((it.pairs ?? []).map((p, i) => `${i + 1}. ${p.left} → ${p.right}`).join("; "), 9, "normal", M + 18);
        }
      }
    }
    const safe = row.title.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "worksheet";
    doc.save(`${safe}${withKey ? "-with-answers" : ""}.pdf`);
  } catch {
    toast.error("Could not create the PDF");
  }
}
