import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../sso/bus";
import { detectMode, type Mode } from "../sso/transport";
import { SSO_COLORS } from "../sso/SsoSheet";
import { canListen, canSpeak, serverVoice, speak } from "../sso/voice";

const LABEL: Record<Mode, string> = {
  server: "Claude 연결됨 (쏘 서버)",
  sample: "Claude 연결됨 (claude.ai 미리보기)",
  offline: "오프라인 — 앱 속 개념 찾기만 가능",
};

export function SsoSettingsCard() {
  const [s, setS] = useState(loadSettings());
  const [mode, setMode] = useState<Mode | null>(null);
  const [tts, setTts] = useState<string | null | undefined>(undefined);
  useEffect(() => { setMode(null); detectMode().then(setMode); setTts(undefined); serverVoice().then(setTts); }, [s.server, s.code]);
  const sample = () => setTimeout(() => speak("안녕, 나 쏘야. 같이 사회 공부하자!"), 50);
  const set = (patch: Partial<typeof s>) => { const n = { ...s, ...patch }; setS(n); saveSettings(n); };
  return (
    <div className="card settings">
      <div className="eyebrow">쏘 설정</div>
      <div className="toggle-row"><span>연결 상태</span><b>{mode ? LABEL[mode] : "확인 중…"}</b></div>
      <label>쏘 서버 주소 (Mac 앱이나 다른 주소에서 쓸 때)
        <input type="text" placeholder="예: https://middle-social.vercel.app" value={s.server} onChange={(e) => set({ server: e.target.value.trim() })} />
      </label>
      <label>접근 코드 (서버에 SSO_ACCESS_CODE를 정했다면)
        <input type="password" value={s.code} onChange={(e) => set({ code: e.target.value.trim() })} />
      </label>
      <div className="toggle-row">
        <span>쏘 색</span>
        <div className="swatches">
          {SSO_COLORS.map((c) => (
            <button key={c.id} title={c.label} className={"swatch" + (s.color === c.hex ? " on" : "")} style={{ background: c.hex }} onClick={() => set({ color: c.hex })} />
          ))}
        </div>
      </div>
      {canSpeak() && (
        <>
          <div className="toggle-row">
            <span>쏘 목소리</span>
            <div className="swatches">
              {tts && <button className={"chip" + (s.voice && s.engine !== "device" ? " on" : "")} onClick={() => { set({ voice: true, engine: "auto" }); sample(); }}>쏘 전용 목소리</button>}
              <button className={"chip" + (s.voice && (s.engine === "device" || !tts) ? " on" : "")} onClick={() => { set({ voice: true, engine: "device" }); sample(); }}>기기 음성</button>
              <button className={"chip" + (!s.voice ? " on" : "")} onClick={() => set({ voice: !s.voice })}>{s.voice ? "끄기" : "꺼짐"}</button>
            </div>
          </div>
          <p className="t-caption">{tts === undefined ? "목소리 확인 중…" : tts ? "쏘 전용 목소리는 서버의 음성 엔진이 만들어요. 안 되면 기기 음성으로 바뀌어요." : "서버에 음성 엔진이 아직 없어서 기기 음성으로 읽어요. Mac·iPad는 설정 › 손쉬운 사용 › 읽기 및 말하기에서 한국어 '유나(향상됨)' 음성을 받으면 훨씬 자연스러워요."}</p>
          {(s.engine === "device" || !tts) && s.voice && (
            <div className="toggle-row">
              <span>기기 음성 높이</span>
              <div className="swatches">
                {([["soft", "낮게"], ["sso", "자연스럽게"], ["high", "조금 높게"]] as const).map(([k, label]) => (
                  <button key={k} className={"chip" + (s.pitch === k ? " on" : "")} onClick={() => { set({ pitch: k }); sample(); }}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="toggle-row"><span>말로 대답하기(음성 인식)</span><b>{canListen() ? "이 기기에서 사용 가능" : "이 기기에서는 글자로 대답"}</b></div>
      <label className="toggle-row" style={{ flexDirection: "row" }}>
        <span>조용히 모드 — 말풍선 참견 끄기 (표정은 그대로)</span>
        <input type="checkbox" checked={s.quiet} onChange={(e) => set({ quiet: e.target.checked })} />
      </label>
    </div>
  );
}
