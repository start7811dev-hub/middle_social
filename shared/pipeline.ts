import {
  CLASSIFIER_SYSTEM, CRISIS_REPLY, FALLBACK_REPLY, SOFT_HELP, classifierInput, cleanHistory, parseCategory, parseQuiz,
  postfilter, prefilter, quizPrompt, redirectReply, sanitizeTurns, ssoSystemPrompt, tutorPrompt,
  type GuardCategory, type LessonContext, type QuizItem, type Turn,
} from "./guard";

/** 모델 호출부만 바꿔 끼운다 — 서버는 Anthropic API, 아티팩트는 sample, 테스트는 모의 함수. */
export interface LLM {
  /** 분류: 빠른 모델, 짧은 출력 */
  classify(system: string, text: string): Promise<string>;
  /** 본 응답 */
  reply(system: string, turns: Turn[], opts?: { short?: boolean }): Promise<string>;
}

export type SsoMode = "chat" | "quiz" | "tutor";
export interface SsoRequest {
  turns: unknown;
  mode?: SsoMode;
  context?: LessonContext | null;
  /** 서버가 서명한 쏘 답인지 확인 — 없으면 클라이언트 기록을 그대로 쓴다(브라우저 경로) */
  verifyAssistant?: (t: Turn) => boolean;
}
export interface SsoResponse {
  kind: "answer" | "redirect" | "crisis" | "quiz" | "error";
  text: string;
  category: GuardCategory | "invalid";
  quiz?: QuizItem;
  /** 서버 경로: 이 답의 서명. 다음 요청 때 대화 기록과 함께 돌려보낸다 */
  sig?: string;
}

export async function runSso(req: SsoRequest, llm: LLM, seed = Date.now()): Promise<SsoResponse> {
  const raw = sanitizeTurns(req.turns);
  if (!raw) return { kind: "error", category: "invalid", text: "질문은 300자 안으로 적어 줘." };
  const last = raw[raw.length - 1].content;
  const ctx = req.context ?? null;

  // 1) 키워드 사전 필터 — 확실한 경우 모델을 부르지 않는다
  const pre = prefilter(last);
  if (pre === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
  if (pre && pre !== "crisis-weak") return { kind: "redirect", category: pre, text: redirectReply(pre, ctx, seed) };
  const weak = pre === "crisis-weak";

  // 2) 대화 기록 정리 — 위조된 쏘의 말, 예전에 걸렸던 질문과 그 답을 뺀다
  const turns = cleanHistory(raw, req.verifyAssistant);
  if (!turns.length || turns[turns.length - 1].role !== "user") return { kind: "error", category: "invalid", text: FALLBACK_REPLY };

  // 3) 주제 분류 (연습 문제 모드는 대화 기록·학생 글을 모델에 넘기지 않으므로 생략)
  if (req.mode !== "quiz") {
    let cat: GuardCategory = "offtopic";
    try {
      cat = parseCategory(await llm.classify(CLASSIFIER_SYSTEM, classifierInput(last, turns.slice(0, -1))));
    } catch {
      return { kind: "error", category: "offtopic", text: "앗, 잠깐 연결이 안 돼. 조금 있다가 다시 말해 줘." };
    }
    if (cat === "crisis") return { kind: "crisis", category: "crisis", text: CRISIS_REPLY };
    if (weak && cat !== "study") return { kind: "redirect", category: "sensitive", text: redirectReply("sensitive", ctx, seed) + SOFT_HELP };
    if (cat !== "study") return { kind: "redirect", category: cat, text: redirectReply(cat, ctx, seed) };
  }

  // 4) 본 응답
  try {
    if (req.mode === "quiz") {
      const out = await llm.reply(quizPrompt(ctx), [{ role: "user", content: "새 연습 문제 하나 만들어 줘." }]);
      const quiz = parseQuiz(out);
      if (!quiz) return { kind: "error", category: "study", text: "문제 만들다 꼬였어. 한 번 더 눌러 줄래?" };
      return { kind: "quiz", category: "study", text: quiz.q, quiz };
    }
    const out = req.mode === "tutor"
      ? await llm.reply(tutorPrompt(ctx), turns, { short: true })
      : await llm.reply(ssoSystemPrompt(ctx), turns);
    // 5) 출력 검사
    const checked = postfilter(out);
    if (!checked.ok || !checked.text) return { kind: "redirect", category: "study", text: redirectReply("offtopic", ctx, seed) };
    return { kind: "answer", category: "study", text: checked.text + (weak ? SOFT_HELP : "") };
  } catch {
    return { kind: "error", category: "study", text: FALLBACK_REPLY };
  }
}
