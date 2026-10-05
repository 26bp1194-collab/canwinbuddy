/* Subject / audience ("For") context used to steer question generation. */

import type { CurriculumSetting } from "./prefs";

export function curriculumText(setting: CurriculumSetting): string {
  return setting.curriculum === "other" ? setting.customCurriculum.trim() : setting.curriculum === "none" ? "" : setting.curriculum;
}

export const SUBJECTS = [
  "Art & Design",
  "Biology",
  "Business Studies",
  "Chemistry",
  "Computer Science",
  "Economics",
  "English",
  "Geography",
  "History",
  "Languages",
  "Literature",
  "Mathematics",
  "Music",
  "Physical Education",
  "Physics",
  "Psychology",
  "Religious Studies",
  "Science",
  "Social Studies",
  "Others",
  "No subject",
] as const;

export type SubjectEntry = { value: string; custom: string };

export type AudienceEntry =
  | { kind: "empty" }
  | { kind: "single"; age: number }
  | { kind: "range"; least: number; highest: number }
  | { kind: "all" };

export const AGES = Array.from({ length: 13 }, (_, i) => i + 6); // 6..18

/** 7-12 => Standard 1-6, 13-18 => Form 1-6 */
export function ageLabel(age: number): string {
  if (age >= 7 && age <= 12) return `Age ${age} — Standard ${age - 6}`;
  if (age >= 13 && age <= 18) return `Age ${age} — Form ${age - 12}`;
  return `Age ${age}`;
}

export function subjectText(s: SubjectEntry): string {
  if (!s.value || s.value === "No subject") return "";
  if (s.value === "Others") return s.custom.trim();
  return s.value;
}

export function audienceText(a: AudienceEntry): string {
  if (a.kind === "empty") return "";
  if (a.kind === "single") return ageLabel(a.age);
  if (a.kind === "all") return "All ages (6-18)";
  const [lo, hi] = a.least <= a.highest ? [a.least, a.highest] : [a.highest, a.least];
  if (lo === hi) return ageLabel(lo);
  return `Ages ${lo}-${hi} (${ageLabel(lo).split(" — ")[1] ?? ""} to ${ageLabel(hi).split(" — ")[1] ?? ""})`.replace(" ()", "");
}

export function buildGuidance(
  subjects: SubjectEntry[],
  audiences: AudienceEntry[],
  instructions: string,
  curriculum?: CurriculumSetting,
): string {
  const subs = subjects.map(subjectText).filter(Boolean);
  const auds = audiences.map(audienceText).filter(Boolean);
  const parts: string[] = [];
  if (subs.length) parts.push(`Subject(s): ${subs.join(", ")}`);
  if (auds.length) parts.push(`Written for: ${auds.join("; ")} — match vocabulary, reading level and expected prior knowledge to this level.`);
  const curriculumName = curriculum ? curriculumText(curriculum) : "";
  if (curriculumName) parts.push(`Curriculum: ${curriculumName} — align question framing and expected level, but use only facts present in the source.`);
  if (instructions.trim()) parts.push(`Extra instructions from the user: ${instructions.trim()}`);
  return parts.join("\n");
}
