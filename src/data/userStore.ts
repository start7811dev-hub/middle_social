import { get, set } from "idb-keyval";

/**
 * 사용자 학습 데이터 저장소.
 * 지금은 기기 내 IndexedDB(LocalStore). 계정 동기화가 필요해지면
 * 같은 인터페이스로 SupabaseStore를 만들어 교체한다 (docs/ARCHITECTURE.md).
 */
/** 오답 카드 = 간격 반복 카드. box 1→5, 맞히면 다음 상자(간격 늘어남), 틀리면 1번 상자로. */
export interface WrongNote {
  id: string; lessonId: string; quizId: string; picked: number; at: number; resolved?: boolean;
  confidence?: 1 | 2 | 3; box?: number; due?: number; reviews?: number;
}
export const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // box n → n일 뒤
export const DAY = 86400000;
export const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const isDue = (w: WrongNote, now = Date.now()) => !w.resolved && (w.due ?? 0) <= now;
export interface Scrap { id: string; lessonId: string; kind: "concept" | "lesson" | "standard"; title: string; body: string; at: number }
export interface Annotation { id: string; lessonId: string; text: string; at: number }
export interface Photo { id: string; lessonId: string; dataUrl: string; caption: string; at: number }
export interface Progress { [lessonId: string]: { done: boolean; correct: number; total: number; at: number } }
/** 예측 기록: 랩을 보기 전에 학생이 고른 답 */
export interface Predictions { [lessonId: string]: { picked: number; right: boolean; at: number } }
/** 확신도 보정 기록 — 확신(1~3)별 정답/시도 */
export interface Calibration { [conf: string]: { right: number; total: number } }

export interface UserData { wrong: WrongNote[]; scraps: Scrap[]; notes: Annotation[]; photos: Photo[]; progress: Progress; predictions: Predictions; calibration: Calibration; missions: Record<string, number> }
export const emptyUser = (): UserData => ({ wrong: [], scraps: [], notes: [], photos: [], progress: {}, predictions: {}, calibration: {}, missions: {} });

export interface UserStore { load(): Promise<UserData>; save(d: UserData): Promise<void> }

const KEY = "ms.user.v1";
export const LocalStore: UserStore = {
  async load() {
    try { return { ...emptyUser(), ...((await get(KEY)) as UserData | undefined) }; }
    catch { return emptyUser(); }
  },
  async save(d) { try { await set(KEY, d); } catch { /* private mode 등 */ } },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
