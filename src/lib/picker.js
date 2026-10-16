/* قواعد اختيار الأسئلة — مشتركة بين طور الفئات واللعب السريع (وسكربت الاختبار).

   الأعمال (أفلام/مسلسلات/أنمي): كل سؤال فيه works = [معرّف العمل…] (من scripts/works.mjs)،
   وworks-map.json يربط كل عمل بسلسلته (العراب 1 و2 = سلسلة وحدة) ويحدد الفئات المخصصة.

   أ) فئة مخصصة مختارة (The Wire، Game of Thrones…) ← ولا سؤال عن نفس السلسلة بأي فئة ثانية باللعبة. ما تنكسر أبدًا.
   ب) باقي الفئات ← كل سلسلة مرة وحدة بس باللعبة كلها. لو فئة ما تكمل لوحتها، تنفك هالقاعدة لهالفئة بس (وتنكتب بالكونسول).
   + الأسئلة اللي لعبها الحساب قبل ما تتكرر — إلا لو خلصت أسئلة الفئة (تنكتب بالكونسول).

   مجموعة التجربة (أول لعبة لأي حساب): نفس الأسئلة للكل من trial.json، وتمشي على نفس القواعد. */

let FR = {};        // عمل → سلسلة
let DED = {};       // فئة مخصصة → سلسلتها
export function setWorksMap(m) { FR = (m && m.fr) || {}; DED = (m && m.dedicated) || {}; }
export const franchisesOf = (q) => [...new Set(((q && q.works) || []).map((w) => FR[w] || w))];
export const dedicatedOf = (cat) => DED[cat] || null;

/* حالة لعبة وحدة. cats = الفئات المختارة (لو معروفة مسبقًا) */
export function newGame(cats = []) {
  const G = { ded: new Map(), used: new Set(), relaxed: new Set(), log: [] };
  for (const c of cats) addCategory(G, c);
  return G;
}
// اللعب السريع العادي: الفئات تنعرف وحدة وحدة بالتصويت
export function addCategory(G, cat) {
  const f = DED[cat];
  if (f && !G.ded.has(f)) G.ded.set(f, cat);
}

// تنبيه بالكونسول — مرة وحدة لكل رسالة باللعبة
const say = (G, msg) => { if (G.log.includes(msg)) return; G.log.push(msg); if (typeof console !== "undefined") console.warn("[picker] " + msg); };

// قاعدة أ: سؤال عن سلسلة لها فئة مخصصة باللعبة، وهو مو من هالفئة
const breaksA = (G, q) => franchisesOf(q).some((f) => G.ded.has(f) && G.ded.get(f) !== q.cat);
// قاعدة ب: سلسلة انعرضت قبل (الفئات المخصصة نفسها ما تنحسب — كل أسئلتها عن نفس العمل)
const breaksB = (G, q) => !DED[q.cat] && franchisesOf(q).some((f) => G.used.has(f));

/* يرجع أفضل مجموعة مرشحين لفئة: يطبّق القواعد بالترتيب، ويفكّ الأخف أول لو ما بقى شي.
   pool: أسئلة الفئة بعد فلاتر الوضع (نفس الجواب، اللي انعرض بالجولة…)
   played: Set من qid اللي لعبها الحساب (أو null) */
export function candidates(G, cat, pool, played, qidOf) {
  const okA = pool.filter((q) => !breaksA(G, q));
  const fresh = played ? okA.filter((q) => !played.has(qidOf(q))) : okA;
  const strict = fresh.filter((q) => !breaksB(G, q));
  if (strict.length) return strict;
  if (fresh.length) {
    if (!G.relaxed.has(cat)) { G.relaxed.add(cat); say(G, `«${cat}»: ما فيه أسئلة كافية بدون تكرار سلسلة — فكّينا قاعدة التكرار لهالفئة بس`); }
    return fresh;
  }
  if (okA.length) {
    say(G, `«${cat}»: خلصت الأسئلة اللي ما لعبها الحساب — نكرر أسئلة قديمة`);
    const s = okA.filter((q) => !breaksB(G, q));
    return s.length ? s : okA;
  }
  if (pool.length) say(G, `«${cat}»: كل أسئلتها عن سلسلة لها فئة مخصصة باللعبة — الخانة تبقى فاضية`);
  return [];
}

/* لما ينختار سؤال: سلاسله تنحجز لباقي اللعبة */
export function take(G, q) {
  if (DED[q.cat]) return;
  for (const f of franchisesOf(q)) G.used.add(f);
}

/* يختار سؤال بصعوبة معيّنة (مع الأقرب لو ما فيه) من مرشحين */
export function byDifficulty(list, want, rnd = Math.random) {
  if (!list.length) return null;
  if (want) {
    const order = want === 1 ? [1, 2, 3] : want === 2 ? [2, 1, 3] : [3, 2, 1];
    for (const d of order) { const c = list.filter((q) => (q.d || 2) === d); if (c.length) return c[Math.floor(rnd() * c.length)]; }
  }
  return list[Math.floor(rnd() * list.length)];
}

/* مجموعة التجربة لفئة: أسئلة trial.json اللي تمشي على القواعد وما انعرضت */
export function trialPool(G, cat, trial, byQid, taken) {
  const ids = (trial && trial.cats && trial.cats[cat]) || [];
  return ids.map((id) => byQid.get(id)).filter((q) => q && !taken.has(q) && !breaksA(G, q) && !breaksB(G, q));
}
