// @ts-nocheck
/* ==================================================================
   الحسابات ورصيد الألعاب (Supabase)
   - تسجيل حساب / دخول / خروج / نسيت كلمة المرور
   - كل حساب له رصيد ألعاب. بدء لعبة يخصم وحدة من السيرفر (start_game)
     فما أحد يقدر يلعب برصيد مو له حتى لو عدّل الكود بالمتصفح.
   - إذا خلص الرصيد تطلع شاشة التجديد.
   ================================================================== */
import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = URL && KEY ? createClient(URL, KEY) : null;

// رسائل الأخطاء بالعربي
const errMsg = (e) => {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (/Invalid login credentials/i.test(m)) return "الإيميل أو كلمة المرور غلط";
  if (/already registered|already been registered/i.test(m)) return "هذا الإيميل مسجّل من قبل، سجّل دخول";
  if (/Password should be at least/i.test(m)) return "كلمة المرور لازم تكون 6 أحرف أو أكثر";
  if (/Unable to validate email|invalid email|is invalid/i.test(m)) return "الإيميل مكتوب غلط";
  if (/Email not confirmed/i.test(m)) return "افتح إيميلك وأكّد الحساب أول";
  if (/rate limit|too many/i.test(m)) return "محاولات كثيرة، انتظر شوي وجرّب";
  if (/no_credits/i.test(m)) return "no_credits";
  if (/not_logged_in|JWT/i.test(m)) return "سجّل دخول أول";
  if (/Failed to fetch|NetworkError/i.test(m)) return "ما فيه اتصال بالإنترنت";
  return "صار خطأ، جرّب مرة ثانية";
};

/* ---------- الحالة العامة للحساب ---------- */
export function useAccount() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(!supabase);
  const [modal, setModal] = useState(null); // null | "auth" | "credits" | "account"

  const loadProfile = useCallback(async (u) => {
    if (!u) { setProfile(null); return null; }
    const { data } = await supabase.from("profiles").select("id,email,name,credits,games_played,created_at").eq("id", u.id).maybeSingle();
    setProfile(data || null);
    return data;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session ? data.session.user : null;
      setUser(u); loadProfile(u).finally(() => setReady(true));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session ? session.user : null;
      setUser(u); loadProfile(u);
      if (u) setModal((m) => (m === "auth" ? null : m));
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
    if (error) return { error: errMsg(error) };
    if (!data.session) return { info: "سوّينا حسابك. افتح إيميلك واضغط رابط التأكيد، وبعدها سجّل دخول." };
    return { ok: true };
  };
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: errMsg(error) } : { ok: true };
  };
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/#reset" });
    return error ? { error: errMsg(error) } : { info: "أرسلنا لك رابط تغيير كلمة المرور على الإيميل." };
  };
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: errMsg(error) } : { ok: true };
  };
  const signOut = async () => { await supabase.auth.signOut(); setModal(null); };
  const refresh = () => loadProfile(user);

  /* بوابة اللعب: تتأكد من الدخول وتخصم لعبة من الرصيد. ترجع true إذا يقدر يلعب */
  const gate = async (mode) => {
    if (!supabase) return true;                      // الحسابات مو مفعّلة = اللعب مفتوح
    if (!user) { setModal("auth"); return false; }
    const { data, error } = await supabase.rpc("start_game", { p_mode: mode });
    if (error) {
      const m = errMsg(error);
      if (m === "no_credits") { setModal("credits"); await refresh(); return false; }
      alert(m); return false;
    }
    setProfile((p) => (p ? { ...p, credits: data, games_played: (p.games_played || 0) + 1 } : p));
    return true;
  };

  return { enabled: !!supabase, ready, user, profile, modal, setModal, signUp, signIn, signOut, resetPassword, updatePassword, refresh, gate };
}

/* ---------- الواجهات ---------- */
export function AccountChip({ acc }) {
  if (!acc.enabled) return null;
  if (!acc.user) return <button className="ac-chip" onClick={() => acc.setModal("auth")}>تسجيل الدخول</button>;
  const c = acc.profile ? acc.profile.credits : "…";
  return (
    <button className="ac-chip" onClick={() => acc.setModal("account")} aria-label="حسابي">
      <span className={"ac-cred" + (acc.profile && acc.profile.credits === 0 ? " zero" : "")}>{c}</span>
      <span>{c === 1 ? "لعبة" : "ألعاب"}</span>
    </button>
  );
}

export function AccountModals({ acc }) {
  // صفحة تغيير كلمة المرور بعد الضغط على رابط الإيميل
  const [resetMode, setResetMode] = useState(typeof window !== "undefined" && /type=recovery|#reset/.test(window.location.hash));
  if (!acc.enabled) return null;
  if (resetMode && acc.user) return <Shell onClose={() => setResetMode(false)}><NewPassword acc={acc} done={() => { setResetMode(false); window.location.hash = ""; }} /></Shell>;
  if (acc.modal === "auth") return <Shell onClose={() => acc.setModal(null)}><AuthForm acc={acc} /></Shell>;
  if (acc.modal === "credits") return <Shell onClose={() => acc.setModal(null)}><NoCredits acc={acc} /></Shell>;
  if (acc.modal === "account" && acc.user) return <Shell onClose={() => acc.setModal(null)}><AccountPage acc={acc} /></Shell>;
  return null;
}

function Shell({ children, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="ac-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <style>{CSS}</style>
      <div className="ac-box" dir="rtl">
        <button className="ac-close" onClick={onClose} aria-label="إغلاق">✕</button>
        {children}
      </div>
    </div>
  );
}

function AuthForm({ acc }) {
  const [tab, setTab] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (tab === "signup" && !name.trim()) return setMsg({ error: "اكتب اسمك" });
    if (!email.includes("@")) return setMsg({ error: "اكتب إيميل صحيح" });
    if (tab !== "forgot" && pass.length < 6) return setMsg({ error: "كلمة المرور لازم تكون 6 أحرف أو أكثر" });
    setBusy(true);
    const r = tab === "signup" ? await acc.signUp(name, email, pass)
      : tab === "login" ? await acc.signIn(email, pass)
      : await acc.resetPassword(email);
    setBusy(false);
    if (!r.ok) setMsg(r);
  };

  return (
    <form onSubmit={submit} className="ac-form" noValidate>
      <h2>{tab === "signup" ? "سوّ حسابك" : tab === "login" ? "تسجيل الدخول" : "نسيت كلمة المرور"}</h2>
      <p className="ac-muted">{tab === "signup" ? "أول لعبة علينا. بعدها تجدد رصيدك من حسابك." : tab === "login" ? "ادخل على حسابك وكمّل اللعب." : "اكتب إيميلك ونرسل لك رابط تغيير كلمة المرور."}</p>
      {tab !== "forgot" && (
        <div className="ac-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => { setTab("signup"); setMsg(null); }}>حساب جديد</button>
          <button type="button" role="tab" aria-selected={tab === "login"} className={tab === "login" ? "on" : ""} onClick={() => { setTab("login"); setMsg(null); }}>عندي حساب</button>
        </div>
      )}
      {tab === "signup" && (
        <label className="ac-field"><span>الاسم</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={30} /></label>
      )}
      <label className="ac-field"><span>الإيميل</span>
        <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {tab !== "forgot" && (
        <label className="ac-field"><span>كلمة المرور</span>
          <input type="password" dir="ltr" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={tab === "signup" ? "new-password" : "current-password"} /></label>
      )}
      {msg && <div className={msg.error ? "ac-err" : "ac-info"} role="status">{msg.error || msg.info}</div>}
      <button className="ac-btn" disabled={busy}>
        {busy ? "لحظة…" : tab === "signup" ? "سوّ الحساب" : tab === "login" ? "دخول" : "أرسل الرابط"}
      </button>
      {tab === "login" && <button type="button" className="ac-link" onClick={() => { setTab("forgot"); setMsg(null); }}>نسيت كلمة المرور؟</button>}
      {tab === "forgot" && <button type="button" className="ac-link" onClick={() => { setTab("login"); setMsg(null); }}>رجوع لتسجيل الدخول</button>}
    </form>
  );
}

function NewPassword({ acc, done }) {
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (pass.length < 6) return setMsg({ error: "كلمة المرور لازم تكون 6 أحرف أو أكثر" });
    const r = await acc.updatePassword(pass);
    r.ok ? done() : setMsg(r);
  };
  return (
    <form onSubmit={submit} className="ac-form">
      <h2>كلمة مرور جديدة</h2>
      <label className="ac-field"><span>كلمة المرور الجديدة</span>
        <input type="password" dir="ltr" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></label>
      {msg && <div className="ac-err">{msg.error}</div>}
      <button className="ac-btn">احفظ</button>
    </form>
  );
}

function NoCredits({ acc }) {
  return (
    <div className="ac-form">
      <h2>خلص رصيدك</h2>
      <p className="ac-muted">لعبت كل الألعاب اللي في رصيدك. جدّد رصيدك عشان تبدأ لعبة جديدة.</p>
      <div className="ac-stat"><b>0</b><span>ألعاب متبقية</span></div>
      <div className="ac-info">الدفع من الموقع جاي قريب. للتجديد الحين تواصل معنا وأرسل إيميل حسابك: <b dir="ltr">{acc.user && acc.user.email}</b></div>
      <button className="ac-btn" onClick={() => acc.setModal(null)}>تمام</button>
    </div>
  );
}

function AccountPage({ acc }) {
  const p = acc.profile || {};
  return (
    <div className="ac-form">
      <h2>{p.name || "حسابي"}</h2>
      <p className="ac-muted" dir="ltr" style={{ textAlign: "right" }}>{acc.user.email}</p>
      <div className="ac-stats">
        <div className="ac-stat"><b className={p.credits === 0 ? "zero" : ""}>{p.credits ?? "…"}</b><span>ألعاب متبقية</span></div>
        <div className="ac-stat"><b>{p.games_played ?? 0}</b><span>ألعاب لعبتها</span></div>
      </div>
      <button className="ac-btn" onClick={() => acc.setModal("credits")}>جدّد الرصيد</button>
      <button className="ac-link" onClick={acc.signOut}>تسجيل الخروج</button>
    </div>
  );
}

const CSS = `
.ac-overlay{position:fixed;inset:0;z-index:100;background:rgba(30,25,20,.40);display:grid;place-items:center;padding:16px;
  font-family:'Rubik',system-ui,sans-serif;animation:acFade .18s ease both;}
.ac-box{position:relative;width:min(420px,100%);max-height:92vh;overflow:auto;background:#FFFFFF;color:#1F1B2A;border-radius:20px;padding:28px 24px 24px;
  box-shadow:0 24px 60px rgba(70,50,20,.2);animation:acUp .28s cubic-bezier(.23,1,.32,1) both;}
.ac-close{position:absolute;top:12px;left:12px;width:36px;height:36px;border-radius:10px;border:0;background:none;color:#6F6880;cursor:pointer;font-size:16px;}
.ac-close:hover{background:#F0EBE3;color:#1F1B2A;}
.ac-form{display:flex;flex-direction:column;gap:12px;}
.ac-form h2{font-family:'Lalezar',cursive;font-weight:400;font-size:32px;line-height:1.2;}
.ac-muted{color:#6F6880;font-size:15px;line-height:1.7;}
.ac-tabs{display:grid;grid-template-columns:1fr 1fr;background:#F6F3EE;border-radius:12px;padding:4px;margin:4px 0;}
.ac-tabs button{border:0;background:none;color:#6F6880;font:inherit;font-weight:700;padding:10px;border-radius:9px;cursor:pointer;}
.ac-tabs button.on{background:#E3DBCF;color:#1F1B2A;}
.ac-field{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#6F6880;}
.ac-field input{background:#F6F3EE;border:2px solid #E3DBCF;border-radius:12px;padding:13px 14px;color:#1F1B2A;font:inherit;font-size:16px;}
.ac-field input:focus{outline:none;border-color:#B5710A;}
.ac-btn{margin-top:6px;border:0;border-radius:14px;padding:15px;background:#1F1B2A;color:#FFFFFF;font:inherit;font-weight:800;font-size:17px;cursor:pointer;transition:transform .15s,opacity .15s;}
.ac-btn:active:not(:disabled){transform:scale(.98);}
.ac-btn:disabled{opacity:.5;}
.ac-link{border:0;background:none;color:#6F6880;font:inherit;font-size:14px;cursor:pointer;padding:6px;}
.ac-link:hover{color:#1F1B2A;}
.ac-err{background:#FBE6E8;color:#B4343F;border-radius:10px;padding:10px 12px;font-size:14px;}
.ac-info{background:#E2F5EF;color:#0E7A64;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.7;}
.ac-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0;}
.ac-stat{background:#F6F3EE;border-radius:14px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:2px;}
.ac-stat b{font-family:'Lalezar',cursive;font-weight:400;font-size:40px;line-height:1.1;color:#B5710A;}
.ac-stat b.zero{color:#D9434E;}
.ac-stat span{font-size:13px;color:#6F6880;}
.ac-chip{display:inline-flex;align-items:center;gap:6px;border:0;cursor:pointer;background:#FFFFFF;color:#1F1B2A;border-radius:999px;padding:7px 14px;
  font-family:'Rubik',system-ui,sans-serif;font-size:14px;font-weight:700;box-shadow:inset 0 0 0 1.5px #E3DBCF;}
.ac-chip:hover{background:#F0EBE3;}
.ac-cred{font-family:'Lalezar',cursive;font-weight:400;font-size:18px;color:#B5710A;}
.ac-cred.zero{color:#D9434E;}
@keyframes acFade{from{opacity:0}to{opacity:1}}
@keyframes acUp{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ac-overlay,.ac-box{animation:none;}}
`;
export const ACCOUNT_CSS = CSS;
