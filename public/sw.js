/* 쏘 사회 — 오프라인 캐시
   · 앱 화면(index.html): 네트워크 우선, 끊기면 캐시
   · JS·CSS·폰트·아이콘(파일명에 해시): 캐시 우선
   · 학습 콘텐츠(content/*.json): 네트워크 우선 → 새 콘텐츠가 바로 반영되고, 오프라인에서도 열림
   · /api/ (쏘 대화): 캐시하지 않음 */
const CACHE = "sso-social-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./content/manifest.json"]).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    return (await c.match(req)) || (await c.match("./index.html")) || Response.error();
  }
};
const cacheFirst = async (req) => {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
};
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.includes("/assets/") || url.pathname.includes("/icons/")) e.respondWith(cacheFirst(e.request));
  else e.respondWith(networkFirst(e.request));
});
