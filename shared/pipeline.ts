import {
  CLASSIFIER_SYSTEM, CRISIS_REPLY, FALLBACK_REPLY, parseCategory, parseQuiz, postfilter, prefilter,
  quizPrompt, redirectReply, sanitizeTurns, ssoSystemPrompt,
  type GuardCategory, type LessonContext, type QuizItem, type Turn,
} from "./guard";

/** 모델 호출부만 바꿔 끼운다 — 서버는 Anthropic API, 아티팩트는 sample, 테스트는 모의 함수. */
export interface LLM {
  /** 분류: 빠른 모델, 짧은 출력 */
  classify(system: string, text: string): Promise<string>;
  /** 본 응답 */
  reply(system: string, turns: Turn[]): Promise<string>;
}

export interface SsoRequest { turns: unknown; mode?: "chat" | "quiz"; context?: LessonContext | null }
export interface SsoResponse {
  kind: "answer" | "redirect" | "crisis" | "quiz" | "error";
  text: string;
  category: GuardCategory | "invalid";
  quiz?: QuizItem;
}

export async function runSso(req: SsoRequest, llm: LLM, seed = Date.now()): Promise<SsoResponse> {
  const turns = sanitizeTurns(req.turns);
  if (!turns) return { kind: "error", category: "invalid", text: "질문은 300자 안으로 적어 주세요." };
  const last = turns[turns.length - 1].content;
  const ctx = req.context ?? null;

  // 1) 키워드 사전 필터 — 모델을 부르지 않는다
  const pre = prefilter(last);
  if (pre === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
  if (pre) return { kind: "redirect", category: pre, text: redirectReply(pre, ctx, seed) };

  // 2) 주제 분류 — 직전 쏘의 말 한 줄을 함께 줘서 "응", "더 알려줘" 같은 이어지는 말도 판단
  if (req.mode !== "quiz") {
    const prev = turns.length > 1 ? `쏘의 직전 말: ${turns[turns.length - 2].content.slice(0, 200)}\n` : "";
    let cat: GuardCategory = "offtopic";
    try {
      cat = parseCategory(await llm.classify(CLASSIFIER_SYSTEM, `${prev}학생 메시지: ${last}`));
    } catch {
      return { kind: "error", category: "offtopic", text: "쏘가 잠깐 연결이 안 돼요. 조금 뒤에 다시 물어봐 주세요." };
    }
    if (cat === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
    if (cat !== "study") return { kind: "redirect", category: cat, text: redirectReply(cat, ctx, seed) };
  }

  // 3) 본 응답
  try {
    if (req.mode === "quiz") {
      const raw = await llm.reply(quizPrompt(ctx), [{ role: "user", content: "새 연습 문제 하나 만들어 줘." }]);
      const quiz = parseQuiz(raw);
      if (!quiz) return { kind: "error", category: "study", text: "문제를 만들다 꼬였어요. 한 번 더 눌러 볼래요?" };
      return { kind: "quiz", category: "study", text: quiz.q, quiz };
    }
    const raw = await llm.reply(ssoSystemPrompt(ctx), turns);
    // 4) 출력 검사
    const out = postfilter(raw);
    if (!out.ok || !out.text) return { kind: "redirect", category: "study", text: redirectReply("offtopic", ctx, seed) };
    return { kind: "answer", category: "study", text: out.text };
  } catch {
    return { kind: "error", category: "study", text: FALLBACK_REPLY };
  }
}
