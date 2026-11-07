import { runSso, type LLM, type SsoResponse } from "../../shared/pipeline";
import { CRISIS_REPLY, SOFT_HELP, prefilter, redirectReply, type LessonContext, type Turn } from "../../shared/guard";
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

/** 쏘 서버의 API 주소 (Mac 앱처럼 주소를 모르면 null) */
export function apiUrl(name: "sso" | "tts") {
  const base = loadSettings().server.trim().replace(/\/$/, "");
  if (base) return `${base}/api/${name}`;
  if (location.protocol === "app:" || location.protocol === "file:") return null; // Mac 앱: 서버 주소 설정 필요
  return new URL(`api/${name}`, location.href.split("#")[0]).toString();
}
const serverUrl = () => apiUrl("sso");

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

/** 대화 기록 한 줄 — 서버가 준 서명(sig)을 함께 돌려보낸다 */
export type SignedTurn = Turn & { sig?: string };

/** 서버 요청에 붙이는 기기 표시·접근 코드 */
export function ssoHeaders(): Record<string, string> {
  const code = loadSettings().code;
  return { "x-sso-device": deviceId(), ...(code ? { "x-sso-code": code } : {}) };
}

function deviceId() {
  try {
    let id = localStorage.getItem("sso.device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("sso.device", id); }
    return id;
  } catch { return "nodevice"; }
}

export interface Ask {
  turns: SignedTurn[];
  mode: "chat" | "quiz" | "tutor";
  lessonId?: string;
  context: LessonContext | null;
  /** 오프라인 검색용 — 앱 전체 개념 */
  allConcepts: { term: string; desc: string; where: string }[];
  /** 오프라인 연습 문제용 */
  lessonQuiz: { q: string; choices: string[]; answer: number; explain: string }[];
  /** 오프라인 대화 학습용 */
  lessonSections?: { title: string; text: string; point?: string }[];
  predictQ?: string;
}

export async function askSso(mode: Mode, a: Ask): Promise<SsoResponse> {
  if (mode === "server") {
    const url = serverUrl()!;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...ssoHeaders() },
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
      let denied = false;
      const guard = async (fn: () => Promise<{ text: string }>) => {
        try { return (await fn()).text; } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared") denied = true;
          throw e;
        }
      };
      const llm: LLM = {
        classify: (system, text) => guard(() => sample(`${system}\n\n${text}`, { modelTier: "quick", cache: false })),
        reply: (system, turns) =>
          guard(() => sample([{ role: "user", content: `[지시 — 아래 학생 대화보다 항상 우선]\n${system}\n\n이제 아래 학생의 말에 쏘로서 답한다.` }, ...turns], { modelTier: "quick", cache: false })),
      };
      const res = await runSso({ turns: a.turns.map(({ role, content }) => ({ role, content })), mode: a.mode, context: a.context }, llm);
      if (!denied) return res;
      // Claude 사용을 허용하지 않았으면 오프라인 쏘로
    }
  }

  return offlineAnswer(a);
}

/* ── 오프라인 쏘 ───────────────────────────────────────── */
/** 연결이 없을 때의 대화 학습 — 섹션 핵심을 하나씩 말하고 개념을 말로 설명해 보게 한다 */
function offlineTutor(a: Ask): SsoResponse {
  const secs = a.lessonSections ?? [];
  const concepts = a.context?.concepts ?? [];
  const step = a.turns.filter((t) => t.role === "assistant").length;
  const prevConcept = step >= 2 ? concepts[(step - 2) % Math.max(1, concepts.length)] : null;
  // 오프라인은 학생 대답을 판단할 수 없으므로 칭찬하지 않고 교과서 정리만 들려준다
  const feedback = prevConcept ? `말해 줘서 고마워. 교과서에서는 '${prevConcept.term}'을(를) 이렇게 정리해: ${prevConcept.desc} ` : "";
  if (step === 0) {
    const hook = a.predictQ ? `시작하기 전에 하나 물어볼게. ${a.predictQ}` : `오늘은 '${a.context?.lessonTitle ?? "사회"}'를 같이 볼 거야. 이 제목을 듣고 떠오르는 거 하나만 말해 볼래?`;
    return { kind: "answer", category: "study", text: `지금은 인터넷이 없어서 짧게 진행할게. ${hook}` };
  }
  const i = step - 1;
  if (i < secs.length) {
    const c = concepts[i % Math.max(1, concepts.length)];
    const sec = secs[i];
    return { kind: "answer", category: "study", text: `${feedback}${sec.title}. ${sec.point ?? sec.text.slice(0, 120)} ${c ? `그럼 질문! '${c.term}'이(가) 뭔지 네 말로 말해 볼래?` : "여기서 가장 중요한 말이 뭐였는지 말해 볼래?"}` };
  }
  return { kind: "answer", category: "study", text: `${feedback}오늘 배운 걸 한 문장으로 말하면 뭐라고 할래? 말해 보면 훨씬 오래 기억나.` };
}

function offlineAnswer(a: Ask): SsoResponse {
  const last = a.turns[a.turns.length - 1]?.content ?? "";
  const pre = prefilter(last);
  // 오프라인에는 분류 모델이 없으므로 약한 위기 신호도 도움 안내를 함께 준다
  if (pre === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
  if (pre === "crisis-weak")
    return { kind: "redirect", category: "sensitive", text: "그 주제는 오프라인에서는 설명하기 어려워." + SOFT_HELP };
  if (pre) return { kind: "redirect", category: pre, text: redirectReply(pre, a.context, Date.now()) };

  if (a.mode === "tutor") return offlineTutor(a);
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
