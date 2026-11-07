import { SsoCharacter, type SsoMood } from "./SsoCharacter";

/* 캐릭터 시트 — #/sso 에서 색·표정 확인용 */
const MOODS: SsoMood[] = ["idle", "talk", "happy", "think", "wave", "oops"];
export const SSO_COLORS = [
  { id: "white", label: "화이트", hex: "#ffffff" },
  { id: "lavender", label: "라벤더", hex: "#c3baff" },
  { id: "yellow", label: "옐로", hex: "#ffe3a3" },
  { id: "mint", label: "민트", hex: "#a9e4cf" },
  { id: "pink", label: "핑크", hex: "#ffc2c8" },
];

export function SsoSheet() {
  return (
    <div className="page">
      <h1 className="h-light">쏘 캐릭터 시트</h1>
      <div className="sso-sheet">
        {SSO_COLORS.map((c) => (
          <figure key={c.id}><SsoCharacter size={200} color={c.hex} mood="idle" /><figcaption>{c.label}</figcaption></figure>
        ))}
        <figure className="sso-on-white"><SsoCharacter size={200} color="#ffffff" mood="happy" /><figcaption>화이트 · 흰 배경</figcaption></figure>
      </div>
      <div className="sso-sheet">
        {MOODS.map((m) => (
          <figure key={m}><SsoCharacter size={160} mood={m} color="#ffffff" /><figcaption>{m}</figcaption></figure>
        ))}
      </div>
    </div>
  );
}
