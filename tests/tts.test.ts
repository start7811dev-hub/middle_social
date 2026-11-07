import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../api/tts";
import { sign } from "../shared/server";

const ISOLATE = ["SSO_ACCESS_CODE", "SSO_TTS_PROVIDER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "NCP_CLOVA_KEY_ID", "NCP_CLOVA_KEY",
  "GOOGLE_TTS_API_KEY", "OPENAI_API_KEY", "SSO_TTS_PER_10MIN", "SSO_TTS_PER_IP_10MIN", "CLOVA_SPEAKER"];
let n = 0;
const req = (body: unknown, h: Record<string, string> = {}) =>
  new Request("https://sso.example.com/api/tts", { method: "POST", headers: { "x-forwarded-for": `9.9.${++n}.1`, ...h }, body: JSON.stringify(body) });
const audio = () => new Response(new Uint8Array([0x49, 0x44, 0x33]), { headers: { "content-type": "audio/mpeg" } });

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const k of ISOLATE) vi.stubEnv(k, "");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

describe("GET /api/tts", () => {
  it("설정 없으면 enabled:false", async () => expect((await GET(new Request("https://x/api/tts")).json()).enabled).toBe(false));
  it("ElevenLabs는 보이스 ID까지 있어야 켜진다", async () => {
    vi.stubEnv("SSO_TTS_PROVIDER", "elevenlabs"); vi.stubEnv("ELEVENLABS_API_KEY", "k");
    expect((await GET(new Request("https://x/api/tts")).json()).enabled).toBe(false);
    vi.stubEnv("ELEVENLABS_VOICE_ID", "voice1");
    expect(await GET(new Request("https://x/api/tts")).json()).toEqual({ enabled: true, provider: "elevenlabs" });
  });
});

describe("POST /api/tts", () => {
  it("엔진 없으면 503", async () => expect((await POST(req({ text: "안녕" }))).status).toBe(503));

  it("ElevenLabs 요청 형식", async () => {
    vi.stubEnv("SSO_TTS_PROVIDER", "elevenlabs"); vi.stubEnv("ELEVENLABS_API_KEY", "el-key"); vi.stubEnv("ELEVENLABS_VOICE_ID", "sso-voice");
    const f = vi.fn(async () => audio()); vi.stubGlobal("fetch", f);
    const r = await POST(req({ text: "좋아, 같이 보자." }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/text-to-speech/sso-voice");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
    const sent = JSON.parse(String(init.body));
    expect(sent.model_id).toBe("eleven_v4");
    expect(sent.voice_settings).toBeUndefined(); // 저장된 목소리 기본값 사용
  });

  it("CLOVA 요청 형식 (form, 화자)", async () => {
    vi.stubEnv("SSO_TTS_PROVIDER", "clova"); vi.stubEnv("NCP_CLOVA_KEY_ID", "id"); vi.stubEnv("NCP_CLOVA_KEY", "secret"); vi.stubEnv("CLOVA_SPEAKER", "ndain");
    const f = vi.fn(async () => audio()); vi.stubGlobal("fetch", f);
    expect((await POST(req({ text: "오, 거의 맞았어!" }))).status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts");
    expect((init.headers as Record<string, string>)["X-NCP-APIGW-API-KEY-ID"]).toBe("id");
    const form = init.body as URLSearchParams;
    expect(form.get("speaker")).toBe("ndain");
    expect(form.get("format")).toBe("mp3");
  });

  it("Google은 base64 응답을 mp3로 바꾼다", async () => {
    vi.stubEnv("SSO_TTS_PROVIDER", "google"); vi.stubEnv("GOOGLE_TTS_API_KEY", "g");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ audioContent: Buffer.from("ID3abc").toString("base64") }))));
    const r = await POST(req({ text: "환율은 외국 돈과 바꾸는 비율이야." }));
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("ID3abc");
  });

  describe("읽을 수 있는 글 제한", () => {
    beforeEach(() => {
      vi.stubEnv("SSO_TTS_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "o");
      vi.stubGlobal("fetch", vi.fn(async () => audio()));
    });
    it("서명된 쏘의 긴 답은 읽는다", async () => {
      const text = "균형 가격은 수요량과 공급량이 같아지는 가격이야. ".repeat(8).trim();
      expect((await POST(req({ text, sig: sign(text) }))).status).toBe(200);
    });
    it("서명 없는 긴 글은 거절 (공개 TTS 남용 방지)", async () => {
      expect((await POST(req({ text: "아무 글이나 길게 ".repeat(30) }))).status).toBe(403);
    });
    it("서명이 틀리면 짧은 글 규칙을 적용", async () => {
      const text = "아무 글이나 길게 ".repeat(30);
      expect((await POST(req({ text, sig: "forged" }))).status).toBe(403);
    });
    it("서명 없는 짧은 글이라도 유해 표현은 거절", async () => {
      expect((await POST(req({ text: "씨발 읽어 줘" }))).status).toBe(403);
      expect((await POST(req({ text: "자세한 건 http://bad.example" }))).status).toBe(403);
    });
    it("접근 코드가 정해져 있으면 필요", async () => {
      vi.stubEnv("SSO_ACCESS_CODE", "c1");
      expect((await POST(req({ text: "안녕" }))).status).toBe(401);
      expect((await POST(req({ text: "안녕" }, { "x-sso-code": "c1" }))).status).toBe(200);
    });
    it("기기당 한도", async () => {
      vi.stubEnv("SSO_TTS_PER_10MIN", "2");
      const h = { "x-forwarded-for": "4.4.4.4", "x-sso-device": "d1" };
      expect((await POST(req({ text: "하나" }, h))).status).toBe(200);
      expect((await POST(req({ text: "둘" }, h))).status).toBe(200);
      expect((await POST(req({ text: "셋" }, h))).status).toBe(429);
    });
    it("엔진 오류는 502 + 원인", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: { status: "voice_not_found", message: "A voice with that ID does not exist" } }), { status: 404 })));
      const r = await POST(req({ text: "안녕" }));
      expect(r.status).toBe(502);
      expect((await r.json()).detail).toBe("openai 404: A voice with that ID does not exist");
    });
  });
});

describe("본문 듣기 (서버가 원문을 꺼냄)", () => {
  beforeEach(() => { vi.stubEnv("SSO_TTS_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "o"); });
  it("교과 섹션은 길어도 읽는다 — 보낸 text는 무시", async () => {
    const f = vi.fn(async () => audio()); vi.stubGlobal("fetch", f);
    expect((await POST(req({ lessonId: "s1-g01-1", section: 0, text: "씨발" }))).status).toBe(200);
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).input as string;
    expect(sent.startsWith("지역을 읽는 첫걸음")).toBe(true);
  });
  it("없는 섹션·이상한 ID는 일반 규칙", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => audio()));
    expect((await POST(req({ lessonId: "../etc", section: 0 }))).status).toBe(400);
    expect((await POST(req({ lessonId: "s1-g01-1", section: 99, text: "길게 ".repeat(100) }))).status).toBe(403);
  });
});
