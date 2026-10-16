/* ينشر فئة "مقاطع فن أجنبي" من raw-images/clips.csv (no,url,start_sec,end_sec,length_sec,difficulty,answer,alt):
     1) يقص كل مقطع من raw-images/clips/NNN.mp4 (القطعة المنزّلة بـ yt-dlp، تبدأ قبل start_sec بثانية
        — أو من 0 لو start_sec أقل من ثانية) بالضبط من start_sec لين end_sec، ويطلع:
          public/media/clips/NNN.mp4  فيديو H.264 + AAC، أقصى ارتفاع 480، faststart
          public/media/clips/NNN.m4a  صوت بس، AAC ‎96k
          public/img/clips/NNN.webp   لقطة من نص المقطع (صورة الجواب)
        بدون أي metadata (عنوان وغيره). الرقم من عمود no، فاسم الملف ما يكشف الجواب
     2) يكتب public/data/foreign-clips.json ويحدّث index.json
   يحتاج ffmpeg بالـ PATH (أو FFMPEG=مسار). الملف الموجود ما ينقص من جديد إلا مع --force
   شغّله: npm run clips-bank */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "raw-images/clips.csv");
const RAW = path.join(ROOT, "raw-images/clips");
const MEDIA = path.join(ROOT, "public/media/clips");
const IMG = path.join(ROOT, "public/img/clips");
const OUT = path.join(ROOT, "public/data");
const CAT = "مقاطع فن أجنبي", FILE = "foreign-clips.json";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FORCE = process.argv.includes("--force");
sharp.cache(false);  // نفس ملف اللقطة ينكتب أكثر من مرة

/* سطر CSV فيه حقول بين "" (الجواب ممكن فيه فاصلة) */
const parse = (line) => {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
};

const ff = (args) => execFileSync(FFMPEG, ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });

/* توحيد الصوت: المقاطع من مصادر مختلفة (بعضها أعلى من غيره بـ 50 dB)، فنقيس كل مقطع
   ونرفعه/نخفّضه لنفس العلو (‎-16 LUFS) بمرحلتين — عشان ما يحتاج أحد يلعب بالصوت كل سؤال */
const LOUD = "I=-16:TP=-1.5:LRA=11";
const loudnorm = (src, off, len) => {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-ss", String(off), "-i", src, "-t", String(len), "-map", "0:a:0",
    "-af", `loudnorm=${LOUD}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const j = r.stderr.lastIndexOf("{");
  const m = JSON.parse(r.stderr.slice(j, r.stderr.indexOf("}", j) + 1));
  // مقطع شبه صامت بالأصل: رفعه 50 dB يطلّع وشيش بس، فالرفع أقصاه 20 dB
  if (-16 - +m.input_i > 20) return "volume=20dB,alimiter=limit=0.84:level=false,aresample=48000";
  return `loudnorm=${LOUD}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}`
    + `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
};
const CLEAN = ["-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact"];
const pad = (n) => String(n).padStart(3, "0");

fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(IMG, { recursive: true });

const rows = fs.readFileSync(CSV, "utf8").replace(/\r/g, "").trim().split("\n").slice(1).map(parse);
const list = [];
for (const [no, , s, e, , d, a, alt] of rows) {
  const id = pad(no), start = +s, end = +e, len = end - start;
  const off = Math.min(start, 1);  // القطعة المنزّلة تبدأ عند max(start-1, 0)
  const src = path.join(RAW, id + ".mp4");
  const mp4 = path.join(MEDIA, id + ".mp4"), m4a = path.join(MEDIA, id + ".m4a"), still = path.join(IMG, id + ".webp");
  if (!a || !d) throw new Error(`الصف ${no}: الجواب أو الصعوبة فاضي`);
  const af = (FORCE || !fs.existsSync(mp4) || !fs.existsSync(m4a)) ? loudnorm(src, off, len) : null;
  if (FORCE || !fs.existsSync(mp4)) {
    ff(["-ss", String(off), "-i", src, "-t", String(len), "-map", "0:v:0", "-map", "0:a:0",
      "-vf", "scale=-2:'min(480,ih)':flags=lanczos,format=yuv420p", "-af", af,
      "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-profile:v", "main", "-maxrate", "900k", "-bufsize", "1800k",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", ...CLEAN, mp4]);
  }
  if (FORCE || !fs.existsSync(m4a)) {
    ff(["-ss", String(off), "-i", src, "-t", String(len), "-map", "0:a:0", "-vn", "-af", af,
      "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", ...CLEAN, m4a]);
  }
  if (FORCE || !fs.existsSync(still)) {
    const png = path.join(RAW, id + "-still.png");
    // لقطة النص؛ لو طلعت شبه سودا (مشهد معتم أو انتقال) ناخذ الأوضح من لقطات قريبة منها
    const grab = async (at) => { ff(["-ss", String(off + len * at), "-i", src, "-frames:v", "1", png]); return (await sharp(png).stats()).channels.slice(0, 3).reduce((t, c) => t + c.mean, 0) / 3; };
    if (await grab(0.5) < 30) {
      let best = [0.5, -1];
      for (const at of [0.5, 0.35, 0.65, 0.2, 0.8]) { const l = await grab(at); if (l > best[1]) best = [at, l]; }
      await grab(best[0]);
    }
    // trim يشيل الأشرطة السودا فوق وتحت (لقطات السينما العريضة)
    // — بس لو اللي انشال أشرطة فعلًا (العرض كامل تقريبًا)، مو مشهد غامق انقص نصه
    const orig = await sharp(png).metadata();
    const t = await sharp(png).trim({ background: "#000", threshold: 24 }).toBuffer({ resolveWithObject: true }).catch(() => null);
    const bars = t && t.info.width >= orig.width * 0.97 && t.info.height >= orig.height * 0.5;
    await sharp(bars ? t.data : png).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 75 }).toFile(still);
    fs.unlinkSync(png);
  }
  list.push({ cat: CAT, d: +d, q: "من وين هالمقطع؟", a, alt: alt ? alt.split("|") : [], clip: "/media/clips/" + id, aImg: "/img/clips/" + id + ".webp" });
  process.stdout.write(".");
}
console.log();
fs.writeFileSync(path.join(OUT, FILE), JSON.stringify(list), "utf8");

const aKey = (q) => String(q.a || "").trim().toLowerCase();
const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
index.categories = index.categories.filter((c) => c.name !== CAT);
index.categories.push({ name: CAT, file: FILE, count: list.length, uniqueAnswers: new Set(list.map(aKey)).size });
index.categories.sort((a, b) => a.name.localeCompare(b.name, "ar"));
index.total = index.categories.reduce((t, c) => t + c.count, 0);
index.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1), "utf8");

const by = [1, 2, 3].map((k) => `${k}: ${list.filter((q) => q.d === k).length}`).join("، ");
console.log(`✓ ${CAT}: ${list.length} مقطع في ${FILE} (الصعوبة ${by})`);
console.log(`✓ index.json: ${index.categories.length} فئة، ${index.total} سؤال`);
