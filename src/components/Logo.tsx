// 브랜드 마크 — 안경 쓴 캐릭터 라인 드로잉 (원본 스케치 기반 벡터화)
// size가 작을수록 선을 굵게 해서 32px 이하에서도 형태가 유지되게 한다.
export function LogoMark({ size = 44, color = "currentColor", lens }: { size?: number; color?: string; lens?: string }) {
  const sw = size <= 28 ? 5.2 : size <= 48 ? 4.4 : 3.6;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M27 57C21 38 27 22 43 15" />
      <path d="M57 14C73 17 81 31 77 53" />
      <path d="M37 25C34.5 30 33.6 34 34 38" />
      <path d="M50 21C48.4 27 48 31 48.4 36" />
      <path d="M63 24C65 29 66 33 65.6 37.5" />
      <path d="M29.5 49C25 49 24.5 57 29.5 58" />
      <path d="M30 58C32 67 39 73 49 73.5C58 73.5 65 69 69 61" />
      <circle cx="40.5" cy="51" r="7.2" fill={lens ?? "none"} />
      <circle cx="60.5" cy="51" r="7.2" fill={lens ?? "none"} />
      <path d="M47.7 50.5Q50.5 48.6 53.3 50.5" />
      <circle cx="42" cy="51.5" r="1.8" fill={color} stroke="none" />
      <circle cx="59" cy="51.5" r="1.8" fill={color} stroke="none" />
      <circle cx="51" cy="63" r="1.9" strokeWidth={sw * 0.72} />
      <path d="M42 74L41 80" />
      <path d="M40 81C46 79.5 54 79.5 60 81" />
      <path d="M19 97C21 87 29 82 39 81" />
      <path d="M57.6 87.5h.01M57.2 93.5h.01" />
      <path d="M72 60C74 73 69 86 62 96" />
      <path d="M76 57C80 72 76.5 87 70.5 97" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="logo-lockup">
      <span className="logo-badge"><LogoMark size={40} lens="var(--surface)" /></span>
      {!compact && <span className="logo-word"><b>SOCIAL</b> ATLAS</span>}
    </span>
  );
}
