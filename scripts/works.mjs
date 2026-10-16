/* وسوم الأعمال (فيلم / مسلسل / أنمي) لكل سؤال — عشان نفس العمل ما يتكرر باللعبة.
   المصدر الوحيد للتعديل: src/data/works.json
     works:      كل عمل: الاسم، النوع، الأسماء البديلة (إنجليزي وعربي)، والسلسلة (franchise) لو هو جزء منها
     franchises: السلاسل — أجزاء نفس العمل بس (العراب 1 و2، هاري بوتر…). الأعمال المشتقة (Better Call Saul) منفصلة
     manual:     وسوم يدوية بمعرّف السؤال (qid) للأسئلة اللي القواعد ما تلقطها؛ [] = السؤال مو عن عمل معيّن
   القواعد التلقائية تحت (rules). أي سؤال بفئة أفلام/مسلسلات/أنمي ما انوسم يطلع بالتقرير.
   شغّله:  npm run works            تقرير بس (ما يغيّر شي)
           npm run works -- --write يكتب "works" بكل سؤال في public/data + public/data/works-map.json
   (سكربتات البنوك — anime-bank، series-bank… — تشغّله تلقائيًا بعدها، لأنها تعيد كتابة ملفات الفئات) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qid } from "../src/lib/qid.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public/data");
const W = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/works.json"), "utf8"));
const WRITE = process.argv.includes("--write");

const norm = (s) => String(s || "").normalize("NFKC").toLowerCase()
  .replace(/[ً-ْٰـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/[’'`´]/g, "'").replace(/&/g, " and ").replace(/[^\p{L}\p{N}']+/gu, " ").trim();
const byName = new Map();
const clash = [];
for (const [id, w] of Object.entries(W.works)) for (const n of [w.title, ...(w.aliases || [])]) {
  const k = norm(n);
  if (byName.has(k) && byName.get(k) !== id) clash.push(`"${n}": ${byName.get(k)} / ${id}`); else byName.set(k, id);
}
const find = (name) => byName.get(norm(name)) || null;

// ---------- القواعد التلقائية ----------
// الفئات المخصصة لعمل واحد (لو انضافت فئة مخصصة جديدة: سطر هنا + "dedicated" بالسلسلة في works.json)
const DEDICATED = Object.fromEntries(Object.entries(W.franchises).filter(([, f]) => f.dedicated).map(([id, f]) => [f.dedicated, id]));
// «من أي فيلم…» / «خمّن المسلسل: …» / «ما الفيلم الذي…» → الجواب هو اسم العمل
const TITLE_Q = /(من أي|من اي|بأي|باي|وش اسم|ما اسم|ما|خمّن|خمن)\s+(سلسلة\s+أفلام|(ال)?(فيلم|فلم|مسلسل|أنمي|انمي))/;
const rules = {
  "مسلسلات": (q) => [q.series],
  "أحداث أفلام": (q) => [q.movie],
  "أنمي": (q) => [(q.q.match(/^من أنمي ([^:]+):/) || [])[1]],
  "خمّن البوستر": (q) => [q.a],
  "مقاطع فن أجنبي": (q) => [q.a],
  "شخصيات أنمي": (q) => [((q.info || "").match(/من ([^\.،]+?)(?:[\.،]|$)/) || [])[1]],
};
// فئات أسئلتها كلها عن أعمال (لازم كل سؤال ينوسم أو يكون له وسم يدوي)
const FILM_CATS = new Set([...Object.keys(rules), ...Object.keys(DEDICATED), "أفلام ومسلسلات"]);

const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const report = { perCat: {}, unknownNames: [], untagged: [], manualUsed: 0, manualMissing: new Set(Object.keys(W.manual || {})) };
let tagged = 0, total = 0;
for (const c of index.categories) {
  const file = path.join(DATA, c.file);
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const q of list) {
    total++;
    const id = qid(q);
    let works = null, how = "";
    if (W.manual && id in W.manual) { works = W.manual[id]; how = "manual"; report.manualUsed++; report.manualMissing.delete(id); }
    else if (DEDICATED[q.cat]) { works = [W.franchises[DEDICATED[q.cat]].main]; how = "dedicated"; }
    else if (rules[q.cat] || TITLE_Q.test(q.q)) {
      const names = rules[q.cat] ? rules[q.cat](q) : [q.a];
      works = [];
      for (const n of names.filter(Boolean)) {
        const w = find(n) || find(String(n).replace(/^the /i, ""));
        if (w) works.push(w); else report.unknownNames.push({ cat: q.cat, name: n, qid: id, q: q.q.slice(0, 80) });
      }
      how = rules[q.cat] ? "rule" : "asks for the title";
    }
    if (works && works.length) {
      tagged++;
      const pc = (report.perCat[q.cat] ||= {});
      for (const w of works) pc[w] = (pc[w] || 0) + 1;
    } else if (FILM_CATS.has(q.cat) && !(W.manual && id in W.manual)) {
      report.untagged.push({ cat: q.cat, qid: id, q: q.q.slice(0, 100), a: q.a });
    }
    if (WRITE) {
      const want = works && works.length ? [...new Set(works)] : undefined;
      if (JSON.stringify(q.works) !== JSON.stringify(want)) { if (want) q.works = want; else delete q.works; changed = true; }
    }
  }
  if (WRITE && changed) fs.writeFileSync(file, JSON.stringify(list), "utf8");
}

// ---------- التقرير ----------
const fr = (w) => (W.works[w] && W.works[w].franchise) || w;
console.log(`الأعمال: ${Object.keys(W.works).length} · السلاسل: ${Object.keys(W.franchises).length} · أسئلة موسومة: ${tagged}/${total} · يدوي: ${report.manualUsed}`);
if (clash.length) console.log("\n⚠ اسم واحد لعملين:\n  " + clash.join("\n  "));
if (report.unknownNames.length) console.log("\n⚠ أسماء ما لها عمل في works.json:\n" + report.unknownNames.map((x) => `  [${x.cat}] ${x.name} — ${x.q}`).join("\n"));
if (report.untagged.length) console.log("\n⚠ أسئلة بفئات الأفلام/المسلسلات بدون وسم:\n" + report.untagged.map((x) => `  [${x.cat}] ${x.qid} ${x.q} → ${x.a}`).join("\n"));
if (report.manualMissing.size) console.log(`\n⚠ وسوم يدوية لأسئلة ما عادت موجودة (تغيّر نصها؟): ${[...report.manualMissing].join(", ")}`);
if (process.argv.includes("--json")) fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify({ ...report, manualMissing: [...report.manualMissing], fr: Object.fromEntries(Object.keys(W.works).map((w) => [w, fr(w)])) }, null, 1));
if (WRITE) {
  // خريطة صغيرة للمتصفح: عمل → سلسلة (بس اللي لها سلسلة)، وفئة مخصصة → سلسلتها
  const map = {
    fr: Object.fromEntries(Object.entries(W.works).filter(([, w]) => w.franchise).map(([id, w]) => [id, w.franchise])),
    dedicated: Object.fromEntries(Object.entries(W.franchises).filter(([, f]) => f.dedicated).map(([id, f]) => [f.dedicated, id])),
  };
  fs.writeFileSync(path.join(DATA, "works-map.json"), JSON.stringify(map), "utf8");
  console.log("\n✓ انكتبت الوسوم في public/data و works-map.json");
}
if (report.unknownNames.length || report.untagged.length || clash.length) process.exitCode = 1;
