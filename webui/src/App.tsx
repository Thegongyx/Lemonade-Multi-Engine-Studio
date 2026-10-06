import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Boxes, Cpu, SlidersHorizontal, Globe, MessageSquare, Settings, Sun, Moon } from "lucide-react";
import EnginesPage from "./pages/EnginesPage";
import ModelsPage from "./pages/ModelsPage";
import ChatPage from "./pages/ChatPage";
import RuntimePage from "./pages/RuntimePage";
import SettingsPage from "./pages/SettingsPage";

function Sidebar() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };
  const nav = [
    { to: "/models", label: t("nav.models"), icon: <SlidersHorizontal size={17} /> },
    { to: "/chat", label: t("nav.chat"), icon: <MessageSquare size={17} /> },
    { to: "/engines", label: t("nav.engines"), icon: <Boxes size={17} /> },
    { to: "/runtime", label: t("nav.runtime"), icon: <Cpu size={17} /> },
    { to: "/settings", label: t("nav.settings"), icon: <Settings size={17} /> },
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
        <button className="btn ghost sm" onClick={toggleTheme} title={t("settings.theme")}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  useEffect(() => {
    // ?theme=light|dark overrides the saved preference (also handy for testing).
    const urlTheme = new URLSearchParams(window.location.search).get("theme");
    const theme = urlTheme === "light" || urlTheme === "dark"
      ? urlTheme
      : (localStorage.getItem("theme") || "dark");
    if (urlTheme === "light" || urlTheme === "dark") localStorage.setItem("theme", urlTheme);
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

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
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
