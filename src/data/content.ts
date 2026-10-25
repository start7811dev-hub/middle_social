import type { Catalog, Lesson, Manifest, Unit } from "./types";

/**
 * 콘텐츠 로더 — 여러 소스를 순서대로 읽어 병합한다.
 *  - 기본 소스: 앱에 포함된 ./content (public/content)
 *  - 외부 소스: VITE_CONTENT_SOURCES (쉼표 구분) — GitHub raw, Supabase Storage, CMS 등
 *  - 병합 규칙: 같은 unit id → 필드 덮어쓰기, lessons는 lesson id 기준으로 교체/추가
 *  - 각 소스는 manifest.json + units/*.json 구조만 지키면 된다 (schema/unit.schema.json)
 */
const env = (import.meta.env.VITE_CONTENT_SOURCES as string | undefined)?.trim();
export const CONTENT_SOURCES = (env ? env.split(",") : ["./content"]).map((s) => s.trim().replace(/\/$/, ""));

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function mergeLessons(base: Lesson[], extra: Lesson[]) {
  const out = [...base];
  for (const l of extra) {
    const i = out.findIndex((x) => x.id === l.id);
    if (i >= 0) out[i] = { ...out[i], ...l };
    else out.push(l);
  }
  return out;
}

let cache: Promise<Catalog> | null = null;
export function loadCatalog(): Promise<Catalog> {
  if (cache) return cache;
  cache = (async () => {
    let manifest: Manifest | null = null;
    const units: Record<string, Unit> = {};
    const loaded: string[] = [];
    for (const src of CONTENT_SOURCES) {
      try {
        const m = await getJSON<Manifest>(`${src}/manifest.json`);
        const list = await Promise.all(m.units.map((u) => getJSON<Unit>(`${src}/${u.path}`)));
        for (const u of list) {
          const prev = units[u.id];
          units[u.id] = prev ? { ...prev, ...u, lessons: mergeLessons(prev.lessons, u.lessons) } : u;
        }
        if (!manifest) manifest = m;
        else {
          manifest.contentVersion = m.contentVersion || manifest.contentVersion;
          for (const ref of m.units) if (!manifest.units.find((x) => x.id === ref.id)) manifest.units.push(ref);
          for (const b of m.books) {
            const mb = manifest.books.find((x) => x.id === b.id);
            if (mb) for (const id of b.units) if (!mb.units.includes(id)) mb.units.push(id);
          }
        }
        loaded.push(src);
      } catch (e) {
        console.warn("[content] 소스 로드 실패:", src, e);
      }
    }
    if (!manifest) throw new Error("콘텐츠를 불러오지 못했습니다.");
    return { manifest, units, sources: loaded };
  })();
  return cache;
}

export const unitList = (c: Catalog, book?: string) =>
  c.manifest.books.filter((b) => !book || b.id === book).flatMap((b) => b.units.map((id) => c.units[id]).filter(Boolean));

export function findLesson(c: Catalog, lessonId: string) {
  for (const u of Object.values(c.units)) {
    const l = u.lessons.find((x) => x.id === lessonId);
    if (l) return { unit: u, lesson: l };
  }
  return null;
}
