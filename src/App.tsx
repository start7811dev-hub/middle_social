import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { loadCatalog } from "./data/content";
import type { Catalog } from "./data/types";
import { UserProvider } from "./data/UserContext";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { Units } from "./pages/Units";
import { UnitPage } from "./pages/UnitPage";
import { WrongNotes } from "./pages/WrongNotes";
import { Scraps } from "./pages/Scraps";
import { About } from "./pages/About";
import { Review } from "./pages/Review";

export function App() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadCatalog().then(setCat).catch((e) => setErr(String(e))); }, []);
  if (err) return <div className="boot">콘텐츠를 불러오지 못했습니다. {err}</div>;
  if (!cat) return <div className="boot"><span className="boot-dot" /> 불러오는 중</div>;
  return (
    <UserProvider>
      <HashRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Home cat={cat} />} />
            <Route path="/units" element={<Units cat={cat} />} />
            <Route path="/unit/:unitId/:lessonId?" element={<UnitPage cat={cat} />} />
            <Route path="/review" element={<Review cat={cat} />} />
            <Route path="/wrong" element={<WrongNotes cat={cat} />} />
            <Route path="/scraps" element={<Scraps cat={cat} />} />
            <Route path="/about" element={<About cat={cat} />} />
          </Routes>
        </Shell>
      </HashRouter>
    </UserProvider>
  );
}
