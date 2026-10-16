// @ts-nocheck
/* روابط الصور والتحميل المسبق.

   imgUrl: يضيف ?v=بصمة المحتوى (من public/data/img-manifest.json) لرابط الصورة.
   الخادم يخزّن /img اللي فيها v سنة كاملة، ولو تغيّرت الصورة تتغير البصمة.
   لو الملف ما نزل، الرابط يرجع بدون v والخادم يتحقق منه كل مرة — يشتغل بس أبطأ.

   preload: يحمّل صور بالخلفية قبل ما تنطلب، فتطلع فورًا من الكاش. */

const V = {};
let pending = null;

export function loadImgManifest() {
  if (pending) return pending;
  pending = fetch("/data/img-manifest.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((m) => { Object.assign(V, m); })
    .catch(() => { /* بدون بصمات: الروابط تشتغل عادي */ });
  return pending;
}

export const imgUrl = (src) => (src && V[src] ? `${src}?v=${V[src]}` : src);

// صور الأسئلة داخل مجلدات الأنمي وأحداث الأفلام والمسلسلات وThe Wire وGame of Thrones وBreaking Bad وصور البوسترات تنعرض بصندوق مربع ثابت، مهما كانت دقتها
export const isBoxImg = (src) => /^\/img\/(anime\/[^/]+|movie-plot|series|the-wire|game-of-thrones|breaking-bad|posters)\//.test(src || "");
// خلفية الصندوق: نفس الصورة مغبّشة ومعتّمة تعبّي الفراغ حول الصورة اللي مو مربعة (::before في CSS يقرأ --bg)
export const boxBg = (src) => (isBoxImg(src) ? { "--bg": `url(${JSON.stringify(imgUrl(src))})` } : undefined);
// لين تتحمّل الصورة، الصندوق يعرض خلفية ناعمة متحركة؛ onLoad يحط ready ويطلع الصورة بتلاشي
export const markBoxReady = (ev) => ev.currentTarget.parentElement.classList.add("ready");

/* طابور تحميل بالخلفية: كم صورة بنفس الوقت، بأولوية منخفضة، وما يعيد اللي تحمّل */
const done = new Set();
const queue = [];
let active = 0;
const LIMIT = 3;

function fetchImg(url, priority, onDone) {
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = priority;
  if (onDone) img.onload = img.onerror = onDone;
  img.src = url;
}

function pump() {
  while (active < LIMIT && queue.length) {
    const { url } = queue.shift();
    active++;
    fetchImg(url, "low", () => { active--; pump(); });
  }
}

/* srcs: مسارات بدون v. "low" تنتظر دورها بالطابور، غيرها يبدأ فورًا (صورة الجواب مثلًا) */
export function preload(srcs, priority = "low") {
  for (const src of [].concat(srcs)) {
    const url = imgUrl(src);
    if (!url || done.has(url)) continue;
    done.add(url);
    if (priority === "low") queue.push({ url });
    else fetchImg(url, priority);
  }
  pump();
}
