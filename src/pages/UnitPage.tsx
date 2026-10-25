import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Catalog, Lesson, Unit } from "../data/types";
import { unitList } from "../data/content";
import { useUser } from "../data/UserContext";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/Shell";
import { LabView } from "../labs/registry";

export function UnitPage({ cat }: { cat: Catalog }) {
  const { unitId, lessonId } = useParams();
  const nav = useNavigate();
  const unit = cat.units[unitId!];
  const { data } = useUser();
  if (!unit) return <div className="page"><p>단원을 찾을 수 없습니다.</p></div>;
  const lesson = unit.lessons.find((l) => l.id === lessonId) ?? unit.lessons[0];
  const order = unitList(cat);
  const idx = order.findIndex((u) => u.id === unit.id);
  const prev = order[idx - 1], next = order[idx + 1];

  return (
    <div className="page unit">
      <TopBar right={
        <div className="unit-nav">
          {prev && <button className="btn-ghost" onClick={() => nav(`/unit/${prev.id}`)}><Icon name="back" size={16} /> {prev.title}</button>}
          {next && <button className="btn-ghost" onClick={() => nav(`/unit/${next.id}`)}>{next.title} <Icon name="arrow" size={16} /></button>}
        </div>} />

      <div className="unit-head">
        <span className={`tile tile-lg accent-${unit.accent}`}><Icon name={unit.icon} size={28} /></span>
        <div>
          <div className="eyebrow">{unit.book === "s1" ? "사회①" : "사회②"} · {unit.area} · {String(unit.no).padStart(2, "0")}</div>
          <h1 className="h-unit">{unit.title}</h1>
        </div>
        {!unit.standardsVerified && <span className="pill-warn" title="교육부 고시 원문 대조 전">성취기준 원문 대조 필요</span>}
      </div>

      <div className="unit-grid">
        <aside className="lesson-index">
          {unit.lessons.map((l, i) => {
            const done = data.progress[l.id]?.done;
            return (
              <Link key={l.id} to={`/unit/${unit.id}/${l.id}`} className={"lesson-item" + (l.id === lesson.id ? " on" : "")}>
                <span className={"lesson-no num" + (done ? " done" : "")}>{done ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="lesson-text">
                  <span className="lesson-code">{l.standard.code ?? "코드 미정"}</span>
                  <span className="lesson-title">{l.title}</span>
                </span>
                {l.lab && l.lab.type !== "planned" && <Icon name="cube" size={16} className="lesson-3d" />}
              </Link>
            );
          })}
        </aside>

        <LessonBody key={lesson.id} unit={unit} lesson={lesson} />
        <SidePanel key={"p" + lesson.id} unit={unit} lesson={lesson} />
      </div>
    </div>
  );
}

function LessonBody({ unit, lesson }: { unit: Unit; lesson: Lesson }) {
  const { toggleScrap, isScrapped, data } = useUser();
  const pred = data.predictions[lesson.id];
  return (
    <section className="lesson-body">
      <div className={"stage" + (lesson.predict && !pred ? " gated" : "")}>
        {lesson.predict && !pred && <PredictGate lesson={lesson} />}
        {lesson.lab ? <LabView lab={lesson.lab} accent={unit.accent} /> : (
          <div className="stage-empty">
            <span className={`tile tile-lg accent-${unit.accent}`}><Icon name={unit.icon} size={28} /></span>
            <h3>{lesson.title}</h3>
            <p>이 학습에는 아직 3D 랩이 연결되지 않았습니다.</p>
          </div>
        )}
      </div>

      {lesson.predict && pred && (
        <div className={"card reveal-card " + (pred.right ? "ok" : "bad")}>
          <div className="card-head">
            <span className="eyebrow"><Icon name="target" size={14} /> 내 예측</span>
            <span className={"verdict " + (pred.right ? "ok" : "bad")}>{pred.right ? "적중" : "빗나감 — 그래서 더 오래 기억된다"}</span>
          </div>
          <p className="t-caption">{lesson.predict.q} → <b>{lesson.predict.choices[pred.picked]}</b>
            {!pred.right && <> · 정답 <b>{lesson.predict.choices[lesson.predict.answer]}</b></>}</p>
          <p>{lesson.predict.reveal}</p>
        </div>
      )}

      {lesson.mission && <Mission lesson={lesson} />}

      <div className="card standard-card">
        <div className="card-head">
          <span className="eyebrow">성취기준 {lesson.standard.code && <b className="code">[{lesson.standard.code}]</b>}</span>
          {lesson.standard.text && (
            <button className={"icon-btn" + (isScrapped(lesson.id, "성취기준") ? " on" : "")} aria-label="스크랩"
              onClick={() => toggleScrap({ lessonId: lesson.id, kind: "standard", title: "성취기준", body: lesson.standard.text! })}>
              <Icon name="bookmark" size={18} />
            </button>
          )}
        </div>
        <p className="standard-text">{lesson.standard.text ?? "성취기준 원문 대조 후 입력 예정입니다."}</p>
      </div>

      {lesson.concepts.length > 0 && (
        <div className="concepts">
          {lesson.concepts.map((c) => (
            <div key={c.term} className="card concept">
              <div className="card-head">
                <h4>{c.term}</h4>
                <button className={"icon-btn" + (isScrapped(lesson.id, c.term) ? " on" : "")} aria-label={`${c.term} 스크랩`}
                  onClick={() => toggleScrap({ lessonId: lesson.id, kind: "concept", title: c.term, body: c.desc })}>
                  <Icon name="bookmark" size={18} />
                </button>
              </div>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SidePanel({ unit, lesson }: { unit: Unit; lesson: Lesson }) {
  const [tab, setTab] = useState<"quiz" | "note" | "photo">("quiz");
  return (
    <aside className="side-panel">
      <div className="seg">
        {([["quiz", "복습 문제"], ["note", "주석"], ["photo", "사진"]] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "quiz" && <Quiz unit={unit} lesson={lesson} />}
      {tab === "note" && <Notes lesson={lesson} />}
      {tab === "photo" && <Photos lesson={lesson} />}
    </aside>
  );
}

const CONF = [
  { v: 1 as const, label: "찍었다", hint: "감으로 골랐어요" },
  { v: 2 as const, label: "반반", hint: "헷갈려요" },
  { v: 3 as const, label: "확실", hint: "자신 있어요" },
];

function Quiz({ lesson }: { unit: Unit; lesson: Lesson }) {
  const { addWrong, update, logAnswer } = useUser();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [conf, setConf] = useState<1 | 2 | 3 | null>(null);
  const [score, setScore] = useState(0);
  const [illusions, setIllusions] = useState(0);
  const items = lesson.quiz;
  if (!items.length) return <div className="empty">이 학습의 복습 문제는 준비 중입니다.</div>;
  const q = items[i];
  const finished = i >= items.length;
  const revealed = conf !== null;
  const right = picked === q?.answer;
  const bet = (c: 1 | 2 | 3) => {
    if (picked === null || revealed) return;
    setConf(c);
    logAnswer(c, picked === q.answer);
    if (picked === q.answer) {
      setScore((s) => s + 1);
      if (c === 1) addWrong(lesson.id, q.id, picked, 1); // 찍어서 맞힌 문제도 복습 카드로
    } else {
      addWrong(lesson.id, q.id, picked, c);
      if (c === 3) setIllusions((n) => n + 1);
    }
  };
  const nextQ = () => {
    if (i + 1 >= items.length) {
      const total = items.length, correct = score;
      update((d) => ({ ...d, progress: { ...d.progress, [lesson.id]: { done: true, correct, total, at: Date.now() } } }));
    }
    setI(i + 1); setPicked(null); setConf(null);
  };
  if (finished) return (
    <div className="quiz-done">
      <div className="display num">{score}<small> / {items.length}</small></div>
      <p>{score === items.length ? "모두 맞혔습니다." : "틀린 문제는 복습 카드가 되어 정해진 날에 다시 나옵니다."}</p>
      {illusions > 0 && <p className="illusion-note"><Icon name="idea" size={16} /> 확신했는데 틀린 착각 {illusions}개 — 오늘 복습에 바로 올렸어요.</p>}
      <button className="btn" onClick={() => { setI(0); setScore(0); setPicked(null); setConf(null); setIllusions(0); }}>다시 풀기</button>
    </div>
  );
  return (
    <div className="quiz">
      <div className="quiz-meta"><span className="num">{i + 1} / {items.length}</span><span className="bar"><span className="bar-fill accent-primary" style={{ width: `${(i / items.length) * 100}%` }} /></span></div>
      <p className="quiz-q">{q.q}</p>
      <div className="choices">
        {q.choices.map((c, k) => (
          <button key={k} onClick={() => !revealed && setPicked(k)} disabled={revealed}
            className={"choice" + (!revealed && picked === k ? " picked" : "") + (revealed && k === q.answer ? " right" : "") + (revealed && picked === k && k !== q.answer ? " wrong" : "")}>
            <span className="choice-no num">{k + 1}</span>{c}
          </button>
        ))}
      </div>
      {picked !== null && !revealed && (
        <div className="bet">
          <div className="eyebrow">얼마나 확신해요?</div>
          <div className="bet-row">
            {CONF.map((c) => (
              <button key={c.v} className={"bet-btn b" + c.v} onClick={() => bet(c.v)}>
                <span className="bet-dots">{"●".repeat(c.v)}{"○".repeat(3 - c.v)}</span>
                <b>{c.label}</b><small>{c.hint}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {revealed && (
        <div className={"explain " + (right ? "ok" : "bad")}>
          <b>{right ? (conf === 1 ? "맞혔지만 찍은 답 — 복습 카드에 넣었어요" : "정답") : conf === 3 ? "착각 발견! 확신한 오답은 고치면 가장 오래 남아요" : "오답 — 복습 카드가 되었어요"}</b>
          <p>{q.explain}</p>
          <button className="btn" onClick={nextQ}>{i + 1 >= items.length ? "결과 보기" : "다음 문제"}</button>
        </div>
      )}
    </div>
  );
}

function PredictGate({ lesson }: { lesson: Lesson }) {
  const { update } = useUser();
  const p = lesson.predict!;
  const choose = (k: number) =>
    update((d) => ({ ...d, predictions: { ...d.predictions, [lesson.id]: { picked: k, right: k === p.answer, at: Date.now() } } }));
  return (
    <div className="gate">
      <div className="gate-card">
        <span className="tile accent-primary"><Icon name="target" /></span>
        <div className="eyebrow">보기 전에 먼저 예측</div>
        <h3>{p.q}</h3>
        <div className="gate-choices">
          {p.choices.map((c, k) => <button key={k} className="gate-choice" onClick={() => choose(k)}>{c}</button>)}
        </div>
        <p className="t-caption">틀려도 괜찮아요. 예측이 빗나간 순간이 가장 오래 기억됩니다.</p>
      </div>
    </div>
  );
}

function Mission({ lesson }: { lesson: Lesson }) {
  const { data, update, newId } = useUser();
  const done = data.missions[lesson.id];
  const shots = data.photos.filter((p) => p.lessonId === lesson.id).slice(0, 4);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await shrink(f);
    update((d) => ({
      ...d,
      photos: [{ id: newId(), lessonId: lesson.id, dataUrl, caption: "현장 미션", at: Date.now() }, ...d.photos],
      missions: { ...d.missions, [lesson.id]: Date.now() },
    }));
    e.target.value = "";
  };
  return (
    <div className={"card mission" + (done ? " done" : "")}>
      <div className="card-head">
        <span className="eyebrow"><Icon name="pin" size={14} /> 현장 미션</span>
        {done && <span className="verdict ok">완료</span>}
      </div>
      <p className="mission-text">{lesson.mission}</p>
      <div className="mission-row">
        {shots.map((p) => <img key={p.id} src={p.dataUrl} alt="미션 사진" />)}
        <label className="mission-add"><Icon name="camera" size={20} /><span>{done ? "더 찍기" : "찍어서 완료"}</span>
          <input type="file" accept="image/*" capture="environment" onChange={onFile} /></label>
      </div>
    </div>
  );
}

function Notes({ lesson }: { lesson: Lesson }) {
  const { data, update, newId } = useUser();
  const [text, setText] = useState("");
  const mine = data.notes.filter((n) => n.lessonId === lesson.id);
  const add = () => {
    if (!text.trim()) return;
    update((d) => ({ ...d, notes: [{ id: newId(), lessonId: lesson.id, text: text.trim(), at: Date.now() }, ...d.notes] }));
    setText("");
  };
  return (
    <div className="notes">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="이 학습에 대한 메모를 남기세요" rows={4} />
      <button className="btn" onClick={add}>주석 추가</button>
      {mine.map((n) => (
        <div key={n.id} className="note">
          <p>{n.text}</p>
          <div className="note-foot">
            <span>{new Date(n.at).toLocaleDateString("ko-KR")}</span>
            <button className="icon-btn" aria-label="삭제" onClick={() => update((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }))}><Icon name="trash" size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

async function shrink(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.82);
}

function Photos({ lesson }: { lesson: Lesson }) {
  const { data, update, newId } = useUser();
  const mine = data.photos.filter((p) => p.lessonId === lesson.id);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => setBusy(false), []);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setBusy(true);
    for (const f of files) {
      const dataUrl = await shrink(f);
      update((d) => ({ ...d, photos: [{ id: newId(), lessonId: lesson.id, dataUrl, caption: "", at: Date.now() }, ...d.photos] }));
    }
    setBusy(false);
    e.target.value = "";
  };
  return (
    <div className="photos">
      <label className="upload">
        <Icon name="camera" size={22} />
        <span>{busy ? "처리 중…" : "교과서·필기 사진 추가"}</span>
        <small>iPad에서는 바로 촬영할 수 있습니다</small>
        <input type="file" accept="image/*" multiple onChange={onFile} />
      </label>
      <div className="photo-grid">
        {mine.map((p) => (
          <figure key={p.id}>
            <img src={p.dataUrl} alt="학습 사진" />
            <button className="icon-btn" aria-label="삭제" onClick={() => update((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== p.id) }))}><Icon name="trash" size={16} /></button>
          </figure>
        ))}
      </div>
    </div>
  );
}
