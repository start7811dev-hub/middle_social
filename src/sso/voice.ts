/* 쏘의 목소리와 귀
   · 말하기: 서버에 음성 엔진이 설정돼 있으면 /api/tts의 고품질 목소리(쏘 전용),
     없거나 실패하면 기기 내장 한국어 음성(높이를 억지로 바꾸지 않은 자연스러운 소리)
   · 듣기(STT): Safari·Chrome의 음성 인식 (ko-KR). 안 되는 환경에서는 글자 입력으로 대체
   음성 인식은 브라우저가 처리하며, Safari·Chrome은 이를 위해 Apple·Google 서버를 쓸 수 있다(각 회사 정책). */

import { loadSettings } from "./bus";
import { apiUrl, ssoHeaders } from "./transport";

/* ── 기기 음성 (대체용) ───────────────────── */
// 품질 좋은 순서: Mac·iPad의 '향상된' 음성 > Google > Microsoft
const PREFERRED = ["Yuna (Premium)", "Yuna (Enhanced)", "유나(프리미엄)", "유나(향상됨)", "Sora", "Yuna", "유나", "Google 한국의", "Microsoft SunHi", "Heami", "Jian"];

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

/** 기기 음성의 높낮이 — 기본은 손대지 않음(1.0). 높이를 크게 올리면 기계음이 심해진다 */
export const PITCH = { soft: 0.95, sso: 1.0, high: 1.08 } as const;
export type PitchPreset = keyof typeof PITCH;

export const canSpeak = () => typeof window !== "undefined" && (!!window.speechSynthesis || typeof Audio !== "undefined");

/** 소리 내어 읽기 좋게 정리 */
function clean(t: string) {
  return t.replace(/[*#_`>|]/g, "").replace(/\s+/g, " ").replace(/\(([^)]{0,40})\)/g, ", $1,").trim();
}

interface Handlers { onStart?: () => void; onEnd?: () => void }
/** sig: 쏘 서버가 준 서명 / section: 교과 본문 섹션(서버가 원문을 꺼내 읽음) */
export interface SpeakOpts { sig?: string; section?: { lessonId: string; index: number } }

function deviceSpeak(text: string, h: Handlers) {
  const synth = window.speechSynthesis;
  if (!synth) { h.onEnd?.(); return; }
  synth.cancel();
  const s = loadSettings();
  // 긴 답은 문장 단위로 나눠 읽어야 Safari에서 끊기지 않는다
  const parts = clean(text).match(/[^.!?。]+[.!?。]?/g) ?? [text];
  let started = false, ended = false;
  const finish = () => { if (!ended) { ended = true; window.clearTimeout(guard); window.clearTimeout(noStart); h.onEnd?.(); } };
  // 음성 엔진이 없거나 끝 신호를 안 주는 기기 대비
  const noStart = window.setTimeout(() => { if (!started) finish(); }, 1500);
  const guard = window.setTimeout(finish, clean(text).length * 160 + 3000);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = "ko-KR";
    const v = koVoice();
    if (v) u.voice = v;
    u.pitch = PITCH[(s.pitch as PitchPreset) ?? "sso"] ?? 1;
    u.rate = Math.min(1.15, Math.max(0.85, s.rate ?? 1));
    if (i === 0) u.onstart = () => { if (!started) { started = true; h.onStart?.(); } };
    if (i === parts.length - 1) { u.onend = finish; u.onerror = finish; }
    synth.speak(u);
  });
}

/* ── 쏘 전용 목소리 (서버 TTS) ───────────────── */
let ttsP: Promise<string | null> | null = null;
let ttsFor = "";
/** 서버 음성 엔진 이름 (없으면 null) */
export function serverVoice(): Promise<string | null> {
  const url = apiUrl("tts");
  if (!url) return Promise.resolve(null);
  if (ttsP && ttsFor === url) return ttsP;
  ttsFor = url;
  ttsP = fetch(url, { signal: AbortSignal.timeout(3500) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.enabled ? String(j.provider) : null))
    .catch(() => null);
  return ttsP;
}

// iOS Safari는 사용자가 누른 순간에만 소리를 허락한다 → 첫 터치 때 하나의 audio를 '열어 두고' 계속 재용
let player: HTMLAudioElement | null = null;
function getPlayer() {
  if (!player && typeof Audio !== "undefined") { player = new Audio(); player.preload = "auto"; }
  return player;
}
function silentWav() {
  const n = 800, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
let unlocked = false;
function unlock() {
  if (unlocked) return;
  const p = getPlayer();
  if (!p) return;
  unlocked = true;
  p.src = silentWav();
  p.play().catch(() => { unlocked = false; });
}
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "touchend", "keydown"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

const cache = new Map<string, string>(); // 같은 말은 다시 만들지 않는다
let seq = 0;
let current: Handlers | null = null; // 지금 말하는 중인 쪽

/** 방금 어떤 목소리로 읽었는지 — 설정 화면에서 보여 준다 (기기 음성으로 바뀐 이유 포함) */
export interface VoiceStatus { engine: "server" | "device"; reason?: string }
let lastStatus: VoiceStatus | null = null;
const statusFns = new Set<(s: VoiceStatus) => void>();
export const voiceStatus = () => lastStatus;
export function onVoiceStatus(fn: (s: VoiceStatus) => void) { statusFns.add(fn); return () => { statusFns.delete(fn); }; }
function report(s: VoiceStatus) { lastStatus = s; statusFns.forEach((f) => f(s)); }

async function fetchAudio(text: string, o: SpeakOpts): Promise<string> {
  const key = o.section ? `sec:${o.section.lessonId}:${o.section.index}` : text;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = apiUrl("tts");
  if (!url) throw new Error("서버 주소 없음");
  const body = o.section ? { lessonId: o.section.lessonId, section: o.section.index } : { text: text.replace(/\s+/g, " ").trim(), sig: o.sig };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...ssoHeaders() }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!r.ok || !(r.headers.get("content-type") || "").includes("audio")) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.detail || j.error || `서버 ${r.status}`);
  }
  const src = URL.createObjectURL(await r.blob());
  cache.set(key, src);
  if (cache.size > 40) { const [k, v] = cache.entries().next().value as [string, string]; URL.revokeObjectURL(v); cache.delete(k); }
  return src;
}

export function speak(text: string, h: Handlers = {}, o: SpeakOpts = {}) {
  stopSpeaking();
  const my = ++seq;
  current = h;
  let ended = false;
  const done = () => { if (!ended && my === seq) { ended = true; current = null; h.onEnd?.(); } };
  const fallback = (reason?: string) => {
    if (my !== seq || ended) return;
    report({ engine: "device", reason });
    deviceSpeak(text, { onStart: h.onStart, onEnd: done });
  };
  if (loadSettings().engine === "device") { fallback("설정에서 기기 음성 선택"); return; }

  (async () => {
    if (!(await serverVoice())) return fallback("서버에 음성 엔진 없음");
    let src: string;
    try { src = await fetchAudio(text, o); } catch (e) { return fallback((e as Error).message || "음성 요청 실패"); }
    if (my !== seq) return; // 그새 다른 말을 시작했으면 버린다
    const p = getPlayer();
    if (!p) return fallback("오디오 재생 불가");
    p.onplaying = () => { if (my === seq) { report({ engine: "server" }); h.onStart?.(); } };
    p.onended = done;
    p.onerror = () => fallback("오디오 파일 재생 실패");
    p.src = src;
    p.play().catch(() => fallback("브라우저가 소리 재생을 막음 — 화면을 한 번 누른 뒤 다시")); // 소리 허락을 못 받았으면 기기 음성으로
  })();
}

export function stopSpeaking() {
  seq++;
  window.speechSynthesis?.cancel();
  if (player) { player.onended = player.onerror = player.onplaying = null; try { player.pause(); } catch { /* 없음 */ } }
  current = null; // 멈춘 말의 끝 신호는 보내지 않는다 (부른 쪽이 직접 상태를 정리)
}

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
