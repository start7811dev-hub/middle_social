import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// 폰트는 앱에 포함 → 오프라인(Mac 앱)에서도 동일하게 표시
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
