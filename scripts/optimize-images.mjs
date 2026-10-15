/* يصغّر صور public/img لحجم العرض الفعلي (الصندوق أقصاه ~520px):
     - صور الأسئلة والأجوبة: عرض أقصى 800px، جودة 75
     - أغلفة الفئات (img/cats): عرض أقصى 480px، جودة 75
     - ما يكبّر أي صورة. الصورة اللي أصغر من الحد تنعاد بجودة 75 بس لو وفّرت 10%+،
       فتشغيله مرة ثانية ما يضيّع الجودة (ما يلقى شي يوفّر فيه)
     - صور jpg/png/avif اللي تستخدمها الأسئلة تتحول webp، ومساراتها تتعدل في public/data
   الأصول تبقى في raw-images، هذا يغيّر ملفات public بس.
   شغّله: npm run optimize-images    (بعد إضافة صور جديدة) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG = path.join(ROOT, "public/img");
const DATA = path.join(ROOT, "public/data");
const QUALITY = 75, MAX_Q = 800, MAX_COVER = 480, MIN_SAVING = 0.1;
const SKIP = new Set(["CAT_INFO"]);   // مصادر الأغلفة الأصلية (مو منشورة)

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (SKIP.has(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const maxFor = (file) => (path.relative(IMG, file).split(path.sep)[0] === "cats" ? MAX_COVER : MAX_Q);

async function encode(src, max) {
  const input = fs.readFileSync(src);   // من الذاكرة: على ويندوز sharp يمسك الملف مفتوح ويمنع الكتابة فوقه
  const meta = await sharp(input).metadata();
  let img = sharp(input).rotate();
  if (meta.width > max) img = img.resize({ width: max, withoutEnlargement: true });
  return { buf: await img.webp({ quality: QUALITY }).toBuffer(), resized: meta.width > max };
}

/* 1) jpg/png/avif المستخدمة بالأسئلة -> webp، وتحديث المسارات */
const files = fs.readdirSync(DATA).filter((f) => f.endsWith(".json") && f !== "index.json");
const legacy = new Map();   // "/img/x.jpg" -> "/img/x.webp"
for (const f of files) {
  for (const q of JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"))) {
    for (const p of [q.img, q.aImg]) {
      if (p && /\.(jpe?g|png|avif)$/i.test(p) && fs.existsSync(path.join(ROOT, "public", p))) legacy.set(p, p.replace(/\.(jpe?g|png|avif)$/i, ".webp"));
    }
  }
}
let converted = 0;
for (const [from, to] of legacy) {
  const out = path.join(ROOT, "public", to);
  if (fs.existsSync(out) && !process.argv.includes("--force")) throw new Error(`${to} موجود — اسم متكرر، راجعه يدويًا`);
  const { buf } = await encode(path.join(ROOT, "public", from), MAX_Q);
  fs.writeFileSync(out, buf);
  fs.unlinkSync(path.join(ROOT, "public", from));
  converted++;
}
if (legacy.size) {
  for (const f of files) {
    const p = path.join(DATA, f);
    const raw = fs.readFileSync(p, "utf8");
    const list = JSON.parse(raw);
    let changed = false;
    for (const q of list) for (const k of ["img", "aImg"]) if (legacy.has(q[k])) { q[k] = legacy.get(q[k]); changed = true; }
    if (changed) fs.writeFileSync(p, JSON.stringify(list) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
  }
}

/* 2) كل webp: تصغير لحد العرض، أو إعادة ضغط لو توفّر */
let resized = 0, recompressed = 0, kept = 0, before = 0, after = 0;
for (const file of walk(IMG)) {
  if (!file.endsWith(".webp")) continue;
  const old = fs.statSync(file).size;
  const { buf, resized: r } = await encode(file, maxFor(file));
  before += old;
  if (r || buf.length <= old * (1 - MIN_SAVING)) {
    fs.writeFileSync(file, buf);
    after += buf.length;
    r ? resized++ : recompressed++;
  } else { after += old; kept++; }
}
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
console.log(`✓ تحويل jpg/png/avif → webp: ${converted}`);
console.log(`✓ webp: ${resized} تصغّرت، ${recompressed} انضغطت أكثر، ${kept} على حالها — ${mb(before)} → ${mb(after)}`);
