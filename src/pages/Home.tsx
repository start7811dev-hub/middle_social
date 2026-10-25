import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Catalog, Unit } from "../data/types";
import { unitList } from "../data/content";
import { useUser } from "../data/UserContext";
import { Ring, TopBar } from "../components/Shell";
import { Icon } from "../components/Icon";
import { GlobeScene, type GlobePin } from "../labs/GlobeScene";
import { isDue } from "../data/userStore";

const BOOK_TABS = [{ id: "all", label: "전체" }, { id: "s1", label: "사회①" }, { id: "s2", label: "사회②" }];
const KOREA = ["s2-g07", "s2-g08", "s2-g09", "s2-g10", "s2-g11"];

export function unitProgress(u: Unit, progress: Record<string, { done: boolean }>) {
  const done = u.lessons.filter((l) => progress[l.id]?.done).length;
  return { done, total: u.lessons.length, ratio: done / u.lessons.length };
}

export function Home({ cat }: { cat: Catalog }) {
  const nav = useNavigate();
  const { data } = useUser();
  const [book, setBook] = useState("all");
  const units = unitList(cat, book === "all" ? undefined : book);
  const all = unitList(cat);
  const lessonsTotal = all.reduce((a, u) => a + u.lessons.length, 0);
  const lessonsDone = Object.values(data.progress).filter((p) => p.done).length;
  const answered = Object.values(data.progress).reduce((a, p) => a + p.total, 0);
  const correct = Object.values(data.progress).reduce((a, p) => a + p.correct, 0);
  const openWrong = data.wrong.filter((w) => !w.resolved).length;
  const missions = Object.keys(data.missions).length;

  const pins = useMemo<GlobePin[]>(() => {
    const geoUnits = units.filter((u) => u.geo && !KOREA.includes(u.id));
    const ps: GlobePin[] = geoUnits.map((u) => ({
      id: u.id, lat: u.geo!.lat, lng: u.geo!.lng, label: u.title, icon: u.icon, accent: u.accent,
      sub: `${u.book === "s1" ? "사회①" : "사회②"} · ${String(u.no).padStart(2, "0")}`,
      onClick: () => nav(`/unit/${u.id}`),
      heat: unitProgress(u, data.progress).ratio, // 학습한 만큼 지역이 물든다
    }));
    if (units.some((u) => KOREA.includes(u.id)))
      ps.push({ id: "korea", lat: 37.5, lng: 127.5, label: "대한민국 지리", sub: "사회② · 07–11", icon: "flag", accent: "primary",
        onClick: () => nav("/unit/s2-g07"),
        heat: KOREA.reduce((a, id) => a + (cat.units[id] ? unitProgress(cat.units[id], data.progress).ratio : 0), 0) / KOREA.length });
    return ps;
  }, [book, data.progress]);
  const geoAll = all.filter((u) => u.area === "지리");
  const lit = geoAll.reduce((a, u) => a + unitProgress(u, data.progress).ratio, 0) / Math.max(1, geoAll.length);
  const due = data.wrong.filter((w) => isDue(w)).length;
  const sure = data.calibration["3"];

  const society = units.filter((u) => u.area === "일반사회");
  const [sel, setSel] = useState(0);

  return (
    <div className="page home">
      <TopBar tabs={BOOK_TABS} value={book} onChange={(b) => { setBook(b); setSel(0); }}
        right={<button className="search" onClick={() => nav("/units")}><Icon name="search" size={18} /><span>단원·개념 찾기</span></button>} />

      <div className="home-grid">
        {/* 좌: 학습 현황 */}
        <section className="home-left">
          <h1 className="h-light">학습 현황</h1>
          <div className="eyebrow-row"><span className="eyebrow-strong">완료한 학습</span><span className="eyebrow">성취기준 기준</span></div>
          <div className="display num">{lessonsDone}<small> / {lessonsTotal}</small></div>
          <div className="tile-list">
            <button className="tile-row" onClick={() => nav("/review")}>
              <span className="tile accent-primary"><Icon name="review" /></span>
              <span><span className="tile-row-label">오늘의 복습</span><b className="num">{due}<small> 장</small></b></span>
            </button>
            <button className="tile-row" onClick={() => nav("/wrong")}>
              <span className="tile accent-coral"><Icon name="wrong" /></span>
              <span><span className="tile-row-label">오답 노트</span><b className="num">{openWrong}</b></span>
            </button>
            <button className="tile-row" onClick={() => nav("/scraps")}>
              <span className="tile accent-sky"><Icon name="bookmark" /></span>
              <span><span className="tile-row-label">스크랩</span><b className="num">{data.scraps.length}</b></span>
            </button>
            <div className="tile-row">
              <span className="tile accent-orange"><Icon name="pin" /></span>
              <span><span className="tile-row-label">현장 미션</span><b className="num">{missions}</b></span>
            </div>
          </div>
          <div className="rings">
            <div className="ring-item"><Ring value={answered ? correct / answered : 0} color="var(--primary)" />
              <span><b className="num">{correct}/{answered}</b><small>정답률</small></span></div>
            <div className="ring-item"><Ring value={sure ? sure.right / sure.total : 0} color="var(--magenta)" label={sure ? undefined : "–"} />
              <span><b className="num">{sure ? `${sure.right}/${sure.total}` : "0/0"}</b><small>'확실' 답 적중률</small></span></div>
          </div>
        </section>

        {/* 중앙: 지구본 */}
        <section className="home-globe">
          <div className="halo" aria-hidden />
          <GlobeScene pins={pins} />
          <div className="lit-meter">
            <span className="eyebrow">밝힌 세계</span>
            <b className="num">{Math.round(lit * 100)}%</b>
            <span className="t-caption">지리 학습을 마칠 때마다 그 지역이 물듭니다</span>
          </div>
        </section>

        {/* 우: 단원 리스트 */}
        <section className="home-right">
          <div className="panel-title">단원 <span className="eyebrow">{units.length}개</span></div>
          <div className="unit-table">
            {units.map((u) => {
              const p = unitProgress(u, data.progress);
              return (
                <button key={u.id} className="unit-row" onClick={() => nav(`/unit/${u.id}`)}>
                  <i className={`dot accent-${u.accent}`} />
                  <span className="unit-row-title">{u.title}</span>
                  <span className="unit-row-n num">{p.done}/{p.total}</span>
                  <span className="bar"><span className={`bar-fill accent-${u.accent}`} style={{ width: `${p.ratio * 100}%` }} /></span>
                  {u.impact3d === 3 && <span className="badge-3d" title="3D 핵심 콘텐츠">3D</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 하단: 일반사회 캡슐 */}
      {society.length > 0 && (
        <section className="capsules" aria-label="일반사회 단원">
          <div className="capsules-head">
            <span className="panel-title">일반사회</span>
            <span className="eyebrow">지구본 밖의 단원 · 선택 후 다시 눌러 열기</span>
          </div>
          <div className="capsule-track">
            {society.map((u, i) => (
              <button key={u.id} className={`capsule accent-${u.accent} ${i === sel ? "on" : ""}`}
                onClick={() => (i === sel ? nav(`/unit/${u.id}`) : setSel(i))}>
                <span className="capsule-no num">{String(u.no).padStart(2, "0")}</span>
                <Icon name={u.icon} size={30} stroke={1.4} />
                <span className="capsule-title">{u.title}</span>
                <span className="capsule-sub">{u.book === "s1" ? "사회①" : "사회②"} · {u.lessons.length}개 학습</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
