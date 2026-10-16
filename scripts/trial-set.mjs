/* مجموعة التجربة: أسئلة أول لعبة لأي حساب جديد — نفسها للكل.
   لكل فئة 6 أسئلة (2 سهل، 2 متوسط، 2 صعب) = لوحة فئة وحدة في الطورين.
   ثابتة: الفئة اللي لها مجموعة ما تتغير أبدًا حتى لو انضافت أسئلة للبنك. الفئة الجديدة تاخذ مجموعتها أول مرة تشغّل السكربت.
   الاختيار حتمي (عشوائي ببذرة من اسم الفئة)، ويمشي على قواعد الأعمال:
     - الفئات العادية ما فيها ولا سؤال عن سلسلة لها فئة مخصصة (Game of Thrones…)
     - كل سلسلة تظهر مرة وحدة بس بكل مجموعات التجربة (فأي 6 فئات تنختار ما يتكرر فيها عمل)
   المخرج: public/data/trial.json  —  شغّله: npm run trial-set  (بعد npm run works -- --write) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qid } from "../src/lib/qid.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public/data");
const OUT = path.join(DATA, "trial.json");
const NO_DIFF = ["لور السولز"];
const PER = [1, 1, 2, 2, 3, 3];

const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(DATA, "works-map.json"), "utf8"));
const trial = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { cats: {} };
trial["//"] = "أسئلة أول لعبة (نفسها لكل حساب جديد) — معرّفات qid. لا تعدّل فئة موجودة إلا لو تبي تغيّر تجربتها عمدًا. scripts/trial-set.mjs";
const fr = (q) => [...new Set((q.works || []).map((w) => map.fr[w] || w))];
const dedFr = new Set(Object.values(map.dedicated));
const norm = (s) => String(s || "").trim().toLowerCase();

// بذرة ثابتة من اسم الفئة
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e9) / 1e9; };
}

const all = {}; const byId = new Map();
for (const c of index.categories) {
  all[c.name] = JSON.parse(fs.readFileSync(path.join(DATA, c.file), "utf8"));
  for (const q of all[c.name]) byId.set(qid(q), q);
}

// السلاسل المحجوزة من المجموعات الموجودة (الفئات العادية بس)
const usedFr = new Set();
for (const [cat, ids] of Object.entries(trial.cats)) {
  if (map.dedicated[cat]) continue;
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) console.log(`⚠ «${cat}»: ${missing.length} من أسئلة التجربة ما عادت بالبنك (تغيّر نصها؟) — اللعبة تكمل الخانة من البنك`);
  for (const id of ids) { const q = byId.get(id); if (q) fr(q).forEach((f) => usedFr.add(f)); }
}

let added = 0;
for (const c of index.categories) {
  const cat = c.name;
  if (trial.cats[cat]) continue;                       // ثابتة: ما نلمس الموجود
  const dedicated = !!map.dedicated[cat];
  const r = rng(cat);
  const pool = [...all[cat]].sort((a, b) => (qid(a) < qid(b) ? -1 : 1));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const pick = [], ans = new Set(), mine = new Set();
  const ok = (q, strict) => {
    if (ans.has(norm(q.a))) return false;
    if (dedicated) return true;
    const f = fr(q);
    if (f.some((x) => dedFr.has(x))) return false;                       // قاعدة أ: أبدًا
    if (strict && f.some((x) => usedFr.has(x) || mine.has(x))) return false; // قاعدة ب
    return true;
  };
  let relaxed = false;
  for (const want of PER) {
    const diffOk = (q) => NO_DIFF.includes(cat) || (q.d || 2) === want;
    let q = pool.find((x) => !pick.includes(x) && diffOk(x) && ok(x, true))
         || pool.find((x) => !pick.includes(x) && ok(x, true));             // صعوبة قريبة
    if (!q) { q = pool.find((x) => !pick.includes(x) && diffOk(x) && ok(x, false)) || pool.find((x) => !pick.includes(x) && ok(x, false)); if (q) relaxed = true; }
    if (!q) break;
    pick.push(q); ans.add(norm(q.a)); fr(q).forEach((f) => mine.add(f));
  }
  if (pick.length < PER.length) console.log(`⚠ «${cat}»: لقينا ${pick.length} أسئلة بس للتجربة`);
  if (relaxed) console.log(`⚠ «${cat}»: تكرر فيها عمل موجود بفئة ثانية بالتجربة (ما فيه بديل)`);
  if (!dedicated) mine.forEach((f) => usedFr.add(f));
  trial.cats[cat] = pick.map(qid);
  added++;
}
trial.cats = Object.fromEntries(Object.entries(trial.cats).sort(([a], [b]) => a.localeCompare(b, "ar")));
fs.writeFileSync(OUT, JSON.stringify(trial, null, 1), "utf8");
console.log(`✓ trial.json: ${Object.keys(trial.cats).length} فئة (${added} جديدة)`);
