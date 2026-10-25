import { useMemo, useRef, useState } from "react";

/* 수요·공급 랩 — 가격선을 끌어 초과수요/초과공급을 체험하고, 요인 칩으로 곡선을 이동시킨다. */
const PMAX = 12000, QMAX = 100, K = 0.008;
const W = 640, H = 420, M = { l: 64, r: 24, t: 24, b: 48 };
const x = (q: number) => M.l + (q / QMAX) * (W - M.l - M.r);
const y = (p: number) => H - M.b - (p / PMAX) * (H - M.t - M.b);
const pOfY = (py: number) => ((H - M.b - py) / (H - M.t - M.b)) * PMAX;

const SCEN = [
  { id: "inc", label: "소득 증가", d: 15, s: 0, why: "같은 가격에서 더 사려 함 → 수요 곡선 오른쪽 이동" },
  { id: "sub", label: "대체재 가격 하락", d: -15, s: 0, why: "다른 상품으로 수요가 옮겨감 → 수요 곡선 왼쪽 이동" },
  { id: "tech", label: "생산 기술 발달", d: 0, s: 15, why: "생산 비용 하락 → 공급 곡선 오른쪽 이동" },
  { id: "storm", label: "태풍으로 생산 감소", d: 0, s: -15, why: "공급량 감소 → 공급 곡선 왼쪽 이동" },
];

export function SupplyDemand({ params }: { params?: Record<string, unknown> }) {
  const shiftMode = params?.mode === "shift";
  const [price, setPrice] = useState(9000);
  const [ds, setDs] = useState(0);
  const [ss, setSs] = useState(0);
  const [scen, setScen] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const qd = (p: number, d = ds) => 90 + d - K * p;
  const qs = (p: number, s = ss) => K * p - 10 + s;
  const eqP = (d = ds, s = ss) => (100 + d - s) / (2 * K);
  const P = eqP(), Q = qd(P);
  const P0 = eqP(0, 0), Q0 = qd(P0, 0);
  const gap = qd(price) - qs(price);
  const state = Math.abs(gap) < 2 ? "균형" : gap > 0 ? "초과 수요" : "초과 공급";

  const line = (f: (p: number) => number) => {
    const pts: string[] = [];
    for (let p = 0; p <= PMAX; p += 250) { const q = f(p); if (q >= 0 && q <= QMAX) pts.push(`${x(q)},${y(p)}`); }
    return pts.join(" ");
  };
  const drag = (e: React.PointerEvent) => {
    if (!svg.current || e.buttons === 0) return;
    const r = svg.current.getBoundingClientRect();
    const py = ((e.clientY - r.top) / r.height) * H;
    setPrice(Math.round(Math.max(500, Math.min(PMAX - 500, pOfY(py))) / 100) * 100);
  };
  const ticksP = useMemo(() => [0, 2000, 4000, 6000, 8000, 10000, 12000], []);
  const pick = (s: (typeof SCEN)[number]) => {
    if (scen === s.id) { setScen(null); setDs(0); setSs(0); return; }
    setScen(s.id); setDs(s.d); setSs(s.s); setPrice(Math.round(eqP(s.d, s.s) / 100) * 100);
  };
  const cur = SCEN.find((s) => s.id === scen);

  return (
    <div className="lab-sd">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="sd-svg" onPointerDown={drag} onPointerMove={drag}>
        <defs>
          <linearGradient id="sdD" x1="0" x2="1"><stop offset="0" stopColor="var(--primary)" /><stop offset="1" stopColor="var(--magenta)" /></linearGradient>
          <linearGradient id="sdS" x1="0" x2="1"><stop offset="0" stopColor="var(--sky)" /><stop offset="1" stopColor="var(--green)" /></linearGradient>
        </defs>
        {ticksP.map((p) => (
          <g key={p}>
            <line x1={M.l} x2={W - M.r} y1={y(p)} y2={y(p)} className="sd-grid" />
            <text x={M.l - 10} y={y(p) + 4} className="sd-tick" textAnchor="end">{p.toLocaleString()}</text>
          </g>
        ))}
        {[0, 20, 40, 60, 80, 100].map((q) => <text key={q} x={x(q)} y={H - M.b + 20} className="sd-tick" textAnchor="middle">{q}</text>)}
        <text x={M.l} y={14} className="sd-axis">가격(원)</text>
        <text x={W - M.r} y={H - 8} className="sd-axis" textAnchor="end">수량(개)</text>

        {/* 초과 구간 */}
        {state !== "균형" && (
          <rect x={x(Math.min(qd(price), qs(price)))} y={y(price) - 9}
            width={Math.abs(x(qd(price)) - x(qs(price)))} height={18} rx={9}
            className={gap > 0 ? "sd-gap sd-gap-d" : "sd-gap sd-gap-s"} />
        )}
        {/* 이동 전 곡선 */}
        {(ds !== 0 || ss !== 0) && <>
          <polyline points={line((p) => qd(p, 0))} className="sd-ghost" />
          <polyline points={line((p) => qs(p, 0))} className="sd-ghost" />
          <circle cx={x(Q0)} cy={y(P0)} r={5} className="sd-ghost-pt" />
        </>}
        <polyline points={line(qd)} stroke="url(#sdD)" className="sd-curve" />
        <polyline points={line(qs)} stroke="url(#sdS)" className="sd-curve" />
        <text x={x(qd(1200)) + 8} y={y(1200)} className="sd-label" fill="var(--magenta)">D 수요</text>
        <text x={x(qs(11500)) + 8} y={y(11500) + 4} className="sd-label" fill="var(--green)">S 공급</text>
        {/* 균형점 */}
        <line x1={M.l} x2={x(Q)} y1={y(P)} y2={y(P)} className="sd-eq-guide" />
        <line x1={x(Q)} x2={x(Q)} y1={y(P)} y2={H - M.b} className="sd-eq-guide" />
        <circle cx={x(Q)} cy={y(P)} r={13} className="sd-eq-halo" />
        <circle cx={x(Q)} cy={y(P)} r={6} className="sd-eq" />
        {/* 드래그 가격선 */}
        <line x1={M.l} x2={W - M.r} y1={y(price)} y2={y(price)} className="sd-price" />
        <g transform={`translate(${W - M.r - 118}, ${y(price) - 15})`} className="sd-handle">
          <rect width={118} height={30} rx={15} />
          <text x={59} y={20} textAnchor="middle">↕ {price.toLocaleString()}원</text>
        </g>
      </svg>

      <div className="sd-side">
        <div className="stat-card">
          <div className="eyebrow">현재 가격에서</div>
          <div className={`sd-state ${state === "균형" ? "ok" : gap > 0 ? "d" : "s"}`}>{state}</div>
          <div className="kv"><span>수요량</span><b className="num">{Math.max(0, qd(price)).toFixed(0)}</b></div>
          <div className="kv"><span>공급량</span><b className="num">{Math.max(0, qs(price)).toFixed(0)}</b></div>
          <p className="hint">
            {state === "균형" ? "수요량과 공급량이 같다. 시장 가격은 여기서 멈춘다."
              : gap > 0 ? "사려는 사람이 더 많다 → 가격이 오른다."
              : "팔려는 물건이 남는다 → 가격이 내린다."}
          </p>
        </div>
        <div className="stat-card">
          <div className="eyebrow">균형</div>
          <div className="kv"><span>균형 가격</span><b className="num">{Math.round(P).toLocaleString()}원</b></div>
          <div className="kv"><span>균형 거래량</span><b className="num">{Q.toFixed(0)}개</b></div>
          <button className="btn-ghost" onClick={() => setPrice(Math.round(P / 100) * 100)}>가격을 균형으로 이동</button>
        </div>
        {shiftMode && (
          <div className="stat-card">
            <div className="eyebrow">무슨 일이 생기면?</div>
            <div className="chips">
              {SCEN.map((s) => <button key={s.id} className={`chip ${scen === s.id ? "on" : ""}`} onClick={() => pick(s)}>{s.label}</button>)}
            </div>
            {cur && <p className="hint">{cur.why}. 균형 가격 {Math.round(P0).toLocaleString()} → <b>{Math.round(P).toLocaleString()}원</b></p>}
          </div>
        )}
      </div>
    </div>
  );
}
