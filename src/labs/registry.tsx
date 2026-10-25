import type { ComponentType } from "react";
import type { Accent, Lab } from "../data/types";
import { GlobeScene } from "./GlobeScene";
import { SupplyDemand } from "./SupplyDemand";
import { Icon } from "../components/Icon";

/**
 * 랩 레지스트리 — 콘텐츠 JSON의 lab.type → 컴포넌트.
 * 새 3D 랩 추가: 컴포넌트 작성 → 여기 등록 → scripts/validate-content.mjs KNOWN_LABS에 추가.
 */
export interface LabProps { params?: Record<string, unknown>; accent: Accent }

function GlobeLab({ params, accent }: LabProps) {
  const f = params?.focus as [number, number] | undefined;
  return (
    <div className="lab-globe">
      <GlobeScene focus={f} zoom={(params?.zoom as number) ?? 1} highlight={params?.highlight as string}
        highlightAccent={accent} arcs={params?.arcs as string} autoRotate={!f} heat={false}
        pins={f ? [{ id: "f", lat: f[0], lng: f[1], label: "학습 지역", icon: "spark", accent }] : []} />
      <div className="lab-hint">드래그해서 돌리고, 핀치·스크롤로 확대</div>
    </div>
  );
}

function PlannedLab({ params }: LabProps) {
  return (
    <div className="lab-planned">
      <div className="tile tile-lg accent-primary"><Icon name="cube" size={28} /></div>
      <h3>{(params?.name as string) ?? "3D 랩"}</h3>
      <p>제작 예정인 3D 랩입니다. 콘텐츠 JSON에서 lab.type을 구현된 랩으로 바꾸면 이 자리에 표시됩니다.</p>
    </div>
  );
}

export const LABS: Record<string, ComponentType<LabProps>> = {
  globe: GlobeLab,
  "supply-demand": ({ params }) => <SupplyDemand params={params} />,
  planned: PlannedLab,
};

export function LabView({ lab, accent }: { lab: Lab; accent: Accent }) {
  const C = LABS[lab.type] ?? PlannedLab;
  return <C params={lab.params} accent={accent} />;
}
