/* يكتب public/data/img-manifest.json: لكل صورة في public/img ومقطع في public/media بصمة قصيرة من محتواها.
   التطبيق يضيفها للرابط (?v=بصمة)، والخادم يخزّن الروابط اللي فيها v سنة كاملة.
   لو تغيّرت صورة بنفس الاسم تتغير البصمة، فيتغير الرابط وينزل الجديد.
   يشتغل تلقائيًا قبل vite build (npm run build)، والملف ما ينحفظ بـ git. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["img", "media"];
const OUT = path.join(ROOT, "public/data/img-manifest.json");
const SKIP = new Set(["CAT_INFO"]);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (SKIP.has(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);

const manifest = {};
for (const dir of DIRS) {
  const base = path.join(ROOT, "public", dir);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base).sort()) {
    const url = "/" + dir + "/" + path.relative(base, file).split(path.sep).join("/");
    manifest[url] = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
  }
}
fs.writeFileSync(OUT, JSON.stringify(manifest));
console.log(`✓ img-manifest.json: ${Object.keys(manifest).length} ملف`);
