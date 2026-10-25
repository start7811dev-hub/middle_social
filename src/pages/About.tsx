import type { Catalog } from "../data/types";
import { TopBar } from "../components/Shell";

export function About({ cat }: { cat: Catalog }) {
  const m = cat.manifest;
  const lessons = Object.values(cat.units).flatMap((u) => u.lessons);
  const verified = lessons.filter((l) => l.standard.verified).length;
  return (
    <div className="page">
      <TopBar />
      <h1 className="h-light">콘텐츠 정보</h1>
      <div className="about-grid">
        <div className="card"><div className="eyebrow">교육과정</div><h3>{m.curriculum}</h3><p className="hint">{m.source}</p></div>
        <div className="card"><div className="eyebrow">콘텐츠 버전</div><h3 className="num">{m.contentVersion}</h3><p className="hint">단원 {m.units.length} · 학습 {lessons.length}</p></div>
        <div className="card"><div className="eyebrow">성취기준 원문 대조</div><h3 className="num">{verified} / {lessons.length}</h3><p className="hint">나머지는 단원명만 확인된 상태</p></div>
        <div className="card"><div className="eyebrow">불러온 콘텐츠 소스</div>{cat.sources.map((s) => <p key={s} className="mono">{s}</p>)}</div>
      </div>
    </div>
  );
}
