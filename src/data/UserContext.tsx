import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BOX_DAYS, DAY, LocalStore, emptyUser, startOfDay, uid, type UserData, type UserStore } from "./userStore";

interface Ctx {
  data: UserData; ready: boolean;
  update: (fn: (d: UserData) => UserData) => void;
  addWrong: (lessonId: string, quizId: string, picked: number, confidence?: 1 | 2 | 3) => void;
  logAnswer: (confidence: 1 | 2 | 3, right: boolean) => void;
  review: (wrongId: string, right: boolean) => void;
  toggleScrap: (s: { lessonId: string; kind: "concept" | "lesson" | "standard"; title: string; body: string }) => void;
  isScrapped: (lessonId: string, title: string) => boolean;
  newId: () => string;
}
const UserCtx = createContext<Ctx | null>(null);

export function UserProvider({ children, store = LocalStore }: { children: ReactNode; store?: UserStore }) {
  const [data, setData] = useState<UserData>(emptyUser());
  const [ready, setReady] = useState(false);
  const first = useRef(true);
  useEffect(() => { store.load().then((d) => { setData(d); setReady(true); }); }, [store]);
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; return; }
    store.save(data);
  }, [data, ready, store]);

  const value = useMemo<Ctx>(() => ({
    data, ready, newId: uid,
    update: (fn) => setData((d) => fn(d)),
    // 틀린 문제 → 1번 상자, 내일 다시. 확신 '높음'으로 틀리면 착각 카드(오늘 바로 한 번 더)
    addWrong: (lessonId, quizId, picked, confidence) => setData((d) => ({
      ...d,
      wrong: [{ id: uid(), lessonId, quizId, picked, at: Date.now(), confidence, box: 1, reviews: 0,
        due: confidence === 3 ? Date.now() : startOfDay() + DAY },
        ...d.wrong.filter((w) => !(w.lessonId === lessonId && w.quizId === quizId))],
    })),
    logAnswer: (conf, right) => setData((d) => {
      const c = d.calibration[conf] ?? { right: 0, total: 0 };
      return { ...d, calibration: { ...d.calibration, [conf]: { right: c.right + (right ? 1 : 0), total: c.total + 1 } } };
    }),
    review: (id, right) => setData((d) => ({
      ...d,
      wrong: d.wrong.map((w) => {
        if (w.id !== id) return w;
        const box = right ? Math.min(6, (w.box ?? 1) + 1) : 1;
        if (box >= 6) return { ...w, box: 5, resolved: true, reviews: (w.reviews ?? 0) + 1 };
        return { ...w, box, reviews: (w.reviews ?? 0) + 1, due: startOfDay() + BOX_DAYS[box] * DAY };
      }),
    })),
    toggleScrap: (s) => setData((d) => {
      const hit = d.scraps.find((x) => x.lessonId === s.lessonId && x.title === s.title);
      return { ...d, scraps: hit ? d.scraps.filter((x) => x !== hit) : [{ id: uid(), at: Date.now(), ...s }, ...d.scraps] };
    }),
    isScrapped: (lessonId, title) => data.scraps.some((x) => x.lessonId === lessonId && x.title === title),
  }), [data, ready]);
  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>;
}
export const useUser = () => {
  const c = useContext(UserCtx);
  if (!c) throw new Error("UserProvider 필요");
  return c;
};
