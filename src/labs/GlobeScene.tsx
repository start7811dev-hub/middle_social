import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import { Icon } from "../components/Icon";
import type { Accent } from "../data/types";

/* ─────────────────────────────────────────────
   헥스 도트 지구본
   - 화이트 매트 구체 + 육지를 육각 기둥(InstancedMesh)으로 돌출 → 레퍼런스의 엠보싱/헥스맵 결합
   - 핀은 HTML 오버레이(PinTag 스타일), 뒤로 돌아가면 자동 숨김
   - 지역 하이라이트, 아크(네트워크), 포커스 이동 지원
   ───────────────────────────────────────────── */

export interface GlobePin {
  id: string; lat: number; lng: number; label: string; sub?: string;
  icon: string; accent: Accent; onClick?: () => void;
  heat?: number; // 0~1, 주변 도트를 물들이는 정도 (학습 진도 표시에 사용)
}
export interface GlobeProps {
  pins?: GlobePin[];
  focus?: [number, number];
  zoom?: number;
  highlight?: string;
  highlightAccent?: Accent;
  arcs?: string;
  autoRotate?: boolean;
  heat?: boolean; // 핀 주변 도트를 액센트색으로 물들임
}

const R = 1;
const STEP = 2.1; // 도트 간격(°)
export function ll2v(lat: number, lng: number, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

// 육지 도트 좌표 — 1회 계산 후 캐시
let DOTS: [number, number][] | null = null;
function landDots() {
  if (DOTS) return DOTS;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const land = feature(land110 as any, (land110 as any).objects.land) as any;
  const out: [number, number][] = [];
  let row = 0;
  for (let lat = -84; lat <= 84; lat += STEP * 0.866, row++) {
    const dLng = STEP / Math.max(0.12, Math.cos((lat * Math.PI) / 180));
    const off = row % 2 ? dLng / 2 : 0;
    for (let lng = -180 + off; lng < 180; lng += dLng) if (geoContains(land, [lng, lat])) out.push([lat, lng]);
  }
  DOTS = out;
  return out;
}

const REGIONS: Record<string, (lat: number, lng: number) => boolean> = {
  asia: (a, g) => (a > -11 && a < 78 && g > 60 && g < 150) || (a > 12 && a < 45 && g > 34 && g <= 60),
  europe: (a, g) => a > 35 && a < 72 && g > -12 && g < 45,
  africa: (a, g) => a > -36 && a < 37.5 && g > -18 && g < 52 && !(a > 30 && g > 34),
  americas: (_a, g) => g < -30 && g > -170,
  oceania: (a, g) => a < -8 && a > -50 && g > 110,
  arctic: (a) => a > 64,
  korea: (a, g) => a > 33 && a < 43.5 && g > 124 && g < 131,
};

const NETWORK: Record<string, [number, number][][]> = {
  network: [[37.5, 127], [34, -118], [50, 8.6], [1.3, 103.8], [25.2, 55.3], [-23.5, -46.6], [-33.9, 151.2]].slice(1)
    .map((p) => [[37.5, 127], p as [number, number]]),
  tnc: [[[42.3, -83], [25.7, -100.3]], [[42.3, -83], [-23.5, -46.6]], [[37.4, -122], [31.2, 121.5]], [[37.4, -122], [22.5, 114]]],
};

function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function GlobeScene(props: GlobeProps) {
  const { pins = [], focus, zoom = 1, highlight, highlightAccent = "primary", arcs, autoRotate = true, heat = true } = props;
  const host = useRef<HTMLDivElement>(null);
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const api = useRef<{ focusTo: (lat: number, lng: number, z: number) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    // 화면 비율에 맞춰 구체가 꽉 차지 않도록 거리 계산 (iPad 세로·Mac 가로 공통)
    let baseDist = 4.4;
    const fit = (w: number, h: number) => {
      const v = (camera.fov * Math.PI) / 180;
      const hz = 2 * Math.atan(Math.tan(v / 2) * (w / Math.max(1, h)));
      return (R * 1.16) / Math.sin(Math.min(v, hz) / 2);
    };
    baseDist = fit(el.clientWidth, el.clientHeight);
    camera.position.copy(focus ? ll2v(focus[0], focus[1], baseDist / zoom) : ll2v(25, 110, baseDist / zoom));

    // 조명: 밝은 반구광 + 좌상단 키라이트 + 우하단 필라이트 → 하얀 엠보싱 질감
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e3f7, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(-3, 4, 5);
    camera.add(key);
    const fill = new THREE.DirectionalLight(0xf1efff, 0.55);
    fill.position.set(4, -3, 3);
    camera.add(fill);
    scene.add(camera);

    // 구체
    const globe = new THREE.Group();
    scene.add(globe);
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96),
      new THREE.MeshStandardMaterial({ color: cssColor("--globe-base"), roughness: 1, metalness: 0 })));

    // 헥스 도트
    const dots = landDots();
    const hexR = ((STEP * Math.PI) / 180) * 0.42;
    const geo = new THREE.CylinderGeometry(hexR, hexR * 1.04, 0.006, 6);
    geo.translate(0, 0.003, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const mesh = new THREE.InstancedMesh(geo, mat, dots.length);
    const up = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const white = new THREE.Color(cssColor("--globe-dot"));
    const hl = highlight ? REGIONS[highlight] : undefined;
    const hlColor = new THREE.Color(cssColor(`--${highlightAccent}`));
    const pinHeat = heat ? pins.map((p) => ({ v: ll2v(p.lat, p.lng), c: new THREE.Color(cssColor(`--${p.accent}`)), k: p.heat ?? 1 })) : [];
    const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const tmp = new THREE.Color();
    dots.forEach(([lat, lng], i) => {
      const n = ll2v(lat, lng);
      q.setFromUnitVectors(up, n.clone().normalize());
      m4.compose(n, q, one);
      mesh.setMatrixAt(i, m4);
      tmp.copy(white);
      if (hl && hl(lat, lng)) tmp.lerp(hlColor, 0.25 + rnd(i) * 0.6);
      else for (const h of pinHeat) {
        const d = n.distanceTo(h.v);
        const rad = 0.1 + 0.2 * h.k;
        if (h.k > 0 && d < rad) { const t = (1 - d / rad) * (0.45 + rnd(i) * 0.55); if (rnd(i + 7) > 1 - 0.75 * h.k) tmp.lerp(h.c, Math.min(0.95, t * 1.3)); }
      }
      mesh.setColorAt(i, tmp);
    });
    globe.add(mesh);

    // 아크
    const arcMats: THREE.ShaderMaterial[] = [];
    const sky = new THREE.Color(cssColor("--sky")), mag = new THREE.Color(cssColor("--magenta"));
    for (const [a, b] of arcs ? NETWORK[arcs] ?? [] : []) {
      const va = ll2v(a[0], a[1], R * 1.01), vb = ll2v(b[0], b[1], R * 1.01);
      const mid = va.clone().add(vb).multiplyScalar(0.5);
      mid.setLength(R + va.distanceTo(vb) * 0.45);
      const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
      const m = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { a: { value: sky }, b: { value: mag }, t: { value: Math.random() } },
        vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: `uniform vec3 a; uniform vec3 b; uniform float t; varying vec2 vUv;
          void main(){ float p = smoothstep(0.12,0.0,abs(fract(t)-vUv.x)); vec3 c = mix(a,b,vUv.x) + p*0.5; gl_FragColor=vec4(c, 0.85); }`,
      });
      arcMats.push(m);
      globe.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0045, 6, false), m));
      for (const v of [va, vb]) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), new THREE.MeshBasicMaterial({ color: sky }));
        dot.position.copy(v);
        globe.add(dot);
      }
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 1.7;
    controls.maxDistance = 9;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.35;

    // 포커스 애니메이션
    let anim: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
    const focusTo = (lat: number, lng: number, z: number) => {
      anim = { from: camera.position.clone(), to: ll2v(lat, lng, baseDist / z), t: 0 };
      controls.autoRotate = false;
    };
    api.current = { focusTo };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      const nd = fit(w, h);
      if (Math.abs(nd - baseDist) > 0.01) { camera.position.multiplyScalar(nd / baseDist); baseDist = nd; }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const pinVecs = pins.map((p) => ({ id: p.id, v: ll2v(p.lat, p.lng, R * 1.02) }));
    const proj = new THREE.Vector3(), camDir = new THREE.Vector3();
    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (anim) {
        anim.t = Math.min(1, anim.t + dt * 1.1);
        const e = 1 - Math.pow(1 - anim.t, 3);
        const len = THREE.MathUtils.lerp(anim.from.length(), anim.to.length(), e);
        camera.position.copy(anim.from.clone().normalize().lerp(anim.to.clone().normalize(), e).setLength(len));
        if (anim.t >= 1) anim = null;
      }
      controls.update();
      arcMats.forEach((m) => (m.uniforms.t.value += dt * 0.35));
      renderer.render(scene, camera);
      // 핀 투영
      const w = el.clientWidth, h = el.clientHeight;
      camDir.copy(camera.position).normalize();
      for (const p of pinVecs) {
        const node = pinEls.current[p.id];
        if (!node) continue;
        const facing = p.v.clone().normalize().dot(camDir);
        proj.copy(p.v).project(camera);
        node.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px)`;
        node.style.opacity = facing > 0.2 ? String(Math.min(1, (facing - 0.2) * 4)) : "0";
        node.style.pointerEvents = facing > 0.35 ? "auto" : "none";
        node.style.zIndex = String(Math.round(facing * 100));
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => x.dispose());
      });
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, arcs, pins.map((p) => p.id + p.accent + (p.heat ?? 1).toFixed(2)).join()]);

  useEffect(() => {
    if (focus) api.current?.focusTo(focus[0], focus[1], zoom);
  }, [focus?.[0], focus?.[1], zoom]);

  return (
    <div className="globe" ref={host}>
      <div className="globe-pins">
        {pins.map((p) => (
          <button key={p.id} ref={(n) => { pinEls.current[p.id] = n; }} className="pin" onClick={p.onClick}>
            <span className="pin-tag">
              <span className={`tile tile-sm accent-${p.accent}`}><Icon name={p.icon} size={16} /></span>
              <span className="pin-text"><span className="pin-sub">{p.sub}</span><span className="pin-label">{p.label}</span></span>
            </span>
            <span className={`pin-dot accent-${p.accent}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
