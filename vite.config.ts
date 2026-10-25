import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base './' → Vercel·정적 호스팅·하위 경로 어디서나 동작
export default defineConfig({ base: "./", plugins: [react()], build: { chunkSizeWarningLimit: 1200 } });
