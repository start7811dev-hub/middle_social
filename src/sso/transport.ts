import { runSso, type LLM, type SsoResponse } from "../../shared/pipeline";
import { CRISIS_REPLY, prefilter, redirectReply, type LessonContext, type Turn } from "../../shared/guard";
import { loadSettings } from "./bus";

/* 쏘가 대답하는 길 — 가능한 것부터 순서대로
   1) server  : Vercel /api/sso (Claude API, 서버에 키 보관) — 정식 경로
   2) sample  : claude.ai 아티팩트 안에서 열었을 때, 보는 사람의 Claude로 같은 안전 파이프라인 실행
   3) offline : 연결이 없을 때 — 안전 필터 + 앱 콘텐츠에서 개념 찾기 */
export type Mode = "server" | "sample" | "offline";

declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

type SampleFn = ((input: string | Turn[], opts?: Record<string, unknown>) => Promise<{ text: string }>) | null;

function serverUrl() {
  const base = loadSettings().server.trim().replace(/\/$/, "");
  if (base) return `${base}/api/sso`;
  if (location.protocol === "app:" || location.protocol === "file:") return null; // Mac 앱: 서버 주소 설정 필요
  return new URL("api/sso", location.href.split("#")[0]).toString();
}

let sampleP: Promise<SampleFn> | null = null;
function getSample(): Promise<SampleFn> {
  if (!sampleP) {
    sampleP = (async () => {
      if (!window.claude?.use) return null;
      try { return (await window.claude.use("sample")) as SampleFn; } catch { return null; }
    })();
  }
  return sampleP;
}

export async function detectMode(): Promise<Mode> {
  const url = serverUrl();
  if (url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const j = await r.json();
        if (j.ok && j.ai) return "server";
      }
    } catch { /* 다음 경로 */ }
  }
  if (await getSample()) return "sample";
  return "offline";
}

export interface Ask {
  turns: Turn[];
  mode: "chat" | "quiz";
  lessonId?: string;
  context: LessonContext | null;
  /** 오프라인 검색용 — 앱 전체 개념 */
  allConcepts: { term: string; desc: string; where: string }[];
  /** 오프라인 연습 문제용 */
  lessonQuiz: { q: string; choices: string[]; answer: number; explain: string }[];
}

export async function askSso(mode: Mode, a: Ask): Promise<SsoResponse> {
  if (mode === "server") {
    const url = serverUrl()!;
    const s = loadSettings();
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(s.code ? { "x-sso-code": s.code } : {}) },
        body: JSON.stringify({ turns: a.turns, mode: a.mode, lessonId: a.lessonId }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await r.json();
      return { category: "study", ...j } as SsoResponse;
    } catch {
      return { kind: "error", category: "study", text: "쏘 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." };
    }
  }

  if (mode === "sample") {
    const sample = await getSample();
    if (sample) {
      const llm: LLM = {
        classify: async (system, text) =>
          (await sample(`${system}\n\n---\n${text}`, { modelTier: "quick", cache: false })).text,
        reply: async (system, turns) =>
          (await sample([{ role: "user", content: `[지시]\n${system}\n\n이제 아래 학생의 말에 쏘로서 답한다.` }, ...turns], { modelTier: "quick", cache: false })).text,
      };
      try {
        return await runSso({ turns: a.turns, mode: a.mode, context: a.context }, llm);
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code !== "not_granted" && code !== "sampling_disabled") throw e;
        // 허용하지 않았으면 오프라인으로
      }
    }
  }

  return offlineAnswer(a);
}

/* ── 오프라인 쏘 ───────────────────────────────────────── */
function offlineAnswer(a: Ask): SsoResponse {
  const last = a.turns[a.turns.length - 1]?.content ?? "";
  const pre = prefilter(last);
  if (pre === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
  if (pre) return { kind: "redirect", category: pre, text: redirectReply(pre, a.context, Date.now()) };

  if (a.mode === "quiz") {
    const q = a.lessonQuiz[Math.floor(Math.random() * a.lessonQuiz.length)];
    if (q) return { kind: "quiz", category: "study", text: q.q, quiz: q };
    return { kind: "answer", category: "study", text: "이 학습에는 아직 연습 문제가 없어요. 다른 학습에서 눌러 볼래요?" };
  }

  // 질문 속 낱말이 들어간 개념을 찾는다 (현재 학습 우선)
  const words = last.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2)
    .map((w) => w.replace(/(이|가|은|는|을|를|의|에|에서|이랑|랑|와|과|야|이야|뭐야|뭐|란|이란|가요|인가요|해줘|알려줘)$/u, ""))
    .filter((w) => w.length >= 2);
  const local = (a.context?.concepts ?? []).map((c) => ({ ...c, where: a.context!.lessonTitle }));
  const pool = [...local, ...a.allConcepts];
  const hit = pool.find((c) => words.some((w) => c.term.includes(w) || w.includes(c.term)));
  if (hit) {
    return {
      kind: "answer", category: "study",
      text: `'${hit.term}'은(는) ${hit.desc} (${hit.where}에서 배워요) 지금은 오프라인이라 교과 내용 안에서만 찾아 줄 수 있어요. 이 개념을 내 말로 한 문장으로 바꿔 볼래요?`,
    };
  }
  return {
    kind: "answer", category: "study",
    text: "지금은 인터넷 연결이 없어서 앱 안의 개념만 찾아 줄 수 있어요. 궁금한 개념 이름을 넣어 보거나, '연습 문제'를 눌러 보세요.",
  };
}
