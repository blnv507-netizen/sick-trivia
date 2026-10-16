// @ts-nocheck
import { askJudge } from "./net";

const AR_NUM = {
  "صفر": "0", "واحد": "1", "وحده": "1", "اثنين": "2", "اثنان": "2", "ثنين": "2",
  "ثلاثه": "3", "ثلاث": "3", "اربعه": "4", "اربع": "4", "خمسه": "5", "خمس": "5",
  "سته": "6", "ست": "6", "سبعه": "7", "سبع": "7", "ثمانيه": "8", "ثمان": "8",
  "تسعه": "9", "تسع": "9", "عشره": "10", "عشر": "10", "احدعشر": "11", "اثناعشر": "12",
  "مئه": "100", "مايه": "100", "الف": "1000",
};
const STOP = new Set(["ال", "من", "في", "على", "عن", "الى", "هو", "هي", "بن", "ابو", "ام", "the", "of", "a", "an"]);

const norm = (s) => (s || "").toString().trim().toLowerCase()
  .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
  .replace(/[أإآٱ]/g, "ا").replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي")
  .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "")
  .replace(/[\u064B-\u0652\u0640]/g, "")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ").trim();

const tokens = (s) => norm(s).split(" ")
  .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
  .map((w) => AR_NUM[w] || w)
  .filter((w) => w && !STOP.has(w));

const normNum = (s) => {
  const t = norm(s);
  const m = t.replace(/\s/g, "").match(/-?\d+(\.\d+)?/);
  if (m) return m[0];
  const w = tokens(s).find((x) => AR_NUM[x] || /^\d+$/.test(x));
  return w ? (AR_NUM[w] || w) : null;
};

// مسافة ليفنشتاين للتسامح مع الأخطاء الإملائية
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
const close = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const d = lev(a, b), L = Math.max(a.length, b.length);
  return d <= (L <= 4 ? 1 : L <= 8 ? 2 : 3) && 1 - d / L >= 0.75;
};


// ---- مطابقة صوتية بين العربي والإنجليزي ----
// نحوّل الاسم لهيكل حروف ساكنة، فيتطابق "ماليينيا" مع "Malenia" تلقائيًا
const AR_SKEL = {
  "ب": "b", "ت": "t", "ث": "t", "ج": "g", "ح": "h", "خ": "k", "د": "d", "ذ": "z",
  "ر": "r", "ز": "z", "س": "s", "ش": "s", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  "ع": "", "غ": "g", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "", "ي": "", "ا": "", "ء": "", "ة": "h", "ى": "", "پ": "b", "ڤ": "f", "چ": "j", "ژ": "z", "گ": "g",
};
function skeleton(s) {
  let t = norm(s);
  if (!t) return "";
  // إنجليزي: ثنائيات الحروف أولاً ثم حذف الحركات
  t = t.replace(/^ال/, "").replace(/ ال/g, " ");           // أل التعريف
  t = t.replace(/ph/g, "f").replace(/gh/g, "g").replace(/kh/g, "k")
       .replace(/sh/g, "s").replace(/ch/g, "s").replace(/th/g, "t")
       .replace(/dh/g, "d").replace(/ck/g, "k").replace(/qu/g, "k")
       .replace(/x/g, "ks").replace(/c([eiy])/g, "s$1")        // ce/ci/cy = س
       .replace(/c/g, "k").replace(/q/g, "k").replace(/v/g, "f")
       .replace(/p/g, "b").replace(/j/g, "g")                  // ج تُنطق g أو j
       .replace(/[aeiouwy]/g, "");
  let out = "";
  for (const ch of t) {
    if (AR_SKEL[ch] !== undefined) out += AR_SKEL[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === " ") out += " ";
  }
  // حذف التكرار المتجاور: "bb" -> "b"
  return out.replace(/(.)\1+/g, "$1").replace(/\s+/g, " ").trim();
}
function skelMatch(a, b) {
  const x = skeleton(a).replace(/\s/g, ""), y = skeleton(b).replace(/\s/g, "");
  if (!x || !y) return false;
  if (x === y) return x.length >= 2;
  if (x.length < 3 || y.length < 3) return false;
  const d = lev(x, y), L = Math.max(x.length, y.length);
  return d <= (L <= 5 ? 1 : 2) && 1 - d / L >= 0.7;
}

// التصحيح المحلي: يشتغل بدون إنترنت أو حساب
function localJudge(userText, modelAnswer, alts) {
  // نقبل الإجابة النموذجية أو أي بديل مسجل (عربي/إنجليزي)
  const list = [modelAnswer, ...(alts || [])].filter(Boolean);
  if (list.length > 1) return list.some((a) => judgeOne(userText, a));
  return judgeOne(userText, modelAnswer);
}

function judgeOne(userText, modelAnswer) {
  const u = norm(userText), m = norm(modelAnswer);
  if (!u) return false;
  if (u === m) return true;
  if (skelMatch(userText, modelAnswer)) return true; // عربي ضد إنجليزي
  // أرقام
  const un = normNum(userText), mn = normNum(modelAnswer);
  if (mn !== null && un !== null && un === mn) return true;
  if (mn !== null && un === null) return false;
  const ut = tokens(userText), mt = tokens(modelAnswer);
  if (!ut.length || !mt.length) return false;
  const uj = ut.join(" "), mj = mt.join(" ");
  if (uj === mj) return true;
  if (close(uj, mj)) return true;
  // كل كلمة مهمة بالإجابة النموذجية موجودة (أو قريبة) عند اللاعب
  const covered = mt.every((mw) => ut.some((uw) => close(uw, mw) || skelMatch(uw, mw)));
  if (covered) return true;
  // إجابة جزئية مقبولة: كل كلمة كتبها اللاعب موجودة بالإجابة، وفيها كلمة مميزة
  if (mt.length > 1) {
    const allInModel = ut.every((uw) => mt.some((mw) => close(uw, mw)));
    const hasKey = ut.some((uw) => uw.length >= 3 && mt.some((mw) => close(uw, mw)));
    if (allInModel && hasKey) return true;
  }
  return false;
}

async function judgeTyped(question, modelAnswer, entries, useAI, alts) {
  // 1) التصحيح المحلي أولاً — يشتغل دائمًا وبدون حساب
  const map = {};
  const unsure = [];
  entries.forEach((en) => {
    const ok = localJudge(en.text, modelAnswer, alts);
    map[en.pid] = ok;
    if (!ok) unsure.push(en); // المرفوضة محليًا نعطيها فرصة ثانية مع AI
  });
  if (!useAI || !unsure.length) return map;
  // 2) الـ AI يراجع المرفوضة بس (مرادفات، أسماء بديلة، صياغة مختلفة)
  try {
    // السيرفر يرجع معرّفات اللاعبين اللي إجاباتهم صحيحة (pid)
    const ok = await askJudge({ question, answer: modelAnswer, alts, entries: unsure.map((en) => ({ pid: en.pid, text: en.text })) });
    ok.forEach((pid) => { map[pid] = true; });
  } catch (e) { /* نكتفي بالتصحيح المحلي */ }
  return map;
}


export { AR_NUM, STOP, norm, tokens, normNum, lev, close, AR_SKEL, skeleton, skelMatch, localJudge, judgeOne, judgeTyped };
