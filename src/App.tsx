// @ts-nocheck
/* الجذر: التوجيه بين طوري هات الجواب. كل طور ينحمّل لحاله (code splitting).
   /            → الرئيسية + اللعب السريع (روم من الجوالات)
   /categories  → طور الفئات (شاشة وحدة، فريقين ولوحة فئات) */
import React, { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router";
import { useAccount, AccountModals, ACCOUNT_CSS } from "./account";
import ErrorBoundary from "./components/ErrorBoundary";

const QuickPlay = lazy(() => import("./pages/QuickPlay"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));

function Loading() {
  return <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6F6880", fontFamily: "Rubik, system-ui, sans-serif" }}>جاري التحميل…</div>;
}

/* الروابط القديمة (#jeem و /jeem) تتحول لطور الفئات، ونرجع لأعلى الصفحة مع كل تنقل */
function RouteEffects() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => { if (hash.startsWith("#jeem")) navigate("/categories", { replace: true }); }, [hash]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const acc = useAccount();
  return (
    <ErrorBoundary>
      <style>{ACCOUNT_CSS}</style>
      <RouteEffects />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<QuickPlay acc={acc} />} />
          <Route path="/categories" element={<CategoriesPage acc={acc} />} />
          <Route path="/jeem" element={<Navigate to="/categories" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AccountModals acc={acc} />
    </ErrorBoundary>
  );
}
