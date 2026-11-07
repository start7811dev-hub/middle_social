import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "../data/types";
import { contextFromUnit } from "../../shared/context";
import type { Turn } from "../../shared/guard";
import { Icon } from "../components/Icon";
import { SsoCharacter, type SsoMood } from "./SsoCharacter";
import { getLastLesson, loadSettings, saveSettings } from "./bus";
import { askSso, type Mode } from "./transport";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "./voice";

/* ─────────────────────────────────────────────
   말로 공부하기 — 쏘가 이끄는 대화 수업
   쏘가 말한다 → 학생이 말로(또는 글로) 대답한다 → 쏘가 듣고 다음으로 간다
   ───────────────────────────────────────────── */

interface Line { role: "user" | "assistant"; content: string; crisis?: boolean }
type Phase = "thinking" | "speaking" | "listening" | "idle";

export function TalkMode({ cat, mode, onClose }: { cat: Catalog; mode: Mode | null; onClose: () => void }) {
  const lesson = getLastLesson();
  const unit = lesson ? cat.units[lesson.unitId] : null;
  const l = unit?.lessons.find((x) => x.id === lesson?.lessonId);
  const ctx = useMemo(() => (unit && lesson ? contextFromUnit(unit, lesson.lessonId) : null), [unit, lesson]);
  const [settings, setSettings] = useState(loadSettings());
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const turnsRef = useRef<Turn[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const voiceOn = settings.voice && canSpeak();
  const ear = canListen();
  const [autoListen, setAutoListen] = useState(ear);

  const mood: SsoMood = phase === "speaking" ? "talk" : phase === "thinking" ? "think" : phase === "listening" ? "idle" : "idle";
  const last = [...lines].reverse().find((x) => x.role === "assistant");

  const startListening = useCallback(() => {
    if (!ear || crisis) { setTyping(true); return; }
    stopSpeaking();
    setHeard("");
    setMicError(null);
    setPhase("listening");
    stopRef.current = listen({
      onInterim: setHeard,
      onFinal: (t) => sendRef.current(t),
      onEnd: () => setPhase((p) => (p === "listening" ? "idle" : p)),
      onError: (e) => {
        setPhase("idle");
        if (e === "not-allowed" || e === "service-not-allowed") { setMicError("마이크를 쓸 수 없어. 글자로 대답해 줘."); setTyping(true); setAutoListen(false); }
        else if (e === "no-speech") setMicError("잘 안 들렸어. 마이크를 눌러서 다시 말해 줘.");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ear, crisis]);

  const sayOut = useCallback((t: string, then?: () => void) => {
    if (!voiceOn) { setPhase("idle"); then?.(); return; }
    speak(t, { onStart: () => setPhase("speaking"), onEnd: () => { setPhase("idle"); then?.(); } });
    setPhase("speaking");
  }, [voiceOn]);

  const send = useCallback(async (said: string, hidden = false) => {
    const content = said.trim().slice(0, 300);
    if (!content) return;
    stopRef.current();
    setHeard("");
    setText("");
    const turns: Turn[] = [...turnsRef.current, { role: "user", content }];
    turnsRef.current = turns;
    if (!hidden) setLines((x) => [...x, { role: "user", content }]);
    setPhase("thinking");
    const res = await askSso(mode ?? "offline", {
      turns, mode: "tutor", lessonId: lesson?.lessonId, context: ctx, allConcepts: [],
      lessonQuiz: l?.quiz ?? [], lessonSections: l?.sections ?? [], predictQ: l?.predict?.q,
    }).catch(() => ({ kind: "error" as const, category: "study" as const, text: "앗, 잠깐 멈췄어. 다시 말해 줄래?" }));
    turnsRef.current = [...turnsRef.current, { role: "assistant", content: res.text }];
    const isCrisis = res.kind === "crisis";
    setLines((x) => [...x, { role: "assistant", content: res.text, crisis: isCrisis }]);
    if (isCrisis) { setCrisis(true); setAutoListen(false); }
    sayOut(res.text, () => { if (autoListenRef.current && !typingRef.current && !isCrisis) startListening(); });
  }, [mode, lesson, ctx, l, sayOut, startListening]);

  const typingRef = useRef(typing);
  typingRef.current = typing;
  const sendRef = useRef(send);
  sendRef.current = send;
  const autoListenRef = useRef(autoListen);
  autoListenRef.current = autoListen;

  // 시작: 쏘가 먼저 말을 건다
  useEffect(() => {
    if (!mode) return;
    send("대화로 공부 시작하자. 먼저 말 걸어 줘.", true);
    return () => { stopRef.current(); stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [lines]);

  const close = () => { stopRef.current(); stopSpeaking(); onClose(); };
  const toggleVoice = () => { const n = { ...settings, voice: !settings.voice }; setSettings(n); saveSettings(n); if (!n.voice) stopSpeaking(); };

  return (
    <div className="talk" role="dialog" aria-label="쏘랑 말로 공부하기">
      <header className="talk-head">
        <div>
          <div className="eyebrow">쏘랑 말로 공부하기</div>
          <h2>{l?.title ?? "사회"}</h2>
        </div>
        <div className="talk-tools">
          {canSpeak() && <button className={"chip" + (voiceOn ? " on" : "")} onClick={toggleVoice}>{voiceOn ? "쏘 목소리 켜짐" : "쏘 목소리 꺼짐"}</button>}
          {ear && <button className={"chip" + (autoListen ? " on" : "")} onClick={() => setAutoListen((v) => !v)}>{autoListen ? "자동 듣기" : "눌러서 말하기"}</button>}
          <button className="icon-btn" aria-label="끝내기" onClick={close}><Icon name="wrong" size={22} /></button>
        </div>
      </header>

      <div className="talk-stage">
        <div className={"talk-sso phase-" + phase}>
          <SsoCharacter size={230} mood={mood} color={settings.color} />
          {phase === "listening" && <div className="ear-ring" aria-hidden />}
        </div>
        <div className={"talk-caption" + (last?.crisis ? " crisis" : "")} aria-live="polite">
          {phase === "thinking" ? <span className="dots"><i /><i /><i /></span> : last?.content ?? "쏘가 준비하고 있어…"}
          {last?.crisis && (
            <div className="help-lines">
              <a href="tel:1388"><b>1388</b><span>청소년상담</span></a>
              <a href="tel:109"><b>109</b><span>자살예방상담</span></a>
              <a href="tel:112"><b>112</b><span>긴급 신고</span></a>
            </div>
          )}
        </div>
        {phase === "listening" && <div className="talk-heard">{heard || "듣고 있어…"}</div>}
        {micError && <div className="talk-note">{micError}</div>}
      </div>

      <div className="talk-log" ref={listRef}>
        {lines.map((x, i) => <div key={i} className={"talk-line " + (x.role === "user" ? "u" : "a")}>{x.content}</div>)}
      </div>

      <footer className="talk-controls">
        {typing || !ear ? (
          <form className="sso-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea value={text} maxLength={300} rows={1} placeholder="대답을 적어 줘" autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
            <button className="btn" disabled={!text.trim() || phase === "thinking"}>보내기</button>
            {ear && <button type="button" className="icon-btn mic-sm" aria-label="말로 하기" onClick={() => { setTyping(false); startListening(); }}><MicIcon /></button>}
          </form>
        ) : (
          <div className="mic-row">
            <button type="button" className="chip" onClick={() => { stopRef.current(); setPhase("idle"); setTyping(true); }}>글자로 대답</button>
            <button type="button" className={"mic" + (phase === "listening" ? " on" : "")} disabled={phase === "thinking" || crisis}
              aria-label={phase === "listening" ? "말하기 끝" : "말하기"}
              onClick={() => (phase === "listening" ? stopRef.current() : startListening())}>
              <MicIcon />
            </button>
            <button type="button" className="chip" disabled={phase === "thinking"} onClick={() => send("잘 모르겠어. 힌트 줘.")}>힌트 줘</button>
          </div>
        )}
        <p className="sso-foot">말은 이 기기(브라우저)에서 글자로 바뀌고, 쏘에게는 글자만 전달돼요. 대화는 저장되지 않아요.</p>
      </footer>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
