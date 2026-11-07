import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePost, GET } from "../api/sso";
import { CRISIS_REPLY } from "../shared/guard";
import type { LLM } from "../shared/pipeline";

const mk = (cat: string, reply = "균형 가격은 수요량과 공급량이 같아지는 가격이에요. 그럼 초과 수요일 때 가격은 어떻게 될까요?") => {
  const llm = { classify: vi.fn(async () => `{"c":"${cat}"}`), reply: vi.fn(async () => reply) } satisfies LLM;
  return llm;
};
let n = 0;
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://sso.example.com/api/sso", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++n}`, ...headers },
    body: JSON.stringify(body),
  });
const ask = (q: string) => ({ turns: [{ role: "user", content: q }] });

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
});

describe("POST /api/sso", () => {
  it("학습 질문 → 분류 후 본 응답", async () => {
    const llm = mk("study");
    const r = await (await handlePost(req(ask("균형 가격이 뭐야?")), llm)).json();
    expect(r.kind).toBe("answer");
    expect(llm.classify).toHaveBeenCalledOnce();
    expect(llm.reply).toHaveBeenCalledOnce();
    // 시스템 프롬프트에 절대 규칙이 들어 있어야 한다
    expect((llm.reply.mock.calls[0] as unknown[])[0]).toContain("절대 규칙");
  });

  it("위기 표현 → 모델 호출 없이 도움 안내", async () => {
    const llm = mk("study");
    const r = await (await handlePost(req(ask("요즘 죽고 싶어")), llm)).json();
    expect(r.kind).toBe("crisis");
    expect(r.text).toBe(CRISIS_REPLY);
    expect(r.text).toContain("1388");
    expect(llm.classify).not.toHaveBeenCalled();
    expect(llm.reply).not.toHaveBeenCalled();
  });

  it("분류기가 crisis를 잡으면 도움 안내", async () => {
    const llm = mk("crisis");
    const r = await (await handlePost(req(ask("요즘 너무 힘들어서 아무것도 하기 싫어")), llm)).json();
    expect(r.kind).toBe("crisis");
    expect(llm.reply).not.toHaveBeenCalled();
  });

  it.each(["offtopic", "sensitive", "injection", "pii"])("분류 %s → 본 응답 없이 학습 전환", async (cat) => {
    const llm = mk(cat);
    const r = await (await handlePost(req(ask("롤 티어 올리는 법 알려줘")), llm)).json();
    expect(r.kind).toBe("redirect");
    expect(llm.reply).not.toHaveBeenCalled();
  });

  it("모델 답에 금지 표현이 섞이면 교체", async () => {
    const llm = mk("study", "자세한 내용은 https://bad.example 에서 보세요");
    const r = await (await handlePost(req(ask("세계화가 뭐야?")), llm)).json();
    expect(r.kind).toBe("redirect");
    expect(r.text).not.toContain("http");
  });

  it("분류기 실패 시 본 응답을 부르지 않는다", async () => {
    const llm = { classify: vi.fn(async () => { throw new Error("down"); }), reply: vi.fn(async () => "x") };
    const r = await (await handlePost(req(ask("유럽 연합이 뭐야?")), llm)).json();
    expect(r.kind).toBe("error");
    expect(llm.reply).not.toHaveBeenCalled();
  });

  it("300자 초과 → 400", async () => {
    const res = await handlePost(req(ask("가".repeat(301))), mk("study"));
    expect(res.status).toBe(400);
  });

  it("깨진 JSON → 400", async () => {
    const r = new Request("https://sso.example.com/api/sso", { method: "POST", body: "{nope", headers: { "x-forwarded-for": "9.9.9.9" } });
    expect((await handlePost(r, mk("study"))).status).toBe(400);
  });

  it("접근 코드 설정 시 코드 없으면 401", async () => {
    vi.stubEnv("SSO_ACCESS_CODE", "class-3");
    expect((await handlePost(req(ask("지역화가 뭐야?")), mk("study"))).status).toBe(401);
    expect((await handlePost(req(ask("지역화가 뭐야?"), { "x-sso-code": "class-3" }), mk("study"))).status).toBe(200);
  });

  it("같은 기기 과다 요청 → 429", async () => {
    vi.stubEnv("SSO_RATE_PER_10MIN", "3");
    const h = { "x-forwarded-for": "7.7.7.7" };
    const llm = mk("study");
    for (let i = 0; i < 3; i++) expect((await handlePost(req(ask("환율이 뭐야?"), h), llm)).status).toBe(200);
    expect((await handlePost(req(ask("환율이 뭐야?"), h), llm)).status).toBe(429);
  });

  it("API 키 없으면 503", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { POST } = await import("../api/sso");
    expect((await POST(req(ask("무역이 뭐야?")))).status).toBe(503);
  });

  it("API 키가 없어도 위기 표현에는 도움 안내", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { POST } = await import("../api/sso");
    const r = await (await POST(req(ask("죽고 싶어")))).json();
    expect(r.kind).toBe("crisis");
  });

  it("학습 문맥은 서버가 자기 콘텐츠에서 읽는다", async () => {
    const unit = { title: "시장과 가격", lessons: [{ id: "s2-s09-2", title: "수요·공급과 가격 결정", standard: { text: "성취기준" }, concepts: [{ term: "균형 가격", desc: "같아지는 가격" }], sections: [] }] };
    const f = vi.fn(async () => new Response(JSON.stringify(unit)));
    vi.stubGlobal("fetch", f);
    const llm = mk("study");
    await handlePost(req({ ...ask("이거 쉽게 설명해줘"), lessonId: "s2-s09-2" }), llm);
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe("https://sso.example.com/content/units/s2-s09.json");
    expect((llm.reply.mock.calls[0] as unknown[])[0]).toContain("균형 가격");
  });

  it("잘못된 lessonId는 무시(경로 조작 방지)", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await handlePost(req({ ...ask("설명해줘"), lessonId: "../../etc/passwd" }), mk("study"));
    expect(f).not.toHaveBeenCalled();
  });

  it("연습 문제 모드 → 검증된 4지선다", async () => {
    const llm = mk("study", '{"q":"균형 가격은?","choices":["a","b","c","d"],"answer":1,"explain":"이유"}');
    const r = await (await handlePost(req({ ...ask("새 문제"), mode: "quiz" }), llm)).json();
    expect(r.kind).toBe("quiz");
    expect(r.quiz.choices).toHaveLength(4);
  });
});

describe("튜터 모드", () => {
  it("짧은 대답도 분류를 거쳐 튜터 프롬프트로 답한다", async () => {
    const llm = mk("study", "좋아, 거의 맞았어! 그럼 가격이 오르면 수요량은 어떻게 될까?");
    const r = await (await handlePost(req({ turns: [{ role: "assistant", content: "가격이 내리면 어떻게 될까?" }, { role: "user", content: "더 많이 사" }].slice(1), mode: "tutor" }), llm)).json();
    expect(r.kind).toBe("answer");
    expect((llm.reply.mock.calls[0] as unknown[])[0]).toContain("대화 학습 모드");
  });
  it("튜터 모드에서도 위기 표현은 즉시 안내", async () => {
    const llm = mk("study");
    const r = await (await handlePost(req({ ...ask("그냥 다 끝내고 싶어"), mode: "tutor" }), llm)).json();
    expect(r.kind).toBe("crisis");
    expect(llm.reply).not.toHaveBeenCalled();
  });
  it("쏘의 말투 규칙(반말·비하 금지)이 들어간다", async () => {
    const llm = mk("study");
    await handlePost(req(ask("세계화가 뭐야?")), llm);
    expect((llm.reply.mock.calls[0] as unknown[])[0]).toContain("다정한 반말");
  });
});

describe("GET /api/sso", () => {
  it("상태 응답", async () => {
    const r = await (GET(new Request("https://sso.example.com/api/sso"))).json();
    expect(r.ok).toBe(true);
  });
  it("Mac 앱 출처는 CORS 허용, 모르는 출처는 불허", () => {
    const a = GET(new Request("https://sso.example.com/api/sso", { headers: { origin: "app://bundle" } }));
    expect(a.headers.get("access-control-allow-origin")).toBe("app://bundle");
    const b = GET(new Request("https://sso.example.com/api/sso", { headers: { origin: "https://evil.example" } }));
    expect(b.headers.get("access-control-allow-origin")).toBeNull();
  });
});
