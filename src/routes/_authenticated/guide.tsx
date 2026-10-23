import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  Upload,
  Sparkles,
  Copy,
  UserPlus,
  FileText,
  SlidersHorizontal,
  Play,
  Lightbulb,
  ClipboardList,
  Share2,
  FolderOpen,
  Settings,
  Video,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import guideVideo from "@/assets/canwinbuddy-guide.mp4.asset.json";
import guidePoster from "@/assets/canwinbuddy-guide-poster.jpg.asset.json";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({
    meta: [
      { title: "Guide — CanWinBuddy" },
      { name: "description", content: "Learn how to turn your notes into quizzes and worksheets with CanWinBuddy." },
      { property: "og:title", content: "Guide — CanWinBuddy" },
      { property: "og:description", content: "Learn how to turn your notes into quizzes and worksheets with CanWinBuddy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "/guide" },
    ],
    links: [{ rel: "canonical", href: "/guide" }],
  }),
  component: GuidePage,
});

type GuideSection = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  bullets: string[];
};

const SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    icon: UserPlus,
    title: "Getting started",
    bullets: [
      "Create an account with a username and a password. No email is needed.",
      "Usernames need at least 4 letters or numbers, with at least one letter. Passwords need at least 6 characters.",
      "Your quizzes, worksheets, results and settings are saved to your account, so you can log in on any device.",
      "There is no email on your account, so keep your password somewhere safe.",
    ],
  },
  {
    id: "adding-notes",
    icon: FileText,
    title: "Adding your notes",
    bullets: [
      "Go to Generate. Step 1 is Notes.",
      "Title is optional. Subject and Age (7 to 25, optional) help the AI match the right level.",
      "Paste your text into the Notes box. Long pastes turn into a small note bubble you can open, edit or remove.",
      "Tap the + button to add files (PDF, DOCX, XLSX, CSV, TXT, MD or images, up to 20 MB each) or a list of topics to follow.",
      "Photos, scans and PDFs are read by AI, including tables and diagrams. Clear, well-lit photos work best. If a warning appears, check the text before generating.",
      "AI Text Helper can write study text from a topic description, or improve and fact-check text you already have. Always double-check AI-written facts.",
      "Your work is saved automatically while you stay in the same browser tab.",
    ],
  },
  {
    id: "customising",
    icon: SlidersHorizontal,
    title: "Customising your quiz",
    bullets: [
      "Press Next to reach Step 2.",
      "Instructions are optional. Tell the AI what to focus on, for example dates and causes.",
      "Choose the amount (1 to 100) and the difficulty: Simple, Average or Difficult.",
      "Choose a curriculum: None, SPM, IGCSE, A-Levels, Gaokao, AP, SAT, CBSE, ICSE, or Other and type your own.",
      "Simple mode has one switch for short questions and answers.",
      "Advanced mode has sliders for question length, answer length, complexity and obscurity (from explicit to implicit).",
      "Questions come in a mix of styles, such as true-or-false statements, fill in the blank, scenarios, odd one out and calculations, so quizzes feel less repetitive.",
      "Some questions have two or three options, are true-or-false style, or ask you to select two correct answers.",
      "For maths and science, quizzes can include calculations, equations and word problems at the right level for your age and curriculum.",
      "If your notes cannot support that many questions, the app tells you. You can add more sources or continue with fewer questions.",
      "Press Generate. The AI studies your notes, writes the questions, then checks them against your source before saving.",
    ],
  },
  {
    id: "playing",
    icon: Play,
    title: "Playing a quiz",
    bullets: [
      "Open a quiz and press Play. Questions and answer order are shuffled each time.",
      "You see straight away if you were right. Reset quiz starts again.",
      "If you leave halfway, your progress is saved on that device.",
      "At the end you get your score, a review of every question, and AI explanations for the ones you missed.",
      "Finished attempts are saved under the History button on the quiz page. You can rename or delete them.",
    ],
  },
  {
    id: "improving",
    icon: Sparkles,
    title: "Understanding and improving questions",
    bullets: [
      "Tap Explain next to a question to see why the answer is right, and ask your own follow-up question.",
      "Tick questions and press Edit selected (or Edit all), then tell the AI what to change.",
      "In the More menu, Follow-up quiz makes a fresh quiz from the same notes. Choose easier, harder or the same level.",
      "Sources shows the notes and settings the quiz was made from.",
      "Press Flashcards on a quiz to flip through the questions and answers, then mark each card Know it or Still learning.",
      "Press Study Notes on the Notes step to get a short revision sheet with the points people often forget or mix up first. Copy it or download it as a PDF.",
    ],
  },
  {
    id: "worksheets",
    icon: ClipboardList,
    title: "Worksheets",
    bullets: [
      "On Step 1 of Generate, press Create Worksheet.",
      "Choose a Subject, an Age (6 to 18) and a Curriculum. It uses the notes and topics you already added.",
      "You get an exam-style worksheet with sections, marks and answer lines. Question types depend on the curriculum and age: multiple choice, short answer, structured, fill in the blank, true or false, matching and essay.",
      "On the worksheet page you can switch on Fill in to answer on screen, open the Answer key tab, download a PDF (with or without answers), or print.",
    ],
  },
  {
    id: "sharing",
    icon: Share2,
    title: "Sharing and exporting",
    bullets: [
      "Share (in the More menu) gives you a link. Anyone with it can play without an account.",
      "Pick Blooket, Gimkit, Gimkit 2 or Kahoot, then press Download. Blooket and Gimkit give you a CSV file. Kahoot gives you an Excel (.xlsx) file.",
      "Blooket: create a set, choose CSV Import, then upload the file.",
      "Gimkit: create a new kit, choose Import from Spreadsheet, then Upload File. Gimkit 2 is the two-column version (question and correct answer only).",
      "Kahoot: create a kahoot, choose Add question, then Import spreadsheet, and upload the .xlsx file.",
      "If a site rejects the file, press Copy instead. Paste the rows into that site's own template, keep the columns in the same order, and upload that file.",
      "Use the Language option to translate the questions before you export.",
      "Questions with two correct answers export to Kahoot. Blooket and Gimkit exports leave them out.",
    ],
  },
  {
    id: "organised",
    icon: FolderOpen,
    title: "Staying organised",
    bullets: [
      "History holds all your quizzes and worksheets.",
      "Star favourites, sort (Newest, Oldest, A-Z, Most questions and more) and filter by All, Groups, Quizzes, Worksheets or Favourited.",
      "Groups bundle related quizzes, for example Biology unit 3. Open a group to Play all together.",
      "Deleting asks \"Are you sure?\". You can turn this off with Quick delete in Settings.",
      "The Dashboard shows your totals and recent sets.",
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings",
    bullets: [
      "App language translates the whole interface.",
      "Quiz defaults set your usual amount, difficulty, curriculum, export format, quiz language, and separate Simple and Advanced defaults.",
      "You can also turn the AI Text Helper planning questions on or off, set Quick delete, skip the not-enough-information warning, and choose dark or light theme.",
      "Press Save when the \"unsaved changes\" bar appears.",
      "Reset all puts every setting back to default. Delete account permanently removes your data.",
    ],
  },
  {
    id: "tips",
    icon: Lightbulb,
    title: "Quick tips",
    bullets: [
      "Better notes make better quizzes. Use clear, factual text with key terms and formulas.",
      "Start with 10 questions, check them, then go bigger.",
      "Choose a curriculum and age to get exam-style wording.",
      "Notes that include formulas or worked examples produce calculation questions.",
      "Skim the questions once before you share or print.",
    ],
  },
];

function GuidePage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Guide")}</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          {t("Turn your notes into quizzes and worksheets in a few minutes.")}
        </p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Placeholder icon={Upload} title={t("1. Add notes")} body={t("Paste text, upload files, or list topics.")} />
        <Placeholder icon={Sparkles} title={t("2. Customise")} body={t("Choose how many questions, how hard, and which curriculum.")} />
        <Placeholder icon={Copy} title={t("3. Play or export")} body={t("Play in the app, share a link, or export to Blooket, Gimkit or Kahoot.")} />
      </div>



      <Accordion type="single" collapsible defaultValue="getting-started" className="panel mt-8 px-4 sm:px-6">
        {SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger>
              <span className="flex items-center gap-3">
                <section.icon className="h-4 w-4 shrink-0 text-primary" />
                <span>{t(section.title)}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {section.bullets.map((b) => (
                  <li key={b}>{t(b)}</li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <section className="panel mt-8 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Video className="h-4 w-4 shrink-0 text-primary" /> {t("Video walkthrough")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("A tour of CanWinBuddy: add notes, customise, then play, share or export.")}
        </p>
        <video
          className="mt-4 aspect-video w-full rounded-xl border border-border bg-black"
          controls
          playsInline
          preload="metadata"
          poster={guidePoster.url}
          src={guideVideo.url}
        >
          {t("Your browser cannot play this video.")}
        </video>
      </section>

      <div className="mt-8 flex justify-center">
        <Button asChild>
          <Link to="/generate">{t("Start generating")}</Link>
        </Button>
      </div>

      <div className="mt-10 text-center">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{t("Credits")}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("CanWinBuddy, a study app")} {t("designed & developed by")}{" "}
          <span className="font-medium text-foreground">Loke Ken Win</span>
        </p>
      </div>
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="panel p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
