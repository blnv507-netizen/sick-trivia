/* ينشر بنك مسلسل كفئة وحدة — "مسلسلات" (seriesBank.ts) أو "The Wire" (wireBank.ts) أو "Game of Thrones" (gotBank.ts):
     1) يضبط img/aImg في ملف البنك: يشيل أي مسار صورته مو موجودة، ويعبّي
        الفاضي من مجلد صور الفئة — NNN.webp للجواب و NNNq.webp للسؤال
        (NNN رقم السؤال بالبنك، يبدأ من 001). الصورة المعاد استخدامها تبقى
        تأشر على ملف سؤال ثاني (أو فئة ثانية). السؤال اللي بلا صورة ينعرض نص بس
     2) يكتب ملف الفئة في public/data ويحدّث index.json
   شغّله: npm run series-bank / wire-bank / got-bank
   (بعد إضافة صور أو تعديل ملف البنك) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BANKS = {
  series: { src: "src/data/seriesBank.ts", img: "series", cat: "مسلسلات", file: "series.json" },
  wire: { src: "src/data/wireBank.ts", img: "the-wire", cat: "The Wire", file: "the-wire.json" },
  got: { src: "src/data/gotBank.ts", img: "game-of-thrones", cat: "Game of Thrones", file: "game-of-thrones.json" },
};
const B = BANKS[process.argv[2] || "series"];
if (!B) throw new Error("بنك غير معروف: " + process.argv[2] + " — المتاح: " + Object.keys(BANKS).join(", "));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, B.src);
const IMG = path.join(ROOT, "public/img", B.img);
const OUT = path.join(ROOT, "public/data");
const CAT = B.cat, FILE = B.file;

/* نفس تنسيق الملف: {"key": value, ...} بسطر واحد */
const ser = (v) => Array.isArray(v) ? "[" + v.map(ser).join(", ") + "]"
  : v && typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + ser(x)).join(", ") + "}"
  : JSON.stringify(v);

const pad = (n) => String(n).padStart(3, "0");
const exists = (src) => fs.existsSync(path.join(ROOT, "public", src));

const list = [];
const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split("\n").map((line) => {
  const m = line.match(/^(\s*)(\{.*\})(,?)(\r?)$/);
  if (!m) return line;
  const q = JSON.parse(m[2]);
  if (q.cat !== CAT) throw new Error("فئة غير متوقعة: " + q.cat);
  const n = pad(list.length + 1);
  for (const [key, file] of [["img", n + "q.webp"], ["aImg", n + ".webp"]]) {
    if (q[key] && !exists(q[key])) delete q[key];
    if (!q[key] && fs.existsSync(path.join(IMG, file))) q[key] = `/img/${B.img}/${file}`;
  }
  /* ترتيب ثابت للمفاتيح: الصور آخر شي */
  const { img, aImg, ...rest } = q;
  const out = { ...rest, ...(img && { img }), ...(aImg && { aImg }) };
  list.push(out);
  return m[1] + ser(out) + m[3] + m[4];
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
