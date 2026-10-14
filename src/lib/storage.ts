// @ts-nocheck


// Web storage adapter: local data stays in the browser; shared room data
// is stored by the Node backend so multiple phones can play the same room.
if (typeof window !== "undefined" && !(window as any).storage) {
  (window as any).storage = {
    async set(key: string, value: string, shared = true) {
      if (!shared) { localStorage.setItem(key, value); return; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key), {
        method: "PUT", headers: { "Content-Type": "application/json" },
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
      const r = await fetch("/api/kv/" + encodeURIComponent(key), { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw new Error("storage delete failed");
    }
  };
}
