// @ts-nocheck


// Web storage adapter: local data stays in the browser; shared room data
// is stored by the Node backend so multiple phones can play the same room.
// The server gives each room key to the browser that first wrote it, so every request says who we are.
// One id per browser (kept in localStorage) — a refresh or a second tab is still the same player/host.
function clientId() {
  try {
    let id = localStorage.getItem("fz:cid");
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("fz:cid", id); }
    return id;
  } catch (e) { return ((window as any).__fzcid ||= Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)); }
}

if (typeof window !== "undefined" && !(window as any).storage) {
  (window as any).storage = {
    async set(key: string, value: string, shared = true) {
      if (!shared) { localStorage.setItem(key, value); return; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key), {
        method: "PUT", headers: { "Content-Type": "application/json", "X-Client-Id": clientId() },
        body: JSON.stringify({ value })
      });
      if (!r.ok) throw new Error("storage write failed");
    },
    async get(key: string, shared = true) {
      if (!shared) { const value = localStorage.getItem(key); return value === null ? null : { value }; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("storage read failed");
      return await r.json();
    },
    async delete(key: string, shared = true) {
      if (!shared) { localStorage.removeItem(key); return; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key), { method: "DELETE", headers: { "X-Client-Id": clientId() } });
      if (!r.ok && r.status !== 404) throw new Error("storage delete failed");
    }
  };
}
