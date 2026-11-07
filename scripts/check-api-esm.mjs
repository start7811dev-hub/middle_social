// Vercel이 실행하는 방식(TS → ESM JS, 파일 단위 변환)으로 서버 함수를 실제로 불러와 본다.
// 확장자 없는 상대 import 같은 '로컬에선 되고 배포에선 터지는' 문제를 빌드 단계에서 잡는다.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 배포 환경 변수(접근 코드·한도)와 분리
for (const k of ["SSO_ACCESS_CODE", "SSO_RATE_PER_10MIN", "SSO_RATE_PER_IP_10MIN", "SSO_DAILY_LIMIT", "SSO_TTS_PROVIDER"]) delete process.env[k];

const out = fs.mkdtempSync(path.join(os.tmpdir(), "api-esm-"));
execSync(`npx tsc -p tsconfig.server.json --noEmit false --outDir ${out} --declaration false`, { stdio: "inherit" });
fs.writeFileSync(path.join(out, "package.json"), '{"type":"module"}');
const mod = await import(pathToFileURL(path.join(out, "api", "sso.js")).href);
for (const fn of ["GET", "POST", "OPTIONS"]) if (typeof mod[fn] !== "function") throw new Error(`api/sso: ${fn} 없음`);
const health = await (mod.GET(new Request("https://x.test/api/sso"))).json();
if (!health.ok) throw new Error("api/sso GET 실패");
// 키 없이도 위기 표현에는 도움 안내가 나와야 한다
delete process.env.ANTHROPIC_API_KEY;
const r = await (await mod.POST(new Request("https://x.test/api/sso", { method: "POST", body: JSON.stringify({ turns: [{ role: "user", content: "죽고 싶어" }] }) }))).json();
if (r.kind !== "crisis") throw new Error("api/sso 위기 응답 실패");

// /api/tts — 엔진 없이도 불러와지고, 교과 본문을 찾을 수 있어야 한다
const tts = await import(pathToFileURL(path.join(out, "api", "tts.js")).href);
for (const fn of ["GET", "POST", "OPTIONS"]) if (typeof tts[fn] !== "function") throw new Error(`api/tts: ${fn} 없음`);
if ((await tts.GET(new Request("https://x.test/api/tts")).json()).enabled !== false) throw new Error("api/tts GET 실패");
if (!tts.sectionText("s1-g01-1", 0)) throw new Error("api/tts 본문 찾기 실패");
fs.rmSync(out, { recursive: true, force: true });
console.log("✓ 서버 함수(sso·tts) ESM 로드·호출 확인");
