import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Catalog } from "../data/types";
import { useUser } from "../data/UserContext";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/Shell";
import { unitProgress } from "./Home";

export function Units({ cat }: { cat: Catalog }) {
  const nav = useNavigate();
  const { data } = useUser();
  const [q, setQ] = useState("");
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="page">
      <TopBar right={<label className="search"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="단원·학습·개념 검색" /></label>} />
      {cat.manifest.books.map((b) => (
        <section key={b.id} className="book">
          <div className="book-head"><h2>{b.title}</h2><span className="eyebrow">보통 중{b.defaultGrade} · 학교마다 다를 수 있음</span></div>
          {(["지리", "일반사회"] as const).map((area) => {
            const units = b.units.map((id) => cat.units[id]).filter((u) => u && u.area === area)
              .filter((u) => !q || match(u.title) || u.lessons.some((l) => match(l.title) || l.concepts.some((c) => match(c.term))));
            if (!units.length) return null;
            return (
              <div key={area} className="area">
                <div className="area-label">{area}</div>
                <div className="unit-cards">
                  {units.map((u) => {
                    const p = unitProgress(u, data.progress);
                    return (
                      <button key={u.id} className="card unit-card" onClick={() => nav(`/unit/${u.id}`)}>
                        <div className="unit-card-top">
                          <span className={`tile accent-${u.accent}`}><Icon name={u.icon} /></span>
                          <span className="num unit-card-no">{String(u.no).padStart(2, "0")}</span>
                        </div>
                        <h3>{u.title}</h3>
                        <ul>{u.lessons.map((l) => <li key={l.id}>{l.title}</li>)}</ul>
                        <div className="unit-card-foot">
                          <span className="bar"><span className={`bar-fill accent-${u.accent}`} style={{ width: `${p.ratio * 100}%` }} /></span>
                          <span className="num">{p.done}/{p.total}</span>
                          {u.impact3d === 3 && <span className="badge-3d">3D</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
