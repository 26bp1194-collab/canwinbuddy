import { useEffect, useState } from "react";
import { Loader2, Wand2, Sparkles, CheckCircle2, Globe, ShieldCheck, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { aiTextHelper, planTextQuestions } from "@/lib/ai.functions";
import { usePlanningEnabled } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Mode = "source-finder" | "refine-check";
type PlanQ = { question: string; placeholder?: string; answer: string };

export function AiTextHelper({
  open,
  onOpenChange,
  sourceText,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceText: string;
  onApply: (text: string) => void;
}) {
  const { planningEnabled } = usePlanningEnabled();
  const [mode, setMode] = useState<Mode>("source-finder");
  const [instruction, setInstruction] = useState("");
  const [existing, setExisting] = useState("");
  const [improve, setImprove] = useState(true);
  const [factCheck, setFactCheck] = useState(false);
  const [customOn, setCustomOn] = useState(false);
  const [custom, setCustom] = useState("");
  const [planQs, setPlanQs] = useState<PlanQ[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("source-finder");
      setInstruction("");
      setExisting(sourceText);
      setImprove(true);
      setFactCheck(false);
      setCustomOn(false);
      setCustom("");
      setPlanQs(null);
      setResult("");
    }
  }, [open, sourceText]);

  const validInput = () => {
    if (mode === "source-finder" && !instruction.trim()) {
      toast.error("Describe the information you want first.");
      return false;
    }
    if (mode === "refine-check" && !existing.trim()) {
      toast.error("Paste the source text you want changed.");
      return false;
    }
    if (mode === "refine-check" && customOn && !custom.trim()) {
      toast.error("Tell the AI what to do for your custom instruction.");
      return false;
    }
    return true;
  };

  const generate = async (answers?: PlanQ[]) => {
    setLoading(true);
    try {
      const { text } = await aiTextHelper({
        data: {
          mode,
          instruction: instruction.trim() || "Refine the provided source text.",
          existingText: mode === "refine-check" ? existing : result,
          actions:
            mode === "refine-check"
              ? { improve, factCheck, custom: customOn ? custom.trim() : "" }
              : undefined,
          planAnswers: (answers ?? planQs ?? []).map((p) => ({ question: p.question, answer: p.answer })),
        },
      });
      setResult(text);
      setPlanQs(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Text helper failed");
    } finally {
      setLoading(false);
    }
  };

  const start = async () => {
    if (!validInput()) return;
    if (!planningEnabled || result) {
      void generate();
      return;
    }
    setPlanning(true);
    try {
      const { questions } = await planTextQuestions({
        data: {
          mode,
          instruction: instruction.trim() || "Refine the provided source text.",
          existingText: mode === "refine-check" ? existing : "",
        },
      });
      setPlanQs(questions.map((q) => ({ ...q, answer: "" })));
    } catch {
      void generate();
    } finally {
      setPlanning(false);
    }
  };

  const busy = loading || planning;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> AI Text Helper
          </DialogTitle>
          <DialogDescription>
            Find new information from the web, or refine and fact-check text you already have.
          </DialogDescription>
        </DialogHeader>

        {planQs ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecks className="h-4 w-4 text-primary" /> A few quick questions
            </div>
            <p className="text-xs text-muted-foreground">
              Answering these makes the text match your style. You can skip this step, or turn planning off in Settings.
            </p>
            {planQs.map((q, i) => (
              <div key={i}>
                <Label className="mb-2 block">{q.question}</Label>
                <Textarea
                  value={q.answer}
                  placeholder={q.placeholder || "Your answer…"}
                  onChange={(e) =>
                    setPlanQs((prev) => prev!.map((p, idx) => (idx === i ? { ...p, answer: e.target.value } : p)))
                  }
                  className="min-h-[64px]"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={mode === "source-finder"}
                onClick={() => setMode("source-finder")}
                icon={<Globe className="h-4 w-4" />}
                label="Source Finder"
              />
              <ModeButton
                active={mode === "refine-check"}
                onClick={() => setMode("refine-check")}
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Refine & Check"
              />
            </div>

            {mode === "source-finder" ? (
              <div>
                <Label htmlFor="helper-inst" className="mb-2 block">Information Description</Label>
                <Textarea
                  id="helper-inst"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g. Find information about the causes and key events of the French Revolution (1789–1799), including important dates and figures."
                  className="min-h-[110px]"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="helper-existing" className="mb-2 block">Your source text</Label>
                  <Textarea
                    id="helper-existing"
                    value={existing}
                    onChange={(e) => setExisting(e.target.value)}
                    placeholder="Paste the text you want improved or fact-checked…"
                    className="min-h-[140px]"
                  />
                </div>
                <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
                  <CheckRow id="improve" checked={improve} onChange={setImprove} label="Improve text" />
                  <CheckRow id="factcheck" checked={factCheck} onChange={setFactCheck} label="Fact-check text" />
                  <CheckRow id="custom" checked={customOn} onChange={setCustomOn} label="Custom" />
                  {customOn && (
                    <Textarea
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="Tell the AI what to do with your text, e.g. shorten it to 200 words and add formulas."
                      className="min-h-[80px]"
                    />
                  )}
                </div>
              </>
            )}

            {result && (
              <div>
                <Label className="mb-2 block">AI output</Label>
                <Textarea value={result} onChange={(e) => setResult(e.target.value)} className="min-h-[200px]" />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex flex-wrap gap-2">
            {planQs ? (
              <>
                <Button variant="secondary" onClick={() => generate(planQs.map((p) => ({ ...p, answer: "" })))} disabled={busy}>
                  Skip
                </Button>
                <Button onClick={() => generate()} disabled={busy}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Continue
                </Button>
              </>
            ) : (
              <>
                {result && (
                  <Button variant="secondary" onClick={() => generate()} disabled={busy}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Change more
                  </Button>
                )}
                {!result ? (
                  <Button onClick={start} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate
                  </Button>
                ) : (
                  <Button onClick={() => onApply(result)} disabled={busy}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Use Text
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary text-primary-foreground"
          : "border-border bg-secondary/50 text-foreground hover:bg-accent/60",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</Label>
    </div>
  );
}
