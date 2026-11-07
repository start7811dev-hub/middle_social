import { useEffect, useState } from "react";
import { loadSettings, onSettings, saveSettings } from "./bus";
import { canListen, canSpeak, stopSpeaking } from "./voice";

/* 쏘 목소리 듣기 / 말로 대답하기 — 앱 전체에서 같은 설정 (어디서 바꿔도 모두 따라간다) */
export function useVoicePrefs() {
  const [s, setS] = useState(loadSettings());
  useEffect(() => onSettings(() => setS(loadSettings())), []);
  const speakOn = s.voice && canSpeak();
  const micOn = s.mic && canListen();
  const set = (patch: { voice?: boolean; mic?: boolean }) => {
    const n = { ...loadSettings(), ...patch };
    saveSettings(n);
    if (patch.voice === false) stopSpeaking();
  };
  return { speakOn, micOn, set };
}

export function VoiceToggles({ compact = false }: { compact?: boolean }) {
  const { speakOn, micOn, set } = useVoicePrefs();
  return (
    <div className={"voice-toggles" + (compact ? " compact" : "")} role="group" aria-label="목소리 설정">
      {canSpeak() && (
        <button type="button" className={"vt" + (speakOn ? " on" : "")} aria-pressed={speakOn}
          title={speakOn ? "쏘 목소리 듣기 켜짐 — 누르면 끔" : "쏘 목소리 듣기 꺼짐 — 누르면 켬"} onClick={() => set({ voice: !speakOn })}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {speakOn ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
          </svg>
          {!compact && <span>듣기 {speakOn ? "ON" : "OFF"}</span>}
        </button>
      )}
      {canListen() && (
        <button type="button" className={"vt" + (micOn ? " on" : "")} aria-pressed={micOn}
          title={micOn ? "말로 대답하기 켜짐 — 누르면 끔" : "말로 대답하기 꺼짐 — 누르면 켬"} onClick={() => set({ mic: !micOn })}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            {!micOn && <path d="M4 4l16 16" />}
          </svg>
          {!compact && <span>말하기 {micOn ? "ON" : "OFF"}</span>}
        </button>
      )}
    </div>
  );
}
