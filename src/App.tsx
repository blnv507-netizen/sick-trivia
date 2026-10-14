// @ts-nocheck
/* الجذر: التوجيه بين طوري هات الجواب. كل طور ينحمّل لحاله (code splitting).
   /            → الرئيسية + اللعب السريع (روم من الجوالات)
   /categories  → طور الفئات (شاشة وحدة، فريقين ولوحة فئات) */
import React, { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router";
import { useAccount, AccountModals, ACCOUNT_CSS } from "./account";
import ErrorBoundary from "./components/ErrorBoundary";
import { loadBank } from "./lib/bank";

const QuickPlay = lazy(() => import("./pages/QuickPlay"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));

function Screen({ children }) {
  return <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", gap: 14, textAlign: "center", padding: 24, background: "var(--hj-bg, #F6F2EA)", color: "var(--hj-ink-2, #6A5870)", fontFamily: "var(--hj-body, system-ui), system-ui, sans-serif" }}>{children}</div>;
}

function Loading() {
  return <Screen>جاري التحميل…</Screen>;
}

/* البنك ينزل من public/data قبل ما يبدأ أي طور */
function BankGate({ children }) {
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    loadBank().then(
      () => alive && setState("ready"),
      (e) => { console.error("فشل تحميل بنك الأسئلة:", e); alive && setState("error"); }
    );
    return () => { alive = false; };
  }, []);

  if (state === "error") {
    return (
      <Screen>
        <b style={{ fontFamily: "var(--hj-display, system-ui)", fontSize: 22, color: "var(--hj-ink, #2A1B2E)" }}>ما قدرنا نحمّل الأسئلة</b>
        <span>تأكد من الإنترنت وجرّب تحديث الصفحة.</span>
        <button onClick={() => window.location.reload()} style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", border: 0, borderRadius: 6, padding: "12px 26px", color: "#fff", background: "var(--hj-plum, #6B3FA0)" }}>حدّث الصفحة</button>
      </Screen>
    );
  }
  if (state !== "ready") return <Loading />;
  return children;
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
      <BankGate>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<QuickPlay acc={acc} />} />
            <Route path="/categories" element={<CategoriesPage acc={acc} />} />
            <Route path="/jeem" element={<Navigate to="/categories" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BankGate>
      <AccountModals acc={acc} />
    </ErrorBoundary>
  );
}
