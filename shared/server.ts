/* 서버 함수 공용 도구 (Node 전용 — 브라우저 코드에서 import 금지) */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

/* ── 쏘 답 서명 ── */
function signingKey() {
  return env("SSO_SIGNING_KEY") || createHash("sha256").update(`sso-sign:${env("ANTHROPIC_API_KEY") ?? "dev"}`).digest("hex");
}
export function sign(text: string) {
  return createHmac("sha256", signingKey()).update(text).digest("base64url").slice(0, 32);
}
export function sameString(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ── 요청 한도 (인스턴스 메모리 기준, 최선 노력) ── */
const buckets = new Map<string, number[]>();
export function overLimit(key: string, max: number, now = Date.now(), win = 10 * 60 * 1000) {
  const list = (buckets.get(key) ?? []).filter((t) => now - t < win);
  const over = list.length >= max;
  if (!over) list.push(now);
  buckets.set(key, list);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (!v.some((t) => now - t < win)) buckets.delete(k);
  return over;
}

export function clientKeys(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const device = (req.headers.get("x-sso-device") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64) || "nodevice";
  return { ip, device };
}

/** 접근 코드 검사 — 통과면 null, 아니면 보낼 응답 상태와 문구 */
export function checkAccess(req: Request): { status: number; text: string } | null {
  const code = env("SSO_ACCESS_CODE");
  if (!code || sameString(req.headers.get("x-sso-code") || "", code)) return null;
  const { ip } = clientKeys(req);
  if (overLimit(`bad:${ip}`, 10)) return { status: 429, text: "접근 코드를 너무 많이 틀렸어. 10분 뒤에 다시 해 줘." };
  return { status: 401, text: "접근 코드가 필요해." };
}

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allowed = ["app://bundle", ...(env("SSO_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)];
  const self = new URL(req.url).origin;
  const dev = env("VERCEL_ENV") !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin);
  const ok = origin === self || allowed.includes(origin) || dev;
  return ok
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, x-sso-code, x-sso-device", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" }
    : {};
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(req) },
  });
