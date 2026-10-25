import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { useUser } from "../data/UserContext";
import { Logo } from "./Logo";
import { isDue } from "../data/userStore";

const NAV = [
  { to: "/", icon: "home", label: "홈" },
  { to: "/units", icon: "book", label: "단원" },
  { to: "/review", icon: "review", label: "오늘의 복습" },
  { to: "/wrong", icon: "wrong", label: "오답노트" },
  { to: "/scraps", icon: "bookmark", label: "스크랩" },
  { to: "/about", icon: "settings", label: "정보" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { data } = useUser();
  const loc = useLocation();
  const due = data.wrong.filter((w) => isDue(w)).length;
  return (
    <div className="shell">
      <nav className="rail" aria-label="주요 메뉴">
        <div className="logo" aria-label="중학 사회 아틀라스"><Logo compact /></div>
        <div className="rail-items">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) =>
              "rail-item" + (isActive || (n.to === "/units" && loc.pathname.startsWith("/unit/")) ? " on" : "")} title={n.label}>
              <Icon name={n.icon} />
              <span className="rail-label">{n.label}</span>
              {n.to === "/review" && due > 0 && <i className="badge">{due}</i>}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

export function TopBar({ tabs, value, onChange, right }: {
  tabs?: { id: string; label: string }[]; value?: string; onChange?: (id: string) => void; right?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="brand"><span className="logo-word"><b>SOCIAL</b> ATLAS</span><span className="brand-ko">중학 사회</span></div>
      {tabs && (
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={value === t.id} className={"tab" + (value === t.id ? " on" : "")}
              onClick={() => onChange?.(t.id)}>{t.label}</button>
          ))}
        </div>
      )}
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Ring({ value, color = "var(--primary)", size = 76, label }: { value: number; color?: string; size?: number; label?: string }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} className="ring-val"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-num num">{label ?? `${Math.round(v * 100)}%`}</span>
    </div>
  );
}
