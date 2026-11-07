/* 앱 곳곳에서 일어난 학습 사건을 쏘에게 알리는 이벤트 버스 */
export type SsoEvent =
  | { type: "lesson"; unitId: string; lessonId: string; title: string; hasPredict: boolean; predicted: boolean; concepts: { term: string; desc: string }[] }
  | { type: "leave-lesson" }
  | { type: "predict"; right: boolean }
  | { type: "answer"; right: boolean; confidence: 1 | 2 | 3; q: string; picked: string; correct: string }
  | { type: "quiz-done"; score: number; total: number; hasMission: boolean }
  | { type: "home"; due: number }
  | { type: "mission-done" }
  | { type: "ask"; text: string; mode?: "chat" | "quiz" }
  | { type: "talk" };

const TARGET = new EventTarget();
/** 쏘가 나중에 떠도 지금 보는 학습을 알 수 있게 마지막 학습 사건을 기억한다 */
let lastLesson: Extract<SsoEvent, { type: "lesson" }> | null = null;
export const getLastLesson = () => lastLesson;
export function ssoEmit(e: SsoEvent) {
  if (e.type === "lesson") lastLesson = e;
  if (e.type === "leave-lesson") lastLesson = null;
  TARGET.dispatchEvent(new CustomEvent("sso", { detail: e }));
}
export function onSso(fn: (e: SsoEvent) => void) {
  const h = (ev: Event) => fn((ev as CustomEvent<SsoEvent>).detail);
  TARGET.addEventListener("sso", h);
  return () => TARGET.removeEventListener("sso", h);
}

/* 쏘 설정 — 기기별 (localStorage, 실패해도 기본값) */
export interface SsoSettings { server: string; code: string; color: string; quiet: boolean; voice: boolean; pitch: "soft" | "sso" | "high"; rate: number }
const KEY = "sso.settings.v1";
export function loadSettings(): SsoSettings {
  const d: SsoSettings = { server: (import.meta.env.VITE_SSO_SERVER as string | undefined) ?? "", code: "", color: "#ffffff", quiet: false, voice: true, pitch: "sso", rate: 1.05 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return d; }
}
export function saveSettings(s: SsoSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 불가 환경 */ }
  TARGET.dispatchEvent(new CustomEvent("settings"));
}
export function onSettings(fn: () => void) {
  TARGET.addEventListener("settings", fn);
  return () => TARGET.removeEventListener("settings", fn);
}
