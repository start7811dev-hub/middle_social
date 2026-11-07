/* Vercel Function — 쏘 대화 API
   POST /api/sso  { turns:[{role,content}], mode?: "chat"|"quiz", lessonId?: "s1-g02-1" }
   GET  /api/sso  상태 확인 { ok, ai, accessCode }

   환경 변수 (Vercel → Settings → Environment Variables)
   ANTHROPIC_API_KEY     필수. 브라우저로 절대 내려가지 않는다.
   SSO_MODEL             본 응답 모델 (기본 claude-sonnet-5-5)
   SSO_GUARD_MODEL       분류 모델 (기본 claude-haiku-5-5)
   SSO_ACCESS_CODE       설정하면 이 코드를 아는 기기만 사용 (학급·가정 코드)
   SSO_ALLOWED_ORIGINS   추가로 허용할 출처 (쉼표). Mac 앱(app://bundle)과 같은 출처는 기본 허용
   SSO_RATE_PER_10MIN    기기(IP)당 10분 요청 한도 (기본 20)
*/
import { runSso, type LLM } from "../shared/pipeline";
import { LIMITS, type Turn } from "../shared/guard";
import { LESSON_ID, contextFromUnit } from "../shared/context";

export const config = { maxDuration: 30 };

const API = "https://api.anthropic.com/v1/messages";
const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

function anthropicLLM(key: string): LLM {
  const call = async (model: string, system: string, messages: Turn[], max_tokens: number) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, system, messages, max_tokens }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  };
  return {
    classify: (system, text) => call(env("SSO_GUARD_MODEL") || "claude-haiku-5-5", system, [{ role: "user", content: text }], 20),
    reply: (system, turns) => call(env("SSO_MODEL") || "claude-sonnet-5-5", system, turns, LIMITS.maxReplyTokens),
  };
}

/* ── 기기당 요청 한도 (인스턴스 메모리 기준, 최선 노력) ── */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now()) {
  const max = Number(env("SSO_RATE_PER_10MIN") || 20);
  const win = 10 * 60 * 1000;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < win);
  if (list.length >= max) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allowed = ["app://bundle", ...(env("SSO_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)];
  const self = new URL(req.url).origin;
  const ok = origin === self || allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return ok
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, x-sso-code", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "origin" }
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
  return json(req, { ok: true, ai: !!env("ANTHROPIC_API_KEY"), accessCode: !!env("SSO_ACCESS_CODE") });
}

export function POST(req: Request) {
  return handlePost(req);
}

/** 테스트에서 모델을 바꿔 끼우기 위해 분리 */
export async function handlePost(req: Request, llmOverride?: LLM) {
  const code = env("SSO_ACCESS_CODE");
  if (code && req.headers.get("x-sso-code") !== code) return json(req, { kind: "error", text: "접근 코드가 필요해요." }, 401);
  const key = env("ANTHROPIC_API_KEY");

  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (rateLimited(ip)) return json(req, { kind: "error", text: "질문이 너무 많아요. 10분 쉬었다가 다시 물어봐 주세요." }, 429);

  let body: { turns?: unknown; mode?: string; lessonId?: string };
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return json(req, { kind: "error", text: "요청이 너무 길어요." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json(req, { kind: "error", text: "요청 형식이 잘못됐어요." }, 400);
  }

  // 학습 문맥은 클라이언트가 보낸 글이 아니라 서버가 자기 콘텐츠에서 직접 읽는다 (문맥 위조 방지)
  let context = null;
  if (typeof body.lessonId === "string" && LESSON_ID.test(body.lessonId)) {
    const unitId = body.lessonId.split("-").slice(0, 2).join("-");
    try {
      const r = await fetch(new URL(`/content/units/${unitId}.json`, req.url), { signal: AbortSignal.timeout(5000) });
      if (r.ok) context = contextFromUnit(await r.json(), body.lessonId);
    } catch { /* 문맥 없이 진행 */ }
  }

  // 키가 없어도 위기·유해 표현은 사전 필터에서 바로 안내한다
  const llm = llmOverride ?? (key ? anthropicLLM(key) : null);
  const noKey: LLM = { classify: async () => { throw new Error("no key"); }, reply: async () => { throw new Error("no key"); } };
  const res = await runSso({ turns: body.turns, mode: body.mode === "quiz" ? "quiz" : "chat", context }, llm ?? noKey);
  if (!llm && res.kind === "error" && res.category !== "invalid")
    return json(req, { kind: "error", text: "쏘 서버에 API 키가 설정되지 않았어요." }, 503);
  return json(req, res, res.kind === "error" && res.category === "invalid" ? 400 : 200);
}
