import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUBJECTS, AGES, ageLabel } from "@/lib/quiz-context";
import { CURRICULA } from "@/lib/prefs";
import { listKeyDown } from "@/lib/list-input";
import { generateWorksheet } from "@/lib/worksheet.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceText: string;
  title: string;
  initialSubject?: string;
  initialAge?: number;
  initialCurriculum?: string;
};

export function WorksheetDialog({ open, onOpenChange, sourceText, title, initialSubject, initialAge, initialCurriculum }: Props) {
  const navigate = useNavigate();
  const gen = useServerFn(generateWorksheet);
  const [subject, setSubject] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [age, setAge] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [customCurriculum, setCustomCurriculum] = useState("");
  const [topics, setTopics] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initialSubject && !subject) {
      if ((SUBJECTS as readonly string[]).includes(initialSubject)) setSubject(initialSubject);
      else { setSubject("Others"); setCustomSubject(initialSubject); }
    }
    if (initialAge && !age) setAge(String(initialAge));
    if (initialCurriculum && !curriculum) {
      if ((CURRICULA as readonly string[]).includes(initialCurriculum)) setCurriculum(initialCurriculum);
      else { setCurriculum("other"); setCustomCurriculum(initialCurriculum); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const subjectValue = subject === "Others" ? customSubject.trim() : subject;
  const curriculumValue = curriculum === "other" ? customCurriculum.trim() : curriculum;

  async function submit() {
    const e: Record<string, string> = {};
    if (!subjectValue) e.subject = "Choose a subject.";
    if (!age) e.age = "Choose an age.";
    if (!curriculumValue) e.curriculum = "Choose a curriculum.";
    if (!sourceText.trim() && !topics.trim()) e.topics = "Add topics to follow, or type source text on the Generate page.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { id } = await gen({ data: { subject: subjectValue, age: Number(age), curriculum: curriculumValue, topics, sourceText, title } });
      toast.success("Worksheet created");
      onOpenChange(false);
      navigate({ to: "/worksheet/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the worksheet");
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-destructive">{errors[k]}</p>;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Create Worksheet</DialogTitle>
          <DialogDescription>
            Built in the real format of your curriculum and age, using your source text{sourceText.trim() ? " (already added)" : ""} and the topics below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">Subject *</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger aria-invalid={!!errors.subject}><SelectValue placeholder="Choose subject" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.filter((s) => s !== "No subject").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {subject === "Others" && <Input className="mt-2" value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Type subject" />}
              {err("subject")}
            </div>
            <div>
              <Label className="mb-2 block">Age *</Label>
              <Select value={age} onValueChange={setAge}>
                <SelectTrigger aria-invalid={!!errors.age}><SelectValue placeholder="Choose age" /></SelectTrigger>
                <SelectContent>
                  {AGES.map((a) => <SelectItem key={a} value={String(a)}>{ageLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
              {err("age")}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Curriculum *</Label>
            <Select value={curriculum} onValueChange={setCurriculum}>
              <SelectTrigger aria-invalid={!!errors.curriculum}><SelectValue placeholder="Choose curriculum" /></SelectTrigger>
              <SelectContent>
                {CURRICULA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {curriculum === "other" && <Input className="mt-2" value={customCurriculum} onChange={(e) => setCustomCurriculum(e.target.value)} placeholder="Type curriculum" />}
            {err("curriculum")}
          </div>
          <div>
            <Label className="mb-2 block">Topics to follow</Label>
            <Textarea
              rows={4}
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              onKeyDown={(e) => listKeyDown(e, setTopics)}
              placeholder={"1. Photosynthesis\n2. Cell structure"}
            />
            {err("topics")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : "Generate worksheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
