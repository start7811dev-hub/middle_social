import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/* 로컬 개발에서도 /api/sso 가 동작하도록 Vercel 함수를 그대로 불러 쓰는 미들웨어.
   배포(Vercel)에서는 api/ 폴더가 자동으로 서버 함수가 된다. */
function apiDev(): Plugin {
  return {
    name: "sso-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/sso", async (req, res) => {
        try {
          const mod = await server.ssrLoadModule("/api/sso.ts");
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const url = `http://${req.headers.host}/api/sso`;
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          });
          const fn = mod[req.method ?? "GET"] as ((r: Request) => Response | Promise<Response>) | undefined;
          const out = fn ? await fn(request) : new Response("method not allowed", { status: 405 });
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "")); // .env.local 의 ANTHROPIC_API_KEY
  return {
    base: "./", // Vercel·정적 호스팅·Mac 앱 어디서나 동작
    plugins: [react(), apiDev()],
    build: { chunkSizeWarningLimit: 1400 },
  };
});
