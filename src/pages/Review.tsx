import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Catalog } from "../data/types";
import { findLesson } from "../data/content";
import { useUser } from "../data/UserContext";
import { BOX_DAYS, isDue } from "../data/userStore";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/Shell";

/* 오늘의 복습 — 간격 반복(라이트너 상자). 1→3→7→14→30일, 틀리면 1번 상자로. */
export function Review({ cat }: { cat: Catalog }) {
  const { data, review } = useUser();
  const nav = useNavigate();
  // 세션 시작 시점의 대상 목록을 고정 (풀면서 목록이 바뀌지 않게)
  const queue = useMemo(() => data.wrong.filter((w) => isDue(w))
    .sort((a, b) => (b.confidence === 3 ? 1 : 0) - (a.confidence === 3 ? 1 : 0)).map((w) => w.id), []);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);

  const w = data.wrong.find((x) => x.id === queue[i]);
  const f = w ? findLesson(cat, w.lessonId) : null;
  const q = f?.lesson.quiz.find((x) => x.id === w!.quizId);
  const upcoming = data.wrong.filter((x) => !x.resolved && !isDue(x)).length;

  if (!queue.length || i >= queue.length || !w || !f || !q) {
    return (
      <div className="page">
        <TopBar />
        <h1 className="h-light">오늘의 복습</h1>
        <div className="review-done card">
          <span className="tile tile-lg accent-green"><Icon name="review" size={28} /></span>
          <h2>{queue.length ? `${queue.length}장 중 ${right}장 통과` : "오늘 복습할 카드가 없어요"}</h2>
          <p className="t-caption">대기 중인 카드 {upcoming}장 · 맞히면 다음 상자로 넘어가 간격이 1→3→7→14→30일로 늘어납니다. 5번 상자를 통과하면 졸업.</p>
          <div className="row center"><button className="btn" onClick={() => nav("/")}>홈으로</button></div>
        </div>
      </div>
    );
  }
  const box = w.box ?? 1;
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    const ok = k === q.answer;
    if (ok) setRight((n) => n + 1);
    review(w.id, ok);
  };
  return (
    <div className="page">
      <TopBar />
      <h1 className="h-light">오늘의 복습 <span className="eyebrow">{i + 1} / {queue.length}</span></h1>
      <div className="review-card card">
        <div className="card-head">
          <span className="eyebrow">{f.unit.title} · {f.lesson.title}</span>
          <span className="boxes" title={`${box}번 상자`}>
            {[1, 2, 3, 4, 5].map((b) => <i key={b} className={b <= box ? "on" : ""} />)}
          </span>
        </div>
        {w.confidence === 3 && <span className="illusion-tag"><Icon name="idea" size={14} /> 착각 카드 — 확신했는데 틀렸던 문제</span>}
        <p className="quiz-q big">{q.q}</p>
        <div className="choices">
          {q.choices.map((c, k) => (
            <button key={k} onClick={() => choose(k)} disabled={picked !== null}
              className={"choice" + (picked !== null && k === q.answer ? " right" : "") + (picked === k && k !== q.answer ? " wrong" : "")}>
              <span className="choice-no num">{k + 1}</span>{c}
            </button>
          ))}
        </div>
        {picked !== null && (
          <div className={"explain " + (picked === q.answer ? "ok" : "bad")}>
            <b>{picked === q.answer
              ? (box >= 5 ? "졸업! 이 카드는 이제 나오지 않아요" : `통과 → ${box + 1}번 상자, ${BOX_DAYS[box + 1]}일 뒤 다시`)
              : "1번 상자로 — 내일 다시 만나요"}</b>
            <p>{q.explain}</p>
            <button className="btn" onClick={() => { setI(i + 1); setPicked(null); }}>다음</button>
          </div>
        )}
      </div>
    </div>
  );
}
