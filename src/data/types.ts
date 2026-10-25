export type Accent = "primary" | "sky" | "magenta" | "orange" | "green" | "coral";
export type Area = "지리" | "일반사회";

export interface Standard { code: string | null; text: string | null; verified: boolean }
export interface Concept { term: string; desc: string }
export interface QuizItem { id: string; q: string; choices: string[]; answer: number; explain: string }
export interface Lab { type: string; params?: Record<string, unknown> }
export interface Predict { q: string; choices: string[]; answer: number; reveal: string }
export interface Media { type: "image" | "video" | "model"; src: string; caption?: string; credit?: string }

export interface Lesson {
  id: string; title: string; standard: Standard;
  lab?: Lab; predict?: Predict; mission?: string; media?: Media[]; concepts: Concept[]; quiz: QuizItem[];
}
export interface Unit {
  id: string; book: "s1" | "s2"; area: Area; no: number; title: string;
  icon: string; accent: Accent; impact3d?: number; standardsVerified?: boolean;
  geo?: { lat: number; lng: number }; lessons: Lesson[];
}
export interface Book { id: "s1" | "s2"; title: string; defaultGrade: number; units: string[] }
export interface Manifest {
  schemaVersion: number; contentVersion: string; curriculum: string; source?: string;
  books: Book[]; units: { id: string; path: string }[];
}
export interface Catalog { manifest: Manifest; units: Record<string, Unit>; sources: string[] }
