// @ts-nocheck
import { supabase } from "../account";


/* ---------- أدوات التخزين ---------- */
const jset = async (k, v, shared = true) => {
  try { await window.storage.set(k, JSON.stringify(v), shared); return true; } catch (e) { return false; }
};
const jget = async (k, shared = true) => {
  try { const r = await window.storage.get(k, shared); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
};

/* ---------- الذكاء الاصطناعي ----------
   مراجعة الإجابات اللي رفضها التصحيح المحلي (مضيف اللعب السريع بس).
   السيرفر (/api/judge) يتطلب حساب مسجّل، ويبني الطلب بنفسه من هالحقول — ما يقبل نص حر. */
async function askJudge({ question, answer, alts, entries }) {
  if (!supabase) return [];
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) return [];
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), 9000); // ما ننتظر أكثر من 9 ثواني
  try {
    const res = await fetch("/api/judge", {
      signal: ctrl.signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ question, answer, alts: alts || [], entries }),
    });
    if (!res.ok) return [];
    const out = await res.json();
    return Array.isArray(out.ok) ? out.ok : [];
  } finally {
    clearTimeout(killer);
  }
}


export { jset, jget, askJudge };
