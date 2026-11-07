/* Vercel Function — 쏘 대화 API
   POST /api/sso  { turns:[{role,content,sig?}], mode?: "chat"|"quiz"|"tutor", lessonId?: "s1-g02-1" }
   GET  /api/sso  상태 확인 { ok, ai }

   환경 변수 (Vercel → Settings → Environment Variables)
   ANTHROPIC_API_KEY       필수. 브라우저로 절대 내려가지 않는다.
   SSO_ACCESS_CODE         권장. 설정하면 이 코드를 아는 기기만 사용 (학급·가정 코드)
   SSO_SIGNING_KEY         선택. 쏘 답 서명 키 (없으면 API 키에서 파생)
   SSO_MODEL               본 응답 모델 (기본 claude-sonnet-5-5)
   SSO_GUARD_MODEL         분류 모델 (기본 claude-haiku-5-5)
   SSO_ALLOWED_ORIGINS     추가로 허용할 출처 (쉼표). Mac 앱(app://bundle)과 같은 출처는 기본 허용
   SSO_RATE_PER_10MIN      기기당 10분 요청 한도 (기본 30)
   SSO_RATE_PER_IP_10MIN   IP당 10분 요청 한도 (기본 300 — 학교처럼 한 IP를 여럿이 쓰는 경우 고려)
   SSO_DAILY_LIMIT         인스턴스당 하루 요청 상한 (기본 3000)
*/
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { runSso, type LLM } from "../shared/pipeline";
import { LIMITS, type Turn } from "../shared/guard";
import { LESSON_ID, contextFromUnit } from "../shared/context";
import { UNITS } from "../shared/content.gen";

export const config = { maxDuration: 30 };

const API = "https://api.anthropic.com/v1/messages";
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

function anthropicLLM(key: string): LLM {
  const call = async (model: string, system: string, messages: Turn[], max_tokens: number, timeout: number) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, system, messages, max_tokens }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  };
  return {
    classify: (system, text) => call(env("SSO_GUARD_MODEL") || "claude-haiku-5-5", system, [{ role: "user", content: text }], 20, 8_000),
    reply: (system, turns, o) =>
      call(env("SSO_MODEL") || "claude-sonnet-5-5", system, turns, o?.short ? LIMITS.maxTutorTokens : LIMITS.maxReplyTokens, 20_000),
  };
}

/* ── 쏘 답 서명 — 클라이언트가 쏘의 말을 지어내 대화 기록에 끼우지 못하게 ── */
function signingKey() {
  return env("SSO_SIGNING_KEY") || createHash("sha256").update(`sso-sign:${env("ANTHROPIC_API_KEY") ?? "dev"}`).digest("hex");
}
export function sign(text: string) {
  return createHmac("sha256", signingKey()).update(text).digest("base64url").slice(0, 32);
}
function sameString(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ── 요청 한도 (인스턴스 메모리 기준, 최선 노력 — 학교 단위 운영은 Upstash 등 영속 저장소 권장) ── */
const buckets = new Map<string, number[]>();
let day = { key: "", n: 0 };
export function overLimit(key: string, max: number, now = Date.now(), win = 10 * 60 * 1000) {
  const list = (buckets.get(key) ?? []).filter((t) => now - t < win);
  const over = list.length >= max;
  if (!over) list.push(now);
  buckets.set(key, list);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (!v.some((t) => now - t < win)) buckets.delete(k);
  return over;
}
function overDaily(now = Date.now()) {
  const k = new Date(now).toISOString().slice(0, 10);
  if (day.key !== k) day = { key: k, n: 0 };
  day.n++;
  return day.n > Number(env("SSO_DAILY_LIMIT") || 3000);
}

function cors(req: Request): Record<string, string> {
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

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(req) },
  });

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export function GET(req: Request) {
  return json(req, { ok: true, ai: !!env("ANTHROPIC_API_KEY") });
}

export function POST(req: Request) {
  return handlePost(req);
}

/** 테스트에서 모델을 바꿔 끼우기 위해 분리 */
export async function handlePost(req: Request, llmOverride?: LLM) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const device = (req.headers.get("x-sso-device") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64) || "nodevice";

  // 접근 코드 — 틀린 시도는 IP당 10분 10회까지만
  const code = env("SSO_ACCESS_CODE");
  if (code && !sameString(req.headers.get("x-sso-code") || "", code)) {
    if (overLimit(`bad:${ip}`, 10)) return json(req, { kind: "error", text: "접근 코드를 너무 많이 틀렸어. 10분 뒤에 다시 해 줘." }, 429);
    return json(req, { kind: "error", text: "접근 코드가 필요해." }, 401);
  }
  if (overLimit(`ip:${ip}`, Number(env("SSO_RATE_PER_IP_10MIN") || 300)) || overLimit(`dev:${ip}:${device}`, Number(env("SSO_RATE_PER_10MIN") || 30)))
    return json(req, { kind: "error", text: "질문이 너무 많아. 10분 쉬었다가 다시 물어봐 줘." }, 429);
  if (overDaily()) return json(req, { kind: "error", text: "오늘은 쏘가 쉬는 시간이야. 내일 다시 만나!" }, 429);

  let body: { turns?: unknown; mode?: string; lessonId?: string };
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return json(req, { kind: "error", text: "요청이 너무 길어." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json(req, { kind: "error", text: "요청 형식이 잘못됐어." }, 400);
  }

  // 서명이 맞는 쏘의 말만 대화 기록으로 인정한다
  const verified = new Set<string>();
  if (Array.isArray(body.turns))
    for (const t of body.turns as { role?: string; content?: unknown; sig?: unknown }[])
      if (t?.role === "assistant" && typeof t.content === "string" && typeof t.sig === "string" && sameString(t.sig, sign(t.content)))
        verified.add(t.content.slice(0, LIMITS.maxTurnChars).trim());

  // 학습 문맥은 클라이언트가 보낸 글이 아니라 서버 번들의 콘텐츠에서 읽는다 (문맥 위조 방지)
  let context = null;
  if (typeof body.lessonId === "string" && LESSON_ID.test(body.lessonId)) {
    const unitId = body.lessonId.split("-").slice(0, 2).join("-");
    if (UNITS[unitId]) context = contextFromUnit(UNITS[unitId], body.lessonId);
  }

  // 키가 없어도 위기·유해 표현은 사전 필터에서 바로 안내한다
  const key = env("ANTHROPIC_API_KEY");
  const llm = llmOverride ?? (key ? anthropicLLM(key) : null);
  const noKey: LLM = { classify: async () => { throw new Error("no key"); }, reply: async () => { throw new Error("no key"); } };
  const mode = body.mode === "quiz" || body.mode === "tutor" ? body.mode : "chat";
  const res = await runSso({ turns: body.turns, mode, context, verifyAssistant: (t) => verified.has(t.content) }, llm ?? noKey);
  if (!llm && res.kind === "error" && res.category !== "invalid")
    return json(req, { kind: "error", text: "쏘 서버에 API 키가 설정되지 않았어." }, 503);
  if (res.kind !== "quiz" && res.kind !== "error") res.sig = sign(res.text);
  return json(req, res, res.kind === "error" && res.category === "invalid" ? 400 : 200);
}
