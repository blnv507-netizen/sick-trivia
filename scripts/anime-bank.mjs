/* ينشر بنك الأنمي (src/data/animeBank.ts) كفئة وحدة "أنمي":
     1) يضبط img/aImg في animeBank.ts حسب الصور الموجودة فعلاً في
        public/img/anime/<slug>/ — NN.webp للجواب و NNq.webp للسؤال
        (NN رقم السؤال داخل الأنمي، يبدأ من 01)
     2) يكتب public/data/anime.json (كل سؤال يبدأ بـ "من أنمي X: ") ويحدّث index.json
   شغّله: npm run anime-bank    (بعد إضافة صور أو تعديل animeBank.ts) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/data/animeBank.ts");
const IMG = path.join(ROOT, "public/img/anime");
const OUT = path.join(ROOT, "public/data");
const CAT = "أنمي", FILE = "anime.json";

const raw = fs.readFileSync(SRC, "utf8");
const { ANIME_LIST, animeSlug } = new Function(raw.replace(/export const /g, "const ") + "\nreturn { ANIME_LIST, animeSlug };")();

/* نفس تنسيق الملف: {"key": value, ...} بسطر واحد */
const ser = (v) => Array.isArray(v) ? "[" + v.map(ser).join(", ") + "]"
  : v && typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + ser(x)).join(", ") + "}"
  : JSON.stringify(v);

const pad = (n) => String(n).padStart(2, "0");
const has = (slug, f) => fs.existsSync(path.join(IMG, slug, f));

const idx = {};
const byCat = new Map(ANIME_LIST.map((c) => [c, []]));
const lines = raw.split("\n").map((line) => {
  const m = line.match(/^(\s*)(\{.*\})(,?)(\r?)$/);
  if (!m) return line;
  const q = JSON.parse(m[2]);
  if (!byCat.has(q.cat)) throw new Error("فئة مو موجودة في ANIME_LIST: " + q.cat);
  const n = (idx[q.cat] = (idx[q.cat] || 0) + 1);
  const slug = animeSlug(q.cat);
  delete q.img;
  delete q.aImg;
  if (has(slug, pad(n) + "q.webp")) q.img = `/img/anime/${slug}/${pad(n)}q.webp`;
  if (has(slug, pad(n) + ".webp")) q.aImg = `/img/anime/${slug}/${pad(n)}.webp`;
  byCat.get(q.cat).push(q);
  return m[1] + ser(q) + m[3] + m[4];
});
fs.writeFileSync(SRC, lines.join("\n"), "utf8");

const aKey = (q) => String(q.a || "").trim().toLowerCase();
const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
index.categories = index.categories.filter((c) => c.name !== CAT && !byCat.has(c.name));

/* كل الأنميات فئة وحدة؛ cat في animeBank.ts يبقى اسم الأنمي ويصير بادئة للسؤال */
const merged = [];
for (const [anime, list] of byCat) {
  for (const q of list) merged.push({ ...q, cat: CAT, q: `من أنمي ${anime}: ${q.q}` });

  const qi = list.filter((q) => q.img).length, ai = list.filter((q) => q.aImg).length;
  const noImg = list.map((q, i) => (q.img || q.aImg ? null : pad(i + 1))).filter(Boolean);
  console.log(`✓ ${anime}: ${list.length} سؤال — ${qi} صورة سؤال، ${ai} صورة جواب` + (noImg.length ? ` — بلا صورة: ${noImg.join(" ")}` : ""));
}
fs.writeFileSync(path.join(OUT, FILE), JSON.stringify(merged), "utf8");
index.categories.push({ name: CAT, file: FILE, count: merged.length, uniqueAnswers: new Set(merged.map(aKey)).size });
console.log(`✓ ${CAT}: ${merged.length} سؤال في ${FILE}`);

index.categories.sort((a, b) => a.name.localeCompare(b.name, "ar"));
index.total = index.categories.reduce((t, c) => t + c.count, 0);
index.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1), "utf8");
console.log(`✓ index.json: ${index.categories.length} فئة، ${index.total} سؤال`);
