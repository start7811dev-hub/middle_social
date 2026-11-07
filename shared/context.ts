import type { LessonContext } from "./guard";

/** 콘텐츠 JSON(단원) + lessonId → 쏘에게 줄 학습 문맥 */
export const LESSON_ID = /^s[12]-[gs]\d{2}-\d{1,2}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function contextFromUnit(unit: any, lessonId: string): LessonContext | null {
  const lesson = unit?.lessons?.find((l: { id: string }) => l.id === lessonId);
  if (!lesson) return null;
  return {
    unitTitle: String(unit.title ?? ""),
    lessonTitle: String(lesson.title ?? ""),
    standard: lesson.standard?.text ?? null,
    sections: (lesson.sections ?? []).map((s: { title: string; text: string }) => ({ title: s.title, text: s.text })),
    concepts: (lesson.concepts ?? []).map((c: { term: string; desc: string }) => ({ term: c.term, desc: c.desc })),
  };
}
