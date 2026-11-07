import { useEffect, useRef } from "react";
import * as THREE from "three";

/* ─────────────────────────────────────────────
   쏘 — 3D 캐릭터
   원본 스케치: 둥근 몸, 점 눈, 넓은 미소, 가는 선 팔다리와 동그란 손발
   재질: 몸은 맨질맨질한 매트(약한 클리어코트 + 시인), 얼굴·팔다리는 잉크색 선(튜브)
   상태: idle · talk · happy · think · wave · oops
   ───────────────────────────────────────────── */

export type SsoMood = "idle" | "talk" | "happy" | "think" | "wave" | "oops";

export interface SsoCharacterProps {
  mood?: SsoMood;
  size?: number;
  color?: string;
  onClick?: () => void;
  title?: string;
}

const INK = 0x2a2850;
const SX = 1.0, SY = 1.06, SZ = 0.92; // 몸 비율

/** 몸 표면 위 앞쪽 점(살짝 바깥) */
function onBody(x: number, y: number, lift = 0.012) {
  const nx = x / SX, ny = y / SY;
  const z = SZ * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const p = new THREE.Vector3(x, y, z);
  const n = new THREE.Vector3(x / (SX * SX), y / (SY * SY), z / (SZ * SZ)).normalize();
  return p.add(n.multiplyScalar(lift));
}

function tube(points: THREE.Vector3[], r: number, mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, 48, r, 10, false);
  const m = new THREE.Mesh(g, mat);
  // 둥근 끝
  for (const p of [points[0], points[points.length - 1]]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), mat);
    cap.position.copy(p);
    m.add(cap);
  }
  return m;
}

function buildSso(color: string) {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group(); // 호흡·기울기
  root.add(bodyGroup);

  const ink = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.55, metalness: 0 });
  const skin = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.48, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.6,
    sheen: 0.5, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7,
  });

  // 몸 — 아래가 조금 더 넓은 달걀형
  const g = new THREE.SphereGeometry(1, 96, 96);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 - 0.05 * y;
    pos.setXYZ(i, x * SX * k, y * SY, z * SZ * k);
  }
  g.computeVertexNormals();
  const body = new THREE.Mesh(g, skin);
  bodyGroup.add(body);

  // 눈
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.36, 0.36]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 20), ink);
    e.position.copy(onBody(x, 0.16, 0.02));
    e.scale.set(1, 1.15, 0.6);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(0.018, 0.022, 0.04);
    e.add(shine);
    bodyGroup.add(e);
    eyes.push(e);
  }

  // 미소 — 스케치처럼 넓고 얕은 곡선
  const smilePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = -0.52 + t * 1.02;
    const y = -0.08 - 0.24 * Math.sin(Math.PI * t) - 0.02 * t;
    smilePts.push(onBody(x, y, 0.018));
  }
  const smile = tube(smilePts, 0.026, ink);
  bodyGroup.add(smile);

  // 말할 때 열리는 입 — 미소 선 바로 아래 납작한 타원 (평소엔 두께 0)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: 0x3b2d63, roughness: 0.8 }));
  const mc = onBody(-0.01, -0.36, -0.01);
  const mn = new THREE.Vector3(mc.x / (SX * SX), mc.y / (SY * SY), mc.z / (SZ * SZ)).normalize();
  mouth.position.copy(mc);
  mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mn);
  mouth.scale.set(0.17, 0.001, 0.035);
  bodyGroup.add(mouth);

  // 팔 — 어깨 피벗 그룹으로 흔들기
  const mkArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    const sh = side < 0 ? onBody(-0.97, -0.08, -0.04) : onBody(0.99, 0.12, -0.04);
    pivot.position.copy(sh);
    const pts =
      side < 0
        ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.16, -0.02, 0.02), new THREE.Vector3(-0.3, -0.18, 0.04), new THREE.Vector3(-0.36, -0.42, 0.05)]
        : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.16, 0.0, 0.02), new THREE.Vector3(0.28, -0.04, 0.04), new THREE.Vector3(0.3, -0.16, 0.05)];
    pivot.add(tube(pts, 0.026, ink));
    const hand = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.024, 12, 28), ink);
    const end = pts[pts.length - 1];
    hand.position.set(end.x + side * 0.01, end.y - 0.07, end.z);
    hand.scale.set(0.9, 1.1, 1);
    pivot.add(hand);
    bodyGroup.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // 다리 + 동그란 발 (d · b 모양: 발이 바깥을 향함)
  for (const side of [-1, 1] as const) {
    const top = new THREE.Vector3(side * 0.4, -0.98 * SY + 0.03, 0.18);
    const bot = new THREE.Vector3(side * 0.42, -1.33, 0.2);
    root.add(tube([top, new THREE.Vector3(side * 0.41, -1.15, 0.19), bot], 0.026, ink));
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 12, 28), ink);
    foot.position.set(bot.x + side * 0.085, bot.y - 0.02, bot.z);
    foot.scale.set(1.15, 0.85, 1);
    root.add(foot);
  }

  // 바닥 그림자
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a2850, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.42;
  shadow.scale.set(1, 0.55, 1);
  root.add(shadow);

  return { root, bodyGroup, eyes, mouth, armL, armR, shadow, skin };
}

export function SsoCharacter({ mood = "idle", size = 150, color = "#ffffff", onClick, title = "쏘" }: SsoCharacterProps) {
  const host = useRef<HTMLDivElement>(null);
  const moodRef = useRef<SsoMood>(mood);
  moodRef.current = mood;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size * 1.12);
    renderer.toneMapping = THREE.NeutralToneMapping;
    // 밝은 색(흰색)일수록 노출을 조금 올려 회색으로 죽지 않게
    const lum = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l;
    renderer.toneMappingExposure = lum > 0.92 ? 1.18 : 1.0;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1 / 1.12, 0.1, 50);
    camera.position.set(0, -0.05, 6.9);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe4e0fa, 1.6));
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(1.5, -0.5, 5);
    scene.add(fill);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-2.5, 3.5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe7e2ff, 0.9);
    rim.position.set(3, 1, -2);
    scene.add(rim);

    const sso = buildSso(color);
    sso.root.position.y = 0.1;
    scene.add(sso.root);

    // 시선 — 포인터 방향
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      look.tx = THREE.MathUtils.clamp(dx * 1.6, -0.55, 0.55);
      look.ty = THREE.MathUtils.clamp(dy * 1.2, -0.3, 0.3);
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    let nextBlink = 1.5, blinkT = -1;
    let hop = 0, lastMood: SsoMood = "idle", moodT = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const m = moodRef.current;
      if (m !== lastMood) { lastMood = m; moodT = 0; if (m === "happy") hop = 1; }
      moodT += dt;

      // 호흡·둥실
      const breathe = Math.sin(t * 2.4);
      let y = 0.1 + breathe * 0.025;
      let sq = 1 + breathe * 0.012;

      // 점프 (happy)
      if (hop > 0) {
        hop = Math.max(0, hop - dt * 1.6);
        const p = 1 - hop;
        const h = Math.sin(Math.min(1, p * 1.25) * Math.PI);
        y += h * 0.45;
        sq = p > 0.78 ? 1 - Math.sin(((p - 0.78) / 0.22) * Math.PI) * 0.12 : 1 + h * 0.05;
      }
      sso.root.position.y = y;
      sso.bodyGroup.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      sso.shadow.scale.set(1 - (y - 0.1) * 0.6, 0.55 - (y - 0.1) * 0.3, 1);

      // 시선·기울기
      look.x += (look.tx - look.x) * 0.08;
      look.y += (look.ty - look.y) * 0.08;
      let tilt = 0;
      if (m === "think") tilt = 0.14 + Math.sin(t * 1.5) * 0.02;
      if (m === "oops") tilt = Math.sin(moodT * 22) * 0.06 * Math.max(0, 1 - moodT * 1.5);
      sso.root.rotation.y = look.x;
      sso.root.rotation.x = look.y * 0.6;
      sso.root.rotation.z += (tilt - sso.root.rotation.z) * 0.15;

      // 팔
      const wave = m === "wave" || (m === "talk" && moodT < 1.2);
      sso.armR.rotation.z = wave ? 0.5 + Math.sin(t * 10) * 0.35 : m === "happy" ? 0.6 : Math.sin(t * 2.4) * 0.05;
      sso.armL.rotation.z = m === "happy" ? -0.6 : m === "think" ? -0.2 : -Math.sin(t * 2.4 + 1) * 0.05;

      // 입 (talk)
      const open = m === "talk" ? 0.04 + Math.abs(Math.sin(t * 11)) * 0.07 : m === "happy" ? 0.07 : m === "oops" ? 0.05 : 0.001;
      sso.mouth.scale.y += (open - sso.mouth.scale.y) * 0.35;

      // 깜빡임
      nextBlink -= dt;
      if (nextBlink <= 0 && blinkT < 0) { blinkT = 0; nextBlink = 2.5 + Math.random() * 3; }
      let ey = m === "happy" ? 0.35 : 1;
      if (blinkT >= 0) { blinkT += dt; ey = Math.abs(Math.cos(Math.min(1, blinkT / 0.16) * Math.PI)) * ey; if (blinkT > 0.16) blinkT = -1; }
      for (const e of sso.eyes) e.scale.y = 1.15 * Math.max(0.08, ey);

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mm) ? mm : mm ? [mm] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size, color]);

  return (
    <button ref={host as never} className="sso-char" style={{ width: size, height: size * 1.12 }} onClick={onClick}
      aria-label={`${title}와 이야기하기`} title={title} />
  );
}
