// @ts-nocheck
import { CATS } from "../data/config";
import { norm } from "./judge";

/* ---------- عناصر مساعدة ---------- */
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const genCode = () => { const cs = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += cs[Math.floor(Math.random() * cs.length)]; return s; };
const genPid = () => "p" + Math.random().toString(36).slice(2, 8);
const MAX_SLOTS = 8;
const roomKey = (c) => `fz:room:${c}`;
const slotKey = (c, s) => `fz:s${s}:${c}`;   // مفتاح ثابت لكل لاعب — ما نحتاج list()
const qKey = (q) => (q.q || "") + "|" + (q.a || "");
// مفتاح الإجابة — نمنع تكرار نفس الجواب بنفس الجولة
const aKey = (q) => norm(q.a || "");
const isEventSlot = (idx) => idx > 0 && idx % 3 === 2;
// فئات ما فيها تقييم صعوبة — كل أسئلتها بنفس المستوى
const NO_DIFF = ["لور السولز"];
const noDiff = (c) => NO_DIFF.includes(c);

const INVENTIVE = ["فلسفة ومنطق", "طب وصحة", "اقتصاد وأعمال", "معالم", "مقولات", "مين الشخصية؟", "خمّن البوس", "خمّن اللعبة", "خمّن الشيء", "خمّن البوستر", "لعبة الحروف", "منطق وألغاز", "أمثال ومصطلحات", "طعام ومطبخ", "حيوانات", "فضاء", "السعودية", "سيارات", "اختراعات", "أعلام", "شكل ورسم", "وش الغرض؟", "الرابط المشترك", "قبل ولا بعد؟", "إيموجي", "دليلين", "الأغرب"];
const CLASSIC = CATS.filter((c) => !INVENTIVE.includes(c));
// خيارات التصويت تدور على كل الفئات: ما تتكرر فئة بالخيارات لين تطلع كل الفئات مرة
// (أو كل فئات الهوست المختارة لو حدد فئات)
const VOTE_N = 9;
const drawCats = (h) => {
  const pool = h.picked && h.picked.length ? h.picked : CATS;
  if (pool.length <= VOTE_N) return shuffle(pool);
  if (!Array.isArray(h.catDeck)) h.catDeck = [];
  h.catDeck = h.catDeck.filter((c) => pool.includes(c));
  const out = h.catDeck.splice(0, VOTE_N);
  if (out.length < VOTE_N) {
    // خلصت الدورة: نبدأ دورة جديدة ونكمّل منها بدون تكرار داخل نفس الجولة
    const fresh = shuffle(pool.filter((c) => !out.includes(c)));
    const fill = fresh.splice(0, VOTE_N - out.length);
    // اللي طلعت الحين من الدورة القديمة تنحط آخر الدورة الجديدة عشان ما ترجع قريب
    h.catDeck = [...fresh, ...shuffle(out)];
    out.push(...fill);
  }
  return shuffle(out);
};

/* عدد الأسئلة بكل فئة + غلاف الفئة */
/* العدّادات تجي جاهزة من index.json */
import { CAT_COUNT } from "./bank";

export { shuffle, genCode, genPid, MAX_SLOTS, roomKey, slotKey, qKey, aKey, isEventSlot, NO_DIFF, noDiff, INVENTIVE, CLASSIC, VOTE_N, drawCats, CAT_COUNT };
