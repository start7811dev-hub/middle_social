import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Concept, Lesson, Section } from "../data/types";
import { useUser } from "../data/UserContext";
import { Icon } from "../components/Icon";
import { ssoEmit } from "../sso/bus";
import { canSpeak, speak, stopSpeaking } from "../sso/voice";

/* ─────────────────────────────────────────────
   능동 읽기 — 본문을 '읽기만' 하지 않게
   1) 섹션을 하나씩 연다
   2) 섹션 끝에서 빈칸 확인 1개 → 맞혀야 다음 섹션이 열린다
      (핵심 문장에서 개념어를 빼서 자동 생성 — 콘텐츠를 따로 쓸 필요 없음)
   3) 본문 속 개념어를 누르면 뜻이 뜬다
   4) 섹션마다 듣기
   5) 다 읽으면 쏘에게 한 문장으로 설명하기
   ───────────────────────────────────────────── */

interface Check { kind: "cloze" | "point"; prompt: ReactNode; choices: string[]; answer: number; hint: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function shuffle<T>(xs: T[], seed: number) {
  const a = [...xs];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function seedOf(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

/** 섹션 하나의 확인 문제 만들기 */
function makeCheck(sec: Section, idx: number, all: Section[], concepts: Concept[]): Check | null {
  const seed = seedOf(sec.title + idx);
  const point = sec.point ?? "";
  // 1) 빈칸: 핵심 문장에 들어 있는 가장 긴 개념어
  const terms = concepts.map((c) => c.term).filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  const hit = terms.find((t) => point.includes(t) || sec.text.includes(t));
  if (hit) {
    const source = point.includes(hit) ? point : sec.text.split(/(?<=[.다요])\s+/).find((s) => s.includes(hit)) ?? point;
    const others = shuffle(terms.filter((t) => t !== hit && !source.includes(t)), seed).slice(0, 2);
    if (others.length === 2) {
      const choices = shuffle([hit, ...others], seed + 7);
      const parts = source.split(hit);
      return {
        kind: "cloze",
        prompt: <>{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <span className="blank">?</span>}</span>)}</>,
        choices, answer: choices.indexOf(hit), hint: `본문에서 '${hit.slice(0, 1)}…'로 시작하는 말을 찾아봐요.`,
      };
    }
  }
  // 2) 핵심 고르기: 이 섹션의 핵심 문장을 다른 섹션의 핵심 문장 사이에서 고른다
  const pts = all.map((s) => s.point).filter((p): p is string => !!p);
  if (point && pts.length >= 3) {
    const choices = shuffle([point, ...pts.filter((p) => p !== point).slice(0, 2)], seed);
    return { kind: "point", prompt: "방금 읽은 부분의 핵심은 어느 것일까요?", choices, answer: choices.indexOf(point), hint: "방금 섹션의 제목을 다시 떠올려 봐요." };
  }
  return null;
}

/** 본문 속 개념어를 누를 수 있게 */
function Highlighted({ text, concepts }: { text: string; concepts: Concept[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const terms = concepts.map((c) => c.term).filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map(esc).join("|")})`, "g");
  const seen = new Set<string>();
  return (
    <>
      {text.split(re).map((part, i) => {
        if (!terms.includes(part) || seen.has(part)) return <span key={i}>{part}</span>;
        seen.add(part); // 섹션마다 처음 나온 곳만 강조
        const c = concepts.find((x) => x.term === part)!;
        return (
          <span key={i} className="term-wrap">
            <button className={"term" + (open === part ? " on" : "")} onClick={() => setOpen(open === part ? null : part)}>{part}</button>
            {open === part && <span className="term-pop" role="tooltip"><b>{c.term}</b>{c.desc}</span>}
          </span>
        );
      })}
    </>
  );
}

export function ActiveReader({ lesson }: { lesson: Lesson }) {
  const { data, update } = useUser();
  const sections = lesson.sections ?? [];
  const done = !!data.progress[lesson.id]?.done;
  const stored = data.reading?.[lesson.id] ?? 0;
  const opened = done ? sections.length : Math.max(1, stored);
  const checks = useMemo(() => sections.map((s, i) => makeCheck(s, i, sections, lesson.concepts)), [lesson.id]);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => stopSpeaking(), [lesson.id]);

  const open = (n: number) => {
    update((d) => ({ ...d, reading: { ...(d.reading ?? {}), [lesson.id]: Math.max(n, d.reading?.[lesson.id] ?? 0) } }));
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  if (!sections.length) return null;

  return (
    <div className="reader">
      <div className="reader-progress">
        <span className="eyebrow">읽기</span>
        <span className="bar"><span className="bar-fill accent-primary" style={{ width: `${(Math.min(opened, sections.length) / sections.length) * 100}%` }} /></span>
        <span className="num t-caption">{Math.min(opened, sections.length)} / {sections.length}</span>
        {opened < sections.length && <button className="link" onClick={() => open(sections.length)}>모두 펼치기</button>}
      </div>

      {sections.slice(0, opened).map((sec, k) => (
        <article key={k} className="card section" ref={k === opened - 1 ? endRef : undefined}>
          <div className="section-top">
            <div className="section-no num">{String(k + 1).padStart(2, "0")}</div>
            <button className={"icon-btn listen" + (speaking === k ? " on" : "")} aria-label="듣기"
              onClick={() => {
                if (speaking === k) { stopSpeaking(); setSpeaking(null); return; }
                if (!canSpeak()) return;
                setSpeaking(k);
                speak(`${sec.title}. ${sec.text}`, { onEnd: () => setSpeaking((x) => (x === k ? null : x)) }, { section: { lessonId: lesson.id, index: k } });
              }}>
              <Icon name={speaking === k ? "wrong" : "spark"} size={16} /><span>{speaking === k ? "멈춤" : "듣기"}</span>
            </button>
          </div>
          <h3>{sec.title}</h3>
          {sec.text.split(/\n\n+/).map((para, j) => <p key={j} className="t-body-l"><Highlighted text={para} concepts={lesson.concepts} /></p>)}
          {(k < opened - 1 || done || !checks[k]) && sec.point && (
            <p className="section-point"><Icon name="idea" size={16} /> {sec.point}</p>
          )}
          {k === opened - 1 && !done && (
            checks[k]
              ? <CheckBox key={lesson.id + k} check={checks[k]!} last={k === sections.length - 1} point={sec.point}
                  onPass={() => open(k + 2)} />
              : <button className="btn next-sec" onClick={() => open(k + 2)}>{k === sections.length - 1 ? "다 읽었어요" : "다음 섹션"}</button>
          )}
        </article>
      ))}

      {(opened > sections.length || done) && <TeachBack lesson={lesson} />}
    </div>
  );
}

function CheckBox({ check, last, point, onPass }: { check: Check; last: boolean; point?: string; onPass: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const right = picked === check.answer;
  return (
    <div className={"check" + (picked !== null ? (right ? " ok" : " bad") : "")}>
      <div className="eyebrow"><Icon name="target" size={13} /> {check.kind === "cloze" ? "빈칸 확인" : "핵심 확인"} · 맞혀야 {last ? "마무리돼요" : "다음 섹션이 열려요"}</div>
      <p className="check-q">{check.prompt}</p>
      <div className="check-choices">
        {check.choices.map((c, i) => (
          <button key={i} disabled={right} className={"check-choice" + (picked === i ? (right ? " right" : " wrong") : "")}
            onClick={() => {
              setPicked(i); setTries((t) => t + 1);
              ssoEmit({ type: "answer", right: i === check.answer, confidence: 2, q: String(check.kind === "cloze" ? point ?? "" : check.prompt), picked: c, correct: check.choices[check.answer] });
            }}>{c}</button>
        ))}
      </div>
      {picked !== null && !right && <p className="hint">{tries >= 2 ? `정답은 '${check.choices[check.answer]}'예요.` : check.hint}</p>}
      {(right || tries >= 2) && (
        <>
          {point && <p className="section-point"><Icon name="idea" size={16} /> {point}</p>}
          <button className="btn next-sec" onClick={onPass}>{last ? "다 읽었어요" : "다음 섹션"}</button>
        </>
      )}
    </div>
  );
}

function TeachBack({ lesson }: { lesson: Lesson }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="card teach">
      <div className="teach-head">
        <span className="tile accent-primary"><Icon name="pen" /></span>
        <div>
          <h4>쏘에게 설명해 보기</h4>
          <p className="t-caption">'{lesson.title}'을(를) 친구에게 말하듯 한두 문장으로 써 보세요. 쏘가 맞는지, 빠진 게 있는지 봐 줘요.</p>
        </div>
      </div>
      <textarea value={text} maxLength={180} rows={3} placeholder="예: 시장 가격은 ... 때문에 정해진다."
        onChange={(e) => setText(e.target.value)} disabled={sent} />
      <div className="row">
        <span className="t-caption num">{text.length} / 180</span>
        <button className="btn" disabled={text.trim().length < 8 || sent}
          onClick={() => {
            setSent(true);
            ssoEmit({ type: "ask", text: `내가 '${lesson.title}'을(를) 이렇게 설명해 봤어: "${text.trim()}" 맞는지, 빠지거나 틀린 게 있는지 짧게 봐 줘.` });
          }}>{sent ? "쏘가 보고 있어요" : "쏘에게 보내기"}</button>
      </div>
    </div>
  );
}
