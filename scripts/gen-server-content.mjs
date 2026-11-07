// 서버 함수가 학습 문맥을 자기 번들에서 읽도록 콘텐츠를 TS 모듈로 묶는다 (shared/content.gen.ts)
// npm run validate 때마다 다시 만든다. 직접 고치지 말 것.
import fs from "node:fs";
import path from "node:path";
const dir = "public/content/units";
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const u = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  out[u.id] = {
    title: u.title,
    lessons: u.lessons.map((l) => ({
      id: l.id, title: l.title, standard: { text: l.standard?.text ?? null },
      sections: (l.sections ?? []).map((s) => ({ title: s.title, text: s.text })),
      concepts: (l.concepts ?? []).map((c) => ({ term: c.term, desc: c.desc })),
    })),
  };
}
const body = `/* 자동 생성 — scripts/gen-server-content.mjs. 직접 고치지 말 것. */\n// eslint-disable-next-line\nexport const UNITS: Record<string, any> = ${JSON.stringify(out)};\n`;
fs.writeFileSync("shared/content.gen.ts", body);
console.log(`✓ 서버용 콘텐츠 묶음 생성 — 단원 ${Object.keys(out).length}개 (${(body.length / 1024).toFixed(0)}KB)`);
