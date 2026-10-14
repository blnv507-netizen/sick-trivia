/* يفحص ملفات public/data ويطلّع المشاكل.
   شغّله: npm run check-bank
   يخرج برقم 1 لو فيه خطأ يوقف اللعبة، عشان ينفع في CI لاحقاً. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/data");
const BOARD_VALUES = 3;   // 200/400/600 — فئة اللوحة تحتاج 3 إجابات فريدة على الأقل

if (!fs.existsSync(path.join(DIR, "index.json"))) {
  console.error("✗ ما فيه public/data/index.json — شغّل: npm run split-bank");
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const aKey = (q) => String(q.a || "").trim().toLowerCase();

let errors = 0, warnings = 0, totalQ = 0;
const dupReport = [];

for (const c of index.categories) {
  const p = path.join(DIR, c.file);
  if (!fs.existsSync(p)) { console.error(`✗ ${c.name}: الملف ${c.file} مفقود`); errors++; continue; }

  let list;
  try { list = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error(`✗ ${c.name}: JSON غير صالح — ${e.message}`); errors++; continue; }

  if (!Array.isArray(list)) { console.error(`✗ ${c.name}: المحتوى مو مصفوفة`); errors++; continue; }
  totalQ += list.length;

  /* حقول ناقصة */
  list.forEach((q, i) => {
    if (!q || typeof q !== "object") { console.error(`✗ ${c.name}[${i}]: عنصر غير صالح`); errors++; return; }
    if (!q.q) { console.error(`✗ ${c.name}[${i}]: ما فيه نص سؤال (q)`); errors++; }
    if (!q.a) { console.error(`✗ ${c.name}[${i}]: ما فيه إجابة (a)`); errors++; }
    if (q.cat !== c.name) { console.error(`✗ ${c.name}[${i}]: الفئة داخل السؤال "${q.cat}" ما تطابق الملف`); errors++; }
    if (q.opts && (!Array.isArray(q.opts) || !q.opts.includes(q.a))) {
      console.error(`✗ ${c.name}[${i}]: الإجابة مو ضمن الخيارات — "${String(q.q).slice(0, 40)}"`); errors++;
    }
  });

  /* إجابات مكررة داخل الفئة */
  const seen = new Map();
  const dups = [];
  for (const q of list) {
    const k = aKey(q);
    if (!k) continue;
    if (seen.has(k)) dups.push({ a: q.a, first: seen.get(k), q: q.q });
    else seen.set(k, q.q);
  }
  if (dups.length) {
    warnings += dups.length;
    dupReport.push({ cat: c.name, dups });
  }

  /* عدّادات index محدّثة؟ */
  if (c.count !== list.length) { console.error(`✗ ${c.name}: العدد في index (${c.count}) ما يطابق الملف (${list.length}) — شغّل split-bank`); errors++; }
  if (c.uniqueAnswers !== seen.size) { console.error(`✗ ${c.name}: عدد الإجابات الفريدة ما يطابق — شغّل split-bank`); errors++; }

  /* تكفي للوحة؟ */
  if (seen.size < BOARD_VALUES) {
    console.warn(`⚠ ${c.name}: ${seen.size} إجابة فريدة فقط — ما تنفع للوحة (تحتاج ${BOARD_VALUES})`);
    warnings++;
  }
}

if (dupReport.length) {
  console.log("\n── إجابات مكررة داخل نفس الفئة ──");
  for (const r of dupReport) {
    console.log(`\n  ${r.cat} — ${r.dups.length} تكرار`);
    r.dups.slice(0, 4).forEach((d) => {
      console.log(`    «${d.a}»`);
      console.log(`      ١) ${String(d.first).slice(0, 62)}`);
      console.log(`      ٢) ${String(d.q).slice(0, 62)}`);
    });
    if (r.dups.length > 4) console.log(`    … و${r.dups.length - 4} غيرها`);
  }
}

console.log(`\n${index.categories.length} فئة · ${totalQ} سؤال`);
console.log(errors ? `✗ ${errors} خطأ` : "✓ ما فيه أخطاء");
if (warnings) console.log(`⚠ ${warnings} تنبيه (ما توقف اللعبة)`);
process.exit(errors ? 1 : 0);
