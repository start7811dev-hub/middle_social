import { useNavigate } from "react-router-dom";
import type { Catalog } from "../data/types";
import { findLesson } from "../data/content";
import { useUser } from "../data/UserContext";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/Shell";

export function Scraps({ cat }: { cat: Catalog }) {
  const { data, update } = useUser();
  const nav = useNavigate();
  return (
    <div className="page">
      <TopBar />
      <h1 className="h-light">스크랩 <span className="eyebrow">{data.scraps.length}개</span></h1>
      {!data.scraps.length && <div className="empty big">개념 카드와 성취기준의 책갈피 버튼으로 모아 두세요.</div>}
      <div className="masonry">
        {data.scraps.map((s) => {
          const f = findLesson(cat, s.lessonId);
          return (
            <div key={s.id} className="card scrap">
              <div className="card-head">
                <span className={`chip-static accent-${f?.unit.accent ?? "primary"}`}>{s.kind === "concept" ? "개념" : s.kind === "standard" ? "성취기준" : "학습"}</span>
                <button className="icon-btn" aria-label="삭제" onClick={() => update((d) => ({ ...d, scraps: d.scraps.filter((x) => x.id !== s.id) }))}><Icon name="trash" size={16} /></button>
              </div>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
              {f && <button className="link" onClick={() => nav(`/unit/${f.unit.id}/${f.lesson.id}`)}>{f.unit.title} · {f.lesson.title} →</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
