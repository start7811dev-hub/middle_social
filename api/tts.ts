/* Vercel Function — 쏘 목소리 (TTS)
   POST /api/tts  { text, sig? }  → audio/mpeg
   GET  /api/tts  → { enabled, provider }

   어떤 음성 엔진을 쓸지 환경 변수로 고른다 (키가 없으면 앱은 기기 음성으로 대체)
   SSO_TTS_PROVIDER = elevenlabs | clova | google | openai

   elevenlabs  ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID(필수 — 보이스 라이브러리나 Voice Design으로 만든 쏘 목소리),
               ELEVENLABS_MODEL(기본 eleven_multilingual_v2)
   clova       NCP_CLOVA_KEY_ID, NCP_CLOVA_KEY, CLOVA_SPEAKER(기본 vdain), CLOVA_SPEED(기본 0), CLOVA_PITCH(기본 0), CLOVA_EMOTION(기본 0)
   google      GOOGLE_TTS_API_KEY, GOOGLE_TTS_VOICE(기본 ko-KR-Neural2-A)
   openai      OPENAI_API_KEY, OPENAI_TTS_VOICE(기본 coral) — 2027-01-06 종료 예정 모델이라 비권장

   안전: 쏘 서버가 서명한 답(sig)이거나, 짧고 필터를 통과한 문장만 읽는다. 아무 글이나 읽어 주는 공개 TTS가 되지 않게.
*/
import { postfilter, prefilter } from "../shared/guard.js";
import { UNITS } from "../shared/content.gen.js";
import { checkAccess, clientKeys, cors, env, json, overLimit, sameString, sign } from "../shared/server.js";

export const config = { maxDuration: 20 };

const SSO_STYLE = "밝고 다정한 한국어 목소리. 친한 선배가 동생에게 설명하듯 또박또박, 너무 빠르지 않게, 과장된 연기 없이.";

type Synth = (text: string) => Promise<Response>;

export function provider(): { name: string; synth: Synth } | null {
  const p = (env("SSO_TTS_PROVIDER") || "").toLowerCase();
  const T = AbortSignal.timeout.bind(AbortSignal);
  if (p === "elevenlabs" && env("ELEVENLABS_API_KEY") && env("ELEVENLABS_VOICE_ID"))
    return {
      name: "elevenlabs",
      synth: (text) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env("ELEVENLABS_VOICE_ID")!)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": env("ELEVENLABS_API_KEY")!, "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({
            text, model_id: env("ELEVENLABS_MODEL") || "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true },
          }),
          signal: T(15000),
        }),
    };
  if (p === "clova" && env("NCP_CLOVA_KEY_ID") && env("NCP_CLOVA_KEY"))
    return {
      name: "clova",
      synth: (text) =>
        fetch("https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts", {
          method: "POST",
          headers: {
            "X-NCP-APIGW-API-KEY-ID": env("NCP_CLOVA_KEY_ID")!, "X-NCP-APIGW-API-KEY": env("NCP_CLOVA_KEY")!,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            speaker: env("CLOVA_SPEAKER") || "vdain", text, format: "mp3", volume: "0",
            speed: env("CLOVA_SPEED") || "0", pitch: env("CLOVA_PITCH") || "0", emotion: env("CLOVA_EMOTION") || "0",
          }),
          signal: T(15000),
        }),
    };
  if (p === "google" && env("GOOGLE_TTS_API_KEY"))
    return {
      name: "google",
      synth: async (text) => {
        const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env("GOOGLE_TTS_API_KEY")!)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            input: { text }, voice: { languageCode: "ko-KR", name: env("GOOGLE_TTS_VOICE") || "ko-KR-Neural2-A" },
            audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
          }),
          signal: T(15000),
        });
        if (!r.ok) return r;
        const j = (await r.json()) as { audioContent?: string };
        return new Response(Buffer.from(j.audioContent ?? "", "base64"), { status: 200, headers: { "content-type": "audio/mpeg" } });
      },
    };
  if (p === "openai" && env("OPENAI_API_KEY"))
    return {
      name: "openai",
      synth: (text) =>
        fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { authorization: `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: env("OPENAI_TTS_VOICE") || "coral", input: text, instructions: SSO_STYLE, response_format: "mp3" }),
          signal: T(15000),
        }),
    };
  return null;
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export function GET(req: Request) {
  const p = provider();
  return json(req, { enabled: !!p, provider: p?.name ?? null });
}

export async function POST(req: Request) {
  const denied = checkAccess(req);
  if (denied) return json(req, { error: denied.text }, denied.status);
  const p = provider();
  if (!p) return json(req, { error: "쏘 목소리가 설정되지 않았어." }, 503);

  const { ip, device } = clientKeys(req);
  if (overLimit(`tts-ip:${ip}`, Number(env("SSO_TTS_PER_IP_10MIN") || 400)) || overLimit(`tts-dev:${ip}:${device}`, Number(env("SSO_TTS_PER_10MIN") || 60)))
    return json(req, { error: "잠깐 쉬었다가 다시 들려줄게." }, 429);

  let body: { text?: unknown; sig?: unknown; lessonId?: unknown; section?: unknown };
  try { body = JSON.parse((await req.text()).slice(0, 4000)); } catch { return json(req, { error: "요청 형식이 잘못됐어." }, 400); }
  // 본문 듣기: 글은 서버가 가진 교과 내용에서 직접 꺼낸다 (클라이언트가 보낸 글을 읽지 않음)
  const section = sectionText(body.lessonId, body.section);
  const text = section ?? (typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "");
  if (!text) return json(req, { error: "읽을 글이 없어." }, 400);

  // 교과 본문, 서명된 쏘의 답(최대 700자), 또는 앱의 짧은 고정 문장(최대 160자, 필터 통과)만
  const signed = typeof body.sig === "string" && sameString(body.sig, sign(text));
  const ok = section ? true : signed ? text.length <= 700 : text.length <= 160 && prefilter(text) === null && postfilter(text).ok;
  if (!ok) return json(req, { error: "이 글은 읽을 수 없어." }, 403);

  try {
    const r = await p.synth(text);
    if (!r.ok) return json(req, { error: "목소리를 만들지 못했어." }, 502);
    return new Response(await r.arrayBuffer(), {
      status: 200,
      headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", ...cors(req) },
    });
  } catch {
    return json(req, { error: "목소리를 만들지 못했어." }, 502);
  }
}

/** 교과 본문 한 섹션 (서버 번들에 있는 콘텐츠만) */
export function sectionText(lessonId: unknown, section: unknown): string | null {
  if (typeof lessonId !== "string" || !/^[a-z0-9-]{3,40}$/.test(lessonId) || typeof section !== "number" || !Number.isInteger(section)) return null;
  const unit = UNITS[lessonId.replace(/-\d+$/, "")];
  const sec = unit?.lessons?.find((l: { id: string }) => l.id === lessonId)?.sections?.[section];
  if (!sec?.text) return null;
  return `${sec.title}. ${sec.text}`.replace(/\s+/g, " ").trim().slice(0, 1500);
}
