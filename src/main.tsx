import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// 폰트는 앱에 포함 → 오프라인(Mac 앱)에서도 동일하게 표시
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

// iPad·iPhone 홈 화면 웹앱: 오프라인 캐시 (Vercel 등 https 배포에서만, 미리보기 iframe·Mac 앱 제외)
if ("serviceWorker" in navigator && location.protocol === "https:" && window.top === window.self) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
}
