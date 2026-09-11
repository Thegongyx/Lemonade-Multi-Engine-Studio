import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Boxes, Cpu, SlidersHorizontal, Globe, MessageSquare } from "lucide-react";
import EnginesPage from "./pages/EnginesPage";
import ModelsPage from "./pages/ModelsPage";
import ChatPage from "./pages/ChatPage";
import RuntimePage from "./pages/RuntimePage";

function Sidebar() {
  const { t, i18n } = useTranslation();
  const nav = [
    { to: "/models", label: t("nav.models"), icon: <SlidersHorizontal size={17} /> },
    { to: "/chat", label: t("nav.chat"), icon: <MessageSquare size={17} /> },
    { to: "/engines", label: t("nav.engines"), icon: <Boxes size={17} /> },
    { to: "/runtime", label: t("nav.runtime"), icon: <Cpu size={17} /> },
  ];
  const toggleLang = () => {
    const next = i18n.language.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  };
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">L</div>
        <div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </div>
      </div>
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          {n.icon}
          {n.label}
        </NavLink>
      ))}
      <div className="sidebar-foot">
        <button className="btn ghost sm" onClick={toggleLang} title={t("common.language")}>
          <Globe size={15} />
          {i18n.language.startsWith("zh") ? "中文" : "EN"}
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/models" replace />} />
          <Route path="/engines" element={<EnginesPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
        </Routes>
      </main>
    </div>
  );
}
