/* 쏘의 목소리와 귀 — 브라우저 내장 Web Speech API
   · 말하기(TTS): Mac·iPad·Chrome의 한국어 음성, 높이·속도로 쏘다운 목소리
   · 듣기(STT): Safari·Chrome의 음성 인식 (ko-KR). 안 되는 환경에서는 글자 입력으로 대체
   서버로 음성을 보내지 않는다(인식은 브라우저·OS가 처리). */

import { loadSettings } from "./bus";

const PREFERRED = ["Yuna", "유나", "Sora", "Google 한국의", "Microsoft SunHi", "Heami", "Jian"];

let voicesCache: SpeechSynthesisVoice[] = [];
function koVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  if (!voicesCache.length) voicesCache = synth.getVoices();
  const ko = voicesCache.filter((v) => v.lang?.toLowerCase().startsWith("ko"));
  return PREFERRED.map((n) => ko.find((v) => v.name.includes(n))).find(Boolean) ?? ko[0] ?? null;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { voicesCache = window.speechSynthesis.getVoices(); };
}

export const PITCH = { soft: 1.1, sso: 1.35, high: 1.6 } as const;
export type PitchPreset = keyof typeof PITCH;

export const canSpeak = () => typeof window !== "undefined" && !!window.speechSynthesis;

/** 소리 내어 읽기 좋게 정리 */
function clean(t: string) {
  return t.replace(/[*#_`>|]/g, "").replace(/\s+/g, " ").replace(/\(([^)]{0,40})\)/g, ", $1,").trim();
}

export function speak(text: string, h: { onStart?: () => void; onEnd?: () => void } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) { h.onEnd?.(); return; }
  if (!koVoice() && synth.getVoices().length === 0) { /* 음성 목록이 아직 없을 수도 있어 시도는 한다 */ }
  synth.cancel();
  const s = loadSettings();
  // 긴 답은 문장 단위로 나눠 읽어야 Safari에서 끊기지 않는다
  const parts = clean(text).match(/[^.!?。]+[.!?。]?/g) ?? [text];
  let started = false, ended = false;
  const finish = () => { if (!ended) { ended = true; window.clearTimeout(guard); window.clearTimeout(noStart); h.onEnd?.(); } };
  // 음성 엔진이 없거나 끝 신호를 안 주는 기기 대비: 시작이 안 되면 1.5초, 길이에 맞춘 최대 시간 뒤 끝낸 것으로 본다
  const noStart = window.setTimeout(() => { if (!started) finish(); }, 1500);
  const guard = window.setTimeout(finish, clean(text).length * 160 + 3000);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = "ko-KR";
    const v = koVoice();
    if (v) u.voice = v;
    u.pitch = PITCH[(s.pitch as PitchPreset) ?? "sso"] ?? PITCH.sso;
    u.rate = s.rate ?? 1.05;
    if (i === 0) u.onstart = () => { if (!started) { started = true; h.onStart?.(); } };
    if (i === parts.length - 1) { u.onend = finish; u.onerror = finish; }
    synth.speak(u);
  });
}
export function stopSpeaking() { window.speechSynthesis?.cancel(); }

/* ── 듣기 ─────────────────────────────── */
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
function Recognition(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
/** Electron(Mac 앱)은 음성 인식 서비스가 없어 글자 입력만 */
export const canListen = () => typeof window !== "undefined" && !!Recognition() && !/Electron/i.test(navigator.userAgent);

export function listen(h: { onInterim?: (t: string) => void; onFinal: (t: string) => void; onEnd?: () => void; onError?: (e: string) => void }) {
  const R = Recognition();
  if (!R) { h.onError?.("unsupported"); return () => {}; }
  const r = new R();
  r.lang = "ko-KR";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    h.onInterim?.((finalText + interim).trim());
  };
  r.onerror = (e) => h.onError?.(e.error);
  r.onend = () => { if (finalText.trim()) h.onFinal(finalText.trim()); h.onEnd?.(); };
  try { r.start(); } catch { h.onError?.("start-failed"); }
  return () => { try { r.stop(); } catch { /* 이미 멈춤 */ } };
}
