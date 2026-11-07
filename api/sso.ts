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
import { runSso, type LLM } from "../shared/pipeline.js";
import { LIMITS, trimReply, type Turn } from "../shared/guard.js";
import { LESSON_ID, contextFromUnit } from "../shared/context.js";
import { UNITS } from "../shared/content.gen.js";
import { checkAccess, clientKeys, cors, env, json, overLimit, sameString, sign } from "../shared/server.js";
export { sign } from "../shared/server.js";

export const config = { maxDuration: 30 };

const API = "https://api.anthropic.com/v1/messages";

function anthropicLLM(key: string): LLM {
  const call = async (model: string, system: string, messages: Turn[], max_tokens: number, timeout: number) => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, system, messages, max_tokens }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    // 토큰 한도에 걸려 끊겼으면 마지막 완성 문장까지만
    return j.stop_reason === "max_tokens" && text.length > 20 ? trimReply(text, text.length - 1) : text;
  };
  return {
    classify: (system, text) => call(env("SSO_GUARD_MODEL") || "claude-haiku-5-5", system, [{ role: "user", content: text }], 20, 8_000),
    reply: (system, turns, o) =>
      call(env("SSO_MODEL") || "claude-sonnet-5-5", system, turns, o?.short ? LIMITS.maxTutorTokens : LIMITS.maxReplyTokens, 20_000),
  };
}

let day = { key: "", n: 0 };
function overDaily(now = Date.now()) {
  const k = new Date(now).toISOString().slice(0, 10);
  if (day.key !== k) day = { key: k, n: 0 };
  day.n++;
  return day.n > Number(env("SSO_DAILY_LIMIT") || 3000);
}

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
  const { ip, device } = clientKeys(req);

  // 접근 코드 — 틀린 시도는 IP당 10분 10회까지만
  const denied = checkAccess(req);
  if (denied) return json(req, { kind: "error", text: denied.text }, denied.status);
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
