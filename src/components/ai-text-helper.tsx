import { useEffect, useRef, useState } from "react";
import { Loader2, Wand2, Sparkles, CheckCircle2, Globe, ShieldCheck, ListChecks, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { aiTextHelper, planTextQuestions } from "@/lib/ai.functions";
import { usePlanningEnabled, getHelperState, saveHelperState, clearHelperState } from "@/lib/prefs";

import { useT } from "@/lib/i18n";
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
type PlanQ = { question: string; options: string[]; picks: string[]; custom: string };

const answerOf = (p: PlanQ) => [...p.picks, p.custom.trim()].filter(Boolean).join("; ");

type SavedHelper = {
  mode: Mode;
  instruction: string;
  existing: string;
  improve: boolean;
  factCheck: boolean;
  customOn: boolean;
  custom: string;
  planQs: PlanQ[] | null;
  step: number;
  customPick: boolean;
  result: string;
};



export function AiTextHelper({
  open,
  onOpenChange,
  sourceText,
  onApply,
  initialInstruction = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceText: string;
  onApply: (text: string) => void;
  initialInstruction?: string;
}) {
  const t = useT();
  const { planningEnabled } = usePlanningEnabled();
  const [mode, setMode] = useState<Mode>("source-finder");
  const [instruction, setInstruction] = useState("");
  const [existing, setExisting] = useState("");
  const [improve, setImprove] = useState(true);
  const [factCheck, setFactCheck] = useState(false);
  const [customOn, setCustomOn] = useState(false);
  const [custom, setCustom] = useState("");
  const [planQs, setPlanQs] = useState<PlanQ[] | null>(null);
  const [step, setStep] = useState(0);
  const [customPick, setCustomPick] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const hydrated = useRef(false);

  useEffect(() => {
    if (!open) {
      hydrated.current = false;
      return;
    }
    const saved = getHelperState<SavedHelper>();
    if (saved && !initialInstruction) {
      setMode(saved.mode);
      setInstruction(saved.instruction);
      setExisting(saved.existing || sourceText);
      setImprove(saved.improve);
      setFactCheck(saved.factCheck);
      setCustomOn(saved.customOn);
      setCustom(saved.custom);
      setPlanQs(saved.planQs);
      setStep(saved.step);
      setCustomPick(saved.customPick);
      setResult(saved.result);
    } else {
      setMode("source-finder");
      setInstruction(initialInstruction);
      setExisting(sourceText);
      setImprove(true);
      setFactCheck(false);
      setCustomOn(false);
      setCustom("");
      setPlanQs(null);
      setStep(0);
      setCustomPick(false);
      setResult("");
    }
    hydrated.current = true;
  }, [open, sourceText, initialInstruction]);

  /* Keep everything (including in-progress planning) for the next time it opens */
  useEffect(() => {
    if (!open || !hydrated.current) return;
    saveHelperState({ mode, instruction, existing, improve, factCheck, customOn, custom, planQs, step, customPick, result });
  }, [open, mode, instruction, existing, improve, factCheck, customOn, custom, planQs, step, customPick, result]);


  const validInput = () => {
    if (mode === "source-finder" && !instruction.trim()) {
      toast.error(t("Describe the information you want first."));
      return false;
    }
    if (mode === "refine-check" && !existing.trim()) {
      toast.error(t("Paste the source text you want changed."));
      return false;
    }
    if (mode === "refine-check" && customOn && !custom.trim()) {
      toast.error(t("Tell the AI what to do for your custom instruction."));
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
          planAnswers: (answers ?? planQs ?? []).map((p) => ({ question: p.question, answer: answerOf(p) })).filter((p) => p.answer),
        },
      });
      setResult(text);
      setPlanQs(null);
      setStep(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Text helper failed"));
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
      setPlanQs(questions.map((q) => ({ ...q, picks: [], custom: "" })));
      setStep(0);
      setCustomPick(false);
    } catch {
      void generate();
    } finally {
      setPlanning(false);
    }
  };

  const patchCurrent = (patch: Partial<PlanQ>) => {
    setPlanQs((prev) => prev!.map((p, i) => (i === step ? { ...p, ...patch } : p)));
  };

  const togglePick = (opt: string) => {
    const p = planQs![step];
    patchCurrent({ picks: p.picks.includes(opt) ? p.picks.filter((x) => x !== opt) : [...p.picks, opt] });
  };

  const advance = () => {
    if (!planQs) return;
    if (step + 1 >= planQs.length) {
      void generate();
    } else {
      setStep((s) => s + 1);
      setCustomPick(false);
    }
  };


  const busy = loading || planning;
  const current = planQs?.[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Wand2 className="h-5 w-5 shrink-0 text-primary" /> {t("AI Text Helper")}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t("Find new information from the web, or refine and fact-check text you already have.")}
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 shrink-0 text-primary" /> {t("Quick question")}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {step + 1} / {planQs!.length}
              </span>
            </div>
            <p className="text-base font-medium">{current.question}</p>
            <div className="space-y-2">
              {current.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => togglePick(opt)}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                    current.picks.includes(opt)
                      ? "border-primary/60 bg-primary text-primary-foreground"
                      : "border-border bg-secondary/50 hover:bg-accent/60",
                  )}
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomPick((c) => !c);
                  if (customPick) patchCurrent({ custom: "" });
                }}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                  customPick ? "border-primary/60 bg-accent" : "border-border bg-secondary/50 hover:bg-accent/60",
                )}
              >
                {t("Custom")}
              </button>
              {customPick && (
                <Textarea
                  value={current.custom}
                  onChange={(e) => patchCurrent({ custom: e.target.value })}
                  placeholder={t("Describe what you want instead…")}
                  className="min-h-[70px]"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Pick as many as you like. Skip moves past just this question, or turn planning off in Settings.")}
            </p>

          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={mode === "source-finder"}
                onClick={() => setMode("source-finder")}
                icon={<Globe className="h-4 w-4" />}
                label={t("Source Finder")}
              />
              <ModeButton
                active={mode === "refine-check"}
                onClick={() => setMode("refine-check")}
                icon={<ShieldCheck className="h-4 w-4" />}
                label={t("Refine & Check")}
              />
            </div>

            {mode === "source-finder" ? (
              <div>
                <Label htmlFor="helper-inst" className="mb-2 block">{t("Information Description")}</Label>
                <Textarea
                  id="helper-inst"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t("e.g. Find information about the causes and key events of the French Revolution (1789–1799), including important dates and figures.")}
                  className="min-h-[110px]"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="helper-existing" className="mb-2 block">{t("Your source text")}</Label>
                  <Textarea
                    id="helper-existing"
                    value={existing}
                    onChange={(e) => setExisting(e.target.value)}
                    placeholder={t("Paste the text you want improved or fact-checked…")}
                    className="min-h-[140px]"
                  />
                </div>
                <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
                  <CheckRow id="improve" checked={improve} onChange={setImprove} label={t("Improve text")} />
                  <CheckRow id="factcheck" checked={factCheck} onChange={setFactCheck} label={t("Fact-check text")} />
                  <CheckRow id="custom" checked={customOn} onChange={setCustomOn} label={t("Custom")} />
                  {customOn && (
                    <Textarea
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder={t("Tell the AI what to do with your text, e.g. shorten it to 200 words and add formulas.")}
                      className="min-h-[80px]"
                    />
                  )}
                </div>
              </>
            )}

            {result && (
              <div>
                <Label className="mb-2 block">{t("AI output")}</Label>
                <Textarea value={result} onChange={(e) => setResult(e.target.value)} className="min-h-[200px]" />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">{t("Cancel")}</Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {current ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const cleared = planQs!.map((p, i) => (i === step ? { ...p, picks: [], custom: "" } : p));
                    setPlanQs(cleared);
                    setCustomPick(false);
                    if (step + 1 >= cleared.length) void generate(cleared);
                    else setStep((s) => s + 1);
                  }}

                  disabled={busy}
                >
                  {t("Skip")}
                </Button>
                <Button onClick={advance} disabled={busy || !answerOf(current)}>

                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : step + 1 >= planQs!.length ? (
                    <Sparkles className="mr-2 h-4 w-4" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {step + 1 >= planQs!.length ? t("Generate") : t("Next")}
                </Button>
              </>
            ) : (
              <>
                {result && (
                  <Button variant="secondary" onClick={() => generate()} disabled={busy}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    {t("Change more")}
                  </Button>
                )}
                {!result ? (
                  <Button onClick={start} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {t("Generate")}
                  </Button>
                ) : (
                  <Button onClick={() => onApply(result)} disabled={busy}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> {t("Use Text")}
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
        "flex min-w-0 items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
        active
          ? "border-primary/60 bg-primary text-primary-foreground"
          : "border-border bg-secondary/50 text-foreground hover:bg-accent/60",
      )}
    >
      <span className="shrink-0">{icon}</span>
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
