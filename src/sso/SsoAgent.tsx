import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Catalog } from "../data/types";
import { contextFromUnit } from "../../shared/context";
import type { QuizItem } from "../../shared/guard";
import type { SsoResponse } from "../../shared/pipeline";
import { Icon } from "../components/Icon";
import { SsoCharacter, type SsoMood } from "./SsoCharacter";
import { getLastLesson, loadSettings, onSettings, onSso, type SsoEvent } from "./bus";
import { askSso, detectMode, type Mode, type SignedTurn } from "./transport";
import { TalkMode } from "./TalkMode";
import { canSpeak, listen, speak, stopSpeaking } from "./voice";
import { VoiceToggles, useVoicePrefs } from "./VoiceToggles";

/* ─────────────────────────────────────────────
   쏘 에이전트 — 화면 오른쪽 아래에 살면서
   ① 학습 사건에 반응해 참견하고 (모델 호출 없음, 즉시)
   ② 누르면 대화 패널이 열려 Claude와 안전하게 이야기한다
   ───────────────────────────────────────────── */

interface Msg { role: "user" | "assistant"; content: string; kind?: SsoResponse["kind"]; quiz?: QuizItem; picked?: number; sig?: string }

/** 모델에 보낼 대화 기록 — 정상 답변(answer)으로 이어진 주고받기만, 서명과 함께 */
function buildTurns(msgs: Msg[]): SignedTurn[] {
  const out: SignedTurn[] = [];
  msgs.forEach((m, i) => {
    const isLast = i === msgs.length - 1;
    if (m.role === "user") {
      if (isLast || msgs[i + 1]?.kind === "answer") out.push({ role: "user", content: m.content });
    } else if (m.kind === "answer") out.push({ role: "assistant", content: m.content, sig: m.sig });
  });
  return out.slice(-14);
}
interface Bubble { text: string; actions?: { label: string; run: () => void }[] }

const MODE_LABEL: Record<Mode, string> = {
  server: "Claude 연결됨",
  sample: "Claude 연결됨 · 미리보기",
  offline: "오프라인 · 앱 속 개념만 찾아요",
};

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function SsoAgent({ cat }: { cat: Catalog }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [settings, setSettings] = useState(loadSettings());
  const { speakOn, micOn } = useVoicePrefs();
  const speakOnRef = useRef(speakOn);
  speakOnRef.current = speakOn;
  const [mode, setMode] = useState<Mode | null>(null);
  const [mood, setMood] = useState<SsoMood>("idle");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [talk, setTalk] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [lesson, setLesson] = useState<{ unitId: string; lessonId: string; title: string; concepts: { term: string; desc: string }[] } | null>(() => {
    const l = getLastLesson();
    return l ? { unitId: l.unitId, lessonId: l.lessonId, title: l.title, concepts: l.concepts } : null;
  });
  const moodTimer = useRef<number>();
  const bubbleTimer = useRef<number>();
  const idleTimer = useRef<number>();
  const lastSay = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => onSettings(() => setSettings(loadSettings())), []);
  useEffect(() => { let alive = true; detectMode().then((m) => alive && setMode(m)); return () => { alive = false; }; }, [settings.server, settings.code]);

  const feel = useCallback((m: SsoMood, ms = 2600) => {
    setMood(m);
    window.clearTimeout(moodTimer.current);
    if (m !== "idle") moodTimer.current = window.setTimeout(() => setMood("idle"), ms);
  }, []);

  const say = useCallback((b: Bubble, m: SsoMood = "talk", force = false) => {
    const now = Date.now();
    if (!force && now - lastSay.current < 12000) return; // 참견은 12초에 한 번까지
    lastSay.current = now;
    feel(m, 2400);
    if (settings.quiet && !force) return;
    setBubble(b);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 9000);
  }, [feel, settings.quiet]);

  /* ── 대화 ───────────────────────────────────── */
  const allConcepts = useMemo(
    () => Object.values(cat.units).flatMap((u) => u.lessons.flatMap((l) => l.concepts.map((c) => ({ ...c, where: `${u.title} · ${l.title}` })))),
    [cat],
  );

  const ask = useCallback(async (text: string, kind: "chat" | "quiz" = "chat") => {
    if (busy || !mode) return;
    setOpen(true);
    setBubble(null);
    const shown = kind === "quiz" ? "연습 문제 하나 내 줘." : text.trim().slice(0, 300);
    if (!shown) return;
    const next: Msg[] = [...msgs, { role: "user", content: shown }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    feel("think", 60000);

    const unit = lesson ? cat.units[lesson.unitId] : null;
    const l = unit?.lessons.find((x) => x.id === lesson?.lessonId);
    const turns = buildTurns(next);
    const res = await askSso(mode, {
      turns, mode: kind, lessonId: lesson?.lessonId,
      context: unit && lesson ? contextFromUnit(unit, lesson.lessonId) : null,
      allConcepts, lessonQuiz: l?.quiz ?? [],
    }).catch((): SsoResponse => ({ kind: "error", category: "study", text: "앗, 잠깐 멈췄어. 다시 물어봐 줄래?" }));

    const idx = next.length;
    setMsgs((cur) => [...cur, { role: "assistant", content: res.text, kind: res.kind, quiz: res.quiz, sig: res.sig }]);
    setBusy(false);
    // 듣기 ON이면 쏘가 답을 소리 내 읽는다 (문제 카드는 제외)
    if (speakOnRef.current && res.kind !== "quiz" && res.kind !== "error") {
      speak(res.text, { onStart: () => { setSpeakingIdx(idx); feel("talk", 60000); }, onEnd: () => { setSpeakingIdx(null); feel("idle"); } }, { sig: res.sig });
    }
    feel(res.kind === "error" ? "oops" : res.kind === "redirect" ? "wave" : res.kind === "crisis" ? "idle" : "talk", 3200);
  }, [busy, mode, msgs, lesson, cat, allConcepts, feel]);

  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs, busy]);

  /* ── 참견 규칙 ───────────────────────────────── */
  useEffect(() => onSso((e: SsoEvent) => {
    switch (e.type) {
      case "lesson": {
        setLesson({ unitId: e.unitId, lessonId: e.lessonId, title: e.title, concepts: e.concepts });
        window.setTimeout(() => {
          if (e.hasPredict && !e.predicted) say({ text: "보기 전에 먼저 예측해 봐! 틀려도 괜찮아. 빗나간 게 더 오래 기억나거든." }, "wave", true);
          else if (e.concepts.length) {
            const c = pick(e.concepts);
            say({
              text: `'${c.term}', 네 말로 설명할 수 있어? 막히면 나 눌러. 말로 같이 공부해도 돼.`,
              actions: [{ label: "쉽게 설명해 줘", run: () => ask(`'${c.term}'을(를) 쉽게 설명해 줘.`) }, { label: "말로 공부하기", run: () => setTalk(true) }],
            }, "talk", true);
          }
        }, 900);
        break;
      }
      case "leave-lesson": setLesson(null); break;
      case "predict":
        say(e.right ? { text: "적중! 감 좋은데? 왜 그런지 본문에서 확인해 보자." } : { text: "빗나갔다! 괜찮아, 이렇게 틀린 게 제일 오래 남아." }, e.right ? "happy" : "oops", true);
        break;
      case "answer":
        if (!e.right && e.confidence === 3)
          say({
            text: "착각 발견! 확실하다고 했는데 틀린 건 고치면 오래 가. 같이 볼까?",
            actions: [{ label: "왜 틀렸는지 물어보기", run: () => ask(`'${e.q}' 문제에서 '${e.picked}'를 골랐는데 왜 틀렸어? 정답은 '${e.correct}'래.`) }],
          }, "oops", true);
        else if (e.right && e.confidence === 1) say({ text: "맞히긴 했는데 찍은 거지? 내일 복습에 한 번 더 나올 거야." }, "think", true);
        else if (e.right && e.confidence === 3) feel("happy");
        else if (!e.right) feel("oops");
        break;
      case "quiz-done":
        if (e.score === e.total)
          say({ text: `만점! ${e.hasMission ? "현장 미션도 해 볼래? 아래에 있어." : "다음 학습으로 가 볼까?"}`, actions: [{ label: "연습 문제 하나 더", run: () => ask("", "quiz") }] }, "happy", true);
        else say({ text: "틀린 문제는 오늘의 복습에 넣어 뒀어. 비슷한 문제 하나 더 풀어 볼래?", actions: [{ label: "연습 문제 하나 더", run: () => ask("", "quiz") }] }, "talk", true);
        break;
      case "home":
        if (e.due > 0) say({ text: `오늘 복습할 카드가 ${e.due}장 있어. 5분이면 끝나!`, actions: [{ label: "복습하러 가기", run: () => nav("/review") }] }, "wave");
        break;
      case "mission-done":
        say({ text: "미션 완료! 교과서 개념이 우리 동네에도 있었지?" }, "happy", true);
        break;
      case "ask":
        ask(e.text, e.mode);
        break;
      case "talk":
        setOpen(false); setBubble(null); setTalk(true);
        break;
    }
  }), [say, feel, ask, nav]);

  // 학습 화면에서 한동안 가만히 있으면 깜짝 질문
  useEffect(() => {
    if (!lesson) return;
    const reset = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        if (open || !lesson.concepts.length) return;
        const c = pick(lesson.concepts);
        say({
          text: `잠깐! '${c.term}'이(가) 뭐였는지 기억나?`,
          actions: [{ label: "정답 보기", run: () => { setBubble({ text: `${c.term}: ${c.desc}` }); feel("talk"); } }],
        }, "think");
      }, 75000);
    };
    reset();
    const evs = ["pointerdown", "keydown", "scroll"];
    evs.forEach((n) => window.addEventListener(n, reset, { passive: true }));
    return () => { window.clearTimeout(idleTimer.current); evs.forEach((n) => window.removeEventListener(n, reset)); };
  }, [lesson, open, say, feel]);

  useEffect(() => {
    if (!loc.pathname.startsWith("/unit/")) { setLesson(null); return; }
    const l = getLastLesson();
    if (l) setLesson((cur) => (cur?.lessonId === l.lessonId ? cur : { unitId: l.unitId, lessonId: l.lessonId, title: l.title, concepts: l.concepts }));
  }, [loc.pathname]);

  /* ── 화면 ───────────────────────────────────── */
  const chips = lesson
    ? [
        { label: "쉽게 설명해 줘", text: `'${lesson.title}' 내용을 중학생이 이해하기 쉽게 설명해 줘.` },
        { label: "생활 속 예시", text: `'${lesson.title}'과 관련된 우리 생활 속 예시를 들어 줘.` },
        { label: "3줄 요약", text: `'${lesson.title}' 핵심을 3줄로 요약해 줘.` },
        { label: "연습 문제", quiz: true },
      ]
    : [
        { label: "공부 어떻게 시작해?", text: "이 앱으로 사회 공부를 어떻게 시작하면 좋을까?" },
        { label: "복습 방법", text: "오늘의 복습은 어떻게 하는 거야?" },
      ];

  if (talk) return <TalkMode cat={cat} mode={mode} onClose={() => setTalk(false)} />;

  return (
    <div className={"sso-dock" + (open ? " open" : "")}>
      {open && (
        <section className="sso-panel" role="dialog" aria-label="쏘와 대화">
          <header className="sso-head">
            <div>
              <b>쏘</b> <span className="t-caption">사회 공부 도우미</span>
              <div className="sso-status"><i className={"dot-" + (mode ?? "wait")} />{mode ? MODE_LABEL[mode] : "연결 확인 중"}</div>
            </div>
            <div className="sso-head-tools">
              <VoiceToggles compact />
              {lesson && <button className="chip talk-chip" onClick={() => { setOpen(false); setTalk(true); }}>말로 공부하기</button>}
              <button className="icon-btn" aria-label="닫기" onClick={() => { setOpen(false); stopSpeaking(); }}><Icon name="wrong" size={20} /></button>
            </div>
          </header>
          {lesson && <div className="sso-ctx"><Icon name="book" size={14} /> 지금 보는 학습: <b>{lesson.title}</b></div>}

          <div className="sso-list" ref={listRef}>
            {msgs.length === 0 && (
              <div className="sso-msg a">
                안녕, 나 쏘야. 사회 공부하다 막히면 언제든 물어봐. 개념 설명, 예시, 연습 문제까지 도와줄게. 말로 하고 싶으면 위의 '말로 공부하기'를 눌러.
              </div>
            )}
            {msgs.map((m, i) =>
              m.quiz ? (
                <QuizCard key={i} quiz={m.quiz} picked={m.picked}
                  onPick={(k) => {
                    setMsgs((cur) => cur.map((x, j) => (j === i ? { ...x, picked: k } : x)));
                    feel(k === m.quiz!.answer ? "happy" : "oops");
                  }} />
              ) : m.kind === "crisis" ? (
                <div key={i} className="sso-msg a crisis">
                  <p>{m.content}</p>
                  <div className="help-lines">
                    <a href="tel:1388"><b>1388</b><span>청소년상담</span></a>
                    <a href="tel:109"><b>109</b><span>자살예방상담</span></a>
                    <a href="tel:112"><b>112</b><span>긴급 신고</span></a>
                  </div>
                </div>
              ) : (
                <div key={i} className={"sso-msg " + (m.role === "user" ? "u" : "a") + (m.kind === "redirect" ? " redirect" : "")}>
                  {m.content}
                  {m.role === "assistant" && canSpeak() && (
                    <button className={"say-btn" + (speakingIdx === i ? " on" : "")} aria-label="쏘 목소리로 듣기"
                      onClick={() => {
                        if (speakingIdx === i) { stopSpeaking(); setSpeakingIdx(null); return; }
                        speak(m.content, { onStart: () => { setSpeakingIdx(i); feel("talk", 60000); }, onEnd: () => { setSpeakingIdx(null); feel("idle"); } }, { sig: m.sig });
                      }}>{speakingIdx === i ? "멈춤" : "듣기"}</button>
                  )}
                </div>
              ),
            )}
            {busy && <div className="sso-msg a typing"><span /><span /><span /></div>}
          </div>

          <div className="sso-chips">
            {chips.map((c) => (
              <button key={c.label} className="chip" disabled={busy || !mode} onClick={() => ("quiz" in c ? ask("", "quiz") : ask(c.text!))}>{c.label}</button>
            ))}
          </div>
          <form className="sso-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <textarea value={input} maxLength={300} rows={1} placeholder="사회 공부 질문을 적어 주세요"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }} />
            {micOn && (
              <button type="button" className={"icon-btn mic-sm" + (listening ? " on" : "")} aria-label="말로 묻기" disabled={busy || !mode}
                onClick={() => {
                  if (listening) return;
                  setListening(true);
                  listen({ onInterim: setInput, onFinal: (t) => ask(t), onEnd: () => setListening(false), onError: () => setListening(false) });
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            )}
            <button className="btn" disabled={busy || !input.trim() || !mode}>보내기</button>
          </form>
          <p className="sso-foot">쏘는 사회 공부 이야기만 해요. 대화는 저장되지 않아요.</p>
        </section>
      )}

      {bubble && !open && (
        <div className="sso-bubble" role="status">
          <button className="sso-bubble-x" aria-label="닫기" onClick={() => setBubble(null)}>×</button>
          <p>{bubble.text}</p>
          {bubble.actions && (
            <div className="sso-bubble-actions">
              {bubble.actions.map((a) => <button key={a.label} className="chip" onClick={() => { setBubble(null); a.run(); }}>{a.label}</button>)}
            </div>
          )}
        </div>
      )}

      <SsoCharacter mood={busy ? "think" : mood} color={settings.color} size={open ? 96 : 132}
        onClick={() => { setOpen((o) => !o); setBubble(null); if (!open) feel("wave", 1500); }} />
    </div>
  );
}

function QuizCard({ quiz, picked, onPick }: { quiz: QuizItem; picked?: number; onPick: (k: number) => void }) {
  const done = picked !== undefined;
  return (
    <div className="sso-msg a quiz">
      <div className="eyebrow">쏘의 연습 문제</div>
      <p className="quiz-q">{quiz.q}</p>
      <div className="choices">
        {quiz.choices.map((c, k) => (
          <button key={k} disabled={done} onClick={() => onPick(k)}
            className={"choice" + (done && k === quiz.answer ? " right" : "") + (done && k === picked && k !== quiz.answer ? " wrong" : "")}>
            <span className="choice-no num">{k + 1}</span>{c}
          </button>
        ))}
      </div>
      {done && <p className="hint"><b>{picked === quiz.answer ? "정답!" : "아쉬워요."}</b> {quiz.explain}</p>}
    </div>
  );
}
