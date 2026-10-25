import { useNavigate } from "react-router-dom";
import type { Catalog } from "../data/types";
import { findLesson } from "../data/content";
import { useUser } from "../data/UserContext";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/Shell";

export function WrongNotes({ cat }: { cat: Catalog }) {
  const { data, update } = useUser();
  const nav = useNavigate();
  const items = data.wrong.map((w) => {
    const f = findLesson(cat, w.lessonId);
    const q = f?.lesson.quiz.find((x) => x.id === w.quizId);
    return f && q ? { w, ...f, q } : null;
  }).filter(Boolean) as any[];
  const open = items.filter((x: any) => !x.w.resolved), done = items.filter((x: any) => x.w.resolved);
  const setResolved = (id: string, v: boolean) =>
    update((d) => ({ ...d, wrong: d.wrong.map((w) => (w.id === id ? { ...w, resolved: v } : w)) }));
  const Card = ({ x }: { x: any }) => (
    <div className={"card wrong-card" + (x.w.resolved ? " resolved" : "")}>
      <div className="eyebrow">{x.unit.title} · {x.lesson.title}</div>
      <p className="quiz-q">{x.q.q}</p>
      <div className="wrong-answers">
        {x.w.picked === x.q.answer ? <span className="ans warn">찍어서 맞힘 · 확신 없이 고른 답</span> : <span className="ans bad">내 답 · {x.q.choices[x.w.picked]}{x.w.confidence === 3 ? " (확실하다고 답함 · 착각)" : ""}</span>}
        <span className="ans ok">정답 · {x.q.choices[x.q.answer]}</span>
      </div>
      <p className="hint">{x.q.explain}</p>
      <div className="row">
        <button className="btn-ghost" onClick={() => nav(`/unit/${x.unit.id}/${x.lesson.id}`)}>학습으로 <Icon name="arrow" size={16} /></button>
        <button className="btn" onClick={() => setResolved(x.w.id, !x.w.resolved)}>{x.w.resolved ? "다시 보관" : "이해함"}</button>
      </div>
    </div>
  );
  return (
    <div className="page">
      <TopBar />
      <h1 className="h-light">오답 노트 <span className="eyebrow">{open.length}개 남음</span></h1>
      {!items.length && <div className="empty big">복습 문제를 풀다 틀린 문제가 여기에 모입니다.</div>}
      <div className="masonry">{open.map((x: any) => <Card key={x.w.id} x={x} />)}</div>
      {done.length > 0 && <><h2 className="h-sub">이해한 문제</h2><div className="masonry">{done.map((x: any) => <Card key={x.w.id} x={x} />)}</div></>}
    </div>
  );
}
