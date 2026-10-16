import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const kv = new Map();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/kv/:key", (req, res) => {
  const value = kv.get(req.params.key);
  if (value === undefined) return res.status(404).json({ error: "not found" });
  res.json({ value });
});

app.put("/api/kv/:key", (req, res) => {
  if (typeof req.body?.value !== "string") return res.status(400).json({ error: "value must be a string" });
  // Room/slot data is intentionally short-lived. Old keys are removed after 2 hours.
  kv.set(req.params.key, req.body.value);
  setTimeout(() => { if (kv.get(req.params.key) === req.body.value) kv.delete(req.params.key); }, 2 * 60 * 60 * 1000).unref();
  res.json({ ok: true });
});

app.delete("/api/kv/:key", (req, res) => {
  kv.delete(req.params.key);
  res.json({ ok: true });
});

app.post("/api/claude", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "ANTHROPIC_API_KEY is not configured" });
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Anthropic request failed" });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.json({ text: text.replace(/```json|```/g, "").trim() });
  } catch (e) {
    res.status(502).json({ error: "AI service unavailable" });
  }
});

const dist = path.join(__dirname, "dist");
const YEAR = "public, max-age=31536000, immutable";
// Long cache only where the URL changes whenever the content does:
// Vite's hashed /assets files, and /img and /media requests carrying ?v=<content hash> (see src/lib/img.ts).
// Everything else — index.html, /data/*.json, unversioned images — is revalidated on every use,
// so a new deploy shows up immediately.
const cacheFor = (req) =>
  req.path.startsWith("/assets/") || (/^\/(img|media)\//.test(req.path) && req.query.v) ? YEAR : "no-cache";

app.use(compression());   // JS, CSS, JSON, HTML; images, video and audio are already compressed and are skipped
app.use((req, res, next) => { res.setHeader("Cache-Control", cacheFor(req)); next(); });
app.use(express.static(dist, { cacheControl: false }));
app.use((req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  // A missing file is a 404, not the app page (which would otherwise be cached under the file's URL)
  if (req.method === "GET" && !/^\/(img|media|data|assets)\//.test(req.path)) {
    return res.sendFile(path.join(dist, "index.html"), { cacheControl: false });
  }
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, () => console.log(`Hat Al-Jawab listening on ${PORT}`));
