// 콘텐츠 JSON 검증: npm run validate  (PR마다 GitHub Actions에서도 실행)
import Ajv from "ajv";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "public/content";
const schema = JSON.parse(fs.readFileSync("schema/unit.schema.json", "utf8"));
const validate = new Ajv({ allErrors: true }).compile(schema);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const KNOWN_LABS = ["globe", "supply-demand", "planned"];
// 용어 기준 (docs/EDITORIAL_HISTORY.md) — 발견 시 경고
const TERM_RULES = [
  [/일본해/, "동해"],
  [/한일\s?합방/, "국권 피탈 / 한국 병합 조약의 강제 체결"],
  [/일제\s?시대/, "일제 강점기"],
  [/종군\s?위안부/, "일본군'위안부' 피해자"],
  [/(조선|대륙)\s?진출/, "침략 (일본의 침략 행위를 말하는 경우)"],
];
let warnings = 0;
let errors = 0;
const fail = (m) => { errors++; console.error("✗ " + m); };

const ids = new Set();
for (const ref of manifest.units) {
  const file = path.join(root, ref.path);
  if (!fs.existsSync(file)) { fail(`${ref.id}: 파일 없음 ${ref.path}`); continue; }
  const unit = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!validate(unit)) validate.errors.forEach((e) => fail(`${ref.id}${e.instancePath} ${e.message}`));
  if (unit.id !== ref.id) fail(`${ref.id}: manifest id와 파일 id 불일치 (${unit.id})`);
  const text = JSON.stringify(unit);
  for (const [re, use] of TERM_RULES) if (re.test(text)) { warnings++; console.warn(`⚠ ${ref.id}: "${text.match(re)[0]}" → "${use}" 사용 권장`); }
  for (const l of unit.lessons || []) {
    if (ids.has(l.id)) fail(`중복 lesson id ${l.id}`);
    ids.add(l.id);
    if (l.standard?.verified && !l.standard.text) fail(`${l.id}: verified인데 성취기준 문장이 없음`);
    if (l.lab && !KNOWN_LABS.includes(l.lab.type)) fail(`${l.id}: 등록되지 않은 lab type "${l.lab.type}"`);
    if (l.predict && l.predict.answer >= l.predict.choices.length) fail(`${l.id}/predict: answer 인덱스 범위 초과`);
    for (const q of l.quiz || []) if (q.answer >= q.choices.length) fail(`${l.id}/${q.id}: answer 인덱스 범위 초과`);
  }
}
for (const b of manifest.books) for (const u of b.units)
  if (!manifest.units.find((x) => x.id === u)) fail(`book ${b.id}: 없는 unit ${u}`);

if (errors) { console.error(`\n${errors}개 오류`); process.exit(1); }
console.log(`✓ 콘텐츠 검증 통과 — 단원 ${manifest.units.length}개, 레슨 ${ids.size}개${warnings ? `, 용어 경고 ${warnings}건` : ""}`);
