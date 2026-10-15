/* ينشر بنك أحداث الأفلام (src/data/moviePlotBank.ts) كفئة وحدة "أحداث أفلام":
     1) يضبط img/aImg في moviePlotBank.ts حسب الصور الموجودة فعلاً في
        public/img/movie-plot/ — NNN.webp للجواب و NNNq.webp للسؤال
        (NNN رقم السؤال بالبنك، يبدأ من 001). السؤال اللي بلا صورة ينعرض نص بس
     2) يكتب public/data/movie-plot.json ويحدّث index.json
   شغّله: npm run movie-plot-bank    (بعد إضافة صور أو تعديل moviePlotBank.ts) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/data/moviePlotBank.ts");
const IMG = path.join(ROOT, "public/img/movie-plot");
const OUT = path.join(ROOT, "public/data");
const CAT = "أحداث أفلام", FILE = "movie-plot.json";

/* نفس تنسيق الملف: {"key": value, ...} بسطر واحد */
const ser = (v) => Array.isArray(v) ? "[" + v.map(ser).join(", ") + "]"
  : v && typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + ser(x)).join(", ") + "}"
  : JSON.stringify(v);

const pad = (n) => String(n).padStart(3, "0");
const has = (f) => fs.existsSync(path.join(IMG, f));

const list = [];
const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split("\n").map((line) => {
  const m = line.match(/^(\s*)(\{.*\})(,?)(\r?)$/);
  if (!m) return line;
  const q = JSON.parse(m[2]);
  if (q.cat !== CAT) throw new Error("فئة غير متوقعة: " + q.cat);
  const n = pad(list.length + 1);
  delete q.img;
  delete q.aImg;
  if (has(n + "q.webp")) q.img = `/img/movie-plot/${n}q.webp`;
  if (has(n + ".webp")) q.aImg = `/img/movie-plot/${n}.webp`;
  list.push(q);
  return m[1] + ser(q) + m[3] + m[4];
});
fs.writeFileSync(SRC, lines.join("\n"), "utf8");
fs.writeFileSync(path.join(OUT, FILE), JSON.stringify(list), "utf8");

const aKey = (q) => String(q.a || "").trim().toLowerCase();
const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
index.categories = index.categories.filter((c) => c.name !== CAT);
index.categories.push({ name: CAT, file: FILE, count: list.length, uniqueAnswers: new Set(list.map(aKey)).size });
index.categories.sort((a, b) => a.name.localeCompare(b.name, "ar"));
index.total = index.categories.reduce((t, c) => t + c.count, 0);
index.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1), "utf8");

const qi = list.filter((q) => q.img).length, ai = list.filter((q) => q.aImg).length;
console.log(`✓ ${CAT}: ${list.length} سؤال في ${FILE} — ${qi} صورة سؤال، ${ai} صورة جواب`);
console.log(`✓ index.json: ${index.categories.length} فئة، ${index.total} سؤال`);
