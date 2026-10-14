/* يقرأ src/data/bank.ts ويطلّع منه:
     public/data/index.json      — قائمة الفئات والعدّادات
     public/data/<slug>.json     — أسئلة كل فئة
   شغّله: npm run split-bank    (بعد أي تعديل على bank.ts) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/data/bank.ts");
const OUT = path.join(ROOT, "public/data");

/* bank.ts بيانات صِرفة: نشيل التعليقات العلوية والتصدير ثم نقيّمها */
const raw = fs.readFileSync(SRC, "utf8");
const body = raw
  .replace(/^\s*\/\/\s*@ts-nocheck\s*$/m, "")
  .replace(/export\s*\{\s*BANK\s*\}\s*;?/, "");
const BANK = new Function(body + "\nreturn BANK;")();

if (!Array.isArray(BANK) || !BANK.length) {
  console.error("✗ ما قدرنا نقرأ BANK");
  process.exit(1);
}

/* اسم ملف لاتيني ثابت لكل فئة (أسماء الفئات عربية) */
const slugOf = (name) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ascii = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return (ascii && ascii.length > 1 ? ascii + "-" : "cat-") + h.toString(36);
};

const byCat = new Map();
for (const q of BANK) {
  if (!byCat.has(q.cat)) byCat.set(q.cat, []);
  byCat.get(q.cat).push(q);
}

/* نفس تطبيع الإجابة المستخدم في اللعبة (aKey) عشان العدّ يطابق boardReady */
const aKey = (q) => String(q.a || "").trim().toLowerCase();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = { generatedAt: new Date().toISOString().slice(0, 10), total: BANK.length, categories: [] };

for (const [cat, list] of byCat) {
  const slug = slugOf(cat);
  fs.writeFileSync(path.join(OUT, slug + ".json"), JSON.stringify(list), "utf8");
  index.categories.push({
    name: cat,
    file: slug + ".json",
    count: list.length,
    uniqueAnswers: new Set(list.map(aKey)).size,
  });
}
index.categories.sort((a, b) => a.name.localeCompare(b.name, "ar"));
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1), "utf8");

const bytes = fs.readdirSync(OUT).reduce((t, f) => t + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`✓ ${BANK.length} سؤال في ${byCat.size} فئة`);
console.log(`✓ ${fs.readdirSync(OUT).length} ملف في public/data  (${(bytes / 1048576).toFixed(2)} ميجا)`);
