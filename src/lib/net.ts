// @ts-nocheck


/* ---------- أدوات التخزين ---------- */
const jset = async (k, v, shared = true) => {
  try { await window.storage.set(k, JSON.stringify(v), shared); return true; } catch (e) { return false; }
};
const jget = async (k, shared = true) => {
  try { const r = await window.storage.get(k, shared); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
};

/* ---------- الذكاء الاصطناعي ---------- */
async function askClaude(prompt) {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), 9000); // ما ننتظر أكثر من 9 ثواني
  try {
    return await askClaudeInner(prompt, ctrl.signal);
  } finally {
    clearTimeout(killer);
  }
}

async function askClaudeInner(prompt, signal) {
  const res = await fetch("/api/claude", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "AI request failed");
  return String(data.text || "").replace(/```json|```/g, "").trim();
}


export { jset, jget, askClaude, askClaudeInner };
