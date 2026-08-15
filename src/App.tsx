import React, { useState, useEffect, useRef } from "react";

// Web storage adapter: local data stays in the browser; shared room data
// is stored by the Node backend so multiple phones can play the same room.
if (typeof window !== "undefined" && !(window as any).storage) {
  (window as any).storage = {
    async set(key: string, value: string, shared = true) {
      if (!shared) { localStorage.setItem(key, value); return; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value })
      });
      if (!r.ok) throw new Error("storage write failed");
    },
    async get(key: string, shared = true) {
      if (!shared) { const value = localStorage.getItem(key); return value === null ? null : { value }; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("storage read failed");
      return await r.json();
    },
    async delete(key: string, shared = true) {
      if (!shared) { localStorage.removeItem(key); return; }
      const r = await fetch("/api/kv/" + encodeURIComponent(key), { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw new Error("storage delete failed");
    }
  };
}

/* ============================================================
   SICK TRIVIA — لعبة أسئلة جماعية بين الربع
   كل سؤال: الكل يصوّت على الفئة 🗳️
   إجابات كتابية والذكاء الاصطناعي يحكم ⚡ وأحداث كل 3 أسئلة 🎲
   ============================================================ */

const PTS = { 1: 200, 2: 400, 3: 600 };
const DLBL = { 1: "سهل", 2: "متوسط", 3: "صعب" };
const CATS = ["طب وصحة", "اقتصاد وأعمال", "موسيقى", "عمارة ومعالم", "لغات وشعوب", "مقولات", "مين الشخصية؟", "خمّن البوس", "خمّن اللعبة", "لعبة الحروف", "منطق وألغاز", "أمثال ومصطلحات", "طعام ومطبخ", "حيوانات", "فضاء", "جسم الإنسان", "السعودية", "سيارات", "اختراعات", "أعلام", "شكل ورسم", "وين المكان؟", "مين قالها؟", "وش الغرض؟", "الرابط المشترك", "قبل ولا بعد؟", "إيموجي", "دليلين", "الأغرب", "لو كنت مكانك", "بوسات إلدن رينق", "بوسات السولز", "لور السولز", "أوفرواتش", "أزياء الشخصيات", "ألعاب فيديو", "رياضيات", "فيزياء", "علوم", "عام", "رياضة", "أفلام ومسلسلات", "تاريخ", "جغرافيا", "تقنية", "Engineering Questions"];
const TYPED_SEC = 40;
const BLIND_SHOW = 6;
const VOTE_SEC = 15;
const PICK_SEC = 25;
const START_DELAY = 5000; // بداية موحّدة — وقت كافي يوصل السؤال لكل الأجهزة
const REVEAL_SEC = 14;   // الانتقال التلقائي بعد النتيجة
const EVENT_SEC = 12;    // الانتقال التلقائي بعد شاشة الحدث


/* ---------- شرح كل فئة (يظهر قبل بداية السؤال) ---------- */
const INTRO_SEC = 12;
const CAT_INFO = {
  "أعلام": { icon: "🏳️", desc: "بيطلع لك علم مرسوم، وتكتب اسم الدولة صاحبته. انتبه — فيه أعلام متشابهة ومقلوبة!" },
  "شكل ورسم": { icon: "📐", desc: "رسمة علمية أو هندسية (عدسة، دائرة كهربائية، مثلث، رسم بياني) وتستنتج منها الجواب." },
  "وين المكان؟": { icon: "🗺️", desc: "نوصف لك منطقة داخل لعبة بمعالمها وجوّها، وتقول لنا وش اسمها." },
  "مين قالها؟": { icon: "💬", desc: "عبارة مشهورة من لعبة أو مسلسل، وتقول لنا مين قائلها." },
  "وش الغرض؟": { icon: "⚔️", desc: "نوصف لك سلاح أو أداة بوظيفتها وشكلها، وتسمّيها." },
  "الرابط المشترك": { icon: "🔗", desc: "نعطيك ثلاثة أشياء، وتكتشف وش الشي اللي يجمعهم." },
  "قبل ولا بعد؟": { icon: "🎯", desc: "أسئلة ترتيب زمني — أيهما صدر أول، ومين تجي قبل مين." },
  "إيموجي": { icon: "😀", desc: "لعبة أو فيلم مكتوب بالإيموجي بس، وتحزره." },
  "دليلين": { icon: "🕵️", desc: "دليلين ما لهم علاقة ببعض ظاهريًا، بس يتقاطعون على جواب واحد." },
  "الأغرب": { icon: "🎲", desc: "أربعة أشياء وواحد منهم شاذ عن الباقي — لاقِه." },
  "لو كنت مكانك": { icon: "🧠", desc: "مواقف داخل الألعاب: وش يصير لو سويت كذا؟ أسئلة عن الميكانيكيات مو الأسماء." },
  "طب وصحة": { icon: "🩺", desc: "أجسادنا والأمراض والعلاج — من الفيتامينات للجراحة." },
  "اقتصاد وأعمال": { icon: "💰", desc: "عملات وشركات وأسواق ومصطلحات مالية." },
  "موسيقى": { icon: "🎵", desc: "آلات وأنواع وملحّنون — من العود للجاز." },
  "عمارة ومعالم": { icon: "🏛️", desc: "مبانٍ ومعالم شهيرة وأنماط معمارية حول العالم." },
  "لغات وشعوب": { icon: "🗣️", desc: "لغات العالم وشعوبه وخصائصها الغريبة." },
  "مقولات": { icon: "💬", desc: "مقولة مشهورة وتحزر قائلها — ساسة وعلماء وفلاسفة وشخصيات سينمائية." },
  "مين الشخصية؟": { icon: "🖼️", desc: "صورة لشخصية تاريخية أو معاصرة — تحزر مين هي. سياسيون وعلماء وفلاسفة ومخترعون." },
  "خمّن البوس": { icon: "👹", desc: "صورة مقرّبة لبوس — تحزره من تفصيلة بدرعه أو سلاحه أو شكله. الصورة الكاملة تنكشف بالنتيجة." },
  "خمّن اللعبة": { icon: "🎮", desc: "صورة مقرّبة من زاوية غريبة داخل لعبة — تحزر اللعبة من التفصيلة. الصورة الكاملة تنكشف بالنتيجة." },
  "لعبة الحروف": { icon: "🔤", desc: "نعطيك الحرف ونوصف لك الشي — والجواب لازم يبدأ بنفس الحرف. زي لعبة عزيز بالضبط!" },
  "منطق وألغاز": { icon: "🧩", desc: "ألغاز تحتاج تفكير مو حفظ. اقرأ السؤال مرتين — الفخ دايم بالتفاصيل." },
  "أمثال ومصطلحات": { icon: "📖", desc: "كمّل المثل أو فسّر المصطلح — من الأمثال الشعبية والفصحى." },
  "طعام ومطبخ": { icon: "🍲", desc: "بهارات وأطباق وحقائق غريبة عن الأكل — من المطبق للسوشي." },
  "حيوانات": { icon: "🐾", desc: "حقائق مدهشة عن الحيوانات — أغلبها بتقول: صدق؟!" },
  "فضاء": { icon: "🚀", desc: "كواكب ونجوم وثقوب سوداء — من عطارد لأطراف الكون." },
  "جسم الإنسان": { icon: "🫀", desc: "جسمك أعجب مما تتصور — عظام وأعضاء وأرقام بداخلك." },
  "السعودية": { icon: "🇸🇦", desc: "تاريخ وجغرافيا ومشاريع وثقافة بلدنا — من الدرعية لنيوم." },
  "سيارات": { icon: "🚗", desc: "شعارات وشركات وميكانيكا — للي يفرق عنده V8 عن V6 وللي ما يفرق." },
  "اختراعات": { icon: "💡", desc: "مين اخترع وش، وقصص الاكتشافات اللي صارت بالصدفة." },
  "بوسات إلدن رينق": { icon: "🌳", desc: "بوسات إلدن رينق والـDLC ونايترين — من الوصف والمكان والحركات." },
  "بوسات السولز": { icon: "☠️", desc: "بوسات دارك سولز وبلودبورن وسيكيرو وLies of P — بدون إلدن رينق." },
  "لور السولز": { icon: "📜", desc: "قصص وخلفيات عوالم السولز — الآلهة والمدن والأحداث اللي وراء اللعب." },
  "أوفرواتش": { icon: "🔫", desc: "الأبطال وأسماءهم الحقيقية وجنسياتهم وقصة اللعبة." },
  "أزياء الشخصيات": { icon: "👕", desc: "نوصف لك لبس شخصية بالتفصيل، وتخمّن مين هي." },
  "ألعاب فيديو": { icon: "🕹️", desc: "أسئلة عامة عن الألعاب: شركات، خرائط، شخصيات، وتواريخ." },
  "رياضيات": { icon: "➗", desc: "عمليات حسابية تتولّد جديدة كل مرة. التصحيح فوري — لا فيه اجتهاد بالإجابة." },
  "فيزياء": { icon: "⚛️", desc: "وحدات وقوانين ومفاهيم فيزيائية." },
  "علوم": { icon: "🔬", desc: "أحياء وكيمياء وفلك ومعلومات علمية عامة." },
  "عام": { icon: "🌍", desc: "ثقافة عامة متنوعة — أرقام وحقائق وأشياء تعرفها بالفطرة." },
  "رياضة": { icon: "⚽", desc: "كرة قدم وأولمبياد وأرقام قياسية وأندية." },
  "أفلام ومسلسلات": { icon: "🎬", desc: "أفلام ومسلسلات ومخرجين وشخصيات." },
  "تاريخ": { icon: "🏛️", desc: "أحداث ومعارك وشخصيات تاريخية، إسلامية وعالمية." },
  "جغرافيا": { icon: "🗻", desc: "دول وعواصم وجبال وبحار وأرقام عن الكوكب." },
  "تقنية": { icon: "💻", desc: "شركات ومؤسسين واختصارات وتواريخ من عالم التقنية." },
  "Engineering Questions": { icon: "⚙️", desc: "أسئلة هندسية في الميكانيكا، الديناميكا الحرارية، الموائع، المواد، الطيران والكيمياء الهندسية." },
};
const catInfo = (c) => CAT_INFO[c] || { icon: "❓", desc: "أسئلة متنوعة من هذي الفئة." };


/* ============================================================
   نمط "سين جيم" — فريقان، لوحة 6 فئات، وسائل مساعدة
   كل الإعدادات هنا بمكان واحد عشان تعدّلها بسهولة
   ============================================================ */
const BOARD_VALUES = [100, 100, 300, 300, 500, 500]; // سهل×2 / متوسط×2 / صعب×2
const BOARD_CATS_N = 6;                            // عدد الفئات باللوحة
const TEAM_SEC = 60;                               // وقت الفريق صاحب الدور
const STEAL_SEC = 10;                              // وقت الفريق الثاني (السرقة)
const TEAM_COLORS = ["#D9494F", "#2E7FC4"];        // هوية كل فريق

// وسائل المساعدة — غيّر العدد أو الوصف من هنا
const POWERUPS = [
  { id: "call",   icon: "📞", name: "اتصال بصديق", uses: 1, when: "question",
    desc: "يزيد وقتكم 30 ثانية ويظهر للجميع إنكم تستخدمونها" },
  { id: "double", icon: "✌️", name: "جاوب جوابين", uses: 1, when: "question",
    desc: "تقدرون ترسلون إجابتين ويكفي إن وحدة تكون صح" },
  { id: "pit",    icon: "🕳️", name: "الحفرة",      uses: 1, when: "board",
    desc: "لو الفريق الثاني غلط بسؤاله الجاي، ينخصم منه نص قيمة السؤال" },
  { id: "rest",   icon: "🛑", name: "استريح",      uses: 1, when: "board",
    desc: "توقف لاعبًا من الفريق الثاني عن المشاركة بالسؤال الجاي" },
  { id: "trap",   icon: "🪤", name: "الفخ",        uses: 1, when: "board",
    desc: "السؤال الجاي: لو جاوبه الفريق الثاني غلط ينخصم منه نص القيمة" },
];
// هل الفئة عندها أسئلة كافية للوحة؟ (6 إجابات مختلفة على الأقل)
const boardReady = (c) => new Set(BANK.filter((b) => b.cat === c).map((b) => b.a)).size >= BOARD_VALUES.length;

const puById = (id) => POWERUPS.find((p) => p.id === id);
const freshPowerUps = () => {
  const o = {};
  POWERUPS.forEach((p) => { o[p.id] = p.uses; });
  return o;
};

// بناء اللوحة: 6 فئات × 5 قيم = 30 سؤال
function buildBoard(cats, pickQ) {
  return cats.map((cat) => ({
    cat,
    tiles: BOARD_VALUES.map((pts) => {
      const q = pickQ(cat, pts);
      return { pts, state: q ? "available" : "locked", q };
    }),
  }));
}
// القيمة الأعلى = سؤال أصعب
const ptsToDiff = (pts) => (pts <= 100 ? 1 : pts <= 300 ? 2 : 3);

/* ---------- الأحداث ---------- */
const EVENTS = [
  { id: "double",   icon: "✖️2", name: "دبل النقاط",  desc: "هذا السؤال نقاطه مضاعفة! لا تفوّتها" },
  { id: "risk",     icon: "☠️", name: "خطر",         desc: "الجواب الغلط يخصم منك نص نقاط السؤال!" },
  { id: "blitz",    icon: "⚡", name: "برق",          desc: "نص الوقت بس! أسرع أسرع" },
  { id: "sniper",   icon: "🎯", name: "للأسرع فقط",   desc: "بس أول إجابة صحيحة تاخذ النقاط، الباقي صفر" },
  { id: "blind",    icon: "🙈", name: "سؤال أعمى",    desc: "السؤال بيختفي بعد " + BLIND_SHOW + " ثواني — احفظه زين!" },
  { id: "steal",    icon: "🦹", name: "سرقة",         desc: "الأسرع بالإجابة الصح يسرق نص النقاط من المتصدر!" },
  { id: "roulette", icon: "🎰", name: "روليت",        desc: "نقاط السؤال مجهولة — من 100 إلى 1000، تنكشف بعد الإجابات!" },
];


/* ---------- الآيتمات (تخريب) ---------- */
const ITEMS = [
  { id: "cancel",  icon: "🚫", name: "كنسل",    desc: "الهدف ما يقدر يجاوب هذا السؤال نهائيًا", target: true },
  { id: "rush",    icon: "⏩", name: "تسريع",   desc: "وقت الهدف ينص", target: true },
  { id: "fog",     icon: "🌫️", name: "ضباب",    desc: "السؤال يطلع مشوّش للهدف أول نصف الوقت", target: true },
  { id: "vanish",  icon: "👻", name: "اختفاء",  desc: "السؤال يختفي عن الهدف بعد 5 ثواني", target: true },
  { id: "lock",    icon: "🔒", name: "قفل",     desc: "الهدف ما يقدر يكتب أول 8 ثواني", target: true },
  { id: "mirror",  icon: "🪞", name: "مرايا",   desc: "السؤال يطلع معكوس للهدف", target: true },
  { id: "tax",     icon: "💸", name: "ضريبة",   desc: "لو الهدف جاوب صح، ياخذ نص النقاط بس", target: true },
  { id: "shield",  icon: "🛡️", name: "درع",     desc: "يحميك من كل آيتم بالسؤال الجاي", target: false },
];
const itemById = (id) => ITEMS.find((x) => x.id === id);

/* ---------- بنك الأسئلة ---------- */
const BANK = [
  // ============ أسئلة الصور ============
  // ---- خمّن البوس (حط صورك بمجلد public/img) ----
  { cat: "خمّن البوس", d: 1, q: "من إلدن رينق — مين هذا البوس؟", a: "Godfrey", alt: ["غودفري", "Godfrey First Elden Lord"], img: "/img/boss-godfrey.webp", info: "أول Elden Lord وزوج Marika، يخلع تاجه بالمرحلة الثانية ويقاتلك بيديه." },
  { cat: "خمّن البوس", d: 1, q: "من إلدن رينق — مين هذا البوس؟", a: "Malenia", alt: ["ماليينيا"], img: "/img/boss-Malenia.webp", info: "كل ضربة تصيبك ترجّع لها صحة — من أصعب بوسات اللعبة على الإطلاق." },
  { cat: "خمّن البوس", d: 1, q: "من إلدن رينق — مين هذا البوس؟", a: "Morgott", alt: ["مورغوت"], img: "/img/boss-Morgott.webp", info: "هو نفسه Margit الذي واجهته أول اللعبة، لكن باسمه الملكي الحقيقي." },
  { cat: "خمّن البوس", d: 1, q: "من إلدن رينق DLC — مين هذا البوس؟", a: "Messmer", alt: ["ميسمر", "Messmer the Impaler"], img: "/img/boss-Messmer.webp", info: "ابن Marika المخفي، قاد الـCrusade بأرض الظلال ويقاتل بالرمح والنار." },
  { cat: "خمّن البوس", d: 2, q: "من إلدن رينق — مين هذا البوس؟", a: "Astel", alt: ["أستل", "Astel Naturalborn of the Void"], img: "/img/boss-Astel.webp", info: "مخلوق فضائي عملاق ولد من الفراغ، يهاجم بالجاذبية والنيازك." },
  { cat: "خمّن البوس", d: 2, q: "من سيكيرو — مين هذا البوس؟", a: "Corrupted Monk", alt: ["الراهبة الفاسدة", "الراهب الفاسد"], img: "/img/boss-CorruptedMonk.webp", info: "تحرس جسر Fountainhead Palace وتستخدم الوهم بمنتصف المعركة." },
  { cat: "خمّن البوس", d: 2, q: "من سيكيرو — مين هذا البوس؟", a: "True Corrupted Monk", alt: ["الراهبة الحقيقية", "True Monk"], img: "/img/boss-TrueMonk.webp", info: "النسخة الحقيقية بثلاث مراحل، وتستدعي شبحًا عملاقًا بالمرحلة الأخيرة." },
  { cat: "خمّن البوس", d: 2, q: "من إلدن رينق DLC — مين هذا البوس؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight"], img: "/img/boss-Rellana.webp", info: "فارسة القمرين، وشقيقة Renalla، تبعت Messmer لأرض الظلال." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق DLC — مين هذا البوس؟", a: "Bayle", alt: ["بايل", "Bayle the Dread"], img: "/img/Boss-Bayle.webp", info: "تمرّد على Placidusax وفقد جزءًا من جسده بتلك المعركة." },
  { cat: "خمّن البوس", d: 3, q: "مين هذا البوس؟", a: "Blade Phantom", alt: ["بليد فانتوم", "شبح النصل"], img: "/img/boss-bladephantom.jpg", info: "شبح يقاتل بالنصل ويظهر فجأة بالمعارك." },
  { cat: "خمّن البوس", d: 3, q: "من سيكيرو — مين هذا البوس؟", a: "Gyoubu Oniwa", alt: ["غيوبو", "Reflection of Gyoubu", "جيوبو"], img: "/img/boss-Reflectiongyoubu.webp", info: "نسخة الانعكاس منه بذكريات Hirata، ويقاتلك راكبًا حصانه." },
  { cat: "خمّن البوس", d: 3, q: "من Khazan — مين هذا البوس؟", a: "Maluca", alt: ["مالوكا"], img: "/img/boss-maluca.jpg", info: "من بوسات The First Berserker: Khazan الكورية." },
  { cat: "خمّن البوس", d: 3, q: "من Khazan — مين هذا البوس؟", a: "Rangkus", alt: ["رانغكوس", "رانكوس"], img: "/img/boss-rangkus.jpg", info: "من بوسات The First Berserker: Khazan الكورية." },
  { cat: "خمّن البوس", d: 3, q: "من Khazan — مين هذا البوس؟", a: "Skalpel", alt: ["سكالبل", "سكالبيل"], img: "/img/boss-skalpel.jpg", info: "من بوسات The First Berserker: Khazan الكورية." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Ancient Hero of Zamor", alt: ["بطل زامور"], img: "/img/boss-ancientheroofzamor.jpg", info: "محارب جليدي قديم يهاجم بسيف يجمّد." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Beastman of Farum Azula", alt: ["بيست مان"], img: "/img/boss-beastmanoffarumazula.jpg", info: "محارب وحشي بفاروم أزولا يقاتل بأسلوب سريع." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Black Knife Assassin", alt: ["بلاك نايف", "قاتلة السكين السوداء"], img: "/img/boss-blackknifeassassin.jpg", info: "من اغتالوا Godwyn بسكاكين مشحونة برون الموت." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Burnt Ivory King", alt: ["ملك العاج المحترق"], img: "/img/boss-Burntivoryking.avif", info: "ملك ضحّى بنفسه ليغلق بوابة الفوضى." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Cemetery Shade", alt: ["شبح المقبرة"], img: "/img/boss-cemeteryshade.jpg", info: "شبح يظهر بالمقابر ويستدعي أرواحًا." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Chaos Witch Quelaag", alt: ["كويلاق", "Quelaag"], img: "/img/boss-ChaosWitchQuelaag.avif", info: "نصفها امرأة ونصفها عنكبوت ناري، من بنات ساحرة إيزاليث." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق DLC — مين هذا البوس؟", a: "Commander Gaius", alt: ["غايوس"], img: "/img/boss-commandergaius.png", info: "يهاجمك راكبًا خنزيرًا بريًا ضخمًا." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Crossbreed Priscilla", alt: ["بريسيلا", "Priscilla"], img: "/img/boss-CrossbreedPriscilla.avif", info: "تختفي عن النظر، ويمكن تجاوزها بلا قتال." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Darklurker", alt: ["دارك لوركر"], img: "/img/boss-Darklurker.avif", info: "ينقسم لنسختين بالمرحلة الثانية." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 3 — مين هذا البوس؟", a: "Deep Accursed", alt: ["ديب أكيرسد"], img: "/img/boss-Deepaccursed.webp", info: "يقفز من السقف ويصيبك باللعنة." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Demon Firesage", alt: ["ديمون فايرسيج"], img: "/img/boss-DemonFiresage.avif", info: "شيطان ناري بأعماق إيزاليث." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Dragonkin Soldier", alt: ["جندي التنانين"], img: "/img/boss-dragonkinsoldier.jpg", info: "يهاجم بالبرق الأحمر، من بقايا حرب التنانين." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق DLC — مين هذا البوس؟", a: "Esgar, Priest of Blood", alt: ["إسغار", "Esgar"], img: "/img/boss-esgarpriestofblood.jpg", info: "كاهن دموي بأسلوب قتال وحشي." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Fell Twins", alt: ["التوأم", "Omen Twins"], img: "/img/boss-felltwinsomen.jpg", info: "توأم من الـOmen يقاتلانك معًا بالثلوج." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Flexile Sentry", alt: ["فليكسايل سنتري"], img: "/img/boss-Flexilesentry.avif", info: "له وجهان وسيفان، يقاتلك بسفينة تغرق." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax"], img: "/img/boss-fortissax.jpg", info: "تنين البرق المرتبط بـGodwyn، تقاتله داخل حلم Fia." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Four Kings", alt: ["الملوك الأربعة"], img: "/img/boss-FourKings.avif", info: "تقاتلهم بالظلام الدامس، وكل ما تأخرت زاد عددهم." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Fume Knight", alt: ["فيوم نايت"], img: "/img/boss-FumeKnight.avif", info: "من أصعب بوسات السلسلة، بسيفين وأسلوب عدواني." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Gank Squad", alt: ["غانك سكواد"], img: "/img/boss-GankSquad.avif", info: "ثلاثة يهاجمونك معًا — سمعتها السيئة مستحقة." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Gaping Dragon", alt: ["التنين الفاغر"], img: "/img/boss-GapingDragon.avif", info: "تنين تحوّل فمه لبطن عملاق من شراهته." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Giant Lord", alt: ["لورد العمالقة"], img: "/img/boss-Giantlord.avif", info: "تقاتله بالماضي عبر رحلة زمنية." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Godskin Duo", alt: ["غودسكن", "جودسكين"], img: "/img/bossgodskinduo.jpg", info: "نبيل ورسول يتبادلان الظهور — يشتركان بشريط صحة واحد." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Great Grey Wolf Sif", alt: ["سيف", "Sif"], img: "/img/boss-GreatGreywolfSif.avif", info: "ذئب يحمل سيف سيده Artorias بفمه ويحرس قبره." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Great Wyrm Theodorix", alt: ["ثيودوريكس", "Theodorix"], img: "/img/boss-GreatWyrmTheodorix.jpg", info: "تنين مسموم بمستنقعات جبل جيلمير." },
  { cat: "خمّن البوس", d: 3, q: "مين هذا البوس؟", a: "Iron Dragonslayer", alt: ["قاتل التنانين الحديدي"], img: "/img/boss-irondragonslayer.webp", info: "محارب مدرّع يقاتل بسلاح البرق." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Iron Golem", alt: ["الغولم الحديدي"], img: "/img/boss-IronGolem.avif", info: "تقدر تسقطه من حافة البرج بدل قتاله." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Leonine Misbegotten", alt: ["ليونين"], img: "/img/boss-leoninemisbegotten.jpg", info: "مخلوق أسدي يحرس قلعة موراين." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Lost Sinner", alt: ["الخاطئة الضائعة"], img: "/img/boss-Lostsinner.avif", info: "تقاتلها بالظلام إلا لو أشعلت المشاعل حولها." },
  { cat: "خمّن البوس", d: 2, q: "من إلدن رينق — مين هذا البوس؟", a: "Mimic Tear", alt: ["الدمعة المحاكية"], img: "/img/boss-mimictear.jpg", info: "يتشكّل نسخة منك بسلاحك وعتادك بالضبط." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Nashandra", alt: ["ناشاندرا"], img: "/img/boss-Nashandra.avif", info: "الملكة والبوس النهائي، من شظايا روح مانوس." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Gravelord Nito", alt: ["نيتو", "Nito"], img: "/img/boss-Nito.avif", info: "أول من مات، وأحد حاملي أرواح اللوردات." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Ornstein and Smough", alt: ["أورنشتاين وسموغ"], img: "/img/boss-OrnsteinandSmough.avif", info: "لما تقتل واحدًا يمتص الثاني قوته ويكبر." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 1 — مين هذا البوس؟", a: "Pinwheel", alt: ["بينويل"], img: "/img/boss-Pinwheel.avif", info: "ينقسم لنسخ متعددة، ويُعد أسهل بوس بالسلسلة." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Pursuer", alt: ["المطارد"], img: "/img/boss-Pursuer.avif", info: "يظهر لك مرارًا بأماكن مختلفة طوال اللعبة." },
  { cat: "خمّن البوس", d: 3, q: "مين هذا البوس؟", a: "Red Wolf / Redmane Duo", alt: ["ريدماين", "الذئب الأحمر"], img: "/img/boss-redmaneduo.jpg", info: "من فرسان ردمين المرتبطين برادان." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 3 — مين هذا البوس؟", a: "Ringed Knight", alt: ["فرسان الحلقة"], img: "/img/boss-RingedKnight.webp", info: "حراس المدينة المطوّقة، بسيوف مشتعلة بالظلام." },
  { cat: "خمّن البوس", d: 2, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Ruin Sentinels", alt: ["حراس الأطلال"], img: "/img/boss-Ruinsentinels.avif", info: "ثلاثة دروع طويلة تقاتلك فوق برج ضيق." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Scorpioness Najka", alt: ["ناجكا"], img: "/img/boss-Scorpionessnajka.avif", info: "نصفها امرأة ونصفها عقرب، تغوص بالرمال." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Sir Alonne", alt: ["سير ألون"], img: "/img/boss-sirAlonne.avif", info: "محارب بأسلوب ساموراي، وله نهاية مميزة لو هزمته بلا ضرر." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Smelter Demon", alt: ["شيطان المصهر"], img: "/img/boss-Smelterdemon.avif", info: "درعه مشتعل ويحرقك بمجرد الاقتراب." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Twin Dragonriders", alt: ["فرسان التنين التوأم"], img: "/img/boss-Twindragonriders.avif", info: "اثنان يقاتلانك بساحة ضيقة." },
  { cat: "خمّن البوس", d: 3, q: "من إلدن رينق — مين هذا البوس؟", a: "Valiant Gargoyle", alt: ["الغرغويل"], img: "/img/boss-valiantgargoyle.jpg", info: "اثنان يهاجمانك بأعماق نهر سيوفرا." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Velstadt, the Royal Aegis", alt: ["فيلستادت", "Velstadt"], img: "/img/boss-Velstadttheroyalaegis.avif", info: "حارس الملك المخلص، يقاتلك قبل الوصول إليه." },
  { cat: "خمّن البوس", d: 3, q: "من دارك سولز 2 — مين هذا البوس؟", a: "Vendrick", alt: ["فيندريك"], img: "/img/boss-Vendrick.avif", info: "ملك دراينغليك، يمشي ببطء وضربته تسحق." },
  { cat: "خمّن البوس", d: 3, q: "مين هذا البوس؟", a: "Rot Grub / Worm", alt: ["الدودة"], img: "/img/boss-Worm.webp", info: "مخلوق دودي ضخم." },
  { cat: "خمّن البوس", d: 2, q: "من إلدن رينق — مين هذا البوس؟", a: "Commander Niall", alt: ["نيال", "Niall"], img: "/img/boss-niall.png", info: "قائد بساق واحدة يستدعي محاربين شبحيين." },
  // ---- مين الشخصية؟ ----
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "50 Cent", alt: ["فيفتي سنت", "Curtis Jackson"], img: "/img/person-50cent.avif", info: "مغني راب أمريكي، نجا من إطلاق تسع رصاصات قبل شهرته." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Archimedes", alt: ["أرخميدس"], img: "/img/person-Archimedesmid.jpg", info: "صرخ «يوريكا» لما اكتشف مبدأ الطفو وهو بالحمام." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Charlie Chaplin", alt: ["شارلي شابلن", "شابلن"], img: "/img/person-CharlieChaplineasy.jpg", info: "رمز السينما الصامتة، وشخصيته «المتشرد» أشهر صورة بتاريخ الكوميديا." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Che Guevara", alt: ["تشي غيفارا", "جيفارا"], img: "/img/person-cheguevaraaesy.jpg", info: "ثوري أرجنتيني، وصورته من أكثر الصور استنساخًا بالتاريخ." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Clint Eastwood", alt: ["كلينت إيستوود"], img: "/img/person-ClintEastwoodhard.jpg", info: "نجم أفلام الوسترن ثم صار مخرجًا فاز بأوسكارين." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Eminem", alt: ["إمينيم"], img: "/img/person-Eminemeasy.jpg", info: "أكثر مغني راب مبيعًا بالتاريخ، ومن ديترويت." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Fidel Castro", alt: ["فيدل كاسترو", "كاسترو"], img: "/img/person-fidelcastromid.avif", info: "حكم كوبا نحو خمسين سنة، ونجا من مئات محاولات الاغتيال." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Frank Sinatra", alt: ["فرانك سيناترا", "سيناترا"], img: "/img/person-FrankSinatraeasy.jpg", info: "صاحب أغنية My Way، ولُقّب بـ«الصوت»." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Frederick Barbarossa", alt: ["بربروسا", "فريدريك بربروسا"], img: "/img/person-frederickbarbarossahard.avif", info: "إمبراطور روماني مقدس، غرق بنهر أثناء الحملة الصليبية الثالثة." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "George Orwell", alt: ["جورج أورويل", "أورويل"], img: "/img/person-GeorgeOrwellmid.jpg", info: "مؤلف 1984 ومزرعة الحيوان، ومنه جاء مصطلح «أورويلي»." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Guy Gibson", alt: ["غاي غيبسون"], img: "/img/person-guygibson.avif", info: "طيار بريطاني قاد غارة السدود الشهيرة بالحرب العالمية الثانية." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Heinrich Himmler", alt: ["هاينريش هيملر", "هيملر"], img: "/img/person-HeinrichHimmlerhard.jpg", info: "قائد قوات الأمن النازية وأحد أبرز منفّذي الهولوكوست." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Immanuel Kant", alt: ["إيمانويل كانط", "كانط"], img: "/img/person-ImmanuelKantmid.jpg", info: "فيلسوف ألماني، وكان منتظمًا لدرجة أن الجيران يضبطون ساعاتهم على مشيته." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "James Cook", alt: ["جيمس كوك", "كوك"], img: "/img/person-JamesCookmid.jpg", info: "مستكشف بريطاني رسم خرائط المحيط الهادئ وأستراليا." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Jay-Z", alt: ["جاي زي"], img: "/img/person-JayZmid.jpg", info: "أول مغني راب يصبح مليارديرًا." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Johnny Depp", alt: ["جوني ديب"], img: "/img/person-JohnnyDeppeasy.jpg", info: "اشتهر بدور جاك سبارو بسلسلة قراصنة الكاريبي." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Johannes Kepler", alt: ["كبلر", "يوهانس كبلر"], img: "/img/person-johanneskeplerhard.avif", info: "اكتشف أن مدارات الكواكب بيضاوية لا دائرية." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Leonardo DiCaprio", alt: ["ليوناردو دي كابريو", "دي كابريو"], img: "/img/person-LeonardoDiCaprioeasy.jpg", info: "انتظر أوسكاره الأول حتى فيلم The Revenant بعد سبعة ترشيحات." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Leo Tolstoy", alt: ["تولستوي", "ليو تولستوي"], img: "/img/person-LeoTolstoyhard.jpg", info: "مؤلف «الحرب والسلام» و«آنا كارنينا»." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Louis Armstrong", alt: ["لويس أرمسترونغ"], img: "/img/person-LouisArmstronghard.jpg", info: "عازف ترومبيت أمريكي، من مؤسسي الجاز الحديث." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Marco Polo", alt: ["ماركو بولو"], img: "/img/person-MarcoPolohard.jpg", info: "رحّالة بندقي وصل الصين وعاد بكتاب غيّر تصور أوروبا عن آسيا." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Marilyn Monroe", alt: ["مارلين مونرو", "مونرو"], img: "/img/person-MarilynMonroeeasy.jpg", info: "أيقونة هوليوود بالخمسينات، وتوفيت وعمرها 36." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Marie Curie", alt: ["ماري كوري", "مدام كوري"], img: "/img/person-MarieCurieeasy.jpg", info: "الوحيدة الفائزة بنوبل بمجالين علميين مختلفين." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Quentin Tarantino", alt: ["تارانتينو", "كوينتن تارانتينو"], img: "/img/person-QuentinTarantinomid.jpg", info: "مخرج Pulp Fiction وKill Bill، اشتهر بالسرد غير الخطي." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Rasputin", alt: ["راسبوتين"], img: "/img/person-Rasputinmid.jpg", info: "راهب روسي غامض أثّر على العائلة القيصرية، ومقتله أسطورة بحد ذاته." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Robert De Niro", alt: ["روبرت دي نيرو", "دي نيرو"], img: "/img/person-RobertDeNiroeasy.jpg", info: "زاد 27 كيلو حقيقية لدور Raging Bull." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Salvador Dalí", alt: ["سلفادور دالي", "دالي"], img: "/img/person-SalvadorDalihard.jpg", info: "رسّام سريالي إسباني، وأشهر أعماله الساعات الذائبة." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Steve Jobs", alt: ["ستيف جوبز", "جوبز"], img: "/img/person-SteveJobseasy.jpg", info: "مؤسس آبل، وطُرد من شركته 1985 ثم عاد ليقودها للقمة." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Suleiman the Magnificent", alt: ["سليمان القانوني", "السلطان سليمان"], img: "/img/person-suleimanthemagnificenthard.avif", info: "أطول سلاطين العثمانيين حكمًا، وبلغت الدولة ذروتها بعهده." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Taylor Swift", alt: ["تايلور سويفت"], img: "/img/person-TaylorSwifteasy.jpg", info: "أعادت تسجيل ألبوماتها القديمة لتستعيد ملكية موسيقاها." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Van Gogh", alt: ["فان غوخ", "فنسنت فان غوخ"], img: "/img/person-VanGogheasy.jpg", info: "باع لوحة واحدة بحياته، واليوم أعماله من الأغلى بالعالم." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Vlad Dracula", alt: ["فلاد دراكولا", "فلاد الثالث"], img: "/img/person-VladDraculahard.jpg", info: "أمير من والاشيا، واسمه ألهم رواية دراكولا." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Witold Pilecki", alt: ["فيتولد بيليتسكي"], img: "/img/person-witoldpileckihard.avif", info: "ضابط بولندي تطوّع ليُعتقل بأوشفيتز عمدًا ليوثّق ما يحدث فيه." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Xi Jinping", alt: ["شي جين بينغ", "شي جينبينغ"], img: "/img/person-xijinpingmid.avif", info: "رئيس الصين، وأول من ألغى حد الولايتين الرئاسيتين منذ ماو." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Abraham Lincoln", alt: ["أبراهام لينكولن", "لينكولن"], img: "/img/person-AbrahamLincolneasy.webp", info: "سادس عشر رؤساء أمريكا، قاد البلاد بالحرب الأهلية وألغى العبودية." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "عادل الجبير", alt: ["Adel Al-Jubeir", "الجبير"], img: "/img/person-adelaljubeireasy.jpg", info: "وزير الدولة السعودي للشؤون الخارجية، وسفير سابق بواشنطن." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Adolf Hitler", alt: ["أدولف هتلر", "هتلر"], img: "/img/person-AdolfHitlereasy.jpg", info: "زعيم ألمانيا النازية، وأشعل الحرب العالمية الثانية والهولوكوست." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Albert Einstein", alt: ["ألبرت أينشتاين", "اينشتاين"], img: "/img/person-AlbertEinsteineasy.jpg", info: "صاحب النسبية، وأخذ نوبل عن الظاهرة الكهروضوئية لا عنها." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Alexander Graham Bell", alt: ["غراهام بيل", "بيل"], img: "/img/person-AlexanderGrahambellhard.jpg", info: "مخترع الهاتف، وأول جملة نُقلت بسلك كانت لمساعده واطسون." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Alexander Hamilton", alt: ["ألكسندر هاميلتون", "هاميلتون"], img: "/img/person-alexanderhamiltonhard.jpg", info: "مؤسس النظام المالي الأمريكي، ومات بمبارزة مع نائب الرئيس." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Alexander the Great", alt: ["الإسكندر الأكبر", "الاسكندر"], img: "/img/person-AlexandertheGreatmid.webp", info: "بنى إمبراطورية من اليونان للهند قبل أن يموت وعمره 32." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "الخوارزمي", alt: ["al-Khwarizmi", "الخوارزمى"], img: "/img/person-alKhwarizmieasy.jpg", info: "أبو الجبر، ومن اسمه اللاتيني جاءت كلمة «خوارزمية»." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Mozart", alt: ["موتسارت", "أماديوس موتسارت"], img: "/img/person-AmadeusMozartmid.jpg", info: "ألّف أول سيمفونية وعمره ثماني سنوات، ومات وعمره 35." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Aristotle", alt: ["أرسطو"], img: "/img/person-Aristotlehard.jpg", info: "تلميذ أفلاطون ومعلّم الإسكندر، وأسس المنطق الصوري." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Barack Obama", alt: ["باراك أوباما", "أوباما"], img: "/img/person-BarackObamaeasy.jpg", info: "أول رئيس أمريكي من أصول أفريقية، وفاز بنوبل للسلام بأول سنة له." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Beethoven", alt: ["بيتهوفن"], img: "/img/person-Beethovenmid.jpg", info: "ألّف أعظم أعماله وهو أصمّ تمامًا، ومنها السيمفونية التاسعة." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Benjamin Franklin", alt: ["بنجامين فرانكلين", "فرانكلين"], img: "/img/person-BenjaminFranklinhard.jpg", info: "من مؤسسي أمريكا، وأثبت أن البرق كهرباء بتجربة الطائرة الورقية." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Bill Clinton", alt: ["بيل كلينتون", "كلينتون"], img: "/img/person-BillClintonmid.jpg", info: "الرئيس الأمريكي الثاني والأربعون، وحكم بفترة ازدهار اقتصادي." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Carl Friedrich Gauss", alt: ["غاوس", "جاوس"], img: "/img/person-Carlfrederichgaussahard.jpg", info: "لُقّب بأمير الرياضيات، وجمع الأعداد من 1 إلى 100 ذهنيًا وهو طفل." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Charles Darwin", alt: ["تشارلز داروين", "داروين"], img: "/img/person-CharlesDarwinmid.webp", info: "صاحب نظرية التطور بالانتخاب الطبيعي بعد رحلته على سفينة بيغل." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Christopher Columbus", alt: ["كولومبوس", "كريستوفر كولومبوس"], img: "/img/person-ChristopherColumbusmid.jpg", info: "وصل أمريكا 1492 وهو يظن أنه بلغ الهند." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Copernicus", alt: ["كوبرنيكوس"], img: "/img/person-Copernicushard.jpg", info: "أول من قال إن الأرض تدور حول الشمس لا العكس." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Leonardo da Vinci", alt: ["دافنشي", "ليوناردو دافنشي"], img: "/img/person-DaVincihard.jpg", info: "رسّام الموناليزا، ومهندس ومشرّح صمّم طائرات قبل عصرها بقرون." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Mendeleev", alt: ["مندليف", "دميتري مندليف"], img: "/img/person-DmitriMendeleevhard.jpg", info: "رتّب الجدول الدوري وترك فراغات لعناصر لم تُكتشف — وطابقت تنبؤاته." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Eisenhower", alt: ["أيزنهاور"], img: "/img/person-Eisenhowerhard.jpg", info: "قائد إنزال نورماندي ثم رئيس أمريكا، وحذّر من «المجمع الصناعي العسكري»." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Elon Musk", alt: ["إيلون ماسك", "ماسك"], img: "/img/person-Elonmuskeasy.jpg", info: "مؤسس سبيس إكس ومالك تسلا، وأول من أعاد صاروخًا يهبط واقفًا." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Franklin D. Roosevelt", alt: ["روزفلت", "فرانكلين روزفلت"], img: "/img/person-FranklinDRooseveltmid.jpg", info: "الرئيس الأمريكي الوحيد الذي انتُخب أربع مرات، وقاد البلاد بالكساد والحرب." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Nietzsche", alt: ["نيتشه", "فريدريك نيتشه"], img: "/img/person-FriedrichNietzschemid.jpg", info: "فيلسوف ألماني صاحب فكرة «الإنسان الأعلى» ونقد الأخلاق التقليدية." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Galileo", alt: ["غاليليو", "جاليليو"], img: "/img/person-GalileoGalileihard.jpg", info: "أول من وجّه التلسكوب للسماء، وحوكم لقوله إن الأرض تدور." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Genghis Khan", alt: ["جنكيز خان", "چنگیز"], img: "/img/person-GenghisKhanmid.webp", info: "وحّد المغول وبنى أكبر إمبراطورية برية متصلة بالتاريخ." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "George Washington", alt: ["جورج واشنطن", "واشنطن"], img: "/img/person-GeorgeWashingtonmid.jpg", info: "أول رئيس لأمريكا، ورفض الترشح لولاية ثالثة فأسس تقليدًا دام قرنًا ونصف." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Harry Truman", alt: ["ترومان", "هاري ترومان"], img: "/img/person-HarryTrumanhard.jpg", info: "الرئيس الذي أمر بإلقاء القنبلتين الذريتين على اليابان." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Henry VIII", alt: ["هنري الثامن"], img: "/img/person-HenryVIIIofEnglandhard.jpg", info: "تزوج ست مرات وانفصل عن الكنيسة الكاثوليكية ليطلّق زوجته الأولى." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Isaac Newton", alt: ["إسحاق نيوتن", "نيوتن"], img: "/img/person-IsaacNewtonmid.jpg", info: "قوانين الحركة والجاذبية، وطوّر حساب التفاضل بنفس الوقت مع لايبنتز." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Jeff Bezos", alt: ["جيف بيزوس", "بيزوس"], img: "/img/person-Jeffbezoseasy.jpg", info: "مؤسس أمازون، بدأها متجر كتب بمرآب بيته سنة 1994." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Joan of Arc", alt: ["جان دارك"], img: "/img/person-JoanofArchard.jpg", info: "فتاة فرنسية قادت الجيش بحرب المئة عام، وأُحرقت وعمرها 19." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "John F. Kennedy", alt: ["جون كينيدي", "كينيدي", "JFK"], img: "/img/person-JohnFKennedyeasy.webp", info: "أصغر رئيس أمريكي منتخب، واغتيل بدالاس 1963." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Joseph Stalin", alt: ["ستالين", "جوزيف ستالين"], img: "/img/person-JosephStalineasy.jpg", info: "زعيم الاتحاد السوفيتي، وحكمه اتسم بالتصنيع القسري والقمع الواسع." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Julius Caesar", alt: ["يوليوس قيصر", "قيصر"], img: "/img/person-JuliusCaesarhard.webp", info: "قائد روماني، واغتيل بمجلس الشيوخ على يد أقرب حلفائه." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Franz Kafka", alt: ["كافكا", "فرانز كافكا"], img: "/img/person-kafkahard.jpg", info: "أوصى بحرق كل أعماله، لكن صديقه نشرها فصار من أعظم كتّاب القرن." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Karl Marx", alt: ["كارل ماركس", "ماركس"], img: "/img/person-KarlMarxhard.jpg", info: "مؤلف رأس المال والبيان الشيوعي، وأثّر على سياسة نصف العالم." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "الملك عبدالعزيز", alt: ["King Abdulaziz", "عبدالعزيز آل سعود"], img: "/img/person-kingAbdulazizBinAbdulrahmanAlSaudeasy.webp", info: "مؤسس المملكة العربية السعودية، بدأ بفتح الرياض 1902 ووحّدها 1932." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "الملك فيصل", alt: ["King Faisal", "فيصل بن عبدالعزيز"], img: "/img/person-kingfaisaleasy.jpg", info: "ثالث ملوك السعودية، ومن أبرز مواقفه قرار حظر النفط 1973." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Leland Stanford", alt: ["ليلاند ستانفورد", "ستانفورد"], img: "/img/person-LelandStanfordahrd.jpg", info: "أسس جامعة ستانفورد تخليدًا لابنه الذي مات صغيرًا." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Louis Pasteur", alt: ["لويس باستور", "باستور"], img: "/img/person-louisPasteurhard.jpg", info: "أثبت نظرية الجراثيم، ومنه جاءت «البسترة» ولقاح داء الكلب." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Marie Curie", alt: ["ماري كوري", "مدام كوري"], img: "/img/person-madamecurihard.jpg", info: "الوحيدة الفائزة بنوبل بمجالين علميين، واكتشفت الراديوم والبولونيوم." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Mahatma Gandhi", alt: ["غاندي", "المهاتما غاندي"], img: "/img/person-MahatmaGandhieasy.jpeg", info: "قاد استقلال الهند بالمقاومة السلمية بلا سلاح." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Margaret Thatcher", alt: ["مارغريت تاتشر", "تاتشر"], img: "/img/person-MargaretThatcherhard.webp", info: "أول امرأة تتولى رئاسة وزراء بريطانيا، ولُقّبت بالمرأة الحديدية." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Mark Twain", alt: ["مارك توين"], img: "/img/person-MarkTwainhard.jpg", info: "مؤلف توم سوير وهكلبيري فين، ويُعد أبا الأدب الأمريكي." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Michael Faraday", alt: ["مايكل فاراداي", "فاراداي"], img: "/img/person-MichaelFaradayhard.jpg", info: "اكتشف الحث الكهرومغناطيسي — أساس كل مولد كهرباء بالعالم." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "محمد بن سلمان", alt: ["MBS", "ولي العهد"], img: "/img/person-MohammadBinSalmoneasy.jpg", info: "ولي العهد ورئيس مجلس الوزراء السعودي، وصاحب رؤية 2030." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "محمد بن عبدالوهاب", alt: ["ابن عبدالوهاب"], img: "/img/person-mohammedibnabdulwahabmid.jpg", info: "عالم من نجد، واتفاقه مع محمد بن سعود 1744 أسس الدولة السعودية الأولى." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Mother Teresa", alt: ["الأم تيريزا", "تيريزا"], img: "/img/person-MotherTeresahard.jpg", info: "راهبة كرّست حياتها لفقراء كلكتا، وفازت بنوبل للسلام 1979." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Napoleon", alt: ["نابليون", "نابليون بونابرت"], img: "/img/person-NapoleonBonaparteeasy.webp", info: "إمبراطور فرنسا، وانتهت إمبراطوريته بمعركة واترلو 1815." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Neil Armstrong", alt: ["نيل أرمسترونغ", "ارمسترونج"], img: "/img/person-NeilArmstronghard.jpg", info: "أول إنسان يمشي على القمر سنة 1969." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Nelson Mandela", alt: ["نيلسون مانديلا", "مانديلا"], img: "/img/person-NelsonMandelaahard.jpeg", info: "سُجن 27 سنة ثم صار أول رئيس أسود لجنوب أفريقيا." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Niels Bohr", alt: ["نيلز بور", "بور"], img: "/img/person-nielsbohrhard.jpg", info: "وضع نموذج الذرة بمستويات الطاقة، وأسس مدرسة كوبنهاغن بالكم." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Nikola Tesla", alt: ["نيكولا تسلا", "تسلا"], img: "/img/person-Nikolateslaeasy.jpg", info: "طوّر التيار المتردد الذي يشغّل العالم، ونافس إديسون بحرب التيارات." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Oppenheimer", alt: ["أوبنهايمر"], img: "/img/person-Oppenheimermid.jpg", info: "قاد مشروع مانهاتن لصنع القنبلة الذرية، ثم عارض سباق التسلح." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Otto von Bismarck", alt: ["بسمارك", "أوتو فون بسمارك"], img: "/img/person-OttovonBismarckhard.webp", info: "وحّد ألمانيا بالحديد والدم، وأسس أول نظام تأمين اجتماعي بالعالم." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Plato", alt: ["أفلاطون"], img: "/img/person-Platohard.jpg", info: "تلميذ سقراط، وصاحب «الجمهورية» وأسطورة الكهف." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Pythagoras", alt: ["فيثاغورس"], img: "/img/person-Pythagorashard.jpg", info: "نظريته عن المثلث القائم من أشهر ما بالرياضيات، وأسس مدرسة سرية." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Queen Elizabeth II", alt: ["الملكة إليزابيث", "إليزابيث الثانية"], img: "/img/person-QueenElizabethIIeasy.jpg", info: "أطول من حكم ببريطانيا — 70 سنة على العرش." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Queen Victoria", alt: ["الملكة فيكتوريا", "فيكتوريا"], img: "/img/person-Queenvictoriamid.jpg", info: "حكمت 63 سنة بذروة الإمبراطورية البريطانية، وسُمي العصر باسمها." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Richard Nixon", alt: ["نيكسون", "ريتشارد نيكسون"], img: "/img/person-RichardNixonhard.webp", info: "الرئيس الأمريكي الوحيد الذي استقال، بسبب فضيحة ووترغيت." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Ronald Reagan", alt: ["ريغان", "رونالد ريغان"], img: "/img/person-RonaldReaganhard.jpg", info: "ممثل صار رئيسًا، وحكم بأواخر الحرب الباردة." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Shakespeare", alt: ["شكسبير", "وليام شكسبير"], img: "/img/person-Shakespearmid.jpg", info: "أعظم كتّاب الإنجليزية، وأضاف أكثر من 1700 كلمة للغة." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Sigmund Freud", alt: ["فرويد", "سيغموند فرويد"], img: "/img/person-SigmundFreudhard.jpg", info: "مؤسس التحليل النفسي وفكرة اللاوعي وتفسير الأحلام." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Theodore Roosevelt", alt: ["ثيودور روزفلت"], img: "/img/person-TheodoreRoosevelthard.jpg", info: "أصغر رئيس أمريكي، ودمية «تيدي بير» سُميت باسمه." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Thomas Edison", alt: ["إديسون", "توماس إديسون"], img: "/img/person-ThomasAEdisonmid.jpg", info: "صاحب أكثر من 1000 براءة اختراع، وجعل المصباح الكهربائي عمليًا." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Thomas Jefferson", alt: ["جيفرسون", "توماس جيفرسون"], img: "/img/person-ThomasJeffersonhard.jpg", info: "كاتب إعلان الاستقلال الأمريكي وثالث رؤساء أمريكا." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Vladimir Lenin", alt: ["لينين", "فلاديمير لينين"], img: "/img/person-VladimirLeninmid.jpg", info: "قاد الثورة البلشفية 1917 وأسس الاتحاد السوفيتي." },
  { cat: "مين الشخصية؟", d: 1, q: "مين هذي الشخصية؟", a: "Vladimir Putin", alt: ["بوتين", "فلاديمير بوتين"], img: "/img/person-VladimirPutineasy.webp", info: "رئيس روسيا، وضابط سابق بالمخابرات السوفيتية." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Wernher von Braun", alt: ["فون براون"], img: "/img/person-WernervonBraunhard.jpg", info: "مصمم صاروخ ساتورن الخامس الذي أوصل الإنسان للقمر." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "Winston Churchill", alt: ["تشرشل", "ونستون تشرشل"], img: "/img/person-WinstonChurchillmid.jpg", info: "قاد بريطانيا بالحرب العالمية الثانية، وفاز بنوبل للأدب." },
  { cat: "مين الشخصية؟", d: 3, q: "مين هذي الشخصية؟", a: "Woodrow Wilson", alt: ["ويلسون", "وودرو ويلسون"], img: "/img/person-WoodrowWilsonhard.jpg", info: "رئيس أمريكا بالحرب العالمية الأولى، وصاحب فكرة عصبة الأمم." },
  { cat: "مين الشخصية؟", d: 2, q: "مين هذي الشخصية؟", a: "George W. Bush", alt: ["جورج بوش الابن", "بوش"], img: "/img/person-GeorgeWBushmid.jpg", info: "رئيس أمريكا وقت هجمات 11 سبتمبر وحربي أفغانستان والعراق." },
  // ---- خمّن اللعبة ----
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "The Simpsons", alt: ["سيمبسونز", "The Simpsons Hit & Run"], img: "/img/game-simpsonshard.webp", info: "لعبة مبنية على المسلسل الكرتوني الأشهر، وأسلوبها مستوحى من GTA." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Age of Empires II", alt: ["ايج اوف امبايرز", "AoE2"], img: "/img/game-AgeofEmpiresIIhard.webp", info: "من أعظم ألعاب الاستراتيجية، وما زالت تُلعب تنافسيًا بعد 25 سنة." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Animal Crossing", alt: ["انيمال كروسينق"], img: "/img/game-AnimalCrossingmid.webp", info: "تمشي بالوقت الحقيقي — لو ما دخلت شهرًا، القرية تنبت فيها الأعشاب." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Apex Legends", alt: ["ايبكس", "ابيكس ليجندز"], img: "/img/game-apexlegendseasy.webp", info: "أُطلقت فجأة بلا إعلان مسبق ووصلت 25 مليون لاعب بأسبوع." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "ARK: Survival Evolved", alt: ["ارك", "ARK"], img: "/img/game-ARKSurvivalEvolvedeasy.webp", info: "لعبة بقاء تروّض فيها ديناصورات وتبني قواعد." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Assassin's Creed II", alt: ["اساسنز كريد 2", "AC2"], img: "/img/game-AssassinCreedIImid.webp", info: "أحداثها بعصر النهضة الإيطالية، وبطلها إيتزيو من أحب شخصيات السلسلة." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Battlefield 2", alt: ["باتلفيلد 2", "BF2"], img: "/img/game-Battlefield2hard.webp", info: "صدرت 2005 وأسست القتال الجماعي الحديث بـ64 لاعبًا." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "BioShock", alt: ["بايوشوك"], img: "/img/game-BioShockhard.webp", info: "أحداثها بمدينة رابتشر تحت الماء، وجملة «Would you kindly» من أشهر انقلابات الألعاب." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "BioShock", alt: ["بايوشوك"], img: "/img/game-BioShockmid.webp", info: "تجمع بين الرعب والفلسفة السياسية — نقد لفكر آين راند." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Bloodborne", alt: ["بلودبورن"], img: "/img/game-Bloodborneeasy.webp", info: "حصرية سوني من فروم سوفتوير، بعالم فيكتوري مرعب." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Borderlands", alt: ["بوردرلاندز"], img: "/img/game-Borderlandseasy.webp", info: "أسلوبها الفني «سيل شيدنق» يخليها تبدو رسمة كرتونية متحركة." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Call of Duty: Modern Warfare 2", alt: ["كول اوف ديوتي", "MW2"], img: "/img/game-CallofDutyModernWarfare2easy.webp", info: "من أشهر أجزاء السلسلة، ومهمة «No Russian» أثارت جدلًا عالميًا." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Counter-Strike", alt: ["كاونتر سترايك", "CS"], img: "/img/game-CounterStrike.webp", info: "بدأت مود لـHalf-Life ثم صارت أشهر لعبة تكتيكية بالتاريخ." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Counter-Strike", alt: ["كاونتر سترايك", "CS"], img: "/img/game-CounterStrikeeasy.webp", info: "خريطة Dust 2 أشهر خريطة إطلاق نار بتاريخ الألعاب." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Counter-Strike", alt: ["كاونتر سترايك", "CS"], img: "/img/game-CounterStrikehard.webp", info: "اقتصاد الجولات فيها (شراء الأسلحة) ابتكار غيّر ألعاب التصويب." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Crazy Taxi", alt: ["كريزي تاكسي"], img: "/img/game-CrazyTaximid.webp", info: "لعبة أركيد من سيغا، تسابق الوقت لتوصيل الركاب بجنون." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Crysis", alt: ["كرايسس"], img: "/img/game-Crysishard.webp", info: "صارت معيارًا لقوة الأجهزة — «بس هل تشغّل Crysis؟» صارت نكتة عالمية." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Darkest Dungeon", alt: ["داركست دنجن"], img: "/img/game-DarkestDungeonhard.webp", info: "تدير صحة أبطالك النفسية مو الجسدية فقط — التوتر يجنّنهم." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Dark Souls", alt: ["دارك سولز"], img: "/img/game-DarkSoul1mid.webp", info: "أسست نوعًا كاملًا اسمه «سولز لايك»." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Dead by Daylight", alt: ["ديد باي دايلايت", "DBD"], img: "/img/game-DeadbyDaylighteasy.webp", info: "أربعة ناجين ضد قاتل واحد، وفيها شخصيات من أفلام رعب حقيقية." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Dead by Daylight", alt: ["ديد باي دايلايت", "DBD"], img: "/img/game-DeadbyDaylighthard.webp", info: "تعاونت مع Halloween وTexas Chainsaw وStranger Things." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Dead Space", alt: ["ديد سبيس"], img: "/img/game-DeadSpacehard.webp", info: "ما فيها واجهة على الشاشة — صحتك تظهر على ظهر بدلة البطل." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Death Stranding", alt: ["ديث ستراندنق"], img: "/img/game-DeathStrandinghard.webp", info: "من كوجيما، ولعبة عن توصيل الطرود — قسّمت اللاعبين بين عاشق ورافض." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Deep Rock Galactic", alt: ["ديب روك"], img: "/img/game-DeepRockmid.webp", info: "أقزام فضائيون يعدّنون بكهوف مولّدة عشوائيًا. Rock and Stone!" },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Devil May Cry", alt: ["ديفل ماي كراي", "DMC"], img: "/img/game-DevilMayCryeasy.webp", info: "أسست نوع «الأكشن الأنيق» — كل ما زادت سلاسة ضرباتك زاد تقييمك." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Diablo", alt: ["ديابلو"], img: "/img/game-Diablohard.webp", info: "أسست نوع Action RPG بالنهب العشوائي اللي قلّدته مئات الألعاب." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Dishonored", alt: ["ديسonored", "ديسأونرد"], img: "/img/game-Dishonoredhard.webp", info: "تقدر تنهيها بلا قتل ولا شخص — وطريقة لعبك تغيّر شكل العالم." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Elden Ring", alt: ["إلدن رينق"], img: "/img/game-EldenRingeasy.webp", info: "شاركت جورج آر آر مارتن بكتابة أساطير عالمها." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Fall Guys", alt: ["فول قايز"], img: "/img/game-FallGuyshard.webp", info: "باتل رويال بلا سلاح — 60 حبة فاصولياء تتنافس بألعاب حركية." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Fallout: New Vegas", alt: ["نيو فيغاس", "فولاوت"], img: "/img/game-FalloutNewVegasmid.webp", info: "طوّرها استوديو غير المطوّر الأصلي، ويعتبرها كثيرون أفضل جزء بالسلسلة." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Far Cry 3", alt: ["فار كراي 3"], img: "/img/game-farCry3hard.webp", info: "شخصية الشرير فاس من أشهر أشرار الألعاب رغم ظهوره القصير." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Fortnite", alt: ["فورتنايت"], img: "/img/game-fortniteeasy.webp", info: "بدأت لعبة تعاونية ضد الزومبي قبل ما يضيفون الباتل رويال." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Forza Horizon 5", alt: ["فورزا", "Forza"], img: "/img/game-forza5hard.webp", info: "أحداثها بالمكسيك، ومساحتها من أكبر خرائط ألعاب السباق." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Genshin Impact", alt: ["جينشن امباكت"], img: "/img/game-GenshinImpacteasy.webp", info: "مجانية لكنها من أكثر الألعاب ربحًا بالتاريخ عبر نظام الجاتشا." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "God of War", alt: ["جود اوف وور"], img: "/img/game-godofwarmid.webp", info: "إعادة إطلاق 2018 صُوّرت بلقطة واحدة بلا قطع طوال اللعبة." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "GRIS", alt: ["غريس"], img: "/img/game-grishard.webp", info: "لعبة فنية بلا حوار، تحكي مراحل الحزن بالألوان والرسم اليدوي." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Half-Life 2", alt: ["هاف لايف 2"], img: "/img/game-HalfLife2hard.webp", info: "محرك الفيزياء فيها كان ثورة، ومسدس الجاذبية غيّر مفهوم التفاعل." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Hollow Knight", alt: ["هولو نايت"], img: "/img/game-HollowKnighteasy.webp", info: "طوّرها ثلاثة أشخاص فقط وصارت من أعظم ألعاب المترويدفانيا." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Hotline Miami", alt: ["هوتلاين ميامي"], img: "/img/game-HotlineMiamihard.webp", info: "عنف سريع بموسيقى الثمانينات، وتموت بضربة واحدة." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Hunt: Showdown", alt: ["هنت شوداون"], img: "/img/game-HuntShowdownhard.webp", info: "تمزج البقاء والصيد — الصوت فيها أهم من البصر." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Inside", alt: ["إنسايد"], img: "/img/game-Insidehard.webp", info: "لعبة صامتة بلا كلمة واحدة، ونهايتها من أغرب نهايات الألعاب." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Kingdom Hearts", alt: ["كينقدم هارتس"], img: "/img/game-KingdomHeartseasy.webp", info: "تجمع شخصيات ديزني مع Final Fantasy — وقصتها مشهورة بتعقيدها." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "League of Legends", alt: ["ليق اوف ليجندز", "LoL"], img: "/img/game-LeagueofLegendsmid.webp", info: "أكبر لعبة إلكترونية تنافسية، وبطولتها العالمية تنافس مشاهدات الأولمبياد." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Left 4 Dead", alt: ["ليفت فور ديد", "L4D"], img: "/img/game-Left4Deadhard.webp", info: "«المخرج الذكي» فيها يغيّر مواقع الزومبي حسب أدائك." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "LittleBigPlanet", alt: ["ليتل بيق بلانت", "LBP"], img: "/img/game-LittleBigPlaneteasy.webp", info: "شعارها «العب، اصنع، شارك» — اللاعبون صنعوا ملايين المراحل." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "LittleBigPlanet", alt: ["ليتل بيق بلانت", "LBP"], img: "/img/game-LittleBigPlanethard.webp", info: "بطلها Sackboy مصنوع من القماش، وكل شي بعالمها مواد يدوية." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Minecraft", alt: ["ماينكرافت"], img: "/img/game-Minecrafteasy.webp", info: "أكثر لعبة مبيعًا بالتاريخ — تجاوزت 300 مليون نسخة." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "No Man's Sky", alt: ["نو مانز سكاي"], img: "/img/game-NoManSkymid.webp", info: "فيها 18 كوينتليون كوكب مولّد رياضيًا — أكبر من أن يزورها أحد." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Overcooked", alt: ["اوفركوكد"], img: "/img/game-Overcookedmid.webp", info: "لعبة طبخ تعاونية اشتهرت بأنها تدمّر الصداقات." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Overwatch", alt: ["أوفرواتش"], img: "/img/game-overwatcheasy.webp", info: "من بليزارد، وأبطالها من جنسيات وخلفيات متنوعة عمدًا." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Overwatch", alt: ["أوفرواتش"], img: "/img/game-overwatchmid.webp", info: "نشأت من أنقاض مشروع ملغى اسمه Titan." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Papers, Please", alt: ["بيبرز بليز"], img: "/img/game-PapersPleasemid.webp", info: "تلعب موظف جوازات بدولة ديكتاتورية — وكل ختم قرار أخلاقي." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Payday 2", alt: ["بايداي 2"], img: "/img/game-Payday2easy.webp", info: "لعبة سرقة بنوك تعاونية، تخطط ثم تنفّذ بالخفاء أو بالقوة." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Persona", alt: ["بيرسونا"], img: "/img/game-Personamid.webp", info: "تمزج حياة طالب ثانوي بالنهار مع قتال شياطين بالليل." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Phasmophobia", alt: ["فازموفوبيا"], img: "/img/game-Phasmophobiamid.webp", info: "تصطاد أشباحًا بأدوات حقيقية، والشبح يسمع كلامك بالمايك فعلًا." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Portal 2", alt: ["بورتال 2"], img: "/img/game-Portal2hard.webp", info: "ألغاز بمسدس بوابات، وGLaDOS من أطرف شخصيات الألعاب." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "PUBG", alt: ["ببجي"], img: "/img/game-pubgeasy.webp", info: "أشعلت موجة الباتل رويال كلها، وخريطتها الأولى Erangel." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Red Dead Redemption", alt: ["ريد ديد"], img: "/img/game-RedDeadRedemptionmid.webp", info: "من روكستار، وعالمها من أدق عوالم الغرب الأمريكي بالألعاب." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Resident Evil 4", alt: ["ريزدنت ايفل 4"], img: "/img/game-ResidentEvil4mid.webp", info: "غيّرت السلسلة من رعب البقاء لأكشن، وأسست كاميرا «فوق الكتف»." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Rocket League", alt: ["روكيت ليق"], img: "/img/game-RocketLeagueeasy.webp", info: "كرة قدم بسيارات، ونجحت بعد فشل نسختها الأولى تمامًا." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Rust", alt: ["راست"], img: "/img/game-rusteasy.webp", info: "تبدأ عاريًا بحجر ومشعل، والخطر الأكبر فيها اللاعبون الآخرون." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Sea of Thieves", alt: ["سي اوف ثيفز"], img: "/img/game-SeaofThieveseasy.webp", info: "قرصنة تعاونية — إدارة السفينة تحتاج فريقًا متناسقًا." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Shadow of the Colossus", alt: ["شادو اوف ذا كولوسس"], img: "/img/game-ShadowoftheColossusmid.webp", info: "ما فيها أعداء عاديين — 16 عملاقًا فقط، وكل واحد لغز متحرك." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Silent Hill 2", alt: ["سايلنت هيل 2"], img: "/img/game-Silent%20Hill2hard.webp", info: "الضباب فيها كان حيلة تقنية لتقليل الحمل، فصار أيقونة رعب." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Spelunky", alt: ["سبيلانكي"], img: "/img/game-Spelunkyhard.webp", info: "روقلايك بمراحل مولّدة عشوائيًا، وموتك يرجعك للبداية." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Spyro", alt: ["سبايرو"], img: "/img/game-Spyroeasy.webp", info: "تنين بنفسجي صغير، من أيقونات بلايستيشن الأولى." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Stardew Valley", alt: ["ستاردو فالي"], img: "/img/game-StardewValleymid.webp", info: "طوّرها شخص واحد بمفرده خلال أربع سنوات." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Super Mario 64", alt: ["سوبر ماريو 64"], img: "/img/game-SuperMario64hard.webp", info: "أول لعبة منصات ثلاثية الأبعاد ناجحة، ووضعت قواعد التحكم بالكاميرا." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Super Meat Boy", alt: ["سوبر ميت بوي"], img: "/img/game-SuperMeatBoy-hard.webp", info: "من أصعب ألعاب المنصات، وتموت فيها مئات المرات بالمرحلة الواحدة." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Team Fortress 2", alt: ["تيم فورترس 2", "TF2"], img: "/img/game-TeamFortress2mid.webp", info: "تسع فئات بشخصيات كرتونية، وأول لعبة تشعبن نظام الصناديق." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Oblivion", alt: ["اوبليفيون", "The Elder Scrolls IV"], img: "/img/game-TheElderScrollsIVOblivionmid.webp", info: "اشتهرت بوجوه شخصياتها الغريبة وحواراتها العشوائية." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Skyrim", alt: ["سكايرم", "The Elder Scrolls V"], img: "/img/game-TheElderScrollsVSkyrimeasy.webp", info: "أُعيد إصدارها على كل جهاز تقريبًا حتى صارت نكتة." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "The Last of Us", alt: ["لاست اوف اس"], img: "/img/game-TheLastofUshard.webp", info: "فطر الكورديسيبس فيها حقيقي — يصيب النمل ويتحكم بسلوكه." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "The Witcher 3", alt: ["ذا ويتشر 3"], img: "/img/game-thewitcher3mid.webp", info: "مهماتها الجانبية تُعتبر أفضل من قصص رئيسية بألعاب أخرى." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Tomb Raider", alt: ["تومب رايدر"], img: "/img/game-TombRaidereasy.webp", info: "بطلتها لارا كروفت أول أيقونة نسائية بالألعاب." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "Twisted Metal", alt: ["تويستد ميتال"], img: "/img/game-TwistedMetalhard.webp", info: "قتال بالسيارات، وشخصية Sweet Tooth من أشهر أشرار بلايستيشن." },
  { cat: "خمّن اللعبة", d: 2, q: "من أي لعبة هذي الصورة؟", a: "Uncharted: Drake's Fortune", alt: ["انتشارتد", "Uncharted"], img: "/img/game-UnchartedDrakesFortunmid.webp", info: "أول أجزاء السلسلة، وبطلها ناثان دريك مستوحى من إنديانا جونز." },
  { cat: "خمّن اللعبة", d: 3, q: "من أي لعبة هذي الصورة؟", a: "World of Warcraft", alt: ["وورلد اوف ووركرافت", "WoW"], img: "/img/game-World%20of%20Warcrafthard.webp", info: "أشهر MMORPG بالتاريخ، ووصلت 12 مليون مشترك بذروتها." },
  { cat: "خمّن اللعبة", d: 1, q: "من أي لعبة هذي الصورة؟", a: "Yakuza", alt: ["ياكوزا"], img: "/img/game-Yakuzaeasy.webp", info: "دراما عصابات يابانية جادة، لكن مهماتها الجانبية كوميدية بالكامل." },
  // ---- خمّن اللعبة (تحتاج صور بمجلد public/img) ----
  // ---- الأعلام (كلها مرسومة) ----
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "تشاد", alt: ["Chad"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#002664\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FECB00\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#C60C30\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "نفس ألوان تشاد لكن الأزرق أفتح — أي دولة أوروبية؟", a: "رومانيا", alt: ["Romania"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#002B7F\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FCD116\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#CE1126\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "إندونيسيا", alt: ["Indonesia"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"40\" y=\"0\" fill=\"#CE1126\"/><rect width=\"120\" height=\"40\" y=\"40\" fill=\"#FFFFFF\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "أيرلندا", alt: ["Ireland"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#169B62\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#FF883E\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "ساحل العاج", alt: ["Ivory Coast", "كوت ديفوار"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#FF883E\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#169B62\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "هولندا", alt: ["Netherlands"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#AE1C28\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#21468B\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "روسيا", alt: ["Russia"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#0039A6\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#D52B1E\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "النمسا", alt: ["Austria"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#ED2939\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#ED2939\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "مالي", alt: ["Mali"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#14B53A\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FCD116\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#CE1126\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "غينيا", alt: ["Guinea"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#CE1126\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FCD116\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#009460\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "علم عنابي وأبيض بتسع أسنان مثلثة — أي دولة خليجية؟", a: "قطر", alt: ["Qatar"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#8A1538\"/><rect width=\"34\" height=\"80\" fill=\"#fff\"/><polygon points=\"34,0 46,4.4 34,8.9 46,13.3 34,17.8 46,22.2 34,26.7 46,31.1 34,35.6 46,40 34,44.4 46,48.9 34,53.3 46,57.8 34,62.2 46,66.7 34,71.1 46,75.6 34,80\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "علم أحمر وأبيض بخمس أسنان مثلثة — أي دولة خليجية؟", a: "البحرين", alt: ["Bahrain"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#CE1126\"/><rect width=\"38\" height=\"80\" fill=\"#fff\"/><polygon points=\"38,0 54,8 38,16 54,24 38,32 54,40 38,48 54,56 38,64 54,72 38,80\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 3, q: "أحمر عمودي على السارية وثلاثة خطوط أخضر وأبيض وأسود — أي دولة؟", a: "الإمارات", alt: ["الامارات", "UAE"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" x=\"30\" fill=\"#00732F\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" x=\"30\" fill=\"#fff\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" x=\"30\" fill=\"#000\"/><rect width=\"30\" height=\"80\" fill=\"#FF0000\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 3, q: "مثلث أحمر على السارية وثلاثة خطوط أخضر وأبيض وأسود — أي دولة؟", a: "الأردن", alt: ["الاردن", "Jordan", "فلسطين"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#000\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#fff\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#007A3D\"/><polygon points=\"0,0 46,40 0,80\" fill=\"#CE1126\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أخضر وأبيض وأسود أفقي بمثلث أحمر — أي دولة عربية؟", a: "السودان", alt: ["Sudan"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#D21034\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#fff\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#000\"/><polygon points=\"0,0 40,40 0,80\" fill=\"#007229\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 3, q: "أحمر وأبيض وأسود أفقي مع شكل أخضر منحرف على السارية — أي دولة؟", a: "الكويت", alt: ["Kuwait"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#007A3D\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#fff\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#CE1126\"/><polygon points=\"0,0 30,26.7 30,53.3 0,80\" fill=\"#000\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر بمثلث أبيض على السارية وخنجر وسيفان — أي دولة عربية؟", a: "عمان", alt: ["Oman", "عُمان"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#DB161B\"/><rect x=\"30\" width=\"90\" height=\"26.7\" fill=\"#fff\"/><rect x=\"30\" y=\"53.3\" width=\"90\" height=\"26.7\" fill=\"#008000\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "كولومبيا", alt: ["Colombia"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"40\" y=\"0\" fill=\"#FCD116\"/><rect width=\"120\" height=\"20\" y=\"40\" fill=\"#003893\"/><rect width=\"120\" height=\"20\" y=\"60\" fill=\"#CE1126\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أصفر وأزرق وأحمر متساوية أفقيًا — أي دولة جنوب أمريكية؟", a: "فنزويلا", alt: ["Venezuela"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#FCD116\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#00247D\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#CF142B\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر وأبيض وأحمر عمودي — أي دولة جنوب أمريكية؟", a: "بيرو", alt: ["Peru"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#D91023\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#D91023\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أزرق وأبيض وأزرق أفقي بشمس ذهبية بالمنتصف — أي دولة؟", a: "الأرجنتين", alt: ["الارجنتين", "Argentina"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#74ACDF\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#74ACDF\"/><circle cx=\"60\" cy=\"40\" r=\"9\" fill=\"#F6B40E\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "فنلندا", alt: ["Finland"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#FFFFFF\"/><rect x=\"36\" y=\"0\" width=\"14\" height=\"80\" fill=\"#003580\"/><rect x=\"0\" y=\"33\" width=\"120\" height=\"14\" fill=\"#003580\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "صليب أزرق داخل صليب أبيض على أحمر — أي دولة؟", a: "النرويج", alt: ["Norway"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#BA0C2F\"/><rect x=\"32\" y=\"0\" width=\"20\" height=\"80\" fill=\"#fff\"/><rect x=\"0\" y=\"30\" width=\"120\" height=\"20\" fill=\"#fff\"/><rect x=\"37\" y=\"0\" width=\"10\" height=\"80\" fill=\"#00205B\"/><rect x=\"0\" y=\"35\" width=\"120\" height=\"10\" fill=\"#00205B\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "صليب أحمر على أبيض بحدود زرقاء — أي دولة جزيرة؟", a: "آيسلندا", alt: ["ايسلندا", "Iceland"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#02529C\"/><rect x=\"30\" y=\"0\" width=\"20\" height=\"80\" fill=\"#fff\"/><rect x=\"0\" y=\"30\" width=\"120\" height=\"20\" fill=\"#fff\"/><rect x=\"35\" y=\"0\" width=\"10\" height=\"80\" fill=\"#DC1E35\"/><rect x=\"0\" y=\"35\" width=\"120\" height=\"10\" fill=\"#DC1E35\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "دائرة حمراء بمنتصف أخضر — أي دولة آسيوية؟", a: "بنغلاديش", alt: ["بنجلاديش", "Bangladesh"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#006A4E\"/><circle cx=\"54\" cy=\"40\" r=\"20\" fill=\"#F42A41\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "دائرة صفراء غير متمركزة على أزرق — أي دولة جزرية؟", a: "بالاو", alt: ["Palau"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#4AADD6\"/><circle cx=\"52\" cy=\"40\" r=\"18\" fill=\"#FFDE00\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "تونس", alt: ["Tunisia"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#E70013\"/><circle cx=\"60\" cy=\"40\" r=\"22\" fill=\"#fff\"/><circle cx=\"63\" cy=\"40\" r=\"14\" fill=\"#E70013\"/><circle cx=\"68\" cy=\"40\" r=\"11\" fill=\"#fff\"/><polygon points=\"66,34 68,39 73,39 69,42 71,47 66,44 61,47 63,42 59,39 64,39\" fill=\"#E70013\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "هلال ونجمة بيضاء على أحمر بلا دائرة — أي دولة؟", a: "تركيا", alt: ["Turkey"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#E30A17\"/><circle cx=\"50\" cy=\"40\" r=\"18\" fill=\"#fff\"/><circle cx=\"57\" cy=\"40\" r=\"15\" fill=\"#E30A17\"/><polygon points=\"76,40 80,47 88,47 82,52 84,60 76,55 68,60 70,52 64,47 72,47\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أخضر بهلال ونجمة أبيض وشريط أبيض على السارية — أي دولة؟", a: "باكستان", alt: ["Pakistan"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#01411C\"/><rect width=\"30\" height=\"80\" fill=\"#fff\"/><circle cx=\"72\" cy=\"40\" r=\"17\" fill=\"#fff\"/><circle cx=\"78\" cy=\"38\" r=\"14\" fill=\"#01411C\"/><polygon points=\"88,32 90,37 95,37 91,40 93,45 88,42 83,45 85,40 81,37 86,37\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر بخمس نجوم صفراء بالزاوية — أي دولة؟", a: "الصين", alt: ["China"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#DE2910\"/><polygon points=\"22,12 26,22 36,22 28,28 31,38 22,32 13,38 16,28 8,22 18,22\" fill=\"#FFDE00\"/><circle cx=\"44\" cy=\"10\" r=\"3\" fill=\"#FFDE00\"/><circle cx=\"52\" cy=\"18\" r=\"3\" fill=\"#FFDE00\"/><circle cx=\"52\" cy=\"30\" r=\"3\" fill=\"#FFDE00\"/><circle cx=\"44\" cy=\"38\" r=\"3\" fill=\"#FFDE00\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أخضر وأصفر وأحمر أفقي بنجمة خضراء — أي دولة أفريقية؟", a: "إثيوبيا", alt: ["اثيوبيا", "Ethiopia"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#078930\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#FCDD09\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#DA121A\"/><circle cx=\"60\" cy=\"40\" r=\"15\" fill=\"#0F47AF\"/><polygon points=\"60,30 63,38 71,38 65,43 67,51 60,46 53,51 55,43 49,38 57,38\" fill=\"#FCDD09\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر وأبيض وأسود أفقي بنسر ذهبي بالمنتصف — أي دولة عربية؟", a: "مصر", alt: ["Egypt"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"26.7\" y=\"0\" fill=\"#CE1126\"/><rect width=\"120\" height=\"26.7\" y=\"26.7\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"26.6\" y=\"53.4\" fill=\"#000000\"/><circle cx=\"60\" cy=\"40\" r=\"8\" fill=\"#C09300\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر فوق أسود بشعار ذهبي بالمنتصف — أي دولة أفريقية؟", a: "أنغولا", alt: ["Angola", "موزمبيق"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"40\" y=\"0\" fill=\"#CE1126\"/><rect width=\"120\" height=\"40\" y=\"40\" fill=\"#000000\"/><circle cx=\"60\" cy=\"40\" r=\"10\" fill=\"#FFCB00\" opacity=\"0.9\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "المكسيك", alt: ["Mexico"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#006847\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#CE1126\"/><circle cx=\"60\" cy=\"40\" r=\"9\" fill=\"#8B5A2B\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 1, q: "وش الدولة صاحبة هذا العلم؟", a: "فرنسا", alt: ["France"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#0055A4\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#EF4135\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "بلجيكا", alt: ["Belgium"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#000000\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FAE042\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#ED2939\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أزرق وأبيض بتسعة خطوط وصليب بالزاوية — أي دولة؟", a: "اليونان", alt: ["Greece"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#0D5EAF\"/><rect y=\"8.9\" width=\"120\" height=\"8.9\" fill=\"#fff\"/><rect y=\"17.8\" width=\"120\" height=\"8.9\" fill=\"#0D5EAF\"/><rect y=\"26.700000000000003\" width=\"120\" height=\"8.9\" fill=\"#fff\"/><rect y=\"35.6\" width=\"120\" height=\"8.9\" fill=\"#0D5EAF\"/><rect y=\"44.5\" width=\"120\" height=\"8.9\" fill=\"#fff\"/><rect y=\"53.4\" width=\"120\" height=\"8.9\" fill=\"#0D5EAF\"/><rect y=\"62.300000000000004\" width=\"120\" height=\"8.9\" fill=\"#fff\"/><rect y=\"71.2\" width=\"120\" height=\"8.9\" fill=\"#0D5EAF\"/><rect width=\"44\" height=\"44\" fill=\"#0D5EAF\"/><rect x=\"18\" y=\"0\" width=\"9\" height=\"44\" fill=\"#fff\"/><rect x=\"0\" y=\"17\" width=\"44\" height=\"9\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "سويسرا", alt: ["Switzerland"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"80\" fill=\"#D52B1E\"/><rect x=\"52\" y=\"18\" width=\"16\" height=\"44\" fill=\"#fff\"/><rect x=\"38\" y=\"32\" width=\"44\" height=\"16\" fill=\"#fff\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 1, q: "أخضر وأبيض وأحمر عمودي بلا شعار — أي دولة أوروبية؟", a: "إيطاليا", alt: ["ايطاليا", "Italy"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"40\" height=\"80\" x=\"0\" fill=\"#009246\"/><rect width=\"40\" height=\"80\" x=\"40\" fill=\"#FFFFFF\"/><rect width=\"40\" height=\"80\" x=\"80\" fill=\"#CE2B37\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "أحمر وأصفر وأحمر أفقي بشريط أصفر عريض — أي دولة أوروبية؟", a: "إسبانيا", alt: ["اسبانيا", "Spain"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"20\" y=\"0\" fill=\"#AA151B\"/><rect width=\"120\" height=\"40\" y=\"20\" fill=\"#F1BF00\"/><rect width=\"120\" height=\"20\" y=\"60\" fill=\"#AA151B\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "بولندا", alt: ["Poland"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"40\" y=\"0\" fill=\"#FFFFFF\"/><rect width=\"120\" height=\"40\" y=\"40\" fill=\"#DC143C\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "أعلام", d: 2, q: "وش الدولة صاحبة هذا العلم؟", a: "أوكرانيا", alt: ["Ukraine"], svg: "<svg viewBox=\"0 0 120 80\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"120\" height=\"40\" y=\"0\" fill=\"#0057B7\"/><rect width=\"120\" height=\"40\" y=\"40\" fill=\"#FFD700\"/><rect x=\"0\" y=\"0\" width=\"120\" height=\"80\" fill=\"none\" stroke=\"#3D3153\" stroke-width=\"2\"/></svg>" },
  { cat: "شكل ورسم", d: 2, q: "وش نوع العدسة المرسومة؟", a: "محدبة", alt: ["convex", "محدب"], svg: "<svg viewBox=\"0 0 200 110\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M100 12 Q128 55 100 98 Q72 55 100 12 Z\" fill=\"#2EC4A6\" opacity=\"0.35\" stroke=\"#2EC4A6\" stroke-width=\"2.5\"/><g stroke=\"var(--sand)\" stroke-width=\"2\"><line x1=\"10\" y1=\"30\" x2=\"92\" y2=\"30\"/><line x1=\"10\" y1=\"55\" x2=\"92\" y2=\"55\"/><line x1=\"10\" y1=\"80\" x2=\"92\" y2=\"80\"/><line x1=\"108\" y1=\"32\" x2=\"178\" y2=\"55\"/><line x1=\"108\" y1=\"55\" x2=\"178\" y2=\"55\"/><line x1=\"108\" y1=\"78\" x2=\"178\" y2=\"55\"/></g><circle cx=\"178\" cy=\"55\" r=\"4\" fill=\"#F0A32F\"/></svg>" },
  { cat: "شكل ورسم", d: 2, q: "الدائرة الكهربائية المرسومة: توصيل على التوالي ولا على التوازي؟", a: "التوازي", alt: ["parallel", "توازي"], svg: "<svg viewBox=\"0 0 200 110\" xmlns=\"http://www.w3.org/2000/svg\"><g stroke=\"var(--sand)\" stroke-width=\"2.5\" fill=\"none\"><path d=\"M20 20 H180 V90 H20 Z\"/><path d=\"M70 20 V90\"/><path d=\"M130 20 V90\"/></g><g fill=\"#F0A32F\"><rect x=\"58\" y=\"48\" width=\"24\" height=\"14\" rx=\"3\"/><rect x=\"118\" y=\"48\" width=\"24\" height=\"14\" rx=\"3\"/></g><circle cx=\"20\" cy=\"55\" r=\"5\" fill=\"#D9494F\"/></svg>" },
  { cat: "شكل ورسم", d: 2, q: "أي موجة ترددها أعلى: العليا (الخضراء) ولا السفلى (البرتقالية)؟", a: "العليا", alt: ["الخضراء", "الأولى", "فوق"], svg: "<svg viewBox=\"0 0 200 110\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M10 32 q7.5 -16 15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0\" fill=\"none\" stroke=\"#2EC4A6\" stroke-width=\"2.5\"/><path d=\"M10 82 q22.5 -26 45 0 t45 0 t45 0 t45 0\" fill=\"none\" stroke=\"#F0A32F\" stroke-width=\"2.5\"/></svg>" },
  { cat: "شكل ورسم", d: 3, q: "مثلث قائم الزاوية ضلعاه 3 و 4 — كم طول الوتر؟", a: "5", alt: ["خمسة"], svg: "<svg viewBox=\"0 0 200 120\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"40,100 40,30 145,100\" fill=\"#2EC4A6\" opacity=\"0.2\" stroke=\"#2EC4A6\" stroke-width=\"2.5\"/><rect x=\"40\" y=\"88\" width=\"12\" height=\"12\" fill=\"none\" stroke=\"var(--sand)\" stroke-width=\"2\"/><text x=\"26\" y=\"68\" fill=\"var(--sand)\" font-size=\"16\" font-family=\"sans-serif\">3</text><text x=\"88\" y=\"116\" fill=\"var(--sand)\" font-size=\"16\" font-family=\"sans-serif\">4</text><text x=\"100\" y=\"58\" fill=\"#F0A32F\" font-size=\"18\" font-family=\"sans-serif\">?</text></svg>" },
  { cat: "شكل ورسم", d: 2, q: "مثلث زاويتاه 65 و 45 — كم الزاوية الثالثة؟", a: "70", alt: ["سبعين"], svg: "<svg viewBox=\"0 0 200 120\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"30,100 170,100 105,25\" fill=\"#F0A32F\" opacity=\"0.18\" stroke=\"#F0A32F\" stroke-width=\"2.5\"/><text x=\"36\" y=\"92\" fill=\"var(--sand)\" font-size=\"15\" font-family=\"sans-serif\">65°</text><text x=\"138\" y=\"92\" fill=\"var(--sand)\" font-size=\"15\" font-family=\"sans-serif\">45°</text><text x=\"96\" y=\"50\" fill=\"#2EC4A6\" font-size=\"18\" font-family=\"sans-serif\">?</text></svg>" },
  { cat: "شكل ورسم", d: 3, q: "الأعمدة تمثل مبيعات 4 أرباع — كم الفرق بين الأعلى والأدنى؟", a: "30", alt: ["ثلاثين"], svg: "<svg viewBox=\"0 0 200 120\" xmlns=\"http://www.w3.org/2000/svg\"><g stroke=\"var(--sand)\" stroke-width=\"2\"><line x1=\"22\" y1=\"12\" x2=\"22\" y2=\"100\"/><line x1=\"22\" y1=\"100\" x2=\"185\" y2=\"100\"/></g><g fill=\"#2EC4A6\"><rect x=\"36\" y=\"60\" width=\"26\" height=\"40\"/><rect x=\"74\" y=\"40\" width=\"26\" height=\"60\"/><rect x=\"112\" y=\"25\" width=\"26\" height=\"75\"/><rect x=\"150\" y=\"55\" width=\"26\" height=\"45\"/></g><g fill=\"var(--sand)\" font-size=\"11\" font-family=\"sans-serif\"><text x=\"40\" y=\"55\">40</text><text x=\"78\" y=\"35\">60</text><text x=\"116\" y=\"20\">70</text><text x=\"154\" y=\"50\">45</text></g></svg>" },
  { cat: "شكل ورسم", d: 2, q: "وش اسم الشكل الهندسي المرسوم حسب عدد أضلاعه؟", a: "سداسي", alt: ["hexagon", "مسدس"], svg: "<svg viewBox=\"0 0 200 130\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"100,18 145,44 145,96 100,122 55,96 55,44\" fill=\"#D9494F\" opacity=\"0.22\" stroke=\"#D9494F\" stroke-width=\"2.5\"/></svg>" },
  // ============ البنك الجديد — صعوبة مرفوعة ============
  // ---- هندسة (دفعة 2) ----
  { cat: "Engineering Questions", d: 1, q: "What is the primary driving force behind the sintering process in ceramic powder compacts?", a: "Reduction in total surface energy", opts: ["Increase in atomic vibration frequency", "Formation of covalent bonds", "Reduction in total surface energy", "External atmospheric pressure"], info: "الجسيمات تلتحم لتقليل مساحة السطح الكلية — والطاقة السطحية هي المحرك لا الحرارة نفسها." },
  { cat: "Engineering Questions", d: 3, q: "In liquid phase sintering, what role does the liquid constituent play in accelerating densification?", a: "It acts as a lubricant for particle rearrangement", opts: ["It acts as a lubricant for particle rearrangement", "It lowers the overall chemical purity", "It increases the evaporation rate of the solid", "It prevents the formation of grain boundaries"], info: "السائل يملأ الفراغات ويسهّل انزلاق الحبيبات فتتراص أسرع بكثير من التلبيد الصلب." },
  { cat: "Engineering Questions", d: 2, q: "The structures which have the highest packing of atoms are:", a: "Hexagonal close packed lattice", opts: ["Body centred cubic lattice", "None of the above", "Hexagonal close packed lattice", "Simple cubic lattice"], info: "كفاءة التراص 74% — نفس FCC، وأعلى من BCC (68%) والمكعب البسيط (52%)." },
  { cat: "Engineering Questions", d: 1, q: "The hardness is the property of a material due to which it:", a: "Can cut another metal", opts: ["Can be rolled or hammered into thin sheets", "Can cut another metal", "Can be drawn into wires", "Breaks with little permanent distortion"], info: "الصلادة مقاومة الخدش والاختراق — ولهذا الأصلب يقطع الألين." },
  { cat: "Engineering Questions", d: 1, q: "The property which enables metals to be drawn into wire is known as:", a: "Ductility", opts: ["Ductility", "Plastic deformation", "Straining", "Malleability"], info: "المطيلية للأسلاك، والطَرْق (malleability) للصفائح — الفرق باتجاه التشكيل." },
  { cat: "Engineering Questions", d: 1, q: "The property of a material which enables it to retain the deformation permanently is called:", a: "Plasticity", opts: ["Brittleness", "Ductility", "Malleability", "Plasticity"], info: "عكس المرونة (elasticity) اللي يرجع فيها الجسم لشكله الأصلي." },
  { cat: "Engineering Questions", d: 1, q: "In a unit cell of a body centred cubic space lattice, there are ___ atoms.", a: "Nine", opts: ["Fourteen", "Nine", "Six", "Seventeen"], info: "ثمانية بالأركان وواحدة بالمركز — لكن النصيب الفعلي للخلية ذرتان." },
  { cat: "Engineering Questions", d: 2, q: "The property of a material due to which it breaks with little permanent distortion is called:", a: "Brittleness", opts: ["Malleability", "Brittleness", "Ductility", "Plasticity"], info: "الزجاج والسيراميك مثالها — تنكسر فجأة بلا إنذار بتشوه سابق." },
  { cat: "Engineering Questions", d: 1, q: "Machinability of metal depends on:", a: "Hardness and tensile strength", opts: ["Brittleness", "Brittleness and toughness", "Hardness and tensile strength", "Hardness"], info: "المعدن الأصلب والأقوى شدًا يستهلك أدوات القطع أسرع." },
  { cat: "Engineering Questions", d: 1, q: "Which property is desirable in parts subjected to shock and impact loads?", a: "Toughness", opts: ["Brittleness", "Toughness", "Stiffness", "Strength"], info: "المتانة = القدرة على امتصاص الطاقة قبل الكسر، مو القوة وحدها." },
  { cat: "Engineering Questions", d: 2, q: "Which of the following is an amorphous material?", a: "Glass", opts: ["Glass", "Mica", "Lead", "Silver"], info: "ذراته بلا ترتيب بلوري منتظم — ولهذا ينكسر بحواف عشوائية لا بمستويات." },
  { cat: "Engineering Questions", d: 3, q: "Which statement correctly describes an endothermic reaction?", a: "It absorbs heat from the surroundings, resulting in a temperature decrease", opts: ["It absorbs heat from the surroundings, resulting in a temperature decrease", "It releases heat to the surroundings, resulting in a temperature increase", "It releases heat and lowers the surrounding temperature", "It absorbs heat and raises the surrounding temperature"], info: "endo = للداخل: التفاعل يسحب الحرارة فيبرد المحيط. والطارد (exothermic) عكسه." },
  { cat: "Engineering Questions", d: 2, q: "CH4 + 2 O2 → CO2 + 2 H2O + 213.2 kJ — this reaction is:", a: "Exothermic", opts: ["Isothermal", "Catalytic", "Endothermic", "Exothermic"], info: "الطاقة تظهر بجهة النواتج، يعني التفاعل أطلقها — والاحتراق دائمًا طارد للحرارة." },
  { cat: "Engineering Questions", d: 2, q: "If a reaction finishes with more energy than it started, it must be:", a: "Endothermic", opts: ["Endothermic", "Exothermic", "Isothermal", "Spontaneous"], info: "زيادة طاقة النواتج تعني أنها امتُصت من المحيط." },
  { cat: "Engineering Questions", d: 2, q: "Classify: MgCl2 + Li2CO3 → MgCO3 + LiCl", a: "Double displacement", opts: ["Single displacement", "Decomposition", "Double displacement", "Synthesis"], info: "الأيونان الموجبان تبادلا شريكيهما — ولهذا يُسمى الإحلال المزدوج." },
  { cat: "Engineering Questions", d: 1, q: "Where do you find the reactants and products in a chemical reaction?", a: "Reactants → products", opts: ["Products → reactants", "Reactants → products", "Both on the right", "Both on the left"], info: "السهم يقرأ «ينتج عنه» — والمتفاعلات دائمًا يساره." },
  { cat: "Engineering Questions", d: 3, q: "Why is PET preferred over HDPE for carbonated soft drink bottles?", a: "It has superior CO2 barrier properties", opts: ["It is much cheaper to make", "It is much heavier than HDPE", "It attracts more sunlight", "It has superior CO2 barrier properties"], info: "HDPE يسرّب الغاز فتفقد المشروبات فوارها — وPET يحبسه لشهور." },
  { cat: "Engineering Questions", d: 3, q: "What happens to polymer molecules when they encounter the cold surface of the mold tool?", a: "They lose kinetic energy and stabilize", opts: ["They turn into a gas", "They accelerate rapidly", "They lose kinetic energy and stabilize", "They form permanent cross-links"], info: "التبريد يجمّد السلاسل بمكانها — ولهذا التبريد السريع يسبب إجهادات داخلية بالقطعة." },
  // ---- توسعة + 5 فئات جديدة ----
  { cat: "طعام ومطبخ", d: 1, q: "وش الفاكهة اللي تحتوي على بذورها من الخارج؟", a: "الفراولة", alt: ["strawberry"], info: "ما هي توتة أصلًا نباتيًا — والنقاط الصغيرة عليها هي الثمار الحقيقية." },
  { cat: "طعام ومطبخ", d: 1, q: "وش البهار الأغلى وزنًا بالعالم؟", a: "الزعفران", alt: ["saffron"], info: "يحتاج نحو 150 ألف زهرة لكيلو واحد، وكله يُقطف يدويًا." },
  { cat: "طعام ومطبخ", d: 2, q: "وش المكوّن اللي يخلي الخبز يرتفع؟", a: "الخميرة", alt: ["yeast"], info: "فطر حي يأكل السكر ويطلق ثاني أكسيد الكربون." },
  { cat: "طعام ومطبخ", d: 2, q: "وش نوع الحليب المستخدم بجبن الموزاريلا الأصلي؟", a: "حليب الجاموس", alt: ["buffalo milk", "الجاموس"], info: "وهذا سبب طعمه ودسمه المختلف عن الموزاريلا الصناعية." },
  { cat: "طعام ومطبخ", d: 2, q: "وش الطبق الياباني المكون من عجينة مقلية بطبقة خفيفة؟", a: "تمبورا", alt: ["tempura"], info: "أدخله البرتغاليون لليابان بالقرن السادس عشر." },
  { cat: "طعام ومطبخ", d: 3, q: "وش المادة اللي تجعل الفلفل الأسود لاذعًا؟", a: "البيبيرين", alt: ["piperine"], info: "تختلف عن الكابسيسين اللي بالفلفل الحار." },
  { cat: "طعام ومطبخ", d: 3, q: "عند أي درجة يتخثر بياض البيض؟", a: "62", alt: ["62 درجة", "نحو 62"], info: "والصفار عند 68 — ولهذا يمكن سلق بيضة صفارها سائل وبياضها متماسك." },
  { cat: "طعام ومطبخ", d: 3, q: "وش أقدم مشروب كحولي معروف صُنع من العسل؟", a: "الميد", alt: ["mead"], info: "عُرف قبل النبيذ والبيرة بآلاف السنين." },
  { cat: "طعام ومطبخ", d: 3, q: "وش المطبخ الذي يستخدم تقنية «الوك» بالقلي السريع؟", a: "الصيني", alt: ["chinese"], info: "الحرارة العالية والحركة المستمرة تحفظ القرمشة والنكهة." },
  { cat: "طعام ومطبخ", d: 2, q: "وش الفرق الأساسي بين البن العربي والروبوستا؟", a: "الكافيين", alt: ["نسبة الكافيين"], info: "الروبوستا كافيينه ضعف العربي تقريبًا وطعمه أكثر مرارة." },
  { cat: "حيوانات", d: 1, q: "وش الحيوان الذي يبني السدود على الأنهار؟", a: "القندس", alt: ["beaver", "البيفر"], info: "سدوده تغيّر مجرى الأنهار وتخلق بيئات كاملة لكائنات أخرى." },
  { cat: "حيوانات", d: 1, q: "وش أطول حيوان بري؟", a: "الزرافة", alt: ["giraffe"], info: "تصل لستة أمتار، وقلبها يزن 11 كيلو ليضخ الدم لرأسها." },
  { cat: "حيوانات", d: 2, q: "كم عين للعنكبوت عادةً؟", a: "8", alt: ["ثمانية"], info: "ومع ذلك أغلب العناكب ضعيفة البصر وتعتمد على الاهتزاز." },
  { cat: "حيوانات", d: 2, q: "وش الحيوان الذي يستطيع رؤية الأشعة فوق البنفسجية؟", a: "النحل", alt: ["النحلة", "bee"], info: "يشوف أنماطًا على الأزهار خفية عن أعيننا تمامًا." },
  { cat: "حيوانات", d: 2, q: "وش الطائر الذي يهاجر أطول مسافة سنويًا؟", a: "الخرشنة القطبية", alt: ["Arctic Tern", "الخرشنة"], info: "تسافر من القطب الشمالي للجنوبي — نحو 70 ألف كم بالسنة." },
  { cat: "حيوانات", d: 3, q: "وش الحيوان الذي دماغه أكبر من دماغ الإنسان؟", a: "حوت العنبر", alt: ["الحوت", "sperm whale"], info: "يزن نحو 8 كيلو مقابل 1.4 للإنسان." },
  { cat: "حيوانات", d: 3, q: "وش الكائن الذي يمكنه النجاة بالفضاء بلا حماية؟", a: "الدبّ المائي", alt: ["تارديغريد", "tardigrade"], info: "يدخل حالة سبات يفقد فيها 99% من مائه ويتحمل الإشعاع والفراغ." },
  { cat: "حيوانات", d: 3, q: "وش الحيوان الذي بصمته الأنفية تُستخدم للتعريف مثل بصمة الإنسان؟", a: "البقرة", alt: ["الأبقار", "cow"], info: "تُستخدم فعليًا بسجلات المزارع ببعض الدول." },
  { cat: "حيوانات", d: 3, q: "كم قلبًا للدودة الأرضية؟", a: "5", alt: ["خمسة"], info: "ليست قلوبًا كاملة بل أقواس عضلية تضخ الدم." },
  { cat: "حيوانات", d: 2, q: "وش الحيوان الذي ينام بعين واحدة مفتوحة؟", a: "الدلفين", alt: ["dolphin"], info: "ينام نصف دماغه فقط ليبقى يتنفس ويراقب الخطر." },
  { cat: "سيارات", d: 1, q: "وش الشركة صاحبة شعار الحصان الأسود على درع أصفر؟", a: "فيراري", alt: ["Ferrari"], info: "الحصان كان رمز طيار إيطالي بطل بالحرب العالمية الأولى." },
  { cat: "سيارات", d: 1, q: "وش أشهر سيارة كهربائية بالعالم من ناحية المبيعات؟", a: "تسلا موديل واي", alt: ["Tesla", "تسلا", "Model Y"], info: "صارت أكثر سيارة مبيعًا بالعالم كليًا سنة 2023." },
  { cat: "سيارات", d: 2, q: "وش وظيفة الديفرنشال؟", a: "يسمح للعجلات بسرعات مختلفة", alt: ["الفرق بالمنعطفات", "differential"], info: "بدونه تنزلق العجلة الداخلية بكل منعطف." },
  { cat: "سيارات", d: 2, q: "وش يعني DOHC بمواصفات المحرك؟", a: "عمودا كامات علويان", alt: ["Double Overhead Camshaft", "دبل اوفرهيد"], info: "يسمح بأربع صمامات لكل أسطوانة فتزيد الكفاءة." },
  { cat: "سيارات", d: 2, q: "وش الشركة اليابانية صاحبة محرك الروتاري؟", a: "مازدا", alt: ["Mazda"], info: "محرك فانكل الدوّار — خفيف وقوي لكنه شره بالوقود." },
  { cat: "سيارات", d: 3, q: "وش الرقم الذي يدل على عرض الإطار بمقاس 225/45R17؟", a: "225", alt: ["مئتين وخمسة وعشرين"], info: "بالمليمتر، و45 هي نسبة الارتفاع للعرض، و17 قطر الجنط بالبوصة." },
  { cat: "سيارات", d: 3, q: "وش نظام يوزع قوة الفرملة بين العجلات حسب الحمل؟", a: "EBD", alt: ["توزيع قوة الفرامل الإلكتروني"], info: "يعمل مع ABS لمنع انزلاق المؤخرة عند الفرملة القوية." },
  { cat: "سيارات", d: 3, q: "وش أول سيارة تحقق سرعة 100 كم/س بالتاريخ؟", a: "لا جامي كونتينت", alt: ["La Jamais Contente"], info: "كانت كهربائية سنة 1899 — قبل قرن من ثورة الكهربائيات." },
  { cat: "سيارات", d: 3, q: "وش يقيسه رقم الأوكتان بالبنزين؟", a: "مقاومة الاحتراق المبكر", alt: ["مقاومة الطرق", "anti-knock"], info: "الرقم الأعلى يناسب المحركات عالية الانضغاط فقط." },
  { cat: "سيارات", d: 2, q: "وش القطعة اللي تشعل خليط الوقود بمحرك البنزين؟", a: "البوجيه", alt: ["شمعة الاحتراق", "spark plug"], info: "تولّد شرارة عند نحو 20 ألف فولت." },
  { cat: "اختراعات", d: 1, q: "مين اخترع الهاتف الجوال المحمول الأول؟", a: "مارتن كوبر", alt: ["Martin Cooper", "كوبر"], info: "أجرى أول مكالمة 1973 ليعاير منافسه بشركة بل." },
  { cat: "اختراعات", d: 2, q: "وش الاختراع الذي جاء من ملاحظة التصاق بذور بفرو كلب؟", a: "الفيلكرو", alt: ["Velcro", "اللاصق"], info: "صممه مهندس سويسري بعد نزهة صيد 1941." },
  { cat: "اختراعات", d: 2, q: "مين اخترع الطباعة بالحروف المتحركة بأوروبا؟", a: "غوتنبرغ", alt: ["Gutenberg"], info: "الصينيون سبقوه بقرون لكن نظامه ناسب الأبجدية اللاتينية فانتشر." },
  { cat: "اختراعات", d: 2, q: "وش أول جهاز حاسوب إلكتروني عام بالتاريخ؟", a: "إنياك", alt: ["ENIAC"], info: "وزنه 30 طنًا واحتاج غرفة كاملة، وأضعف من ساعة ذكية اليوم." },
  { cat: "اختراعات", d: 3, q: "مين طوّر أول محرك احتراق داخلي عملي بأربع أشواط؟", a: "نيكولاوس أوتو", alt: ["Otto", "أوتو"], info: "ولهذا تُسمى دورة المحرك «دورة أوتو»." },
  { cat: "اختراعات", d: 3, q: "وش المادة التي اكتُشفت بالصدفة وصارت أساس اللدائن الحديثة؟", a: "الباكليت", alt: ["Bakelite"], info: "أول بلاستيك صناعي بالكامل، اخترعه بيكلاند 1907." },
  { cat: "اختراعات", d: 3, q: "مين اخترع الليزر أول مرة عمليًا؟", a: "ثيودور مايمان", alt: ["Maiman", "مايمان"], info: "1960 — وقيل عنه وقتها إنه «حل يبحث عن مشكلة»." },
  { cat: "اختراعات", d: 2, q: "وش الاختراع الذي غيّر النقل البحري وقلّل كلفة الشحن العالمي؟", a: "الحاوية", alt: ["الكونتينر", "container"], info: "وحّدت الأحجام فصار التفريغ آليًا بدل أيام من العمل اليدوي." },
  { cat: "اختراعات", d: 3, q: "مين اخترع نظام الترقيم بالباركود؟", a: "وودلاند وسيلفر", alt: ["Woodland", "باركود"], info: "استوحاه من شفرة مورس ورسمه على الرمل بالشاطئ." },
  { cat: "اختراعات", d: 1, q: "وش الاختراع الذي يحفظ الطعام باردًا؟", a: "الثلاجة", alt: ["البراد", "fridge"], info: "تنقل الحرارة للخارج بدل ما تصنع البرودة." },
  { cat: "رياضة", d: 1, q: "كم لاعبًا بفريق كرة السلة داخل الملعب؟", a: "5", alt: ["خمسة"], info: "والفريق كامل يضم 12 لاعبًا بقائمة المباراة." },
  { cat: "رياضة", d: 2, q: "وش أكثر نادٍ فوزًا بدوري أبطال أوروبا؟", a: "ريال مدريد", alt: ["Real Madrid"], info: "بفارق كبير عن أقرب منافسيه." },
  { cat: "رياضة", d: 2, q: "كم شوطًا بمباراة البولو؟", a: "6", alt: ["ستة"], info: "يُسمى كل شوط «تشوكا» ومدته سبع دقائق." },
  { cat: "رياضة", d: 2, q: "وش الرياضة التي يُمنع فيها لمس الكرة باليد إلا لحارس المرمى؟", a: "كرة القدم", alt: ["football", "soccer"], info: "والحارس نفسه ممنوع خارج منطقة الجزاء." },
  { cat: "رياضة", d: 3, q: "كم مرة فازت البرازيل بكأس العالم؟", a: "5", alt: ["خمسة"], info: "1958 و1962 و1970 و1994 و2002 — أكثر من أي منتخب." },
  { cat: "رياضة", d: 3, q: "كم يبلغ طول ملعب كرة القدم القياسي بالمتر؟", a: "105", alt: ["نحو 105", "100-110"], info: "والعرض 68 مترًا حسب معايير فيفا للمباريات الدولية." },
  { cat: "رياضة", d: 3, q: "وش البطولة التي تُقام كل أربع سنوات وتجمع كل الرياضات؟", a: "الأولمبياد", alt: ["Olympics"], info: "استُؤنفت 1896 بعد انقطاع دام نحو 1500 سنة." },
  { cat: "رياضة", d: 2, q: "كم عدد الحلقات بالشعار الأولمبي؟", a: "5", alt: ["خمسة"], info: "ترمز للقارات الخمس، وألوانها موجودة بكل أعلام العالم." },
  { cat: "رياضة", d: 3, q: "وش النادي السعودي الملقب بالزعيم؟", a: "الهلال", alt: ["Al Hilal"], info: "أكثر أندية آسيا تتويجًا بدوري الأبطال." },
  { cat: "ألعاب فيديو", d: 1, q: "وش الشركة صاحبة جهاز Xbox؟", a: "مايكروسوفت", alt: ["Microsoft"], info: "دخلت السوق 2001 لتنافس سوني ونينتندو." },
  { cat: "ألعاب فيديو", d: 2, q: "وش أول لعبة فيديو تجارية ناجحة بالتاريخ؟", a: "Pong", alt: ["بونق"], info: "لعبة تنس بخطين ونقطة، أطلقتها أتاري 1972." },
  { cat: "ألعاب فيديو", d: 2, q: "وش المحرك الذي بُنيت عليه Fortnite وValorant؟", a: "Unreal Engine", alt: ["أنريل"], info: "من إبيك غيمز، ويُستخدم اليوم بالأفلام والعمارة أيضًا." },
  { cat: "ألعاب فيديو", d: 2, q: "وش اللعبة التي جعلت الباتل رويال ظاهرة عالمية أول مرة؟", a: "PUBG", alt: ["ببجي"], info: "استوحت الفكرة من فيلم Battle Royale الياباني." },
  { cat: "ألعاب فيديو", d: 3, q: "وش أطول سلسلة ألعاب مستمرة بالتاريخ؟", a: "Ultima", alt: ["أولتيما", "Final Fantasy"], info: "بدأت 1981 واستمرت عقودًا قبل أن تتوقف." },
  { cat: "ألعاب فيديو", d: 3, q: "وش اللعبة التي كسرت الرقم القياسي كأسرع منتج ترفيهي مبيعًا؟", a: "GTA V", alt: ["جي تي ايه 5"], info: "حققت مليار دولار خلال ثلاثة أيام من إطلاقها." },
  { cat: "ألعاب فيديو", d: 3, q: "وش الشركة اليابانية التي بدأت بصناعة ورق اللعب سنة 1889؟", a: "نينتندو", alt: ["Nintendo"], info: "دخلت الألعاب الإلكترونية بعد نحو 90 سنة من تأسيسها." },
  { cat: "ألعاب فيديو", d: 2, q: "وش اللعبة التي بطلها سبّاك إيطالي؟", a: "Mario", alt: ["ماريو", "سوبر ماريو"], info: "كان اسمه أصلًا «Jumpman» بلعبة Donkey Kong." },
  { cat: "ألعاب فيديو", d: 3, q: "وش نظام التشغيل الذي يعمل عليه جهاز Steam Deck؟", a: "لينكس", alt: ["Linux", "SteamOS"], info: "يشغّل ألعاب ويندوز عبر طبقة توافق اسمها Proton." },
  { cat: "ألعاب فيديو", d: 1, q: "وش أشهر لعبة بناء بالمكعبات؟", a: "Minecraft", alt: ["ماينكرافت"], info: "أكثر لعبة مبيعًا بالتاريخ." },
  { cat: "تقنية", d: 1, q: "وش يعني اختصار Wi-Fi تقنيًا؟", a: "اسم تجاري", alt: ["مجرد اسم", "علامة تجارية"], info: "ما هو اختصار لشي — اختارته شركة تسويق ليبدو كـHi-Fi." },
  { cat: "تقنية", d: 2, q: "وش أكبر شبكة اجتماعية من حيث عدد المستخدمين؟", a: "فيسبوك", alt: ["Facebook", "Meta"], info: "تجاوزت ثلاثة مليارات مستخدم نشط شهريًا." },
  { cat: "تقنية", d: 2, q: "وش لغة البرمجة الأكثر استخدامًا بتطوير الويب بالمتصفح؟", a: "جافاسكربت", alt: ["JavaScript"], info: "اللغة الوحيدة التي تفهمها المتصفحات أصلًا." },
  { cat: "تقنية", d: 2, q: "وش المقصود بـ VPN؟", a: "شبكة افتراضية خاصة", alt: ["Virtual Private Network"], info: "تشفّر اتصالك وتخفي موقعك عن مزود الخدمة." },
  { cat: "تقنية", d: 3, q: "كم بت بمفتاح تشفير AES-256؟", a: "256", alt: ["مئتين وستة وخمسين"], info: "عدد الاحتمالات أكبر من عدد ذرات الكون المرصود." },
  { cat: "تقنية", d: 3, q: "وش الشركة التي تصنع أغلب رقائق العالم المتقدمة؟", a: "TSMC", alt: ["تي إس إم سي", "تايوان"], info: "تصنع لأبل وإنفيديا وAMD، ولهذا تايوان محور صراع استراتيجي." },
  { cat: "تقنية", d: 3, q: "وش البروتوكول الذي يضمن وصول البيانات كاملة ومرتبة؟", a: "TCP", alt: ["تي سي بي"], info: "عكس UDP الأسرع لكنه لا يضمن الوصول — يُستخدم بالبث المباشر." },
  { cat: "تقنية", d: 3, q: "مين طوّر لغة بايثون؟", a: "غيدو فان روسم", alt: ["Guido van Rossum", "فان روسم"], info: "سمّاها على برنامج كوميدي بريطاني لا على الأفعى." },
  { cat: "تقنية", d: 2, q: "وش الفرق الأساسي بين RAM وROM؟", a: "RAM تُمحى عند الإطفاء", alt: ["الرام مؤقتة", "volatile"], info: "الرام ذاكرة عمل مؤقتة، والروم تحفظ البيانات دائمًا." },
  { cat: "تقنية", d: 1, q: "وش أشهر منصة لمشاركة الأكواد البرمجية؟", a: "GitHub", alt: ["قيت هب"], info: "اشترتها مايكروسوفت 2018 بـ7.5 مليار دولار." },
  { cat: "عام", d: 1, q: "كم عدد أيام السنة الكبيسة؟", a: "366", alt: ["ثلاثمئة وستة وستين"], info: "تجي كل أربع سنوات لتعويض الفارق مع دوران الأرض الحقيقي." },
  { cat: "عام", d: 2, q: "وش أكثر كتاب مبيعًا بالتاريخ؟", a: "الإنجيل", alt: ["Bible", "الكتاب المقدس"], info: "طُبع منه مليارات النسخ وتُرجم لأكثر من 700 لغة." },
  { cat: "عام", d: 2, q: "وش أطول جسر بحري بالعالم؟", a: "جسر خليج جياوتشو", alt: ["الصين", "Hong Kong-Zhuhai"], info: "بالصين، ويتجاوز 50 كم فوق الماء." },
  { cat: "عام", d: 2, q: "كم عدد الألوان بمكعب روبيك؟", a: "6", alt: ["ستة"], info: "وعدد التركيبات الممكنة أكثر من 43 كوينتليون." },
  { cat: "عام", d: 3, q: "وش أغلى لوحة بيعت بمزاد علني؟", a: "سلفاتور موندي", alt: ["Salvator Mundi"], info: "لدافنشي، بيعت بـ450 مليون دولار سنة 2017." },
  { cat: "عام", d: 3, q: "كم لغة رسمية بالأمم المتحدة؟", a: "6", alt: ["ستة"], info: "العربية والصينية والإنجليزية والفرنسية والروسية والإسبانية." },
  { cat: "عام", d: 3, q: "وش أقصر حرب بالتاريخ وكم استمرت؟", a: "38 دقيقة", alt: ["ثمانية وثلاثين دقيقة", "الأنجلو-زنجبارية"], info: "الحرب الأنجلو-زنجبارية سنة 1896." },
  { cat: "عام", d: 2, q: "وش أكثر عنصر وفرة بجسم الإنسان بالوزن؟", a: "الأكسجين", alt: ["oxygen"], info: "لأن معظم الجسم ماء، والماء نصفه أكسجين بالوزن." },
  { cat: "عام", d: 3, q: "وش أقدم علم وطني ما زال مستخدمًا؟", a: "الدنمارك", alt: ["Denmark", "العلم الدنماركي"], info: "يُستخدم منذ القرن الثالث عشر." },
  { cat: "عام", d: 1, q: "كم عدد قارات العالم؟", a: "7", alt: ["سبعة"], info: "وبعض المدارس تعدّها ستًا بدمج أوروبا وآسيا." },
  { cat: "تاريخ", d: 1, q: "بأي قرن وقعت الحرب العالمية الأولى؟", a: "العشرين", alt: ["20", "القرن العشرين"], info: "1914-1918، وسُميت وقتها «الحرب التي تنهي كل الحروب»." },
  { cat: "تاريخ", d: 2, q: "وش الحضارة التي بنت البتراء؟", a: "الأنباط", alt: ["Nabataeans"], info: "أتقنوا هندسة المياه بالصحراء وتحكموا بطرق تجارة البخور." },
  { cat: "تاريخ", d: 2, q: "مين أول من طاف حول العالم بحرًا؟", a: "بعثة ماجلان", alt: ["ماجلان", "Magellan"], info: "ماجلان نفسه قُتل بالفلبين، وأكمل الرحلة إلبانو بسفينة واحدة." },
  { cat: "تاريخ", d: 2, q: "وش الجدار الذي بناه الرومان شمال بريطانيا؟", a: "سور هادريان", alt: ["Hadrian's Wall"], info: "بطول 117 كم لصد قبائل الشمال." },
  { cat: "تاريخ", d: 3, q: "في أي سنة سقطت القسطنطينية؟", a: "1453", alt: ["١٤٥٣"], info: "بقيادة محمد الفاتح، وتُعد نهاية العصور الوسطى عند كثير من المؤرخين." },
  { cat: "تاريخ", d: 3, q: "وش المعاهدة التي أنهت الحرب العالمية الأولى؟", a: "فرساي", alt: ["Versailles"], info: "شروطها القاسية على ألمانيا مهّدت للحرب الثانية." },
  { cat: "تاريخ", d: 3, q: "مين آخر فراعنة مصر؟", a: "كليوباترا", alt: ["Cleopatra"], info: "يونانية الأصل من سلالة البطالمة لا مصرية." },
  { cat: "تاريخ", d: 3, q: "وش الإمبراطورية التي حكمت بيرو قبل الإسبان؟", a: "الإنكا", alt: ["Inca"], info: "بنت شبكة طرق تفوق 40 ألف كم بلا عجلات ولا حديد." },
  { cat: "تاريخ", d: 2, q: "مين القائد الذي عبر الألب بالفيلة لمهاجمة روما؟", a: "هانيبال", alt: ["Hannibal"], info: "قرطاجي، وعبورها يُعد من أجرأ المناورات العسكرية بالتاريخ." },
  { cat: "تاريخ", d: 3, q: "وش أول دولة منحت المرأة حق التصويت؟", a: "نيوزيلندا", alt: ["New Zealand"], info: "سنة 1893، قبل بريطانيا بربع قرن." },
  { cat: "جغرافيا", d: 1, q: "وش أكبر دولة بالعالم مساحة؟", a: "روسيا", alt: ["Russia"], info: "تغطي أكثر من ثُمن يابسة الأرض." },
  { cat: "جغرافيا", d: 2, q: "وش أصغر دولة بالعالم؟", a: "الفاتيكان", alt: ["Vatican"], info: "مساحتها 0.44 كم² وسكانها أقل من ألف." },
  { cat: "جغرافيا", d: 2, q: "وش البحر الذي لا شواطئ له؟", a: "بحر سارغاسو", alt: ["Sargasso"], info: "محدود بتيارات محيطية لا بيابسة — الوحيد من نوعه." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة التي تضم أكبر عدد براكين نشطة؟", a: "إندونيسيا", alt: ["Indonesia"], info: "تقع على حزام النار وفيها أكثر من 130 بركانًا نشطًا." },
  { cat: "جغرافيا", d: 3, q: "وش أطول سلسلة جبال بالعالم؟", a: "الأنديز", alt: ["Andes"], info: "7000 كم على طول أمريكا الجنوبية." },
  { cat: "جغرافيا", d: 3, q: "وش المدينة الوحيدة التي تقع على قارتين؟", a: "إسطنبول", alt: ["Istanbul"], info: "يفصلها مضيق البوسفور بين أوروبا وآسيا." },
  { cat: "جغرافيا", d: 3, q: "وش الدولة التي لها أكبر عدد جيران بأفريقيا؟", a: "السودان", alt: ["Sudan"], info: "يحدها سبع دول." },
  { cat: "جغرافيا", d: 3, q: "وش أعمق نقطة بالمحيطات؟", a: "خندق ماريانا", alt: ["Mariana Trench"], info: "نحو 11 كم — لو وضعت إفرست فيها لغطته المياه بأكثر من كيلومترين." },
  { cat: "جغرافيا", d: 2, q: "وش الصحراء التي تغطي معظم منغوليا وشمال الصين؟", a: "غوبي", alt: ["Gobi"], info: "صحراء باردة تصل حرارتها لـ40 تحت الصفر شتاءً." },
  { cat: "جغرافيا", d: 1, q: "وش القارة التي تقع فيها مصر؟", a: "أفريقيا", alt: ["Africa"], info: "مع جزء صغير بآسيا هو شبه جزيرة سيناء." },
  { cat: "منطق وألغاز", d: 2, q: "لو كان اليوم الثلاثاء، فأي يوم يكون بعد 100 يوم؟", a: "الخميس", info: "100 ÷ 7 = 14 وباقي 2، فنتقدم يومين من الثلاثاء." },
  { cat: "منطق وألغاز", d: 2, q: "عندك عصا طولها متر وتريد قصها لـ4 قطع — كم قصة تحتاج؟", a: "3", alt: ["ثلاث"], info: "كل قصة تزيد قطعة واحدة." },
  { cat: "منطق وألغاز", d: 2, q: "رجل يدفع 20 ويأخذ الباقي 5 من فاتورة 15 — كم دفع فعليًا؟", a: "15", alt: ["خمسة عشر"], info: "الباقي ليس جزءًا من الدفع." },
  { cat: "منطق وألغاز", d: 3, q: "إذا كان بعض A هم B وكل B هم C — هل بالضرورة بعض A هم C؟", a: "نعم", alt: ["إي", "yes"], info: "القياس صحيح منطقيًا لأن كل B داخل C." },
  { cat: "منطق وألغاز", d: 3, q: "معك 9 عملات وحدة مزيفة أخف وميزان كفتين — كم وزنة كحد أدنى؟", a: "2", alt: ["اثنتين"], info: "قسّمها ثلاثة ثلاثة، ثم قارن داخل المجموعة الأخف." },
  { cat: "منطق وألغاز", d: 3, q: "غرفة فيها 4 زوايا وبكل زاوية قطة، وأمام كل قطة 3 قطط — كم قطة بالغرفة؟", a: "4", alt: ["أربع"], info: "كل قطة ترى الثلاث الأخريات." },
  { cat: "منطق وألغاز", d: 3, q: "ساعة تدق مرة بالواحدة ومرتين بالثانية — كم مرة تدق خلال 12 ساعة؟", a: "78", alt: ["ثمانية وسبعين"], info: "مجموع الأعداد من 1 إلى 12." },
  { cat: "منطق وألغاز", d: 2, q: "لو مشيت جنوبًا كيلو ثم شرقًا كيلو ثم شمالًا كيلو ورجعت لنفس النقطة — وين أنت؟", a: "القطب الشمالي", alt: ["North Pole"], info: "لغز كلاسيكي، وله حلول أخرى قرب القطب الجنوبي." },
  { cat: "منطق وألغاز", d: 3, q: "عمر شخص اليوم يساوي مربع عمره قبل سنوات — إذا كان 25 اليوم فكم كان قبل 20 سنة؟", a: "5", alt: ["خمسة"], info: "5 تربيع = 25." },
  { cat: "منطق وألغاز", d: 2, q: "وش الرقم الذي إذا قسمته على 2 وضربته بـ2 يبقى نفسه؟", a: "أي رقم", alt: ["الكل", "كل الأرقام"], info: "العمليتان متعاكستان فتلغيان بعضهما." },
  { cat: "أمثال ومصطلحات", d: 1, q: "كمّل: من شبّ على شيء…؟", a: "شاب عليه", info: "يعني العادات المبكرة ترسخ ويصعب تغييرها." },
  { cat: "أمثال ومصطلحات", d: 1, q: "كمّل: الطيور على أشكالها…؟", a: "تقع", info: "المتشابهون يجتمعون." },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى «يبيع الماء بحارة السقايين»؟", a: "يعرض بضاعته على أهل الخبرة", alt: ["يتعالم على الخبراء"], info: "يقابله بالإنجليزية: يبيع الثلج للإسكيمو." },
  { cat: "أمثال ومصطلحات", d: 2, q: "كمّل: إذا لم تستحِ…؟", a: "فاصنع ما شئت", info: "من حديث نبوي صار مثلًا متداولًا." },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى «حبل الكذب قصير»؟", a: "الكذب ينكشف سريعًا", alt: ["ينفضح بسرعة"], info: "لأن المتناقضات تتراكم فتفضح صاحبها." },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح «كبش فداء»؟", a: "من يُحمّل ذنب غيره", alt: ["يتحمل عن غيره"], info: "أصله من طقس قديم يُحمّل فيه تيس ذنوب القوم ويُطرد للصحراء." },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى «يمشي على البيض»؟", a: "يتعامل بحذر شديد", alt: ["حذر"], info: "لأن أي ضغط زائد يكسر." },
  { cat: "أمثال ومصطلحات", d: 3, q: "كمّل: وداوني بالتي كانت هي…؟", a: "الداء", info: "من شعر أبي نواس، ويُضرب لمن يعالج الشيء بمثله." },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى «ضربة معلّم»؟", a: "تصرف بارع محسوب", alt: ["حركة ذكية"], info: "من عالم الحرف: الضربة الأخيرة التي يتقنها المعلم وحده." },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى «بيضة الديك»؟", a: "شيء نادر لا يتكرر", alt: ["نادر جدًا"], info: "لأن الديك لا يبيض أصلًا." },
  { cat: "طب وصحة", d: 1, q: "وش العضو الذي يُزرع أكثر من غيره بالعالم؟", a: "الكلية", alt: ["kidney"], info: "لأن الإنسان يعيش بكلية واحدة، فالتبرع من الأحياء ممكن." },
  { cat: "طب وصحة", d: 1, q: "وش الفيتامين الذي تصنعه بشرتك من أشعة الشمس؟", a: "د", alt: ["D", "فيتامين د"], info: "نقصه شائع جدًا بالمناطق الحارة لأن الناس يتجنبون الشمس." },
  { cat: "طب وصحة", d: 1, q: "كم درجة حرارة جسم الإنسان الطبيعية تقريبًا؟", a: "37", alt: ["سبعة وثلاثين"], info: "تتذبذب خلال اليوم، وتكون أدنى قبل الفجر." },
  { cat: "طب وصحة", d: 2, q: "وش المرض الذي يسببه نقص الأنسولين أو مقاومته؟", a: "السكري", alt: ["diabetes"], info: "النوع الأول نقص إفراز، والثاني مقاومة الخلايا له." },
  { cat: "طب وصحة", d: 2, q: "وش الفحص الذي يقيس النشاط الكهربائي للقلب؟", a: "تخطيط القلب", alt: ["ECG", "EKG", "الرسم"], info: "يكشف الذبحات واضطرابات النظم خلال دقائق." },
  { cat: "طب وصحة", d: 2, q: "وش الجهاز المسؤول عن مقاومة العدوى بالجسم؟", a: "المناعي", alt: ["جهاز المناعة", "immune"], info: "يتذكر الميكروبات السابقة — وعلى هذا المبدأ تعمل اللقاحات." },
  { cat: "طب وصحة", d: 2, q: "وش أكثر فصائل الدم انتشارًا بالعالم؟", a: "O موجب", alt: ["O+", "او موجب"], info: "ولهذا بنوك الدم تحتاجه باستمرار رغم كثرته." },
  { cat: "طب وصحة", d: 3, q: "وش الهرمون الذي يرتفع عند التوتر ويُسمى هرمون الإجهاد؟", a: "الكورتيزول", alt: ["cortisol"], info: "ارتفاعه المزمن يضعف المناعة ويرفع سكر الدم." },
  { cat: "طب وصحة", d: 3, q: "وش العملية الجراحية الأكثر إجراءً بالعالم؟", a: "الولادة القيصرية", alt: ["قيصرية", "C-section"], info: "تجاوزت نسبتها 20% من الولادات عالميًا." },
  { cat: "طب وصحة", d: 3, q: "وش المصطلح الطبي لانخفاض الأكسجين بالدم؟", a: "نقص الأكسجة", alt: ["hypoxemia", "hypoxia"], info: "يُقاس بجهاز يوضع على الإصبع اسمه مقياس التأكسج." },
  { cat: "طب وصحة", d: 3, q: "كم يستغرق تجدد خلايا الجلد السطحية تقريبًا؟", a: "28 يومًا", alt: ["شهر", "28"], info: "ولهذا نتائج العناية بالبشرة تحتاج شهرًا على الأقل لتظهر." },
  { cat: "طب وصحة", d: 2, q: "وش المرض الذي قُضي عليه عالميًا بالكامل باللقاح؟", a: "الجدري", alt: ["smallpox"], info: "أُعلن استئصاله 1980 — الوحيد بتاريخ البشرية." },
  { cat: "اقتصاد وأعمال", d: 1, q: "وش العملة المستخدمة باليابان؟", a: "الين", alt: ["yen"], info: "من أكثر العملات تداولًا بالعالم بعد الدولار واليورو." },
  { cat: "اقتصاد وأعمال", d: 1, q: "وش أكبر شركة بالعالم من حيث القيمة السوقية غالبًا؟", a: "آبل", alt: ["Apple", "إنفيديا"], info: "تتناوب مع مايكروسوفت وإنفيديا على الصدارة." },
  { cat: "اقتصاد وأعمال", d: 2, q: "وش المصطلح الذي يعني ارتفاع الأسعار وانخفاض قيمة النقود؟", a: "التضخم", alt: ["inflation"], info: "معدل 2% يُعتبر صحيًا، وما فوقه يضر بالقوة الشرائية." },
  { cat: "اقتصاد وأعمال", d: 2, q: "وش السوق المالي السعودي؟", a: "تداول", alt: ["Tadawul"], info: "من أكبر أسواق المال بالشرق الأوسط." },
  { cat: "اقتصاد وأعمال", d: 2, q: "وش يعني GDP؟", a: "الناتج المحلي الإجمالي", alt: ["الناتج المحلي", "Gross Domestic Product"], info: "قيمة كل السلع والخدمات المنتجة داخل الدولة بسنة." },
  { cat: "اقتصاد وأعمال", d: 2, q: "وش المنظمة التي تنظّم إنتاج النفط بين الدول المصدرة؟", a: "أوبك", alt: ["OPEC"], info: "تأسست 1960 بخمس دول منها السعودية." },
  { cat: "اقتصاد وأعمال", d: 3, q: "وش المصطلح الذي يصف سوق أسهم صاعدًا؟", a: "السوق الصاعد", alt: ["Bull market", "الثور"], info: "يرمز له بالثور لأنه يرفع قرنيه للأعلى." },
  { cat: "اقتصاد وأعمال", d: 3, q: "وش أول شركة تصل قيمتها لتريليون دولار؟", a: "آبل", alt: ["Apple"], info: "سنة 2018، ثم تجاوزت الثلاثة تريليونات لاحقًا." },
  { cat: "اقتصاد وأعمال", d: 3, q: "وش المصطلح الذي يعني طرح أسهم شركة للجمهور أول مرة؟", a: "الاكتتاب العام", alt: ["IPO"], info: "أكبر اكتتاب بالتاريخ كان لأرامكو السعودية 2019." },
  { cat: "اقتصاد وأعمال", d: 3, q: "وش النظام الذي ربط العملات بالذهب وانتهى 1971؟", a: "بريتون وودز", alt: ["Bretton Woods"], info: "إنهاؤه حوّل العالم لنظام العملات الورقية العائمة." },
  { cat: "اقتصاد وأعمال", d: 2, q: "وش أكبر شركة نفط بالعالم؟", a: "أرامكو", alt: ["Aramco", "أرامكو السعودية"], info: "تنتج نحو عُشر نفط العالم." },
  { cat: "اقتصاد وأعمال", d: 1, q: "وش العملة الموحدة لأغلب دول أوروبا؟", a: "اليورو", alt: ["Euro"], info: "تستخدمها 20 دولة من أصل 27 بالاتحاد الأوروبي." },
  { cat: "موسيقى", d: 1, q: "كم وترًا للجيتار الكلاسيكي؟", a: "6", alt: ["ستة"], info: "وفيه أنواع بسبعة وثمانية أوتار للأنماط الحديثة." },
  { cat: "موسيقى", d: 1, q: "وش الآلة العربية الملقبة بأمير الآلات؟", a: "العود", alt: ["oud"], info: "أصل كلمة Lute الأوروبية جاء من «العود» العربية." },
  { cat: "موسيقى", d: 2, q: "كم مفتاحًا بالبيانو القياسي؟", a: "88", alt: ["ثمانية وثمانين"], info: "52 أبيض و36 أسود." },
  { cat: "موسيقى", d: 2, q: "وش النوع الموسيقي الذي نشأ بنيو أورلينز مطلع القرن العشرين؟", a: "الجاز", alt: ["Jazz"], info: "وُلد من مزج التقاليد الأفريقية بالأوروبية." },
  { cat: "موسيقى", d: 2, q: "وش الفرقة البريطانية الملقبة بالخنافس؟", a: "البيتلز", alt: ["The Beatles"], info: "أكثر فرقة مبيعًا بالتاريخ." },
  { cat: "موسيقى", d: 3, q: "وش المؤلف الذي ألّف أعظم أعماله وهو أصمّ؟", a: "بيتهوفن", alt: ["Beethoven"], info: "السيمفونية التاسعة كتبها بعد فقدانه السمع تمامًا." },
  { cat: "موسيقى", d: 3, q: "كم نغمة بالسلم الموسيقي الغربي الكامل؟", a: "12", alt: ["اثنتا عشرة"], info: "سبع أساسية وخمس نصف نغمات." },
  { cat: "موسيقى", d: 3, q: "وش المقام الموسيقي العربي الأكثر شيوعًا؟", a: "الرست", alt: ["rast"], info: "يُعد المقام الأم بالموسيقى العربية." },
  { cat: "موسيقى", d: 3, q: "وش الآلة التي اخترعها بارتولوميو كريستوفوري؟", a: "البيانو", alt: ["piano"], info: "سماها «هاربسيكورد يعزف الخافت والعالي» ومنها اختُصرت." },
  { cat: "موسيقى", d: 2, q: "وش وحدة قياس سرعة الإيقاع الموسيقي؟", a: "BPM", alt: ["نبضة بالدقيقة", "beats per minute"], info: "أغلب أغاني البوب بين 100 و130." },
  { cat: "موسيقى", d: 2, q: "وش أشهر منصة بث موسيقي بالعالم؟", a: "سبوتيفاي", alt: ["Spotify"], info: "سويدية، وغيّرت اقتصاد الموسيقى من الشراء للاشتراك." },
  { cat: "موسيقى", d: 1, q: "وش الآلة التي يُنفخ فيها ولها مفاتيح معدنية وشكل منحنٍ؟", a: "الساكسفون", alt: ["saxophone"], info: "اخترعها أدولف ساكس البلجيكي." },
  { cat: "عمارة ومعالم", d: 1, q: "وش أطول مبنى بالعالم؟", a: "برج خليفة", alt: ["Burj Khalifa"], info: "828 مترًا بدبي، ويحمل الرقم منذ 2010." },
  { cat: "عمارة ومعالم", d: 1, q: "وين يقع سور الصين العظيم؟", a: "الصين", alt: ["China"], info: "يمتد أكثر من 21 ألف كم عبر تضاريس متنوعة." },
  { cat: "عمارة ومعالم", d: 2, q: "وش المعبد اليوناني الشهير فوق تلة الأكروبوليس؟", a: "البارثينون", alt: ["Parthenon"], info: "بُني قبل 2500 سنة تكريمًا لأثينا إلهة المدينة." },
  { cat: "عمارة ومعالم", d: 2, q: "وش أشهر برج مائل بالعالم؟", a: "برج بيزا", alt: ["Pisa", "بيزا"], info: "مال أثناء البناء بسبب تربة طينية غير مستقرة." },
  { cat: "عمارة ومعالم", d: 2, q: "وش المبنى الذي بناه شاه جهان تخليدًا لزوجته؟", a: "تاج محل", alt: ["Taj Mahal"], info: "استغرق بناؤه 22 سنة وعمل فيه 20 ألف عامل." },
  { cat: "عمارة ومعالم", d: 3, q: "وش النمط المعماري المميز بالأقواس المدببة والنوافذ الملونة؟", a: "القوطي", alt: ["Gothic"], info: "ساد أوروبا بالقرون الوسطى، ومثاله كاتدرائية نوتردام." },
  { cat: "عمارة ومعالم", d: 3, q: "مين مصمم دار أوبرا سيدني؟", a: "يورن أوتزون", alt: ["Utzon", "اوتزون"], info: "استغرق البناء 14 سنة وتجاوزت الكلفة التقدير بـ14 ضعفًا." },
  { cat: "عمارة ومعالم", d: 3, q: "وش المدينة الأثرية المنحوتة بالصخر الوردي بالأردن؟", a: "البتراء", alt: ["Petra"], info: "عاصمة الأنباط، ومن عجائب الدنيا السبع الجديدة." },
  { cat: "عمارة ومعالم", d: 3, q: "وش المعماري العراقية التي صممت مبانٍ انسيابية شهيرة عالميًا؟", a: "زها حديد", alt: ["Zaha Hadid"], info: "أول امرأة تفوز بجائزة بريتزكر للعمارة." },
  { cat: "عمارة ومعالم", d: 2, q: "وش المشروع السعودي لمدينة خطية بطول 170 كم؟", a: "ذا لاين", alt: ["The Line", "نيوم"], info: "جزء من نيوم، ومصممة بلا سيارات ولا شوارع تقليدية." },
  { cat: "عمارة ومعالم", d: 2, q: "وين يقع مسجد الحرام؟", a: "مكة", alt: ["مكة المكرمة"], info: "أكبر مسجد بالعالم مساحة واستيعابًا." },
  { cat: "عمارة ومعالم", d: 1, q: "وش المبنى الذي يمثل مقر الرئاسة الأمريكية؟", a: "البيت الأبيض", alt: ["White House"], info: "بُني 1800، وأول ساكنيه جون آدامز." },
  { cat: "لغات وشعوب", d: 1, q: "كم حرفًا بالأبجدية العربية؟", a: "28", alt: ["ثمانية وعشرين"], info: "وبعضهم يعدّها 29 بإضافة الهمزة." },
  { cat: "لغات وشعوب", d: 1, q: "وش اللغة الرسمية بالبرازيل؟", a: "البرتغالية", alt: ["Portuguese"], info: "الدولة الوحيدة بأمريكا اللاتينية الناطقة بها." },
  { cat: "لغات وشعوب", d: 2, q: "وش اللغة التي تُكتب من اليسار لليمين وتُقرأ عموديًا تقليديًا؟", a: "اليابانية", alt: ["Japanese"], info: "تُكتب اليوم أفقيًا أيضًا، والعمودي شائع بالكتب الأدبية." },
  { cat: "لغات وشعوب", d: 2, q: "وش أكثر لغة تعلمًا كلغة ثانية بالعالم؟", a: "الإنجليزية", alt: ["English"], info: "يتعلمها أكثر من مليار شخص كلغة إضافية." },
  { cat: "لغات وشعوب", d: 2, q: "وش اللغة التي ليس لها أزمنة فعلية بالمعنى التقليدي؟", a: "الصينية", alt: ["Chinese", "الماندرين"], info: "تعتمد على كلمات دالة على الزمن بدل تصريف الفعل." },
  { cat: "لغات وشعوب", d: 3, q: "وش اللغة الأوروبية التي لا تنتمي لعائلة اللغات الهندو-أوروبية؟", a: "الباسكية", alt: ["Basque", "الفنلندية"], info: "لغة معزولة لا يُعرف لها قريب حي بالعالم." },
  { cat: "لغات وشعوب", d: 3, q: "وش الشعب الذي يعيش بالقطب الشمالي ويُعرف بالإنويت؟", a: "الإنويت", alt: ["Inuit", "الإسكيمو"], info: "كلمة «إسكيمو» يعتبرها بعضهم مسيئة ويفضلون «إنويت»." },
  { cat: "لغات وشعوب", d: 3, q: "وش أقدم لغة مكتوبة ما زالت مستخدمة؟", a: "الصينية", alt: ["Chinese", "التاميلية"], info: "نصوصها متصلة منذ أكثر من ثلاثة آلاف سنة." },
  { cat: "لغات وشعوب", d: 3, q: "وش عدد اللغات الحية بالعالم تقريبًا؟", a: "7000", alt: ["سبعة آلاف"], info: "ونصفها مهدد بالاندثار خلال هذا القرن." },
  { cat: "لغات وشعوب", d: 2, q: "وش الشعب البدوي الذي يرتدي رجاله لثامًا أزرق بالصحراء الكبرى؟", a: "الطوارق", alt: ["Tuareg"], info: "لُقبوا بالرجال الزرق لأن صبغة اللثام تلوّن بشرتهم." },
  { cat: "لغات وشعوب", d: 2, q: "وش اللغة الرسمية بالنمسا؟", a: "الألمانية", alt: ["German"], info: "بلهجة نمساوية مميزة عن ألمانية ألمانيا." },
  { cat: "لغات وشعوب", d: 1, q: "وش اللغة التي يتحدثها أكبر عدد كلغة أم؟", a: "الصينية", alt: ["الماندرين", "Mandarin"], info: "أكثر من مليار متحدث أصلي." },
  // ---- فيزياء إضافية + مقولات ----
  { cat: "فيزياء", d: 2, q: "وش الجهاز المستخدم لقياس سرعة الرياح؟", a: "أنيمومتر", alt: ["anemometer", "مقياس سرعة الرياح"], info: "يقيس السرعة بعدد دورات كؤوسه بالدقيقة." },
  { cat: "فيزياء", d: 3, q: "كم تبلغ سرعة الإفلات (escape velocity) من سطح الأرض؟", a: "11.2 كم/ث", alt: ["11.2", "11.2 km/s", "أحد عشر فاصلة اثنين"], info: "أقل سرعة تحتاجها لتفلت من جاذبية الأرض بلا دفع إضافي." },
  { cat: "فيزياء", d: 1, q: "القانون الأول للـ thermodynamics يُعرف أيضًا باسم؟", a: "حفظ الطاقة", alt: ["conservation of energy", "بقاء الطاقة"], info: "الطاقة لا تفنى ولا تُستحدث، بس تتحول من شكل لآخر." },
  { cat: "فيزياء", d: 2, q: "وش وحدة قياس عدد الدورات بالثانية (cycles per second)؟", a: "هرتز", alt: ["hertz", "Hz"], info: "سُميت على العالم الألماني هاينريش هرتز مكتشف الموجات الكهرومغناطيسية." },
  { cat: "فيزياء", d: 2, q: "وش اسم تدفق الشحنة الكهربائية الذي يعكس اتجاهه دوريًا؟", a: "التيار المتردد", alt: ["alternating current", "AC", "اي سي"], info: "طوّره تسلا، وهو ما يصل بيوتنا لأنه ينتقل لمسافات بعيدة بفقد أقل." },
  { cat: "فيزياء", d: 3, q: "وش يُسمى تغيّر اتجاه الموجة عند تغيّر الوسط؟", a: "الانكسار", alt: ["refraction", "ريفراكشن"], info: "سببه اختلاف سرعة الموجة بين وسط وآخر — ولهذا القلم يبدو مكسورًا بالماء." },
  { cat: "فيزياء", d: 3, q: "أي نوع من الـ electromagnetic radiation له أقصر طول موجي؟", a: "أشعة غاما", alt: ["gamma ray", "غاما"], info: "الأقصر طولًا والأعلى طاقة، وتحتاج رصاصًا سميكًا لإيقافها." },
  { cat: "فيزياء", d: 1, q: "وش المصطلح الذي يعني تغيّر السرعة مع الزمن؟", a: "التسارع", alt: ["acceleration", "اكسليريشن"], info: "كمية متجهة — لها مقدار واتجاه، والفرملة تسارع سالب." },
  { cat: "فيزياء", d: 3, q: "على ماذا حصل Carl David Anderson على نوبل بالفيزياء سنة 1936؟", a: "اكتشاف البوزيترون", alt: ["positron", "البوزيترونات", "discovery of positrons"], info: "البوزيترون هو الجسيم المضاد للإلكترون — أول دليل على المادة المضادة." },
  { cat: "فيزياء", d: 2, q: "تبخّر الثلج الجاف (dry ice) مثال على أي عملية؟", a: "التسامي", alt: ["sublimation", "سبليميشن"], info: "تحوّل مباشر من صلب لغاز بلا مرور بالحالة السائلة." },
  { cat: "فيزياء", d: 3, q: "كم سعة الـ capacitor لما يغيّر كولوم واحد الجهد بين اللوحين بمقدار فولت واحد؟", a: "فاراد", alt: ["one farad", "1 farad", "الفاراد"], info: "وحدة كبيرة جدًا — المكثفات العملية تُقاس بالميكروفاراد." },
  { cat: "فيزياء", d: 2, q: "الديسيبل (decibel) وحدة لقياس ماذا؟", a: "شدة الصوت", alt: ["loudness", "علو الصوت", "الجهارة"], info: "مقياس لوغاريتمي — كل 10 ديسيبل تعني عشرة أضعاف الشدة." },
  { cat: "فيزياء", d: 3, q: "أي تفاعل نووي هو مصدر طاقة الشمس؟", a: "الاندماج النووي", alt: ["nuclear fusion", "الاندماج", "فيوجن"], info: "اندماج نوى الهيدروجين لتكوين هيليوم مع إطلاق طاقة هائلة." },
  { cat: "فيزياء", d: 3, q: "وش اسم النظرية التي قدّمها P.A.M. Dirac بالعشرينات لتفسير سلوك الجسيمات دون الذرية؟", a: "نظرية المجال الكمي", alt: ["quantum field theory", "QFT", "الحقل الكمي"], info: "وحّدت ميكانيكا الكم مع النسبية الخاصة، وتنبأت بالمادة المضادة." },
  { cat: "فيزياء", d: 3, q: "أي قانون يربط المجالات المغناطيسية بالتيار الكهربائي المتولد عنها؟", a: "قانون أمبير", alt: ["Ampere's law", "امبير"], info: "يحسب المجال المغناطيسي حول سلك يحمل تيارًا." },
  { cat: "فيزياء", d: 2, q: "القوة (force) أي نوع من الكميات الفيزيائية؟", a: "متجهة", alt: ["vector", "فيكتور", "كمية متجهة"], info: "لها مقدار واتجاه — ولهذا نجمعها بقاعدة متوازي الأضلاع لا بالجمع العادي." },
  { cat: "فيزياء", d: 2, q: "الحجم (volume) أي نوع من الكميات الفيزيائية؟", a: "قياسية", alt: ["scalar", "سكالر", "كمية قياسية"], info: "لها مقدار فقط بلا اتجاه." },
  { cat: "فيزياء", d: 2, q: "الكثافة (density) أي نوع من الكميات الفيزيائية؟", a: "قياسية", alt: ["scalar", "سكالر", "كمية قياسية"], info: "الكتلة على الحجم — رقم مجرد بلا اتجاه." },
  { cat: "فيزياء", d: 2, q: "الطاقة (energy) أي نوع من الكميات الفيزيائية؟", a: "قياسية", alt: ["scalar", "سكالر", "كمية قياسية"], info: "حتى الطاقة الحركية قياسية رغم أن السرعة متجهة، لأنها تعتمد على مربع السرعة." },
  { cat: "فيزياء", d: 2, q: "السرعة المتجهة (velocity) أي نوع من الكميات الفيزيائية؟", a: "متجهة", alt: ["vector", "فيكتور", "كمية متجهة"], info: "الفرق بينها وبين speed أن الأخيرة قياسية بلا اتجاه." },
  { cat: "فيزياء", d: 3, q: "وش سبب ارتفاع درجة الصوت المسموعة عند اقتراب الجسم من المصدر؟", a: "تأثير دوبلر", alt: ["Doppler effect", "دوبلر"], info: "نفس المبدأ يقيس به الفلكيون ابتعاد المجرات عبر الانزياح الأحمر." },
  { cat: "فيزياء", d: 3, q: "أي جهاز يحوّل الضوء المتفرق إلى حزمة متوازية؟", a: "كوليميتر", alt: ["collimator", "مُوازي"], info: "يُستخدم بالتلسكوبات وأجهزة الأشعة لتوجيه الحزمة بدقة." },
  { cat: "فيزياء", d: 2, q: "وش القوة الداخلية لوحدة المساحة الناشئة عن قوى خارجية مؤثرة على الجسم؟", a: "الإجهاد", alt: ["stress", "ستريس"], info: "يقابله الانفعال (strain) وهو مقدار التشوه الناتج." },
  { cat: "فيزياء", d: 1, q: "وش وحدة الشحنة الكهربائية بالنظام الدولي؟", a: "كولوم", alt: ["coulomb", "كولون"], info: "يساوي شحنة نحو 6.24×10¹⁸ إلكترونًا." },
  { cat: "فيزياء", d: 3, q: "الموجة المستعرضة (transverse wave) تهتز بأي زاوية بالنسبة لاتجاه انتشارها؟", a: "قائمة", alt: ["right angles", "90", "تسعين", "عمودية"], info: "عكس الموجة الطولية مثل الصوت التي تهتز بنفس اتجاه الانتشار." },
  { cat: "فيزياء", d: 2, q: "قانون نيوتن الأول للحركة يتحدث عن ماذا؟", a: "القصور الذاتي", alt: ["inertia", "إنيرشيا"], info: "الجسم يبقى على حاله ما لم تؤثر عليه قوة محصلة." },
  { cat: "فيزياء", d: 3, q: "من اكتشف الحث الكهرومغناطيسي (electromagnetic induction)؟", a: "Michael Faraday", alt: ["فاراداي", "مايكل فاراداي"], info: "اكتشافه هو أساس كل مولد كهرباء ومحول بالعالم." },
  { cat: "فيزياء", d: 3, q: "أي قانون ينطبق على عمل الفرامل الهيدروليكية بالسيارات؟", a: "قانون باسكال", alt: ["Pascal's law", "باسكال"], info: "الضغط المسلّط على سائل محصور ينتقل بالتساوي لكل الاتجاهات." },
  { cat: "فيزياء", d: 3, q: "أي ظاهرة موجية تنتج عن تداخل موجات متحركة باتجاهين متعاكسين؟", a: "الموجات الموقوفة", alt: ["standing waves", "الموجة المستقرة", "standing wave"], info: "تظهر فيها عقد لا تتحرك وبطون بأقصى اهتزاز — أساس نغمات الأوتار." },
  { cat: "فيزياء", d: 3, q: "وش الاسم الآخر للقوة القوية (strong force)؟", a: "القوة النووية", alt: ["nuclear force", "القوة النووية القوية"], info: "تربط الكواركات داخل البروتون، وأقوى بمئة مرة من الكهرومغناطيسية." },
  { cat: "فيزياء", d: 1, q: "وش قانون الكثافة (density)؟", a: "الكتلة على الحجم", alt: ["d = M/V", "M/V", "الكتلة/الحجم"], info: "ولهذا الفلين يطفو والحديد يغرق رغم إمكان تساوي كتلتهما." },
  { cat: "فيزياء", d: 2, q: "قانون أوم (Ohm's law) يصف العلاقة بين ماذا؟", a: "التيار والجهد والمقاومة", alt: ["current voltage resistance", "V=IR", "الجهد والتيار والمقاومة"], info: "الجهد = التيار × المقاومة، أشهر معادلة بالكهرباء." },
  { cat: "فيزياء", d: 2, q: "وش وحدة الحث المغناطيسي (magnetic induction)؟", a: "تسلا", alt: ["tesla", "تيسلا"], info: "مجال الأرض المغناطيسي نحو 50 ميكروتسلا فقط." },
  { cat: "فيزياء", d: 3, q: "أي جهاز يقيس ويسجّل الرطوبة النسبية للهواء؟", a: "هيغرومتر", alt: ["hygrometer", "مقياس الرطوبة"], info: "يُستخدم بالأرصاد والمتاحف لحفظ القطع الأثرية." },
  { cat: "فيزياء", d: 1, q: "وش المصطلح الذي يعني الشغل المبذول بوحدة الزمن؟", a: "القدرة", alt: ["power", "الطاقة بالثانية", "باور"], info: "وحدتها الواط، وتساوي جول واحد بالثانية." },
  { cat: "فيزياء", d: 1, q: "كم يبلغ تسارع الجاذبية عند سطح الأرض؟", a: "9.8", alt: ["9.8 m/s2", "تسعة فاصلة ثمانية", "9.81"], info: "يختلف قليلًا حسب الموقع — أقل عند خط الاستواء بسبب دوران الأرض." },
  { cat: "فيزياء", d: 1, q: "وش وحدة قياس القوة الدافعة الكهربائية (electromotive force)؟", a: "فولت", alt: ["volt", "الفولت"], info: "سُميت على أليساندرو فولتا مخترع أول بطارية." },
  { cat: "فيزياء", d: 2, q: "وش أضعف قوة بالطبيعة؟", a: "الجاذبية", alt: ["gravity", "الجاذبيه"], info: "أضعف من الكهرومغناطيسية بـ10³⁶ مرة — مغناطيس صغير يغلب جاذبية الأرض كلها." },
  { cat: "فيزياء", d: 3, q: "تجربة قطة شرودنغر الفكرية تفترض أن القطة بحالتين بنفس الوقت — ما هما؟", a: "حية وميتة", alt: ["alive and dead", "حي وميت"], info: "صاغها شرودنغر أصلًا للسخرية من تفسير كوبنهاغن لا لتأييده." },
  { cat: "مقولات", d: 2, q: "مين قال: “Ask not what your country can do for you; ask what you can do for your country.”", a: "John F. Kennedy", alt: ["كينيدي", "جون كينيدي", "JFK"], info: "من خطاب تنصيبه 1961، وصارت من أشهر جمل السياسة الأمريكية." },
  { cat: "مقولات", d: 2, q: "مين قال: “We didn’t land on Plymouth Rock; the rock was landed on us.”", a: "Malcolm X", alt: ["مالكوم إكس", "مالكولم اكس"], info: "يقصد أن الأفارقة جُلبوا قسرًا لا بإرادتهم كالمستوطنين." },
  { cat: "مقولات", d: 2, q: "مين قال: “Float like a butterfly, sting like a bee.”", a: "Muhammad Ali", alt: ["محمد علي كلاي", "محمد علي"], info: "وصف أسلوبه بالملاكمة: حركة خفيفة وضربة قاصمة." },
  { cat: "مقولات", d: 2, q: "مين قال: God “does not play dice.”", a: "Albert Einstein", alt: ["أينشتاين", "اينشتاين"], info: "رفضه لعشوائية ميكانيكا الكم — وقد ثبت لاحقًا أن الكم على حق." },
  { cat: "مقولات", d: 3, q: "مين قال: “The world will little note, nor long remember, what we say here, but it can never forget what they did here.”", a: "Abraham Lincoln", alt: ["لينكولن", "أبراهام لينكولن"], info: "من خطاب غيتيسبرغ، ولم يتجاوز 272 كلمة ودقيقتين." },
  { cat: "مقولات", d: 3, q: "مين قال: “The report of my death was an exaggeration.”", a: "Mark Twain", alt: ["مارك توين"], info: "قالها بعد نشر صحيفة خبر وفاته وهو حي." },
  { cat: "مقولات", d: 2, q: "مين قال: “The arc of the moral universe is long, but it bends toward justice.”", a: "Martin Luther King, Jr.", alt: ["مارتن لوثر كينغ", "مارتن لوثر كينج"], info: "استعارها من واعظ القرن التاسع عشر ثيودور باركر." },
  { cat: "مقولات", d: 1, q: "مين قال: “I am become Death, the destroyer of worlds.”", a: "J. Robert Oppenheimer", alt: ["أوبنهايمر", "اوبنهايمر"], info: "اقتبسها من البهاغافاد غيتا بعد أول تفجير نووي." },
  { cat: "مقولات", d: 1, q: "مين قال: “I came, I saw, I conquered.”", a: "Julius Caesar", alt: ["يوليوس قيصر", "قيصر"], info: "بالأصل اللاتيني: Veni, vidi, vici — لخّص فيها انتصارًا كاملًا." },
  { cat: "مقولات", d: 1, q: "مين قال: “Hate the sin and not the sinner.”", a: "Mahatma Gandhi", alt: ["غاندي", "المهاتما غاندي"], info: "من فلسفته بالمقاومة السلمية: قاوم الظلم لا الظالم." },
  { cat: "مقولات", d: 3, q: "مين قال: “People who boast about their IQ are losers.”", a: "Stephen Hawking", alt: ["ستيفن هوكينغ", "هوكينج"], info: "قالها بمقابلة صحفية لما سُئل عن معدل ذكائه." },
  { cat: "مقولات", d: 2, q: "مين قال: “Give me liberty, or give me death!”", a: "Patrick Henry", alt: ["باتريك هنري"], info: "خطبها 1775 ليحرّض المستعمرات على الثورة ضد بريطانيا." },
  { cat: "مقولات", d: 3, q: "مين قال: “What does not kill me makes me stronger.”", a: "Friedrich Nietzsche", alt: ["نيتشه", "فريدريك نيتشه"], info: "من كتابه «أفول الأصنام»، وصارت شعارًا شعبيًا بعيدًا عن سياقها الفلسفي." },
  { cat: "مقولات", d: 1, q: "مين قال: “That's one small step for man, one giant leap for mankind.”", a: "Neil Armstrong", alt: ["نيل أرمسترونغ", "ارمسترونج"], info: "قالها وهو ينزل على القمر 1969 أمام 600 مليون مشاهد." },
  { cat: "مقولات", d: 1, q: "مين قال: “I have a dream.”", a: "Martin Luther King, Jr.", alt: ["مارتن لوثر كينغ", "مارتن لوثر كينج"], info: "من خطابه أمام نصب لينكولن 1963، وارتجل الجزء الأشهر منه." },
  { cat: "مقولات", d: 1, q: "مين قال: “I'll be back.”", a: "The Terminator", alt: ["Terminator", "التيرمنيتر", "Arnold Schwarzenegger", "أرنولد"], info: "أرنولد اعترض على الجملة لصعوبة نطقها عليه، وصارت أشهر ما قال." },
  { cat: "مقولات", d: 1, q: "مين قال: “To be, or not to be.”", a: "Hamlet", alt: ["هاملت", "Shakespeare", "شكسبير"], info: "من مسرحية هاملت لشكسبير، ومطلع أشهر مناجاة بالأدب." },
  { cat: "مقولات", d: 1, q: "مين قال: “I think, therefore I am.”", a: "René Descartes", alt: ["ديكارت", "Descartes"], info: "بناها على أن الشك نفسه دليل قاطع على وجود مفكّر." },
  { cat: "مقولات", d: 1, q: "مين قال: “Elementary, my dear Watson.”", a: "Sherlock Holmes", alt: ["شرلوك هولمز", "شرلوك"], info: "مفارقة: الجملة لم ترد بهذا الشكل بأي من قصص كونان دويل الأصلية." },
  { cat: "مقولات", d: 2, q: "مين قال: “The only thing we have to fear is fear itself.”", a: "Franklin D. Roosevelt", alt: ["روزفلت", "فرانكلين روزفلت"], info: "من خطاب تنصيبه 1933 بذروة الكساد الكبير." },
  { cat: "مقولات", d: 2, q: "مين قال: “Veni, vidi, vici.”", a: "Julius Caesar", alt: ["يوليوس قيصر", "قيصر"], info: "أرسلها كتقرير عسكري كامل بعد انتصاره بمعركة زيلا." },
  { cat: "مقولات", d: 2, q: "مين قال: “Knowledge is power.”", a: "Francis Bacon", alt: ["فرانسيس بيكون", "بيكون"], info: "من مؤسسي المنهج التجريبي بالعلم الحديث." },
  { cat: "مقولات", d: 2, q: "مين قال: “The unexamined life is not worth living.”", a: "Socrates", alt: ["سقراط"], info: "قالها بمحاكمته قبل إعدامه، ورفض التخلي عن الفلسفة مقابل حياته." },
  { cat: "مقولات", d: 3, q: "مين قال: “I disapprove of what you say, but I will defend to the death your right to say it.”", a: "Voltaire", alt: ["فولتير"], info: "مفارقة: نسبتها له كاتبة سيرته لتلخيص موقفه، ولم يكتبها حرفيًا." },
  { cat: "مقولات", d: 3, q: "مين قال: “Power tends to corrupt, and absolute power corrupts absolutely.”", a: "Lord Acton", alt: ["أكتون", "لورد أكتون"], info: "من رسالة كتبها 1887 عن محاسبة الحكام والباباوات." },
  { cat: "مقولات", d: 3, q: "مين قال: “The medium is the message.”", a: "Marshall McLuhan", alt: ["مكلوهان", "مارشال مكلوهان"], info: "يقصد أن وسيلة النقل نفسها تشكّل الوعي أكثر من محتواها." },
  // ---- لعبة الحروف (بنك عزيز) ----
  { cat: "لعبة الحروف", d: 2, q: "بحرف الألف: حيوان يُطلق عليه «أسامة»؟", a: "الأسد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الألف: مؤلف «لسان العرب»؟", a: "ابن منظور" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الألف: وكالة الأنباء التركية؟", a: "الأناضول" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الألف: الفيلسوف الملقب بالمعلم الأول؟", a: "أرسطو" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الألف: مؤسس علم الاجتماع وصاحب «العبر وديوان المبتدأ والخبر»؟", a: "ابن خلدون" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الألف: بحّار عربي لُقّب بأسد البحار؟", a: "أحمد بن ماجد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الألف: وحدة قياس شدة التيار الكهربائي؟", a: "الأمبير" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الألف: البحر الذي يفصل إيطاليا عن البلقان؟", a: "الأدرياتيكي" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الألف: العملة البرتغالية قبل اليورو؟", a: "إسكودو" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: عالم مسلم قال إن سرعة الضوء أكبر من سرعة الصوت؟", a: "البيروني" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: حرب جاهلية دامت نحو أربعين عامًا بين بكر وتغلب؟", a: "البسوس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: وحدة طول تساوي جزءًا من اثني عشر من القدم؟", a: "البوصة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الباء: عملة إثيوبيا؟", a: "بير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: سلسلة جبال بين فرنسا وإسبانيا؟", a: "البرانس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: عاصمة كولومبيا؟", a: "بوغوتا" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الباء: من أنشأ متحف الإسكندرية القديم؟", a: "بطليموس الأول" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: نوع من الصقور؟", a: "الباز" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الباء: أول طبيب أجرى عملية زراعة قلب؟", a: "برنارد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: المدينة التي أُقيمت فيها أولمبياد 1900؟", a: "باريس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الباء: الفيلسوف الهندي مؤلف «كليلة ودمنة»؟", a: "بيدبا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: لقب السيدة مريم عليها السلام؟", a: "البتول" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الباء: عاصمة التشيك؟", a: "براغ" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الباء: الدولة الوحيدة بأمريكا اللاتينية الناطقة بالبرتغالية؟", a: "البرازيل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الباء: دولة تملك حق النقض بمجلس الأمن؟", a: "بريطانيا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: حمّى خبيثة من الأمراض الصيفية؟", a: "التيفود" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: أعلى هضبة بالعالم؟", a: "التبت" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: عاصمة تايوان؟", a: "تايبيه" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: مؤلف «مشكاة المصابيح»؟", a: "التبريزي" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: الفرويدية مدرسة…؟", a: "التحليل النفسي" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: مكوك فضائي أمريكي انفجر بعد إطلاقه 1986؟", a: "تشالنجر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: من أسرع الأسماك بالبحر؟", a: "التونة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: مدينة يمنية أشهر معالمها جبل صبر؟", a: "تعز" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف التاء: يُستخدم لرؤية الأجسام البعيدة جدًا؟", a: "تلسكوب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف التاء: مبنى يُستعمل لخبز الخبز؟", a: "تنور" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف التاء: آلة حربية للدفاع قديمًا؟", a: "ترس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف التاء: مقبرة هندية من الرخام الأبيض من عجائب الدنيا؟", a: "تاج محل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف التاء: تفريق المال على وجه الإسراف؟", a: "تبذير" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: أعلى بحيرة ملاحية بالعالم بين البيرو وبوليفيا؟", a: "تيتيكاكا" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: الدولة التي عاصمتها عشق آباد؟", a: "تركمانستان" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: عاصمة جورجيا؟", a: "تفليس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: دكتاتور روماني حُكم 24 عامًا وأُعدم مع زوجته؟", a: "تشاوشيسكو" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف التاء: الإيطالي مخترع البارومتر؟", a: "توريتشيلي" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الثاء: مؤلف كتاب «فقه اللغة»؟", a: "الثعالبي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الثاء: الغاز المستخدم بإطفاء الحرائق؟", a: "ثاني أكسيد الكربون" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الثاء: مضاد حيوي طبيعي يُستخدم بالطعام والدواء؟", a: "الثوم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الثاء: صاحب كتاب «الذخيرة في الطب»؟", a: "ثابت بن قرة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الثاء: صفة من أهم صفات الشجاعة؟", a: "الثبات" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الثاء: جهاز يسجّل حرارة الجو آليًا؟", a: "ثرموغراف" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الثاء: طعام يتكون من خبز ومرق؟", a: "ثريد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الثاء: كلمة تقرأها من اليمين والشمال بنفس الشكل؟", a: "ثلث" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الثاء: مجموعة النجوم المتلاصقة؟", a: "الثريا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الثاء: مرض من أمراض الدم الوراثية؟", a: "الثلاسيميا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الثاء: من المظاهر الفلكية التي حيّرت العلماء؟", a: "الثقوب السوداء" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الثاء: الماء السائل سيلانًا شديدًا؟", a: "ثجّاج" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: نقيب المهاجرين إلى الحبشة وخطيبهم؟", a: "جعفر بن أبي طالب" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: اسم أبي ذر الغفاري؟", a: "جندب بن جنادة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الجيم: أهجى شعراء العرب؟", a: "جرير" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الجيم: أكبر جزيرة بالعالم؟", a: "غرينلاند" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الجيم: عالم عربي يُلقّب بأبي الكيمياء؟", a: "جابر بن حيان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الجيم: مؤسس الإمبراطورية المغولية؟", a: "جنكيز خان" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: القبيلة التي تنتمي لها زرقاء اليمامة؟", a: "جديس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الجيم: علم يُعنى بطبقات الأرض؟", a: "جيولوجيا" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: علم مسح الأرض؟", a: "جيوديسيا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الجيم: مدينة عربية فيها أعلى نافورة بالعالم؟", a: "جدة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: آخر ملوك الغساسنة؟", a: "جبلة بن الأيهم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الجيم: المخترع الألماني صاحب أول مطبعة بحروف متحركة؟", a: "غوتنبرغ" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: امرأة تولّت رئاسة وزراء إسرائيل؟", a: "غولدا مائير" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الجيم: وحدة انتقال الصفات الوراثية؟", a: "جينات" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: مخترع آلة التصوير الفوتوغرافي التجارية؟", a: "جورج إيستمان" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الجيم: مدينة يُطلق عليها مدينة الذهب؟", a: "جوهانسبرغ" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الجيم: الفرنسي الذي أسس كأس العالم لكرة القدم؟", a: "جول ريميه" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الحاء: وحدة قياس القدرة تُقاس بها المحركات؟", a: "الحصان" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الحاء: قرية عراقية كردية قُصفت بالكيماوي؟", a: "حلبجة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الحاء: من عجائب الدنيا السبع القديمة بالعراق؟", a: "حدائق بابل المعلقة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الحاء: المطبوعة التي تصدر كل عام؟", a: "حولية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الحاء: مدينة سورية فيها قبر خالد بن الوليد؟", a: "حمص" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الحاء: المكان الذي سكنته إرم ذات العماد؟", a: "حضرموت" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الحاء: شدة الندم على ما فات؟", a: "الحسرة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الحاء: أضخم الحيوانات اللافقارية؟", a: "الحبار" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الخاء: طعام الولادة؟", a: "الخُرس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الخاء: الاسم القديم لمرض الدفتيريا عند العرب؟", a: "خانوق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: من أين تحصل الأسماك على الأكسجين؟", a: "الخياشيم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: وسيلة لتمثيل سطح الأرض على لوحة مستوية؟", a: "الخريطة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الخاء: شجر هندي سريع النمو تُصنع منه الكراسي؟", a: "الخيزران" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: ما يُتعمّد من الفعل، وضده الصواب؟", a: "الخطأ" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الخاء: كم عين للنحلة؟", a: "خمس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: خط عرض تتعامد عليه أشعة الشمس مرتين بالسنة؟", a: "خط الاستواء" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: قطعة من البحر تدخل بالبر؟", a: "الخليج" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الخاء: نبات مخدر يُصنع منه الأفيون؟", a: "الخشخاش" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: ما تغطي به المرأة رأسها؟", a: "الخمار" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الخاء: زبدة الشيء أو ما يُستخرج منه حاويًا خصائصه؟", a: "الخلاصة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: مدينة سعودية قرب الدمام؟", a: "الخبر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الخاء: غاز سام يُستعمل بالحروب ومحرّم دوليًا؟", a: "الخردل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الخاء: اسم قدم البعير؟", a: "خُفّ" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الخاء: نبات يكثر قرب المياه ويُستخرج منه زيت مسهّل؟", a: "الخروع" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الخاء: حلي يوضع بقدم المرأة للزينة؟", a: "خلخال" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: من يُرسل سرًا ليلًا ليأتي بالأخبار؟", a: "دسيس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: من مدن مصر على البحر المتوسط؟", a: "دمياط" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: الليلة الثلاثون من الشهر القمري لشدة ظلمتها؟", a: "الدلماء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: عاصمة تنزانيا التجارية؟", a: "دار السلام" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: سواد الليل وظلمته؟", a: "الدجى" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: المرض والعلة؟", a: "الداء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: يُغفر للشهيد كل شيء إلا…؟", a: "الدَّين" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: صغير الدب؟", a: "ديسم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: أقصى قعر الشيء، عكس الدرج؟", a: "الدرك" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: وضع الميت تحت التراب؟", a: "الدفن" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: الجرّة ذات العروة؟", a: "دورق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: الشجرة العظيمة المتشعبة؟", a: "الدوحة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: يضخّه القلب لكل الجسم؟", a: "الدماء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: ما الذي نأكله قبل أن يولد وبعد أن يموت؟", a: "الدجاج" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: الزمان الطويل أو مدة الحياة كلها؟", a: "الدهر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: المخادع المحتال بأقواله وأفعاله؟", a: "دجّال" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: قمر المريخ الثاني بعد فوبوس؟", a: "ديموس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: الطائر المكنّى بأبي اليقظان؟", a: "الديك" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الدال: قول يطلب به الإنسان إثبات حق بالمحاكم؟", a: "الدعوى" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: السحابة كثيرة المطر؟", a: "داجنة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الدال: المفاعل النووي الإسرائيلي؟", a: "ديمونا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الدال: ماء لم يخرج من الأرض ولم ينزل من السماء؟", a: "الدموع" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الذال: نوع من أنواع السمك؟", a: "ذئب البحر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الذال: الانكسار والخضوع والهوان؟", a: "ذل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الذال: القبيح من كل شيء؟", a: "ذميم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الذال: من أنواع الجمال الروحي والخلق الرفيع؟", a: "الذوق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الذال: تسخير الشيء وتسهيله وتمهيده؟", a: "ذلل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الذال: ما خُبئ لوقت الحاجة؟", a: "ذخر" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الذال: ميقات أهل العراق؟", a: "ذات عرق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الذال: الموجات الترددية بالجو؟", a: "ذبذبات" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الذال: من الأمراض التي عرفها العرب قديمًا؟", a: "ذات الجنب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الذال: نبات عشبي يُصنع منه الخبز ويدخل بصناعة النشا؟", a: "الذرة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الذال: أحداث اليوم تصير بالمستقبل…؟", a: "ذكريات" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الذال: المرأة السليطة اللسان؟", a: "ذربة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الراء: مساحة الربع الخالي تقريبًا؟", a: "ربع مليون كم مربع" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الراء: إصلاح الثوب ووصل قطعتيه؟", a: "رتق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: الذاكرة العشوائية بالحاسب؟", a: "رام" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: عنصر فلزي إشعاعي اكتشفته ماري كوري؟", a: "الراديوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: شخص يُحتجز لضمان اتفاق ما؟", a: "رهينة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: نزف الأنف دمًا؟", a: "رعاف" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الراء: الباب العظيم الحجم؟", a: "رِتاج" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: وحدة وزن إنجليزية؟", a: "رطل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: أحد أصناف أسنان الفم؟", a: "الرحى" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: ما الشيء الذي يتكلم بكل لغات العالم بنفس الوقت؟", a: "الراديو" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: جهاز يستخدم الموجات اللاسلكية لاكتشاف الأجسام؟", a: "الرادار" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الراء: أول طبيب مسلم فصل بين طب الأطفال وطب النساء؟", a: "الرازي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: المادة الأساسية بصناعة الزجاج؟", a: "الرمل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: وحدة قياس قوة الزلازل؟", a: "ريختر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: لعبة إصابة الهدف بالبندقية؟", a: "الرماية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: محلول السكر بالأزهار يمتصه النحل ليصنع العسل؟", a: "رحيق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: مرض بآلام العضلات والمفاصل يُداوى بالمياه المعدنية الحارة؟", a: "الروماتيزم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الراء: داخل كل إنسان، تخرج عند الموت ولا تعود؟", a: "الروح" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الراء: من أمراض العين؟", a: "رمد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: اهتزاز الأرض وارتجافها؟", a: "زلزال" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: من الكتب السماوية؟", a: "الزبور" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: ما بين مفصل الكوع والكتف؟", a: "زند" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: نبات يُستعمل شرابًا بعد غليه؟", a: "زنجبيل" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الزاي: شجرة لها زهر أبيض طيب الرائحة؟", a: "الزيزفون" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: يابس وصافٍ كالماء، وُلد بالنار وإذا عاد إليها انهار؟", a: "الزجاج" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الزاي: سلسلة حديدية مسننة تدخل ببعض الصناعات؟", a: "زنجير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: قطعة حديد حلزونية تتمتع بالمرونة والتمدد؟", a: "الزنبرك" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: من القبائل المشهورة بأفريقيا بشدتها بالحرب؟", a: "الزولو" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: فرخ الحمام، وأحد أنواع البلح؟", a: "زغلول" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: أكبر مدن سويسرا سكانًا؟", a: "زيورخ" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الزاي: من أجود أنواع الخشب يُصنع منه الأثاث؟", a: "الزان" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الزاي: حجر كريم يشبه الزمرد وله ألوان كثيرة؟", a: "زبرجد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: تحريك الشيء بشدة وقوة؟", a: "زعزعة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: الكفر باطنًا مع التظاهر بالإيمان؟", a: "زندقة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: مادة فلزية بيضاء تميل للزرقة تدخل بصناعات مختلفة؟", a: "الزنك" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: مادة سوداء من المواد القطرانية تُستخدم برصف الطرق؟", a: "زفت" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: مرض تآكل خلايا المخ مع تقدم العمر؟", a: "الزهايمر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الزاي: علم الحيوان؟", a: "زولوجيا" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الزاي: الاسم القديم لجمهورية الكونغو الديمقراطية؟", a: "زائير" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الزاي: حجر كريم شفاف شديد الخضرة؟", a: "الزمرد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف السين: عاصمة البوسنة والهرسك؟", a: "سراييفو" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: حيوان لبون رمادي بذنب طويل كثيف يُتخذ من جلده فراء؟", a: "سنجاب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: القطيع أو الجماعة جنبًا لجنب؟", a: "سرب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف السين: قائد معركة القادسية؟", a: "سعد بن أبي وقاص" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف السين: أكبر مدن أستراليا سكانًا؟", a: "سيدني" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف السين: مربي الخيل ومروّضه؟", a: "سائس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: ترك التكلم مع القدرة عليه؟", a: "السكوت" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: المسافة التي يقطعها جسم متحرك بوحدة زمن؟", a: "السرعة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: وجه بلا لسان وتتحدث عن الزمان؟", a: "الساعة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: تبكي بلا عيون وتمشي بلا أرجل؟", a: "السحابة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: الممثل الدبلوماسي لدولة بدولة مضيفة؟", a: "سفير" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: قطعة معدن مصبوبة من ذهب أو فضة؟", a: "سبيكة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: من الفلاسفة اليونانيين، معلّم أفلاطون؟", a: "سقراط" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف السين: مرض تتكاثر فيه الخلايا بلا سيطرة؟", a: "السرطان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: ما يُستعمل لتثبيت الشموع للزينة؟", a: "شمعدان" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الشين: النوع الخفيف من الضباب؟", a: "شبورة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: حزمة دقيقة من الضوء تنطلق باستقامة؟", a: "الشعاع" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الشين: ما يستعمله الصياد لصيد السمك بسنارته؟", a: "شص" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: خفة اليد وأعمال كالسحر تخدع العين؟", a: "شعوذة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: العرق النابض الذي يحمل الدم من القلب؟", a: "الشريان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: القطع الصغيرة المتطايرة من قنبلة؟", a: "شظايا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: البخيل الحريص على المال؟", a: "الشحيح" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: إلى أين كانت رحلة الصيف لقريش؟", a: "الشام" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: الطريد الذي لا مأوى له؟", a: "الشريد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: العلامة التي تميز دولة أو جماعة؟", a: "الشعار" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: نهر يتكون من التقاء دجلة والفرات؟", a: "شط العرب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: الخصام والقطيعة؟", a: "شقاق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: امرأة حكمت مصر بعد وفاة زوجها؟", a: "شجرة الدر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: إحدى مراحل تطور الدودة؟", a: "شرنقة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الشين: نوع من الأغطية كانت العرب تلبسه؟", a: "شملة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: جدول الماء المتساقط من مستوى مرتفع؟", a: "شلال" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: كتلة غازات ملتهبة ومصدر حرارة الكائنات؟", a: "الشمس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الشين: ما يتطاير من النار أو الضوء بالتفريغ الكهربائي؟", a: "شرارة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: مجاوزة الحد والبعد عن الحق؟", a: "شطط" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: طائر من الجوارح من فصيلة الصقور؟", a: "شاهين" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الشين: العملة الإسرائيلية؟", a: "شيكل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الصاد: أكثر دول العالم سكانًا تاريخيًا؟", a: "الصين" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: الاسم السري لقنبلة هيروشيما؟", a: "الصبي الصغير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: العذاب الذي وقع على قوم ثمود؟", a: "الصيحة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: نوع من الأخشاب غالية الثمن وطيبة الرائحة؟", a: "الصندل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: يُستخرج من الشجر ويدخل بصناعات عديدة؟", a: "صمغ" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: قمة ظهر الفرس؟", a: "صهوة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: كانت العرب تحفظ فيها المال؟", a: "صرة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الصاد: عمود يُقام بالسفينة يُشد عليه الشراع؟", a: "الصاري" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: سائل يفرزه الكبد ويتجمع بالمرارة؟", a: "الصفراء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: عاصمة بلغاريا؟", a: "صوفيا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الصاد: ظاهرة اصطدام الصوت بحاجز ثم رجوعه؟", a: "الصدى" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الصاد: مدينة تونسية على البحر المتوسط عند خليج قابس؟", a: "صفاقس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الصاد: شدة الشوق والهوى؟", a: "صبابة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الصاد: جزيرة بوسط المتوسط فتحها المسلمون بقيادة أسد بن الفرات؟", a: "صقلية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الصاد: الجزء ما بين العين والأذن؟", a: "صدغ" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: بخار الماء الكثيف يغشى الأرض كالدخان؟", a: "الضباب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: الذي يؤنّب الإنسان على فعل خطأ بنفسه؟", a: "الضمير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الضاد: المتمكن من الشيء المتعمق بعمله؟", a: "ضليع" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: القوة التي يحدثها عمود الهواء على نقطة؟", a: "الضغط الجوي" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الضاد: الكفيل أو الملتزم بالمعاملات المالية؟", a: "ضامن" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: وظيفة القلب الأساسية؟", a: "ضخ الدم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الضاد: حديدة عريضة يُضبّب بها الباب؟", a: "ضبّة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: نستمده من أشعة الشمس؟", a: "الضوء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الضاد: تصحيح الكتاب وتدقيقه وتشكيله؟", a: "ضبط" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: الحاجة أو الشدة التي لا مدفع لها؟", a: "ضرورة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الضاد: شاطئ البحر وساحله؟", a: "الضفة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: الشعر الطويل المتشابك المكوّن للجدائل؟", a: "ضفيرة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: عظم مستطيل منحنٍ من عظام الجنب؟", a: "الضلع" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: القبر المبني حوله؟", a: "ضريح" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الضاد: ما تُضرم به النار من الحطب؟", a: "الضرام" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: الجلبة والصياح وأكثر ما يكون من السيارات؟", a: "ضجيج" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: العملية الأساسية بالحساب والجبر؟", a: "الضرب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الضاد: التزام الهدوء بعد موقف يضيق به الصدر؟", a: "ضبط النفس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: مدينة لبنانية وميناء تشتهر ببساتين الزيتون ومصفاة بترول؟", a: "طرابلس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: بماذا كانت تُدعى خديجة بالجاهلية؟", a: "الطاهرة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: أكبر مدن آسيا سكانًا؟", a: "طوكيو" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الطاء: أول ملوك الدولة السلجوقية؟", a: "طغرلبك" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: معنى «حجارة من سجيل»؟", a: "طين متحجر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: الصواريخ التي تطلقها الغواصات؟", a: "طوربيد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: الحالة التي تتكوّن فيها شخصية الإنسان مستقبلًا؟", a: "الطفولة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: من الشخص الذي لا يغضب إذا أخرجت له لسانك؟", a: "الطبيب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: نظام اجتماعي يقوم على الفصل بين أفراد المجتمع؟", a: "طبقية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: يحملك إلى حيث تريد وهو واقف؟", a: "الطريق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: مرض خطير كان يُسمى الموت الأسود؟", a: "الطاعون" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: البحيرة التي سيشربها يأجوج ومأجوج آخر الزمان؟", a: "طبرية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: ما يتعذر فهمه وفكّ رموزه؟", a: "طلاسم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: الخضرة التي تعلو الماء الراكد؟", a: "طحلب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: الكائن الحي الذي يعيش على غيره؟", a: "طفيلي" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: مدينة إسبانية تاريخية حكمها المسلمون قرونًا؟", a: "طليطلة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الطاء: البثور الجلدية الناشئة عن بعض الأمراض؟", a: "طفح" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الطاء: وزن للأثقال يقدّر بألف كيلوغرام؟", a: "طن" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الطاء: شعب مسلم يضع رجاله لثامًا أزرق طوال الوقت؟", a: "الطوارق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الظاء: الشيء الذي إذا سرت سار معك ولا تسبقه؟", a: "الظل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الظاء: ما توضع فيه الأوراق والمستندات؟", a: "ظرف" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الظاء: الاعتداء والتجبر بغير وجه حق؟", a: "ظلم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الظاء: علم الميتيورولوجيا؟", a: "الظواهر الجوية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الظاء: سلطان مملوكي صدّ الصليبيين والتتار؟", a: "الظاهر بيبرس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: المرأة التي ترضع غير ولدها؟", a: "الظئر" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: الناقة السوداء أو التي تغلب عليها السمرة؟", a: "الظمياء" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: الهودج الذي تركبه المرأة على الجمل؟", a: "الظعينة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الظاء: الجزء الميت النابت بأطراف الأصابع؟", a: "الظفر" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: بالرياضيات: عكس ظل الزاوية؟", a: "ظل التمام" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: يوم العذاب الذي أصاب قوم شعيب؟", a: "الظلّة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الظاء: الظفر المشقوق للبقرة والشاة والظبي؟", a: "ظلف" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الظاء: الغلبة والفوز والقهر؟", a: "الظفر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الظاء: المعين والمساعد؟", a: "ظهير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الظاء: من محافظات سلطنة عُمان؟", a: "ظفار" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: ماذا يسبب نقص فيتامين أ؟", a: "العمى الليلي" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف العين: ذكر الضفدع؟", a: "العلجوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: اللقب الذي أُطلق على القارة الأمريكية بعد اكتشافها؟", a: "العالم الجديد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: مادة صلبة لا طعم لها وتفوح رائحتها إذا أُحرقت؟", a: "العنبر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: الداء المزمن الذي لا علاج له؟", a: "عضال" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: تقسيم البشر على أساس لون البشرة أو العرق؟", a: "العنصرية" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف العين: الاسم القديم لنظام الشرطة عند العرب؟", a: "العسس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: أحد الاختراعات لتصحيح النظر؟", a: "العدسات" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: لقب السيدة مريم عليها السلام؟", a: "العذراء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: قافلة الجمال المحمّلة بالبضائع؟", a: "عير" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف العين: الناقة التي مضى على حملها عشرة أشهر؟", a: "العشراء" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: الحيوان الصنم الذي عبده بنو إسرائيل؟", a: "العجل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: من أحفاد نوح وإليه تُنسب العرب؟", a: "عدنان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: المرأة التي لم تتزوج؟", a: "عذراء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: إذا طال قصُر، فما هو؟", a: "العمر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف العين: مادة قرن الفيل؟", a: "العاج" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف العين: الاسم الحقيقي لأبي جهل؟", a: "عمرو بن هشام" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: أحد أسماء الأسد؟", a: "الغضنفر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: كائن خرافي ضخم اشتهر بألف ليلة وليلة؟", a: "غول" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: الصبي الذي يقارب سن البلوغ؟", a: "الغلام" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: الكرب والحزن؟", a: "الغم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الغين: ذكر السلحفاة؟", a: "غيلم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: واحد من فواسق الدواب؟", a: "الغراب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: من يموت بالبحر أو النهر؟", a: "غريق" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الغين: المرأة التي استغنت بجمالها عن الزينة؟", a: "غانية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: ما به نماء الجسم وقوامه؟", a: "غذاء" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الغين: الليل إذا أقبلت ظلمته؟", a: "غطش" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: بيت السيف؟", a: "غمد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الغين: إفاضة الماء على البدن كله مع النية؟", a: "الغسل" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: الظالم الجائر؟", a: "الغاشم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: تلوّن السماء بعد غروب الشمس؟", a: "الغسق" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: السحاب الأبيض؟", a: "الغمام" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الغين: ما يكون سحيقًا وعميقًا؟", a: "غائر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: أكبر بحيرة بأفريقيا؟", a: "فيكتوريا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: إلى ماذا يؤدي نقص الحديد بالجسم؟", a: "فقر الدم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: الفقر وقلة ذات اليد؟", a: "الفاقة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: حيوان برمائي ضخم تلد إناثه تحت الماء؟", a: "فرس النهر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: أطول عظمة بجسم الإنسان؟", a: "الفخذ" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: مادة مرهم للجسم مشتقة من النفط؟", a: "فازلين" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: لونه أسود ولا يُنتفع به إلا إذا صار أحمر؟", a: "الفحم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: علم الكلام والمنطق والوجود؟", a: "الفلسفة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: ما الشيء الذي إذا وُضع بالثلاجة لا يبرد؟", a: "الفلفل" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الفاء: معالجة طبية قديمة بسحب الدم من الجسم؟", a: "الفصد" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: حضارة بحرية اندثرت واخترعت أبجدية انتشرت بالعالم؟", a: "الفينيقية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: نوع من الورد ذو رائحة نفاذة؟", a: "الفل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: حجر كريم أزرق مائل للخضرة؟", a: "الفيروز" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الفاء: بروز جزء من الأمعاء من فتحة بجدار البطن؟", a: "الفتق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: عاصمة النمسا؟", a: "فيينا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: وحدة قياس القوة الدافعة الكهربائية؟", a: "فولت" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: إحدى ولايات أمريكا المعروفة بشواطئها؟", a: "فلوريدا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: كائنات دقيقة لا تُرى إلا بالمجهر وتسبب أمراضًا كثيرة؟", a: "الفيروسات" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: من علامات الترقيم بالكتابة؟", a: "الفاصلة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الفاء: لغة إيران الرسمية؟", a: "الفارسية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: قائد معركة عين جالوت؟", a: "قطز" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: وحدة وزن تُوزن بها الأحجار الكريمة؟", a: "القيراط" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف القاف: طعام الضيوف؟", a: "القِرى" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: أكبر مدن أفريقيا؟", a: "القاهرة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: الطوب الأحمر المستخدم بالبناء؟", a: "القرميد" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف القاف: الفراسة بتتبع الأثر ومعرفة مسارات الركبان؟", a: "القيافة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: له خمسة أصابع بلا لحم ولا عظم؟", a: "القفاز" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: غرفة القيادة بالسفينة؟", a: "قمرة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: أول منازل الآخرة؟", a: "القبر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: نوع من الطعام طلبه بنو إسرائيل من موسى؟", a: "قثّاء" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: وجه بلا لسان يدل على الزمان؟", a: "القمر" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف القاف: جبل بمكة اشتهر بعهد قريش؟", a: "أبو قبيس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف القاف: شيء كعبه للحيوان ورأسه للإنسان؟", a: "القمح" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: بأي مكان يكون الخريف قبل الصيف والخادم قبل السيد؟", a: "القاموس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: فئة اشتهرت بالقرون الوسطى بالسطو على السفن؟", a: "القراصنة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: من أنواع الطائرات الحربية تُسقط القنابل؟", a: "قاذفة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف القاف: حشرة تصيب فروة الرأس أو شعر الحيوانات؟", a: "القراد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف القاف: مسمى لأدوات الكتابة من ورق وأقلام؟", a: "قرطاسية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: أكبر غدة بجسم الإنسان؟", a: "الكبد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: مؤلف «رأس المال» وداعية الشيوعية؟", a: "كارل ماركس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: ما السؤال الذي تختلف إجابته دائمًا؟", a: "كم الساعة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الكاف: اسم ابن نوح الذي غرق بالطوفان؟", a: "كنعان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: الأدب القديم أو أدب التراث؟", a: "كلاسيكي" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الكاف: زيت طيار أبيض متبلور ذو رائحة نفاذة؟", a: "كافور" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الكاف: عملة جمهورية التشيك؟", a: "كورونا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: حيوان فيه منفعة مباحة ولا يصح بيعه؟", a: "الكلب" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الكاف: علم التسلسل الزمني؟", a: "الكرونولوجي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: المادة الكيميائية لملح الطعام؟", a: "كلوريد الصوديوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: له أربع أرجل ولا يستطيع المشي إلا محمولًا؟", a: "الكرسي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: مقر الرئاسة الروسية؟", a: "الكرملين" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: من المواد البترولية أقل كثافة من السولار؟", a: "الكيروسين" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: رابطة الدول المستقلة عن الاستعمار البريطاني؟", a: "الكومنولث" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: تجويف طبيعي بصخرة أو جبل؟", a: "الكهف" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: المجلس التشريعي بالولايات المتحدة؟", a: "الكونغرس" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الكاف: وكالة الأنباء الكويتية؟", a: "كونا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: الاسم الكيميائي للطباشير؟", a: "كربونات الكالسيوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: الدولة التي عاصمتها أوتاوا؟", a: "كندا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: مقاطعة تتنازع عليها الهند وباكستان؟", a: "كشمير" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الكاف: طائر طويل الرجلين والمنقار له صوت حسن؟", a: "الكروان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: عاصمة أفغانستان؟", a: "كابل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الكاف: السنة الميلادية التي يكون فيها فبراير 29 يومًا؟", a: "كبيسة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: أكبر مدن المملكة المتحدة؟", a: "لندن" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: يكون بالصبح واحد وبالليل ثلاثة؟", a: "حرف اللام" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: الطفل الذي يُوجد بالطريق ولا يُعرف نسبه؟", a: "اللقيط" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: أخف المعادن؟", a: "الليثيوم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف اللام: أين يقع نهر الكلب؟", a: "لبنان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: من المكونات الداخلية للحاسب الشخصي؟", a: "اللوحة الأم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: علم يدرس اللغات وأصلها وعلاقاتها؟", a: "اللسانيات" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: الغلاف الخارجي الصلب لساق الشجرة؟", a: "لحاء" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: مرض سرطان الدم؟", a: "اللوكيميا" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: سيد الطعام؟", a: "اللحم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: صمغ يُفرز من بعض النباتات ويُعلك؟", a: "لبان" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: جماعة تجتمع لتحقيق هدف؟", a: "لجنة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: علبة فيها مادة متفجرة تُستعمل بالحروب؟", a: "لغم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: كتاب كُتب فيه ما كان وما سيكون؟", a: "اللوح المحفوظ" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: من أشهر مدن كاليفورنيا؟", a: "لوس أنجلوس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: الخصم الشديد الخصومة؟", a: "اللدود" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: غبار الطلع الذي ينتشر بالهواء؟", a: "اللقاح" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: أحد أكبر المعاجم العربية لابن منظور؟", a: "لسان العرب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: الإشارة بالعين للاستهزاء؟", a: "اللمز" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف اللام: الأصوات المبهمة المتعالية التي لا تُفهم؟", a: "لغط" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف اللام: يُستخرج من البحر ويُباع بأغلى الأثمان؟", a: "اللؤلؤ" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: من أعلم هذه الأمة بالحلال والحرام؟", a: "معاذ بن جبل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: كل شيء يشغل حيزًا من الكون وله ثقل؟", a: "المادة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: مؤسس الدولة الأموية؟", a: "معاوية بن أبي سفيان" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: فاتح السند؟", a: "محمد بن القاسم" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الميم: أين ظهرت الدولتان الطولونية والإخشيدية؟", a: "مصر" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: إحدى لغات الكتابة قبل الميلاد بالعراق؟", a: "المسمارية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: الساعة الشمسية التي استخدمها العرب لقياس الوقت؟", a: "مزولة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: يدخل بتركيب جميع أعضاء جسم الإنسان؟", a: "الماء" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: حيوان بري منقرض ضخم بقرون طويلة من أجداد الفيل؟", a: "ماموث" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: ما الذي لا يُنتفع به إلا إذا أشعلنا بعينيه؟", a: "الموقد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: مادة مخدرة تُستخدم بالعمليات الجراحية؟", a: "مورفين" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: ما الشيء الذي يحتكم إليه كل أحد وليس من الأحياء؟", a: "الميزان" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: غشاء الجنين الذي يخرج معه عند الولادة؟", a: "المشيمة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: يطلبه الناس ويهربون منه إذا حضر؟", a: "المطر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: القطار الكهربائي تحت الأرض؟", a: "المترو" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: ما الشيء الذي خرج من الماء وإذا أتى عليه الماء هلك؟", a: "الملح" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: آلة حربية استعملها الرومان لقذف الحجارة؟", a: "المنجنيق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: ما الشيء الذي لا يُنتفع به إلا إذا وضعت إصبعك بعينيه؟", a: "المقص" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: آلة إعدام بفصل الرأس استُعملت بالثورة الفرنسية؟", a: "مقصلة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الميم: الأغشية التي تغلف الأمعاء وتربطها بجدار البطن؟", a: "المساريقا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الميم: سباق العدو الطويل الذي مسافته نحو 42 كم؟", a: "ماراثون" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الميم: وصف للرجل المحارب الذي عبّأ نفسه بالسلاح؟", a: "مدجج" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: أول فتنة بني إسرائيل؟", a: "الناقة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: طعام القادم من سفره؟", a: "النقيعة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: المقصود بقوله تعالى: فبُهت الذي كفر؟", a: "النمرود" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: معنى اسم جعفر؟", a: "النهر الصغير" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: عروق الفؤاد والقلب؟", a: "نياط" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: نقط بيض أو سود تقع بالجلد وتخالف لونه؟", a: "نمش" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: ما هي الحطمة؟", a: "النار" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: أكبر دولة إسلامية بأفريقيا سكانًا؟", a: "نيجيريا" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: الاسم المعرّب لجهاز الفاكس؟", a: "ناسوخ" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: الرئيس الأمريكي الذي استقال بفضيحة ووترغيت؟", a: "نيكسون" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: الحركة التي تزعمها هتلر بألمانيا؟", a: "النازية" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: الحشرة التي لها خمس عيون؟", a: "النحلة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف النون: الصور الذي سينفخ فيه إسرافيل؟", a: "الناقور" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: من مكونات السيجارة؟", a: "نيكوتين" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: عصيان المرأة وترفّعها على زوجها؟", a: "نشوز" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف النون: عاصمة كينيا؟", a: "نيروبي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: حفرة تحت الأرض لها مدخل ومخرج تسير بها المركبات؟", a: "النفق" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: إحدى الدول الاسكندنافية؟", a: "النرويج" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف النون: حالة طبيعية تتعطل معها القوى ويرتاح فيها البدن؟", a: "النوم" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الهاء: أول من سعى بين الصفا والمروة؟", a: "هاجر" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: صفة بين المشي والعدو؟", a: "هرولة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: الصياح بالتشجيع والتأييد؟", a: "هتاف" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: أخفى ما يكون من الصوت؟", a: "الهمس" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: المنطق الفارغ الذي لا معنى له؟", a: "هراء" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: صاحب سلوكيات غير متمدنة وطائشة؟", a: "همجي" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: تمليك الإنسان ماله لغيره بالحياة بلا عوض؟", a: "هبة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: ديانة بالهند من معتقداتها تقديس البقر؟", a: "هندوسية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: ما يكون للرجل من مخافة ووقار؟", a: "هيبة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: أرض مساحتها عشرة آلاف متر مربع؟", a: "هكتار" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: وحدة تردد تعادل دورة بالثانية؟", a: "هرتز" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الهاء: الظهيرة وما يوافق نصف النهار؟", a: "هجير" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: ما تعنيه BBC؟", a: "هيئة الإذاعة البريطانية" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: عاصمة كوبا؟", a: "هافانا" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الهاء: يمر وسط الغابات والأشواك دون أن يتمزق؟", a: "الهواء" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الهاء: إحدى القبائل بالعصر الجاهلي اشتهرت بشعرائها؟", a: "هذيل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: الشق بين الجبلين؟", a: "الوادي" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الواو: الميناء الثاني بالجزائر ويقع غرب الساحل؟", a: "وهران" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: كل ما يتصوره الإنسان بداخله وهو غير صحيح؟", a: "الوهم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: اسم الطين الرقيق؟", a: "وحل" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: ما يوجد من محبة بين الطرفين؟", a: "ود" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: العظام التي تكون على الفخذ؟", a: "الورك" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: برنامج مشهور لمعالجة النصوص؟", a: "وورد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: كتلة أنسجة ناتجة عن نمو غير طبيعي للخلايا؟", a: "ورم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: طعام العرس؟", a: "وليمة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الواو: حيوان بري أصغر من النمر ويُسمى سنور الجبل؟", a: "وشق" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الواو: شرب الكلب بالإناء؟", a: "ولغ" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الواو: ما الشيء الذي عليك الاحتفاظ به بعد أن تعطيه لغيرك؟", a: "الوعد" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الواو: علم يدرس انتقال الصفات بين الأجيال؟", a: "الوراثة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الواو: الخوف وانقباض القلب بالخلوة؟", a: "الوحشة" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الواو: وكالة الأنباء السعودية؟", a: "واس" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الواو: من الثدييات التي تطير بالليل؟", a: "الوطواط" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الواو: من الخال الوحيد لأبناء عمتك؟", a: "والدك" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: من الأحجار الكريمة الحمراء؟", a: "ياقوت" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: أين يقع سد مأرب؟", a: "اليمن" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: من وحدات قياس الزمن؟", a: "اليوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: عنصر فلزي مشع يُستخدم بصناعة القنبلة الذرية؟", a: "اليورانيوم" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: نوع من أنواع الزهور الشهيرة؟", a: "الياسمين" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: ما يكون حول العنق من اللباس؟", a: "ياقة" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: المرحلة التي تسبق تحول الحشرة لفراشة؟", a: "يرقة" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الياء: النهر الشديد الجري الكثير الماء؟", a: "اليعبوب" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الياء: ملكة النحل؟", a: "اليعسوب" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: عنصر رمادي يميل للزرقة يُستعمل بتطهير الجروح؟", a: "اليود" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: الدولة التي عاصمتها أثينا؟", a: "اليونان" },
  { cat: "لعبة الحروف", d: 2, q: "بحرف الياء: المنطقة الطرية المتحركة برأس الطفل؟", a: "اليافوخ" },
  { cat: "لعبة الحروف", d: 1, q: "بحرف الياء: منظمة الأمم المتحدة للتربية والعلم والثقافة؟", a: "اليونسكو" },
  { cat: "لعبة الحروف", d: 3, q: "بحرف الياء: المادة الخضراء الملونة للنبات؟", a: "اليخضور" },
  // ---- أفلام (قائمة حسين + AFI) ----
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل أعمال ألماني يحاول حماية عماله اليهود من النازيين أثناء الحرب العالمية الثانية؟", a: "Schindler's List", alt: ["قائمة شندلر", "شندلر"], info: "صُوّر بالأبيض والأسود عدا الفتاة ذات المعطف الأحمر — رمز لبراءة ضاعت." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت فرقة جنود بمهمة لإنقاذ جندي واحد خلف خطوط العدو بعد مقتل إخوته؟", a: "Saving Private Ryan", alt: ["إنقاذ الجندي رايان"], info: "مشهد إنزال نورماندي أول 27 دقيقة صُوّر بواقعية جعلت محاربين قدامى يغادرون الصالة." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يعلق وحيدًا بجزيرة بعد تحطم طائرته ويصادق كرة طائرة؟", a: "Cast Away", alt: ["كاست اواي", "المنبوذ"], info: "توقف التصوير سنة كاملة ليخسر توم هانكس 25 كيلو ويطوّل شعره." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان ساحران يتنافسان حتى يتحول التنافس لهوس وانتقام مدمّر؟", a: "The Prestige", alt: ["البريستيج", "الهيبة"], info: "الفيلم نفسه مبني على بنية الخدعة السحرية الثلاثية اللي يشرحها بأوله." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كانت مجموعة تحاول اكتشاف هوية مجرم غامض يُعرف باسم Keyser Söze؟", a: "The Usual Suspects", alt: ["المشتبهون المعتادون"], info: "النهاية من أشهر الانقلابات بالسينما، والممثل نفسه ما عرفها إلا بالقراءة الأخيرة." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان مجرم محترف ومحقق يطاردان بعضهما بلوس أنجلوس ويلتقيان بمشهد مقهى شهير؟", a: "Heat", alt: ["هيت"], info: "أول مرة يظهر دي نيرو وباتشينو بمشهد واحد وجهًا لوجه." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يستخرج النفط من أرضه حتى يتحول لأغنى رجال المنطقة وأكثرهم وحشة؟", a: "There Will Be Blood", alt: ["سيكون هناك دماء"], info: "دانيال داي لويس ظل بالشخصية طوال التصوير حتى خارج الكاميرا." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان أب وابنه يحاولان النجاة بعالم بعد كارثة انتشر فيه الجوع والعنف؟", a: "The Road", alt: ["الطريق"], info: "عن رواية كورماك مكارثي، ومصوّر بمواقع حقيقية دمّرها إعصار كاترينا." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يبني إمبراطورية إجرامية بشيكاغو ويطارده فريق صغير من رجال القانون؟", a: "The Untouchables", alt: ["المنبوذون"], info: "عن مطاردة آل كابوني، وسقط أخيرًا بتهمة التهرب الضريبي لا القتل." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل ينتقم من عصابة قتلت عائلته بغرب أمريكي وعلى إيقاع هارمونيكا؟", a: "Once Upon a Time in the West", alt: ["حدث ذات مرة في الغرب"], info: "موسيقى موريكوني كُتبت قبل التصوير وشُغّلت بالموقع ليمثّل الممثلون عليها." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يعود للماضي بسيارة رياضية ويقابل والديه وهما مراهقان؟", a: "Back to the Future", alt: ["العودة للمستقبل"], info: "سيارة الديلوريان اختيرت لأن أبوابها الجناحية تبدو كصحن طائر للفلاحين." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يواجه فوضويًا يريد إثبات أن أي مدينة تنهار لو أزلت قوانينها؟", a: "The Dark Knight", alt: ["فارس الظلام"], info: "هيث ليدجر عزل نفسه شهرًا بغرفة فندق ليبني الشخصية، وفاز بأوسكار بعد وفاته." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان سجين عملاق يمتلك قدرة على الشفاء ويُتهم بجريمة لم يرتكبها؟", a: "The Green Mile", alt: ["الميل الأخير"], info: "من نفس كاتب شاوشانك — ستيفن كينغ، ونفس المخرج فرانك دارابونت." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يقضي سنوات طويلة في السجن رغم أنه بريء، ثم يخطط لهروب سري؟", a: "The Shawshank Redemption", alt: ["شاوشانك", "الخلاص من شاوشانك"], info: "فشل بشباك التذاكر ثم صار الأعلى تقييمًا على IMDb لعقود." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان ابن عائلة إجرامية يحاول الابتعاد عن أعمال عائلته، لكنه ينتهي به الأمر بقيادة العائلة؟", a: "The Godfather", alt: ["العراب", "الجودفاذر"], info: "مايكل كان بطل حرب يرفض الإجرام، ورحلته للظلام هي قلب الفيلم." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يدخل أحلام الآخرين لتنفيذ عملية معقدة لزرع فكرة في عقل شخص؟", a: "Inception", alt: ["إنسبشن", "انسبشن"], info: "نولان كتب السيناريو على مدى عشر سنوات." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يعيش داخل عالم افتراضي دون أن يعرف أن حياته كلها مجرد محاكاة؟", a: "The Matrix", alt: ["ماتريكس", "الماتريكس"], info: "مشهد تفادي الرصاص ابتكر تقنية «bullet time» وقُلّد بعشرات الأفلام." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان محققان يطاردان قاتلًا متسلسلًا يبني جرائمه حول الخطايا السبع؟", a: "Se7en", alt: ["سيفن", "سبعة"], info: "الاستوديو أراد نهاية أخف، لكن بيت وبراد قاتلا لإبقاء النهاية الأصلية." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يدخل عالم المافيا منذ شبابه ويبدأ بالصعود داخل العصابة؟", a: "GoodFellas", alt: ["قودفيلاز", "غودفيلاز"], info: "مبني على قصة هنري هيل الحقيقية، وكان مستشارًا للفيلم." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يعمل سائق سيارة أجرة ليلًا ويصبح مهووسًا بتنظيف المدينة من الجريمة؟", a: "Taxi Driver", alt: ["تاكسي درايفر"], info: "جملة «هل تكلمني؟» كانت ارتجالًا من دي نيرو أمام المرآة." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان سمسار أسهم يبني ثروة هائلة من الاحتيال والمخدرات والحياة المترفة؟", a: "The Wolf of Wall Street", alt: ["وولف اوف وول ستريت", "ذئب وول ستريت"], info: "مبني على مذكرات جوردن بلفورت الحقيقية اللي كتبها بالسجن." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يحاول الانتقام من النازيين عبر خطة لتدمير كبار الضباط داخل سينما؟", a: "Inglourious Basterds", alt: ["انقلوريس باستردز"], info: "تارانتينو أعاد كتابة التاريخ عمدًا — نهاية مختلفة تمامًا عن الواقع." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل عبدًا يتم تحريره على يد صائد جوائز، ثم يبدأ رحلة لإنقاذ زوجته؟", a: "Django Unchained", alt: ["دجانغو", "جانغو"], info: "اسم الزوجة Broomhilda مقتبس من أسطورة ألمانية عن أميرة محبوسة." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان ملاكم مغمور يحصل على فرصة لمواجهة بطل العالم؟", a: "Rocky", alt: ["روكي"], info: "ستالون كتبه بثلاثة أيام ورفض بيعه إلا بشرط أن يمثّله بنفسه." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يجد نفسه في مستشفى غامض أثناء التحقيق في اختفاء مريضة، ثم يكتشف أن القضية مرتبطة به شخصيًا؟", a: "Shutter Island", alt: ["شاتر ايلند", "جزيرة الرعب"], info: "الفيلم مليء بتلميحات مبكرة تنكشف كلها بمشاهدة ثانية." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يكتشف أن زوجته ماتت، لكنه يعاني من فقدان الذاكرة ويستخدم الصور والوشوم لتتبع الحقيقة؟", a: "Memento", alt: ["ميمنتو"], info: "يُروى بترتيب معكوس لتحسّ بالتشوّش نفسه اللي يعيشه البطل." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يصبح مصارعًا بعد أن قُتلت عائلته وبيع عبدًا؟", a: "Gladiator", alt: ["غلادييتر", "المصارع"], info: "أوليفر ريد توفي أثناء التصوير، فأكملوا مشاهده بالحاسوب." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يحاول إثبات براءة متهم بالقتل بينما باقي هيئة المحلفين مقتنعون بإدانته؟", a: "12 Angry Men", alt: ["12 رجلًا غاضبًا", "اثنا عشر رجلا غاضبا"], info: "تسعون بالمئة من الفيلم بغرفة واحدة، ومع ذلك يُعد من أعظم الأفلام." },
  { cat: "أفلام ومسلسلات", d: 1, q: "من أي فيلم كان رجل يكتشف أن حياته كلها برنامج تلفزيوني يراقبه الملايين؟", a: "The Truman Show", alt: ["ترومان شو"], info: "سبق عصر تلفزيون الواقع، وصار مصطلحًا نفسيًا حقيقيًا باسمه." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يعاني من الأرق فيدخل عالم القتال السري وينشئ ناديًا خارج قوانين المجتمع؟", a: "Fight Club", alt: ["فايت كلوب", "نادي القتال"], info: "فشل بالسينما ثم صار من أشهر أفلام الكالت عبر أقراص الـDVD." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان شرطي متخفٍ داخل عصابة، بينما رجل من العصابة متخفٍ داخل الشرطة؟", a: "The Departed", alt: ["ذا ديبارتد"], info: "مقتبس عن فيلم هونغ كونغي اسمه Infernal Affairs." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يطارده قاتل بعد أن وجد حقيبة مليئة بالمال في موقع جريمة؟", a: "No Country for Old Men", alt: ["نو كنتري"], info: "القاتل شيغور بلا موسيقى تصويرية طوال الفيلم — يزيد الرعب." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان قاتل يستخدم عملة معدنية ليقرر مصير ضحاياه؟", a: "No Country for Old Men", alt: ["نو كنتري"], info: "تسريحة شعره صُمّمت من صورة فوتوغرافية لرجل من 1979." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل أعمال ثري يموت بالبداية، وتبدأ الصحافة بمحاولة اكتشاف معنى آخر كلمة قالها؟", a: "Citizen Kane", alt: ["المواطن كين", "سيتزن كين"], info: "الكلمة «Rosebud»، ويُعد الفيلم أكثر عمل تأثيرًا بتاريخ السينما تقنيًا." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يعيش بمدينة مغربية خلال الحرب العالمية الثانية، ويلتقي حبيبته السابقة؟", a: "Casablanca", alt: ["كازابلانكا", "الدار البيضاء"], info: "كُتب السيناريو أثناء التصوير، والممثلون لم يعرفوا النهاية حتى آخر يوم." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت امرأة تحاول الحفاظ على منزلها وحياتها وسط الحرب الأهلية الأمريكية؟", a: "Gone with the Wind", alt: ["ذهب مع الريح"], info: "لو حسبنا التضخم فهو أعلى فيلم إيرادًا بالتاريخ حتى اليوم." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان ضابط بريطاني يقود مجموعة من العرب خلال الثورة العربية ضد العثمانيين؟", a: "Lawrence of Arabia", alt: ["لورنس العرب"], info: "صُوّر أغلبه بصحاري الأردن وإسبانيا، ومدته أربع ساعات تقريبًا." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت فتاة تنتقل لعالم غريب بعد أن حملها إعصار بعيدًا عن منزلها؟", a: "The Wizard of Oz", alt: ["ساحر أوز"], info: "من أوائل الأفلام اللي استخدمت الألوان بشكل درامي — الانتقال من الأبيض والأسود." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان شاب حديث التخرج يدخل بعلاقة مع امرأة أكبر منه ثم يقع بحب ابنتها؟", a: "The Graduate", alt: ["الخريج"], info: "مشهد النهاية بالحافلة صُوّر بارتباك حقيقي — والمخرج أبقاه كما هو." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان عامل موانئ يشهد جريمة قتل ويصارع بين السكوت والإبلاغ؟", a: "On the Waterfront", alt: ["على الواجهة البحرية"], info: "جملة «كان بإمكاني أن أكون منافسًا» من أشهر الجمل بتاريخ السينما." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل وامرأة يحاولان النجاة على متن قارب صغير أثناء الحرب العالمية الأولى؟", a: "The African Queen", alt: ["الملكة الأفريقية"], info: "صُوّر بأدغال الكونغو، ومرض الطاقم كله عدا بوغارت لأنه شرب الويسكي بدل الماء." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كانت ممثلة طموحة تتقرب من نجمة مسرحية مشهورة لتصعد على حسابها؟", a: "All About Eve", alt: ["كل شي عن إيف"], info: "حاصل على 14 ترشيح أوسكار — رقم لم يُكسر إلا مرتين." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت امرأة تسرق مالًا وتهرب فتنزل بنُزل معزول يديره شاب غريب مع أمه؟", a: "Psycho", alt: ["سايكو"], info: "هيتشكوك اشترى كل نسخ الرواية ليمنع تسريب النهاية." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان محقق خاص يحقق بقضية خيانة ثم يكتشف مؤامرة أكبر مرتبطة بالمياه والسياسة؟", a: "Chinatown", alt: ["الحي الصيني"], info: "مبني على فضيحة مياه حقيقية بلوس أنجلوس مطلع القرن العشرين." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يدخل مستشفى للأمراض النفسية ويقاوم النظام القاسي المسيطر على المرضى؟", a: "One Flew Over the Cuckoo's Nest", alt: ["طار فوق عش الوقواق"], info: "ثالث فيلم بالتاريخ يفوز بالأوسكارات الخمسة الكبرى." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كانت عائلة فقيرة تهاجر لكاليفورنيا هربًا من الجفاف والفقر بالثلاثينات؟", a: "The Grapes of Wrath", alt: ["عناقيد الغضب"], info: "عن رواية شتاينبك، ووثّق مأساة «وعاء الغبار» اللي شرّدت مئات الآلاف." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم يبدأ باكتشاف جسم غامض بالفضاء ثم تقفز الأحداث لمستقبل بعيد؟", a: "2001: A Space Odyssey", alt: ["اوديسا الفضاء", "2001"], info: "مؤثراته البصرية سبقت هبوط القمر بسنة، وما زالت تُدرَّس اليوم." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان محقق خاص يحاول العثور على تمثال ثمين سرقه عدد من المجرمين؟", a: "The Maltese Falcon", alt: ["الصقر المالطي"], info: "يُعد أول فيلم نوار حقيقي وأسس ملامح النوع كله." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان ملاكم محترف يعاني من الغيرة والغضب ويدمر علاقاته بشكوكه؟", a: "Raging Bull", alt: ["الثور الهائج"], info: "دي نيرو زاد 27 كيلو حقيقية لتصوير مشاهد ما بعد الاعتزال." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان طفل يصادق كائنًا فضائيًا ضائعًا ويحاول مساعدته للعودة لبيته؟", a: "E.T. the Extra-Terrestrial", alt: ["اي تي", "E.T."], info: "سبيلبرغ صوّر بترتيب زمني ليكون تفاعل الأطفال حقيقيًا." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان جنرال أمريكي مهووس بالحرب يتخذ قرارًا قد يشعل حربًا نووية؟", a: "Dr. Strangelove", alt: ["دكتور سترينجلوف"], info: "كوميديا سوداء عن الحرب الباردة، وبيتر سيلرز لعب ثلاثة أدوار." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل وامرأة يبدآن سلسلة سطو ويصبحان مطلوبين بأنحاء البلاد؟", a: "Bonnie and Clyde", alt: ["بوني وكلايد"], info: "مشهد النهاية غيّر قواعد عرض العنف بالسينما الأمريكية." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان ضابط أمريكي بفيتنام يُرسل بمهمة للعثور على ضابط أصبح يتصرف بجنون؟", a: "Apocalypse Now", alt: ["نهاية العالم الآن"], info: "التصوير استمر 16 شهرًا بالفلبين وأصيب البطل بأزمة قلبية أثناءه." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان سياسي شاب يصل لواشنطن ويواجه الفساد رغم معارضة أصحاب النفوذ؟", a: "Mr. Smith Goes to Washington", alt: ["السيد سميث"], info: "غضب منه الكونغرس وقتها واعتبره تشويهًا للسياسة الأمريكية." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجلان يبحثان عن الذهب بالمكسيك، لكن الطمع يبدأ بتدمير علاقتهما؟", a: "The Treasure of the Sierra Madre", alt: ["كنز سييرا مادري"], info: "مثال كلاسيكي على كيف يفسد الجشع أقوى الصداقات." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان كوميديان نيويوركي يستعيد ذكريات علاقته الفاشلة مع مغنية؟", a: "Annie Hall", alt: ["آني هول"], info: "هزم Star Wars بأوسكار أفضل فيلم سنة 1978." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل يكتشف أن أخاه خانه من أجل السلطة داخل عائلته الإجرامية؟", a: "The Godfather Part II", alt: ["العراب الجزء الثاني"], info: "أول جزء ثانٍ يفوز بأوسكار أفضل فيلم بالتاريخ." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل ينتظر وصول قطار وهو يعرف أن خارجين عن القانون يريدون قتله؟", a: "High Noon", alt: ["الظهيرة"], info: "زمن الفيلم يساوي زمن الأحداث تقريبًا — 85 دقيقة بالضبط." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان محامٍ يدافع عن رجل أسود متهم بجريمة لم يرتكبها بمجتمع عنصري؟", a: "To Kill a Mockingbird", alt: ["أن تقتل طائرًا بريئًا"], info: "شخصية أتيكوس فينش اختيرت أعظم بطل سينمائي بتاريخ AFI." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل وامرأة يهربان معًا بعد لقاء بالطريق ويحاولان إخفاء هويتيهما؟", a: "It Happened One Night", alt: ["حدث ذات ليلة"], info: "أول فيلم يفوز بالأوسكارات الخمسة الكبرى سنة 1934." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجلان يعيشان بنيويورك ويعملان بمهنة خطرة قبل أن يحاولا تحسين حياتهما؟", a: "Midnight Cowboy", alt: ["راعي بقر منتصف الليل"], info: "الوحيد بتصنيف X الذي فاز بأوسكار أفضل فيلم." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان جنود أمريكيون بقاعدة عسكرية قبل هجوم مفاجئ يغيّر حياتهم؟", a: "From Here to Eternity", alt: ["من هنا إلى الأبد"], info: "الهجوم هو بيرل هاربر، ومشهد القبلة على الشاطئ من أشهر الصور بالسينما." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان موسيقار مخضرم تأكله الغيرة من عبقري شاب صاعد؟", a: "Amadeus", alt: ["أماديوس"], info: "عن موتسارت وساليري — والقصة مبالغ فيها تاريخيًا لكنها درامية بامتياز." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان جندي ألماني يحاول النجاة من أهوال الحرب العالمية الأولى؟", a: "All Quiet on the Western Front", alt: ["كل شيء هادئ على الجبهة الغربية"], info: "مُنع بألمانيا النازية لأنه يصوّر الحرب بلا بطولة." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت عائلة تهرب من النمسا مع صعود النازيين وتغني بالطريق؟", a: "The Sound of Music", alt: ["صوت الموسيقى"], info: "مبني على قصة عائلة فون تراب الحقيقية." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان محقق يطارد عصابة مخدرات بشوارع نيويورك بأساليب عنيفة؟", a: "The French Connection", alt: ["الاتصال الفرنسي"], info: "مطاردة السيارة صُوّرت بشوارع حقيقية بلا تصاريح — خطر فعلي على المارة." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل بسيط يمر بأحداث تاريخية أمريكية ضخمة دون أن يدرك أهميتها؟", a: "Forrest Gump", alt: ["فورست غامب"], info: "دُمجت لقطاته مع أرشيف حقيقي لرؤساء أمريكا بتقنية كانت ثورية." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يخوض سباق عربات ملحميًا بروما القديمة؟", a: "Ben-Hur", alt: ["بن هور"], info: "سباق العربات استغرق ثلاثة أشهر تصوير، وفاز الفيلم بـ11 أوسكار." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل فقير يحاول النجاة من الجوع خلال عصر البحث عن الذهب؟", a: "The Gold Rush", alt: ["حمى الذهب"], info: "مشهد أكل الحذاء صُنع من عرق السوس، وشابلن اعتبره أفضل أعماله." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجلان يركبان دراجتين ناريتين عبر أمريكا بحثًا عن الحرية؟", a: "Easy Rider", alt: ["إيزي رايدر"], info: "صُوّر بميزانية زهيدة وحقق أرباحًا هائلة، وأطلق موجة هوليوود الجديدة." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان جنرال أمريكي بالحرب العالمية الثانية يشتهر بصرامته المثيرة للجدل؟", a: "Patton", alt: ["باتون"], info: "سكوت رفض أوسكار أفضل ممثل احتجاجًا على فكرة التنافس بين الممثلين." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يحاول بناء حياة جديدة بعد فيتنام لكنه يعاني من آثارها؟", a: "The Deer Hunter", alt: ["صائد الغزلان"], info: "مشاهد الروليت الروسي مثيرة للجدل تاريخيًا لكنها من أقوى مشاهد السينما." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كانت مجموعة جنود أمريكيين تقاتل بفيتنام وتواجه آثار الحرب النفسية؟", a: "Platoon", alt: ["الفصيلة"], info: "أوليفر ستون كتبه من تجربته الشخصية كجندي بفيتنام." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كانت جرائم غريبة تحدث ببلدة صغيرة ويبدأ التحقيق فيها بشرطية حامل؟", a: "Fargo", alt: ["فارغو"], info: "الادعاء بأنه مبني على قصة حقيقية كان خدعة من الأخوين كوين." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل فقير يقع بحب فتاة من طبقة أعلى منه ويقوده ذلك للكارثة؟", a: "A Place in the Sun", alt: ["مكان تحت الشمس"], info: "عن رواية «مأساة أمريكية» المستوحاة من جريمة حقيقية." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان موظف يعير شقته لرؤسائه ثم يقع بحب فتاة المصعد؟", a: "The Apartment", alt: ["الشقة"], info: "كوميديا سوداء عن الوحدة، وفاز بأوسكار أفضل فيلم 1961." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجلان يتقابلان ويبدآن سلسلة أحداث مترابطة بالجريمة والسرقة تُروى بترتيب غير خطي؟", a: "Pulp Fiction", alt: ["بالب فيكشن"], info: "سرده المتقطع غيّر طريقة كتابة السيناريوهات بالتسعينات." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يبحث لسنوات عن فتاة اختطفها خارجون عن القانون بالغرب الأمريكي؟", a: "The Searchers", alt: ["الباحثون"], info: "يُعتبر أعظم فيلم وسترن، وأثّر على سكورسيزي ولوكاس مباشرة." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يحاول تغيير طريقة كلام امرأة وسلوكها لتبدو من الطبقة الراقية؟", a: "My Fair Lady", alt: ["سيدتي الجميلة"], info: "عن مسرحية «بيغماليون» لبرنارد شو." },
  { cat: "أفلام ومسلسلات", d: 2, q: "من أي فيلم كان رجل مكسور الساق يراقب جيرانه من نافذته ويشتبه بجريمة قتل؟", a: "Rear Window", alt: ["النافذة الخلفية"], info: "كل الفيلم من زاوية شقة واحدة — تحدٍ إخراجي مقصود من هيتشكوك." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان رجل يطارد امرأة تشبه شخصًا من ماضيه ويتحول هوسه لشيء خطير؟", a: "Vertigo", alt: ["فيرتيغو", "الدوار"], info: "اختارته مجلة Sight & Sound أعظم فيلم بالتاريخ سنة 2012." },
  { cat: "أفلام ومسلسلات", d: 3, q: "من أي فيلم كان لصان يسرقان البنوك ويهربان عبر الغرب الأمريكي والسلطات تطاردهما؟", a: "Butch Cassidy and the Sundance Kid", alt: ["بوتش كاسيدي"], info: "مبني على شخصيتين حقيقيتين هربتا فعلًا لبوليفيا." },
  // ---- أسئلة سهلة/متوسطة للوحة (كلها بشرح) ----
  { cat: "وش الغرض؟", d: 1, q: "أداة بالمطبخ تقطع فيها الخبز واللحم؟", a: "السكين", alt: ["سكين"], info: "أقدم أداة صنعها الإنسان — بدأت حجرية قبل 2.5 مليون سنة." },
  { cat: "وش الغرض؟", d: 1, q: "شيء تفتحه فوق راسك يحميك من المطر؟", a: "المظلة", alt: ["الشمسية","الچتر"], info: "اخترعها الصينيون أصلًا للحماية من الشمس لا المطر." },
  { cat: "الرابط المشترك", d: 1, q: "القطة والكلب والحصان — وش يجمعهم؟", a: "حيوانات أليفة", alt: ["حيوانات","مستأنسة"], info: "الكلب أول حيوان استأنسه الإنسان قبل نحو 15 ألف سنة." },
  { cat: "الرابط المشترك", d: 1, q: "الرياض وجدة والدمام — وش يجمعهم؟", a: "مدن سعودية", alt: ["السعودية","مدن بالسعودية"], info: "الرياض بنجد وجدة بالحجاز والدمام بالشرقية — تمثل ثلاث مناطق رئيسية." },
  { cat: "بوسات السولز", d: 2, q: "من بلودبورن — أول بوس رئيسي تواجهه بساحة يارنام المركزية؟", a: "Cleric Beast", alt: ["كليريك بيست"], info: "وحش ضخم متحول من كاهن، ونقطة ضعفه رأسه وذراعه الطويلة." },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — البوس الفارس اللي على حصان ويحرس بداية العالم المفتوح؟", a: "Tree Sentinel", alt: ["حارس الشجرة"], info: "أول امتحان باللعبة — يقتل المبتدئين ويعلّمهم إن الهروب خيار." },
  { cat: "لور السولز", d: 2, q: "من إلدن رينق — وش اسم العاصمة الذهبية اللي تحت الشجرة؟", a: "Leyndell", alt: ["ليندل"], info: "تحتها مدينة جوفية كاملة فيها بقايا من رفضتهم النعمة." },
  { cat: "لور السولز", d: 2, q: "من بلودبورن — وش اسم المدينة اللي تدور فيها الأحداث؟", a: "Yharnam", alt: ["يارنام"], info: "مدينة فيكتورية أصابها وباء الدم فتحوّل أهلها لوحوش ليلة الصيد." },
  { cat: "أزياء الشخصيات", d: 1, q: "بدلة سوداء كاملة وأذنان مدببتان وعباءة ورمز خفاش على الصدر؟", a: "Batman", alt: ["باتمان"], info: "الوحيد بين أبطال DC الكبار بلا قوى خارقة — يعتمد على المال والتدريب." },
  { cat: "منطق وألغاز", d: 1, q: "شيء كل ما أخذت منه كبر — وش هو؟", a: "الحفرة", alt: ["حفرة"], info: "لغز كلاسيكي يعتمد على إن الأخذ هنا حفر مو نقص." },
  { cat: "منطق وألغاز", d: 1, q: "له أسنان كثيرة وما يعض أحد — وش هو؟", a: "المشط", alt: ["مشط"], info: "الأسنان هنا بمعناها الشكلي مو البيولوجي." },
  { cat: "منطق وألغاز", d: 1, q: "كم شهرًا بالسنة فيه 28 يومًا؟", a: "كلها", alt: ["12", "كل الشهور", "الكل"], info: "كل شهر فيه 28 يوم على الأقل — السؤال ما قال «28 بالضبط»." },
  { cat: "منطق وألغاز", d: 1, q: "كيلو حديد وكيلو قطن — أيهما أثقل؟", a: "متساويان", alt: ["نفس الوزن", "متساوين"], info: "الكتلة وحدة، بس القطن حجمه أكبر فيخدع العين." },
  { cat: "أمثال ومصطلحات", d: 1, q: "كمّل: الوقت من…؟", a: "ذهب", info: "مثل يقارن الوقت بأثمن معدن للدلالة على قيمته." },
  { cat: "أمثال ومصطلحات", d: 1, q: "كمّل: الجار قبل…؟", a: "الدار", info: "يعني اختر جيرانك قبل ما تختار البيت نفسه." },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى: يضرب أخماسًا لأسداس؟", a: "يحتار ويتردد", alt: ["الحيرة", "محتار"], info: "أصلها من حساب الإبل قديمًا وطول التفكير بالورد." },
  { cat: "طعام ومطبخ", d: 1, q: "وش المشروب اللي يُصنع من أوراق نبتة الكاميليا؟", a: "الشاي", alt: ["شاي"], info: "كل أنواع الشاي — أخضر وأسود وأولونق — من نفس النبتة، الفرق بالتخمير." },
  { cat: "طعام ومطبخ", d: 1, q: "وش الطعم اللي يميّز الليمون؟", a: "حامض", alt: ["الحموضة", "حمضي"], info: "سببه حمض الستريك." },
  { cat: "طعام ومطبخ", d: 1, q: "وش الجزء من النخلة اللي نأكله؟", a: "التمر", alt: ["الثمرة", "البلح"], info: "وفيه الجُمّار (قلب النخلة) يؤكل كمان لكنه يقتل النخلة." },
  { cat: "حيوانات", d: 1, q: "وش أكبر حيوان على وجه الأرض؟", a: "الحوت الأزرق", alt: ["حوت ازرق"], info: "لسانه لوحده يوزن مثل فيل كامل." },
  { cat: "حيوانات", d: 1, q: "وش الحيوان اللي يغيّر لونه ليختبئ؟", a: "الحرباء", alt: ["حرباء"], info: "تغيّر لونها للتمويه وللتواصل وتنظيم حرارتها كمان." },
  { cat: "حيوانات", d: 2, q: "كم رجل للعنكبوت؟", a: "8", alt: ["ثمانية"], info: "ولهذا هو مو حشرة — الحشرات لها ست أرجل." },
  { cat: "فضاء", d: 1, q: "وش الكوكب اللي نعيش عليه؟", a: "الأرض", alt: ["Earth"], info: "الكوكب الوحيد المعروف بماء سائل على سطحه." },
  { cat: "فضاء", d: 1, q: "وش القمر بالنسبة للأرض: كوكب ولا تابع؟", a: "تابع", alt: ["قمر", "تابع طبيعي"], info: "يدور حول الأرض مو حول الشمس مباشرة، فهو تابع." },
  { cat: "فضاء", d: 1, q: "كم يستغرق دوران الأرض حول نفسها؟", a: "24 ساعة", alt: ["يوم", "24"], info: "بالضبط 23 ساعة و56 دقيقة — والفرق يتراكم فنضيف يومًا كل 4 سنين." },
  { cat: "جسم الإنسان", d: 1, q: "كم عين للإنسان الطبيعي؟", a: "2", alt: ["اثنتين", "عينين"], info: "وجودهما جنبًا لجنب يعطيك إدراك العمق." },
  { cat: "جسم الإنسان", d: 1, q: "وش العضو المسؤول عن التفكير؟", a: "الدماغ", alt: ["المخ"], info: "يستهلك نحو 20% من طاقة جسمك رغم إنه 2% من وزنك." },
  { cat: "جسم الإنسان", d: 1, q: "وش السائل الأحمر اللي يجري بعروقك؟", a: "الدم", alt: ["دم"], info: "لونه أحمر بسبب الحديد بالهيموغلوبين." },
  { cat: "السعودية", d: 1, q: "وش عاصمة السعودية؟", a: "الرياض", alt: ["Riyadh"], info: "صارت العاصمة بعد فتحها 1902 على يد الملك عبدالعزيز." },
  { cat: "السعودية", d: 1, q: "وين تقع الكعبة؟", a: "مكة", alt: ["مكة المكرمة"], info: "وتحديدًا داخل المسجد الحرام." },
  { cat: "السعودية", d: 1, q: "وش عملة السعودية؟", a: "الريال", alt: ["ريال"], info: "مربوط بالدولار منذ 1986 بسعر ثابت 3.75." },
  { cat: "سيارات", d: 1, q: "كم عجل بالسيارة العادية؟", a: "4", alt: ["أربعة"], info: "والاحتياطي خامس بس مو على الأرض." },
  { cat: "سيارات", d: 1, q: "وش لون إشارة المرور اللي تعني قف؟", a: "أحمر", alt: ["الأحمر"], info: "اختير الأحمر لأنه أطول موجة ضوئية مرئية فيُشاف من بعيد." },
  { cat: "سيارات", d: 1, q: "وش السائل اللي تعبّيه بالسيارة عشان تمشي؟", a: "البنزين", alt: ["الوقود", "بنزين"], info: "والديزل بديل يشتغل بالضغط بدل الشرارة." },
  { cat: "اختراعات", d: 1, q: "مين اخترع المصباح الكهربائي التجاري؟", a: "إديسون", alt: ["Edison"], info: "ما كان أول من فكّر فيه، لكنه أول من جعله عمليًا وطويل العمر." },
  { cat: "اختراعات", d: 1, q: "وش الاختراع اللي نستخدمه عشان نشوف الأشياء البعيدة بالسماء؟", a: "التلسكوب", alt: ["المرقاب"], info: "غاليليو أول من وجّهه للسماء ورصد أقمار المشتري." },
  { cat: "اختراعات", d: 1, q: "مين اخترع الطائرة؟", a: "الأخوان رايت", alt: ["رايت", "Wright"], info: "أول رحلة 1903 استمرت 12 ثانية فقط." },
  { cat: "اختراعات", d: 1, q: "وش الاختراع اللي حفظ الأكل بالتبريد؟", a: "الثلاجة", alt: ["البراد"], info: "تسحب الحرارة من الداخل وترميها خارجًا — ما تصنع برودة." },
  { cat: "أعلام", d: 1, q: "وش لون علم السعودية الأساسي؟", a: "أخضر", alt: ["الأخضر"], info: "واللون الأخضر مرتبط تاريخيًا بالإسلام." },
  { cat: "أعلام", d: 1, q: "كم لون بعلم فرنسا؟", a: "3", alt: ["ثلاثة"], info: "أزرق وأبيض وأحمر — من رموز الثورة الفرنسية." },
  { cat: "شكل ورسم", d: 1, q: "كم ضلع للمثلث؟", a: "3", alt: ["ثلاثة"], info: "وأصغر عدد أضلاع يمكن أن يكوّن شكلًا مغلقًا." },
  { cat: "شكل ورسم", d: 1, q: "كم زاوية قائمة بالمربع؟", a: "4", alt: ["أربعة"], info: "كل زاوية 90 درجة، والمجموع 360." },
  { cat: "شكل ورسم", d: 1, q: "شكل ما له أضلاع ولا زوايا — وش هو؟", a: "الدائرة", alt: ["دائرة"], info: "تُعرّف بأنها كل النقاط على بعد ثابت من مركز." },
  { cat: "وين المكان؟", d: 1, q: "مبنى مثلث الشكل ضخم بمصر بناه الفراعنة — وين؟", a: "الأهرامات", alt: ["الجيزة", "مصر"], info: "هرم خوفو ظل أطول بناء بشري لأكثر من 3800 سنة." },
  { cat: "وين المكان؟", d: 1, q: "برج حديدي بباريس صار رمز فرنسا — وين؟", a: "برج إيفل", alt: ["ايفل", "باريس"], info: "بُني كمدخل مؤقت لمعرض 1889 وكانوا ينوون هدمه." },
  { cat: "وين المكان؟", d: 1, q: "بلد على شكل حذاء طويل بالبحر المتوسط — وين؟", a: "إيطاليا", alt: ["Italy"], info: "شكل «الجزمة» صار أشهر خريطة يعرفها الناس." },
  { cat: "وين المكان؟", d: 1, q: "أكبر محيط بالعالم يفصل آسيا عن أمريكا — وين؟", a: "المحيط الهادئ", alt: ["الهادي", "Pacific"], info: "مساحته أكبر من كل اليابسة مجتمعة." },
  { cat: "مين قالها؟", d: 1, q: "مين صاحب جملة «أنا أفكر إذن أنا موجود»؟", a: "ديكارت", alt: ["Descartes"], info: "بناها على أن الشك نفسه دليل على وجود مفكّر." },
  { cat: "مين قالها؟", d: 1, q: "مين قال «العلم في الصغر كالنقش على الحجر»؟", a: "الحسن البصري", alt: ["مثل عربي", "الحسن"], info: "تُنسب للحسن البصري وشاعت كمثل." },
  { cat: "مين قالها؟", d: 1, q: "مين قال «كن أنت التغيير»؟", a: "غاندي", alt: ["Gandhi"], info: "من أشهر عباراته عن الإصلاح الذاتي قبل إصلاح العالم." },
  { cat: "وش الغرض؟", d: 1, q: "شيء تلبسه بعينك عشان تشوف أوضح؟", a: "النظارة", alt: ["نظارات"], info: "عدساتها تصحح انكسار الضوء داخل عينك." },
  { cat: "وش الغرض؟", d: 1, q: "أداة تقيس بها الوقت وتلبسها بيدك؟", a: "الساعة", alt: ["ساعة"], info: "أول ساعة يد كانت تُعتبر إكسسوارًا نسائيًا قبل الحرب العالمية الأولى." },
  { cat: "وش الغرض؟", d: 1, q: "جهاز يبرّد الغرفة بسحب الحرارة منها ورميها برا؟", a: "المكيّف", alt: ["التكييف"], info: "ما يصنع برودة — ينقل الحرارة من مكان لمكان." },
  { cat: "الرابط المشترك", d: 1, q: "البرتقال والليمون واليوسفي — وش يجمعهم؟", a: "حمضيات", alt: ["الحمضيات"], info: "كلها غنية بفيتامين C." },
  { cat: "الرابط المشترك", d: 1, q: "الأحمر والأصفر والأخضر — وين تشوف الثلاثة مرتبة؟", a: "إشارة المرور", alt: ["الإشارة"], info: "الترتيب عالمي: أحمر فوق، أخضر تحت." },
  { cat: "الرابط المشترك", d: 1, q: "القمر والمريخ والزهرة — وش يجمعهم؟", a: "أجرام بالفضاء", alt: ["الفضاء", "المجموعة الشمسية"], info: "القمر تابع، والمريخ والزهرة كوكبان جاران للأرض." },
  { cat: "قبل ولا بعد؟", d: 1, q: "أيهما أول: الفجر ولا الظهر؟", a: "الفجر", info: "الفجر أول صلاة باليوم قبل شروق الشمس." },
  { cat: "قبل ولا بعد؟", d: 1, q: "أيهما اختُرع أول: السيارة ولا الطائرة؟", a: "السيارة", info: "السيارة 1886 والطائرة 1903 — فرق 17 سنة." },
  { cat: "قبل ولا بعد؟", d: 1, q: "أيهما أقدم: الهاتف ولا التلفزيون؟", a: "الهاتف", info: "الهاتف 1876 والتلفزيون بعده بنحو 50 سنة." },
  { cat: "إيموجي", d: 1, q: "خمّن: 🌧️☂️", a: "المطر", alt: ["الشتاء", "مطر"], info: "المظلة أشهر رمز مرتبط بالمطر." },
  { cat: "إيموجي", d: 1, q: "خمّن الحيوان: 🦁👑", a: "الأسد", alt: ["ملك الغابة"], info: "لُقّب بالملك رغم إنه يعيش بالسافانا مو الغابة." },
  { cat: "إيموجي", d: 1, q: "خمّن: ⚽🥅🏟️", a: "كرة القدم", alt: ["فوتبول"], info: "أكثر رياضة شعبية بالعالم." },
  { cat: "دليلين", d: 1, q: "دليل ١: أصفر ومنحني. دليل ٢: القرود تحبه. وش هو؟", a: "الموز", alt: ["موزة"], info: "نبتته عشبية عملاقة مو شجرة." },
  { cat: "دليلين", d: 1, q: "دليل ١: يطير. دليل ٢: يبني عشًا ويبيض. وش هو؟", a: "الطائر", alt: ["طير", "العصفور"], info: "الطيور الوحيدة من الفقاريات المغطاة بريش." },
  { cat: "دليلين", d: 1, q: "دليل ١: أبيض ويسيل. دليل ٢: يجي من البقر. وش هو؟", a: "الحليب", alt: ["اللبن"], info: "غني بالكالسيوم وبروتين الكازين." },
  { cat: "الأغرب", d: 1, q: "مين الغريب: التفاح، الموز، الجزر، البرتقال؟", a: "الجزر", info: "الوحيد الخضار — الباقي فواكه." },
  { cat: "الأغرب", d: 1, q: "مين الغريب: السيارة، الطائرة، الشجرة، الدراجة؟", a: "الشجرة", info: "الوحيدة مو وسيلة نقل." },
  { cat: "الأغرب", d: 1, q: "مين الغريب: الأسد، النمر، الفهد، الحصان؟", a: "الحصان", info: "الوحيد عاشب — الباقي من فصيلة السنوريات المفترسة." },
  { cat: "لو كنت مكانك", d: 1, q: "انقطعت الكهرباء بالبيت فجأة — وش أول شي تتأكد منه؟", a: "القاطع", alt: ["الكهرباء", "الطبلون", "البريكر"], info: "غالبًا قاطع نزل من حمل زائد، وأحيانًا العطل من الشبكة." },
  { cat: "لو كنت مكانك", d: 1, q: "شفت دخانًا يطلع من مبنى — وش تسوي؟", a: "تتصل بالدفاع المدني", alt: ["911", "998", "الطوارئ"], info: "رقم الدفاع المدني بالسعودية 998، والطوارئ الموحد 911." },
  { cat: "لو كنت مكانك", d: 1, q: "جسمك حرارته مرتفعة وتحس بالبرد — وش يسمّى هذا؟", a: "الحمّى", alt: ["حرارة", "سخونة"], info: "الرجفة محاولة الجسم يرفع حرارته للوصول للنقطة الجديدة." },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — أول بوس ذهبي يوقفك بالقلعة الأولى ويقول لك طموحك أحمق؟", a: "Margit", alt: ["مارغيت"], info: "يظهر لاحقًا باسمه الحقيقي Morgott بالعاصمة." },
  { cat: "بوسات السولز", d: 1, q: "من سيكيرو — البوس النهائي وأسطورة السيف بأشينا؟", a: "Isshin", alt: ["إيشين"], info: "تقاتله بأربع مراحل بنهاية Shura أو النهاية الحقيقية." },
  { cat: "لور السولز", d: 1, q: "من إلدن رينق — وش اسم الشجرة الذهبية اللي تشوفها من كل مكان؟", a: "Erdtree", alt: ["شجرة الإرد"], info: "مصدر النعمة والبعث بالعالم، وتحتها العاصمة ليندل." },
  { cat: "لور السولز", d: 1, q: "من دارك سولز — وش تسمى النار اللي ترتاح عندها وتحفظ تقدمك؟", a: "Bonfire", alt: ["بونفاير"], info: "مربوطة بالنار الأولى، وترتاح عندها يعيد الأعداء للحياة." },
  { cat: "أوفرواتش", d: 1, q: "وش نوع الحيوان اللي يمثله البطل Winston؟", a: "غوريلا", alt: ["قرد"], info: "غوريلا معدّلة وراثيًا نشأت بمستعمرة على القمر." },
  { cat: "أوفرواتش", d: 1, q: "وش لون بشرة Widowmaker المميز؟", a: "أزرق", alt: ["الأزرق"], info: "سببه بطء نبضها الشديد بعد تحويلها لقاتلة." },
  { cat: "أوفرواتش", d: 1, q: "البطلة D.Va من أي دولة؟", a: "كوريا الجنوبية", alt: ["كوريا"], info: "كانت لاعبة محترفة قبل ما تقود الميكا." },
  { cat: "أزياء الشخصيات", d: 1, q: "بدلة زرقاء وحرف S أحمر على الصدر وعباءة حمراء؟", a: "Superman", alt: ["سوبرمان"], info: "أول بطل خارق بالمعنى الحديث، ظهر 1938." },
  { cat: "أزياء الشخصيات", d: 1, q: "بدلة حمراء وقناع أسود بعينين بيضاوين وشبكة؟", a: "Spider-Man", alt: ["سبايدرمان"], info: "صممها الشخصية نفسها داخل القصة، لهذا شكلها بسيط." },
  { cat: "أزياء الشخصيات", d: 1, q: "أفرول أزرق وقبعة حمراء وشارب وحرف M؟", a: "Mario", alt: ["ماريو"], info: "الأفرول كان بسبب محدودية ألوان أجهزة الثمانينات." },
  { cat: "ألعاب فيديو", d: 1, q: "وش اللعبة اللي تبني فيها كل شي من مكعبات؟", a: "Minecraft", alt: ["ماينكرافت"], info: "أكثر لعبة مبيعًا بالتاريخ." },
  { cat: "ألعاب فيديو", d: 1, q: "وش شركة بلايستيشن؟", a: "سوني", alt: ["Sony"], info: "دخلت السوق 1994 بعد خلاف مع نينتندو." },
  { cat: "ألعاب فيديو", d: 1, q: "وش أشهر لعبة باتل رويال من Epic Games؟", a: "Fortnite", alt: ["فورتنايت"], info: "بدأت كلعبة تعاونية ضد الزومبي قبل ما يضيفون الباتل رويال." },
  { cat: "علوم", d: 1, q: "وش الغاز اللي تطلقه أنت وتمتصه النباتات؟", a: "ثاني أكسيد الكربون", alt: ["CO2"], info: "النبات يحوّله لسكر عبر التمثيل الضوئي." },
  { cat: "علوم", d: 1, q: "وش حالة الماء عند درجة تحت الصفر؟", a: "صلبة", alt: ["جليد", "ثلج"], info: "الماء من السوائل النادرة اللي يتمدد لما يتجمد." },
  { cat: "عام", d: 1, q: "كم يومًا بالأسبوع؟", a: "7", alt: ["سبعة"], info: "تقسيم بابلي قديم مرتبط بالأجرام السبعة المرئية." },
  { cat: "عام", d: 1, q: "كم لونًا بقوس قزح؟", a: "7", alt: ["سبعة"], info: "نيوتن هو من قسّمها سبعة ليطابق نغمات الموسيقى." },
  { cat: "رياضة", d: 1, q: "كم شوطًا بمباراة كرة القدم؟", a: "2", alt: ["شوطين", "اثنين"], info: "كل شوط 45 دقيقة زائد الوقت بدل الضائع." },
  { cat: "رياضة", d: 1, q: "وش الرياضة اللي تُلعب بمضرب وكرة صفراء على شبكة؟", a: "التنس", alt: ["Tennis"], info: "الكرة صارت صفراء 1972 لتتضح بالتلفزيون." },
  { cat: "تاريخ", d: 1, q: "وش الحضارة اللي بنت الأهرامات؟", a: "الفراعنة", alt: ["المصرية القديمة", "مصر"], info: "استخدموا منحدرات ورافعات بسيطة وقوة بشرية منظمة." },
  { cat: "جغرافيا", d: 1, q: "وش أكبر قارة بالعالم؟", a: "آسيا", alt: ["Asia"], info: "فيها أكثر من نصف سكان الأرض." },
  { cat: "جغرافيا", d: 1, q: "وش أطول نهر بأفريقيا؟", a: "النيل", alt: ["نيل"], info: "يمر بأحد عشر دولة قبل ما يصب بالمتوسط." },
  { cat: "تقنية", d: 1, q: "وش الشركة صاحبة الآيفون؟", a: "آبل", alt: ["Apple"], info: "أول آيفون صدر 2007 وغيّر شكل الهواتف كليًا." },
  { cat: "تقنية", d: 1, q: "وش أشهر محرك بحث بالعالم؟", a: "قوقل", alt: ["Google"], info: "اسمها من كلمة googol أي 1 وبعدها 100 صفر." },
  { cat: "فيزياء", d: 1, q: "وش اللي يخلي الأشياء تطيح للأرض؟", a: "الجاذبية", alt: ["الجذب"], info: "نيوتن وصفها كقوة، وأينشتاين فسّرها كانحناء بالزمكان." },
  { cat: "منطق وألغاز", d: 1, q: "لو كان عندك 3 تفاحات وأخذت 2 — كم صار عندك؟", a: "2", alt: ["اثنتين"], info: "اللي أخذته هو اللي صار عندك — الفخ بصياغة السؤال." },
  // ---- أفلام (أسئلة حسين) ----
  // ---- لور السولز (أسئلة حسين) ----
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو ابن Godfrey وMarika الذي كان يُعرف بأنه أول Elden Lord؟", a: "Godwyn the Golden", alt: ["Godwyn", "غودوين", "جودوين"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هي الشخصية التي تخلّت عن جسدها لتتحرر من الـ Greater Will وتبدأ مخططها الخاص؟", a: "Ranni the Witch", alt: ["Ranni", "رانّي", "راني"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هما التوأمان اللذان وُلدا من Marika وRadagon وكانا مصابين بلعنة منذ ولادتهما؟", a: "Malenia وMiquella", alt: ["Malenia and Miquella", "ماليينيا وميكيلا", "ماليينيا", "ميكيلا"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو ابن Radagon وRennala الذي أصبح سيد الـ Starscourge؟", a: "Starscourge Radahn", alt: ["Radahn", "رادان"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هي الشخصية التي قادت عملية سرقة جزء من الـ Rune of Death؟", a: "Ranni", alt: ["رانّي", "Ranni the Witch"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو الشخص الذي قُتل جسده في Night of the Black Knives، بينما بقيت روحه مرتبطة بالموت؟", a: "Godwyn", alt: ["غودوين", "Godwyn the Golden"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — ما الحدث الذي تسبب في تحطم الـ Elden Ring واندلاع الحرب بين أنصاف الآلهة؟", a: "The Shattering", alt: ["الشاترينغ", "التشظي", "Shattering"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو الابن المنبوذ لـ Marika وGodfrey الذي أصبح Lord of Blood؟", a: "Mohg", alt: ["موغ", "موق"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هي المحاربة التي لم تهزم Radahn بالسيف، بل تسببت في إطلاق الـ Scarlet Rot عليه؟", a: "Malenia", alt: ["ماليينيا"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو الشخص الذي كان زوج Marika الأول وElden Lord قبل أن يُنفى؟", a: "Godfrey", alt: ["غودفري", "جودفري"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو والد Ranni وRadahn وRykard؟", a: "Radagon", alt: ["رادغون", "رادجون"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هي الشخصية التي أنشأت الـ Haligtree كمكان للمنبوذين والمصابين بالـ Curses؟", a: "Miquella", alt: ["ميكيلا"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو الـ Demigod الذي التهمه الثعبان العظيم وأصبح Lord of Blasphemy؟", a: "Rykard", alt: ["ريكارد"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هي الشخصية التي كانت وراء خطة الـ Night of the Black Knives، رغم أنها لم تنفذ عملية القتل بنفسها؟", a: "Ranni", alt: ["رانّي"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — ما العلاقة بين Marika وRadagon؟", a: "هما نفس الشخص", alt: ["نفس الشخص", "same person", "شخص واحد"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من الذي تسبب في إصابة Caelid بالـ Scarlet Rot خلال معركته ضد Radahn؟", a: "Malenia", alt: ["ماليينيا"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — من هو الـ Demigod الذي ظل متمسكًا بجسده رغم موته وأصبح أصلًا لانتشار Deathroot؟", a: "Godwyn", alt: ["غودوين", "Godwyn the Golden"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الشخص الذي أشعل الـ First Flame للمرة الأولى في عصره؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Sunlight"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الـ Lord of Cinder الذي رفض التضحية بنفسه لإعادة إشعال الـ First Flame؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الأخ الأكبر لـ Lothric الذي حمله على ظهره أثناء المعركة؟", a: "Lorian", alt: ["لوريان", "Lorian Elder Prince"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الـ Lord of Cinder الذي كان حاكمًا عملاقًا وضحّى بنفسه لحماية شعبه؟", a: "Yhorm the Giant", alt: ["Yhorm", "يورم"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هم الـ Lords of Cinder الذين كانوا فرقة محاربين تلاحق الـ Abyss وهُزموا في النهاية؟", a: "Abyss Watchers", alt: ["أبيس ووتشرز", "حراس الأبيس"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو أول مولود لـ Gwyn الذي مُحي اسمه من التاريخ بسبب تحالفه مع التنانين؟", a: "Nameless King", alt: ["الملك بلا اسم", "نيملس كنق"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الـ Lord of Cinder الذي أصبح جسده مرتبطًا بالـ Profaned Flame؟", a: "Yhorm the Giant", alt: ["Yhorm", "يورم"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هي الشخصية التي رفضت أن تصبح Lord of Cinder وانضمت إلى Painted World of Ariandel؟", a: "Sister Friede", alt: ["Friede", "فريدي"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الفارس الذي سافر إلى نهاية العالم بحثًا عن دم الـ Dark Soul؟", a: "Slave Knight Gael", alt: ["Gael", "غايل"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الشخص الذي كان مسؤولًا عن تحويل Vordt وDancer إلى Outrider Knights؟", a: "Pontiff Sulyvahn", alt: ["Sulyvahn", "سوليفان"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الشخص الذي أصبح حاكمًا لـ Irithyll واستخدم السحر والسيطرة لإخضاع الآخرين؟", a: "Pontiff Sulyvahn", alt: ["Sulyvahn", "سوليفان"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو المحارب الذي أصبح يُعرف باسم Champion بعد أن فشل في الوصول إلى الـ First Flame؟", a: "Champion Gundyr", alt: ["Gundyr", "غوندر"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — ما اسم القوة التي ابتلعت Artorias وجعلته يفقد السيطرة على نفسه؟", a: "The Abyss", alt: ["Abyss", "الأبيس", "الهاوية"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الشخص الذي كان شريك Yhorm وصديقه، وأقسم أن يفي بوعده له؟", a: "Siegward of Catarina", alt: ["Siegward", "سيغوارد"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو البوس الذي يمثل أرواح جميع من أصبحوا Lords of Cinder؟", a: "Soul of Cinder", alt: ["روح الرماد", "سول اوف سندر"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 3 — من هو الشخص الذي أصبح مرتبطًا بالـ First Flame لدرجة أن جسده تحوّل إلى Ashen warrior؟", a: "Soul of Cinder", alt: ["روح الرماد", "سول اوف سندر"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الرجل الذي ربّى Sekiro وعلّمه طريق الـ Shinobi؟", a: "Owl", alt: ["البومة", "أوول"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الشخص الذي يُعرف بأنه وريث قوة التنين ويصبح محور الصراع في القصة؟", a: "Kuro", alt: ["كورو", "Divine Heir", "الوريث الإلهي"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هي المرأة التي كانت مرتبطة بـ Kuro وامتلكت قوة Dragon's Heritage قبله؟", a: "Tomoe", alt: ["توموي", "تومو"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو المحارب الذي كان جدّه Isshin Ashina ويحاول إنقاذ Ashina بأي وسيلة؟", a: "Genichiro", alt: ["جينيتشيرو", "Genichiro Ashina"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الرجل الذي يُعتبر مؤسس Ashina Clan وأحد أعظم المبارزين في اليابان؟", a: "Isshin Ashina", alt: ["Isshin", "إيشين"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الشخص الذي منح Sekiro قدرته على العودة من الموت؟", a: "Kuro", alt: ["كورو"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هي الشخصية التي حاولت استخدام الـ Dragon's Heritage لإنقاذ Ashina؟", a: "Genichiro", alt: ["جينيتشيرو", "Genichiro Ashina"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو المحارب الذي هزم Sekiro في بداية اللعبة وقطع ذراعه؟", a: "Genichiro", alt: ["جينيتشيرو", "Genichiro Ashina"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الشخص الذي كان يستخدم الـ Mortal Blade الحمراء لإحياء الموتى؟", a: "Genichiro", alt: ["جينيتشيرو", "Genichiro Ashina"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هي الشخصية التي ارتبط خلودها بمياه Senpou Temple ويسمونها الطفلة الإلهية؟", a: "Divine Child", alt: ["الطفلة الإلهية", "Divine Child of Rejuvenating Waters"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الشخص الذي كان يُعرف باسم The Owl وكان من أعظم الـ Shinobi في Ashina؟", a: "Owl", alt: ["البومة", "أوول"] },
  { cat: "لور السولز", d: 3, q: "من سيكيرو — من هو الشخص الذي قتل Emma وIsshin في نهاية Shura؟", a: "Sekiro", alt: ["سيكيرو", "البطل", "الذئب", "Wolf"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الذي قاد الـ Lord Souls واستخدم قوة الـ Flame لمواجهة التنانين القديمة؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Sunlight"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الساحر الذي اكتشف Flame of Chaos وحاول استخدامه بعد أن بدأ الـ First Flame بالضعف؟", a: "The Witch of Izalith", alt: ["Witch of Izalith", "ساحرة إيزاليث", "إيزاليث"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الابن الذي فقد اسمه بعد أن انحاز إلى التنانين القديمة؟", a: "The Nameless King", alt: ["Nameless King", "الملك بلا اسم"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي تسبب في ظهور الـ Bed of Chaos بعد محاولته إنشاء Flame جديدة؟", a: "The Witch of Izalith", alt: ["Witch of Izalith", "ساحرة إيزاليث"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي ضحّى بنفسه لإشعال الـ First Flame عندما بدأ يضعف؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو أول مخلوق وُلد من الـ Dark Soul؟", a: "The Pygmy", alt: ["Pygmy", "البيقمي", "Furtive Pygmy"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي كان يبحث عن الـ Dark Soul وأصبح مرتبطًا بأصل الـ Abyss؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الفارس الذي دخل الـ Abyss لمواجهة Manus؟", a: "Artorias", alt: ["أرتورياس", "Artorias the Abysswalker"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي أنقذ Oolacile من الـ Abyss فعليًا، رغم أن التاريخ نسب الإنجاز إلى Artorias؟", a: "The Chosen Undead", alt: ["Chosen Undead", "اللاعب", "البطل"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو ابن Gwyn الذي أصبح حاميًا لـ Anor Londo بعد أن اختفى والده؟", a: "Gwyndolin", alt: ["غويندولين", "Dark Sun Gwyndolin"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هي ابنة Gwyn التي غادرت Anor Londo وتُعرف بإلهة الشمس والخصب؟", a: "Gwynevere", alt: ["غوينيفير", "جوينيفير"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الأفعى الذي كان يوجّه الـ Darkwraiths ويشجع على قدوم عصر الظلام؟", a: "Darkstalker Kaathe", alt: ["Kaathe", "كاثي"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو أحد فرسان Gwyn الأربعة الأشهر بولائه ودخوله الـ Abyss؟", a: "Artorias", alt: ["أرتورياس"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو التنين الذي قطع ذيله وأصبح سلاحه مشهورًا بين الـ Chosen Undead؟", a: "Seath the Scaleless", alt: ["Seath", "سيث"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو التنين الذي خان أبناء جنسه وانضم إلى Gwyn أثناء الحرب ضد التنانين؟", a: "Seath the Scaleless", alt: ["Seath", "سيث"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي أصبح أول حامل للـ Gravelord power واستخدم الـ Miasma of Death؟", a: "Gravelord Nito", alt: ["Nito", "نيتو"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هي الشخصية التي أصبحت مرتبطة بـ Chaos بعد محاولة إعادة إشعال الـ First Flame؟", a: "The Witch of Izalith", alt: ["Witch of Izalith", "ساحرة إيزاليث"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي كان أول من وجد الـ Dark Soul داخل الـ First Flame؟", a: "The Furtive Pygmy", alt: ["Furtive Pygmy", "البيقمي", "Pygmy"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي أعطى الـ Chosen Undead مهمة الوصول إلى Anor Londo ومواجهة الـ Lord Souls؟", a: "Kingseeker Frampt", alt: ["Frampt", "فرامبت"] },
  { cat: "لور السولز", d: 3, q: "من دارك سولز 1 — من هو الشخص الذي كان يحاول إقناع الـ Chosen Undead بعدم إشعال الـ First Flame؟", a: "Darkstalker Kaathe", alt: ["Kaathe", "كاثي"] },
  // ---- بوسات السولز (أسئلة حسين) ----
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي ينتمي لعائلة Marika لكنه مخفي عن العالم؟", a: "Messmer", alt: ["ميسمر", "Messmer the Impaler", "ميسمير"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي كان مسؤولًا عن حملة الـ Crusade في الـ Realm of Shadow؟", a: "Messmer", alt: ["ميسمر", "Messmer the Impaler", "ميسمير"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي يستخدم الرمح والنار في قتاله؟", a: "Messmer", alt: ["ميسمر", "Messmer the Impaler", "ميسمير"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي عنده عين مغطاة وشعر أحمر؟", a: "Messmer", alt: ["ميسمر", "Messmer the Impaler", "ميسمير"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي اختار أن يُلتهم بدل أن يخضع لإرادة الـ Greater Will؟", a: "Rykard", alt: ["ريكارد", "Rykard Lord of Blasphemy", "لورد البلاسفيمي"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي حوّل الـ Volcano Manor إلى معقل للتمرد على الـ Erdtree؟", a: "Rykard", alt: ["ريكارد", "Rykard Lord of Blasphemy", "لورد البلاسفيمي"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي لقبه مرتبط بتحدّي المقدسات ورفض النظام الذهبي؟", a: "Rykard", alt: ["ريكارد", "Rykard Lord of Blasphemy", "لورد البلاسفيمي"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي قال إن يومًا ما سيصبح كل شيء one flesh؟", a: "Rykard", alt: ["ريكارد", "Rykard Lord of Blasphemy", "لورد البلاسفيمي"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي فقد جزءًا من جسده في معركة قديمة ضد أقوى تنين؟", a: "Bayle", alt: ["بايل", "Bayle the Dread", "بايل الرهيب"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي تمرّد على الـ Dragonlord ورفض الخضوع له؟", a: "Bayle", alt: ["بايل", "Bayle the Dread", "بايل الرهيب"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي قاتل Dragonlord Placidusax ونجا من المواجهة؟", a: "Bayle", alt: ["بايل", "Bayle the Dread", "بايل الرهيب"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي يُعتبر العدو الأكبر لـ Igon؟", a: "Bayle", alt: ["بايل", "Bayle the Dread", "بايل الرهيب"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي كان تنينًا عظيمًا مرتبطًا بأمير الموت؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax", "ليتش دراقون"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي واجه الـ Death داخل أحلام أحد الشخصيات؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax", "ليتش دراقون"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي مرتبط بـ Godwyn والـ Prince of Death؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax", "ليتش دراقون"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي تقاتله داخل حلم Fia؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax", "ليتش دراقون"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي لقبه يجمع بين التنين وشيء مرتبط بالموت؟", a: "Lichdragon Fortissax", alt: ["فورتساكس", "Fortissax", "ليتش دراقون"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي ظلّ يعاني من الـ Frenzied Flame رغم أنه حاول مقاومته؟", a: "Midra", alt: ["ميدرا", "Midra Lord of Frenzied Flame", "لورد الفرنزيد فليم"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي تخلى عن رأسه ليمنع الـ Frenzied Flame من السيطرة عليه؟", a: "Midra", alt: ["ميدرا", "Midra Lord of Frenzied Flame", "لورد الفرنزيد فليم"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي مرتبط بأتباع الـ Three Fingers وفلسفة الـ Frenzied Flame؟", a: "Midra", alt: ["ميدرا", "Midra Lord of Frenzied Flame", "لورد الفرنزيد فليم"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي يتحول في منتصف المعركة من رجل ضعيف إلى Lord مخيف؟", a: "Midra", alt: ["ميدرا", "Midra Lord of Frenzied Flame", "لورد الفرنزيد فليم"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي كان يعاني من ألم شديد بسبب سيف مغروس في رأسه؟", a: "Midra", alt: ["ميدرا", "Midra Lord of Frenzied Flame", "لورد الفرنزيد فليم"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي كانت شقيقتها واحدة من أشهر الشخصيات في الـ Lands Between؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight", "فارسة القمرين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي تحوّل قتالها في المرحلة الثانية إلى مزيج من السحر والنار؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight", "فارسة القمرين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي حاربت إلى جانب Messmer في حملته في الـ Realm of Shadow؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight", "فارسة القمرين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي تستخدم تقنية القمرين التوأمين في أقوى هجماتها؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight", "فارسة القمرين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق DLC — من هو البوس اللي تركت عائلتها واتبعت Messmer إلى أرض الظلال؟", a: "Rellana", alt: ["ريلانا", "Rellana Twin Moon Knight", "فارسة القمرين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي يحمل جزءًا من الـ Rune of Death داخل سلاحه؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي كان يُعرف باسم Gurranq تحت هوية مختلفة؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي يحرس شيئًا أخفته Marika عن بقية العالم؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي تسبب سرقته في بداية سلسلة أحداث أدت إلى Night of the Black Knives؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي تواجهه في Crumbling Farum Azula؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي يُعتبر Shadowbound Beast الخاص بـ Marika؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي لقبه مرتبط بالسلاح الذي يحمل قوة الـ Rune of Death؟", a: "Maliketh", alt: ["ماليكيث", "Maliketh the Black Blade", "النصل الأسود"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي كان يَعتبر نفسه من سلالة Godfrey، رغم أن دمه كان أضعف من بقية أفراد العائلة؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي كان يعوّض ضعفه بزراعة أجزاء أجساد المحاربين في جسده؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي هرب من Leyndell بعد هزيمته، ثم اختبأ داخل قلعة بعيدة؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي قطع رأسه بنفسه ليحاول الهروب من الموت؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي استبدل أحد ذراعيه بذراع تنين أثناء المعركة؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي جمع أطرافًا من أجساد الآخرين ليصنع لنفسه قوة أكبر؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي يحكم Stormveil Castle رغم أن أقاربه الأقوى ينظرون إليه باحتقار؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي تقدر تسمعه يتحدث عن نفسه كأنه أعظم من يكون، رغم أنه يُعتبر الأضعف بين الـ Demigods؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي في المرحلة الثانية يقطع ذراعه ويستخدم رأس تنين كسلاح؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — من هو البوس اللي لقبه مرتبط بفعلٍ يجعله يضيف أجساد الآخرين إلى جسده؟", a: "Godrick", alt: ["غودريك", "Godrick the Grafted", "جودريك"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يستخدم مطرقة ضخمة ويعتمد على الهجمات الجسدية والجليد؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تبدأ المرحلة الثانية عنده بإطلاقه نفسًا جليديًا قويًا؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان أحد فرسان Pontiff Sulyvahn قبل أن يفقد إنسانيته؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تقاتله مباشرة بعد الوصول إلى High Wall of Lothric؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يظهر كوحش ضخم بأرجل قصيرة ودرع معدني؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي لقبه مرتبط بمنطقة شمالية باردة تُعرف باسم Boreal Valley؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يُعتبر أول Boss رئيسي بالقصة؟", a: "Vordt", alt: ["فوردت", "Vordt of the Boreal Valley", "فوردت البوريل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي ما تواجه فيهم مقاتل واحد، بل مجموعة كاملة من رجال الدين؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي يتجمعون حول جثة ويؤدون طقوسًا غامضة؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي يستخدمون السحر والـ Dark أثناء محاولتهم إيقافك؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي واحد منهم يحمل علامة حمراء ويجب التركيز عليه لهزيمتهم؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي يستمرون في الظهور بأعداد كبيرة كلما قتلت بعضهم؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي يحرسون قبرًا مرتبطًا بـ Aldrich؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي تواجههم داخل Cathedral of the Deep؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هم البوس اللي قتالهم يعتمد أكثر على إدارة مجموعة من الأعداء بدل مواجهة واحد قوي؟", a: "Deacons of the Deep", alt: ["الشمامسة", "ديكونز", "Deacons"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان في الأصل ساحرًا من Irithyll قبل أن يصبح حاكمًا مستبدًا؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يحمل سيفين، أحدهما ناري والآخر مغطى بالسحر؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي استولى على Irithyll بعد أن وصل إليها من الـ Painted World؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تظهر نسخة منه في منتصف القتال لتقاتلك بجانبه؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يقف بينك وبين الوصول إلى Anor Londo؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان وراء تحويل Vordt وDancer إلى Outrider Knights؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يقاتلك بسيفين، ويستطيع استدعاء نسخة مظلمة من نفسه؟", a: "Pontiff Sulyvahn", alt: ["سوليفان", "Sulyvahn", "البابا سوليفان"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي قصته مرتبطة بـ Siegward of Catarina ووعدٍ قديم بينهما؟", a: "Yhorm the Giant", alt: ["يورم", "Yhorm", "يورم العملاق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس العملاق اللي يمكن هزيمته بسهولة أكبر باستخدام سلاح صُمم خصيصًا ضده؟", a: "Yhorm the Giant", alt: ["يورم", "Yhorm", "يورم العملاق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كانت في الأصل راقصة في قصر Irithyll قبل أن تتحول إلى شيء آخر؟", a: "Dancer of the Boreal Valley", alt: ["الراقصة", "Dancer", "راقصة الوادي البارد"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي أُجبرت على أن تصبح واحدة من Outrider Knights؟", a: "Dancer of the Boreal Valley", alt: ["الراقصة", "Dancer", "راقصة الوادي البارد"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي حوّلها Pontiff Sulyvahn إلى وحش باستخدام الـ Pontiff's Eyes؟", a: "Dancer of the Boreal Valley", alt: ["الراقصة", "Dancer", "راقصة الوادي البارد"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يمكن مواجهته مبكرًا جدًا إذا قتلت شخصية معينة؟", a: "Dancer of the Boreal Valley", alt: ["الراقصة", "Dancer", "راقصة الوادي البارد"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تُعتبر من أقرب خدم Pontiff Sulyvahn وأكثرهم ولاءً؟", a: "Dancer of the Boreal Valley", alt: ["الراقصة", "Dancer", "راقصة الوادي البارد"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان في الأصل Unkindled مثل اللاعب، لكنه وصل إلى Firelink Shrine بعد فوات الأوان؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تواجه نسخة منه في مكان يشبه الماضي، قبل أن يصبح ما هو عليه؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان من المفترض أن يكون Ashen One، لكنه فشل في الوصول إلى الـ Flame؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يستخدم Halberd ضخمة ويقاتل بأسلوب أكثر عدوانية من نسخته الأخرى؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يظهر في Untended Graves بدل الـ Cemetery of Ash؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يبدو شبيهًا بـ Iudex Gundyr، لكن الفرق أن هذه النسخة أسرع وأشرس؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي لقبه يدل على أنه نسخة مُتوجة وأقوى من Gundyr الذي واجهته في البداية؟", a: "Champion Gundyr", alt: ["تشامبيون غوندر", "Gundyr", "غوندر البطل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان مقدّرًا له أن يصبح Lord of Cinder لكنه رفض هذا المصير؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي اختار أخوه الأكبر أن يحمله على ظهره بدل أن يتركه يواجه مصيره وحده؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان يعاني من مرض جعله غير قادر على أن يعيش حياة طبيعية؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان جزءًا من خطة العائلة لإشعال الـ First Flame رغم أنه لم يرغب بذلك؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يقاتلك وهو جالس على ظهر أخيه الأكبر؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يستخدم الـ Holy Magic ويمتلك القدرة على إحياء أخيه أثناء المعركة؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان رفضه التضحية بالـ Flame سببًا في دخول مملكة Lothric في حالة من الفوضى؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تواجهه مع أخيه بعد صعودك إلى قمة Lothric Castle؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يُعتبر أصغر أبناء العائلة الملكية في Lothric؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي لقبه Younger Prince ويشارك جسده ومعركته مع أخيه الأكبر؟", a: "Lothric", alt: ["لوثريك", "Lothric Younger Prince", "الأمير الأصغر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تخلّى عن عائلته بعد أن اختار الوقوف إلى جانب أعدائهم؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان إلهًا للحرب قبل أن يُمحى اسمه من التاريخ؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي قطع علاقته مع والده بسبب تحالفه مع التنانين؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يصل إلى ساحة القتال راكبًا على تنين عاصفة؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يستخدم البرق كسلاح، بينما يقاتلك من فوق سحابة؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي ارتبط اسمه بـ Gwyn رغم أن اللعبة تعمدت عدم ذكر اسمه الحقيقي؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي كان أول مولود لـ Gwyn قبل أن يخسر مكانته ويُمحى اسمه؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يقاتلك بعد هزيمة تنين يرافقه في المعركة؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تواجهه في Archdragon Peak وسط عاصفة وبرق؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي لقبه نفسه يدل على أن اسمه الحقيقي قد أُزيل من التاريخ؟", a: "Nameless King", alt: ["الملك بلا اسم", "Nameless King", "نيملس كنق"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يمثل كل من سبق له أن أشعل الـ First Flame؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يتغير أسلوب قتاله أثناء المعركة وكأنه يستخدم أرواح محاربين مختلفين؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يحمل آثار جميع الـ Lords of Cinder في جسد واحد؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يستخدم عدة أساليب قتال مختلفة، من السيف والسحر إلى المعجزات؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يظهر في نهاية رحلة اللاعب كآخر حارس للـ First Flame؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يبدو في البداية كمحارب عادي، لكنه يخفي قوة هائلة مرتبطة بالـ Flame؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي في المرحلة الثانية يبدأ بالقتال بأسلوب يشبه Gwyn؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي يمثل إرادة الـ First Flame أكثر من كونه شخصًا واحدًا؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي تقاتله عند Kiln of the First Flame؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 — من هو البوس اللي لقبه يشير إلى أنه تجسيد للأرواح التي أصبحت رمادًا؟", a: "Soul of Cinder", alt: ["روح الرماد", "Soul of Cinder", "سول اوف سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تخفي حقيقتها خلف شخصية راهبة هادئة داخل كنيسة معزولة؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تنتمي إلى عائلة مرتبطة مباشرة بـ Darkwraiths؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تحاربك باستخدام منجل أسود ضخم وحركات سريعة جدًا؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تعود للقتال أكثر من مرة بعد أن تظن أنك هزمتها؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تقاتلها داخل Painted World of Ariandel؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي كانت من أتباع Pontiff Sulyvahn قبل أن تنشق عنه؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي ترتبط قصتها بـ Yuria of Londor؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هي البوس اللي تبدأ المرحلة الثالثة منها بقوة الـ Black Flame؟", a: "Sister Friede", alt: ["فريدي", "Friede", "الأخت فريدي"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي بدأ رحلته كعبد، لكنه انتهى به الأمر بمواجهة اللاعب في نهاية العالم؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي كان يبحث عن دم الـ Dark Soul من أجل إكمال لوحة جديدة؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي خدم كحارس وحليف لشخصية صغيرة كانت تحلم برسم عالم جديد؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي سافر إلى نهاية العالم بحثًا عن شيء كان يحتاجه رسام لخلق عالم جديد؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي ابتلع الـ Dark Soul لدرجة أن جسده بدأ ينهار تحت تأثيرها؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي تواجهه في نهاية الـ Ringed City وسط عالم يحتضر؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 3 DLC — من هو البوس اللي يقاتلك بسيف ضخم وقوس ونشاب، ثم يبدأ باستخدام الـ Dark Soul ضدك؟", a: "Slave Knight Gael", alt: ["غايل", "Gael", "سليف نايت غايل"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي دخل الـ Abyss لإنقاذ البشر، لكنه انتهى به الأمر يستهلكه الظلام؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي اشتهر بأنه فارس عظيم، لكن الحقيقة أن قصته أكثر مأساوية مما تُروى؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي قاتل الـ Abyss حتى فقد ذراعه وسيفه قبل أن ينهار بالكامل؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي كان أحد أعظم فرسان Gwyn الأربعة؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي واجه Manus قبل أن يصل اللاعب إلى الـ Abyss؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي تقاتله وهو مصاب وذراعه مكسورة، لكنه يستمر بالقتال بلا توقف؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي كان لديه رفيق ذئب ضخم يُدعى Sif؟", a: "Artorias", alt: ["أرتورياس", "Artorias of the Abyss", "ارتورياس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي يُقال إن غضبه وحزنه كانا من أسباب انتشار الـ Abyss؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي كان يبحث بجنون عن شيء ثمين سُرق منه؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي ارتبط اسمه بأصل الـ Abyss في Oolacile؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي يُعتبر مصدرًا أو أبًا للـ Abyss؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي تقاتله في أعمق مكان داخل الـ Abyss؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي يستخدم ذراعًا ضخمة بشكل غير طبيعي ويهاجمك من مسافات مختلفة؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي يستطيع استخدام السحر المظلم بطريقة تشبه الـ Dark Soul؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي كان في الأصل إنسانًا قبل أن يتحول إلى مخلوق هائل بسبب الـ Abyss؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي كان غضبه مرتبطًا ببحثه عن قلادة فقدها؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 DLC — من هو البوس اللي لقبه Father of the Abyss ويرتبط مباشرة بأحداث Oolacile؟", a: "Manus", alt: ["مانوس", "Manus Father of the Abyss", "أبو الأبيس"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي تقاتله في مساحة صغيرة جدًا ويبدأ القتال مع كلابه بجانبه؟", a: "Capra Demon", alt: ["كابرا ديمون", "Capra", "شيطان الماعز"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي تدخل ساحته لتجد أن أول شيء يهاجمك ليس هو، بل كلابه؟", a: "Capra Demon", alt: ["كابرا ديمون", "Capra", "شيطان الماعز"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي يستخدم زوجًا من الـ Machetes بدل سلاح واحد؟", a: "Capra Demon", alt: ["كابرا ديمون", "Capra", "شيطان الماعز"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي لقبه مرتبط بمخلوق أسطوري نصفه إنسان ونصفه ماعز؟", a: "Capra Demon", alt: ["كابرا ديمون", "Capra", "شيطان الماعز"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي حافظ على وهمٍ كبير ليجعل مدينة كاملة تبدو كما كانت في الماضي؟", a: "Dark Sun Gwyndolin", alt: ["غويندولين", "Gwyndolin", "دارك سن غويندولين"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي تقاتله داخل Anor Londo بعد أن تكشف الوهم؟", a: "Dark Sun Gwyndolin", alt: ["غويندولين", "Gwyndolin", "دارك سن غويندولين"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي كان أصغر أبناء Gwyn وأحد آلهة Anor Londo؟", a: "Dark Sun Gwyndolin", alt: ["غويندولين", "Gwyndolin", "دارك سن غويندولين"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي تقاتله في ممر طويل بينما يحاول دائمًا الابتعاد عنك؟", a: "Dark Sun Gwyndolin", alt: ["غويندولين", "Gwyndolin", "دارك سن غويندولين"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي لقبه يجمع بين الشمس واسم إله من عائلة Gwyn؟", a: "Dark Sun Gwyndolin", alt: ["غويندولين", "Gwyndolin", "دارك سن غويندولين"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي ضحّى بنفسه ليحافظ على عصر النار رغم أن جسده بدأ يتحول إلى رماد؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي كان أحد أقوى الآلهة في بداية عصر النار؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي استخدم قوة الـ Lightning لمحاربة التنانين القديمة؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي قسّم الـ Lord Soul بين أتباعه قبل أن يواجه مصيره؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي ترك مملكته وعائلته خلفه عندما ذهب لإشعال الـ First Flame؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي تقاتله في Kiln of the First Flame بعد أن تصل إلى نهاية رحلتك؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي أصبح Hollow تقريبًا بعد أن ضحّى بكل شيء لإبقاء الـ Flame مشتعلًا؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي كان Lord of Sunlight قبل أن يصبح Lord of Cinder؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي يستخدم سيفًا مشتعلًا رغم أنه لم يعد يملك القوة التي كانت لديه في السابق؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من دارك سولز 1 — من هو البوس اللي قصته تمثل نهاية عصرٍ وبداية دورة جديدة بين النار والظلام؟", a: "Gwyn", alt: ["غوين", "Gwyn Lord of Cinder", "لورد سندر"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي استخدم قوى الـ Mortal Blade والـ Lightning لتحقيق هدفه؟", a: "Genichiro Ashina", alt: ["جينيتشيرو", "Genichiro", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي كان يحاول حماية Ashina من السقوط أمام الغزاة؟", a: "Genichiro Ashina", alt: ["جينيتشيرو", "Genichiro", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي قطع ذراعك في أول مواجهة بينكما؟", a: "Genichiro Ashina", alt: ["جينيتشيرو", "Genichiro", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي كان حفيد Isshin Ashina لكنه لم يرث مهارته القتالية بالكامل؟", a: "Genichiro Ashina", alt: ["جينيتشيرو", "Genichiro", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي تواجهه فوق Ashina Castle في واحدة من أشهر معارك Sekiro؟", a: "Genichiro Ashina", alt: ["جينيتشيرو", "Genichiro", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي يحرس مدخل Fountainhead Palace ويمنعك من التقدم؟", a: "Corrupted Monk", alt: ["الراهبة الفاسدة", "Corrupted Monk", "الراهب الفاسد"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي لقبه يوحي بأنه راهب، لكنه أصبح فاسدًا بسبب قوة الـ Palace؟", a: "Corrupted Monk", alt: ["الراهبة الفاسدة", "Corrupted Monk", "الراهب الفاسد"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي تقاتله عند جسر يؤدي إلى Fountainhead Palace؟", a: "Corrupted Monk", alt: ["الراهبة الفاسدة", "Corrupted Monk", "الراهب الفاسد"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي يستخدم الوهم والـ Illusion في منتصف المعركة؟", a: "Corrupted Monk", alt: ["الراهبة الفاسدة", "Corrupted Monk", "الراهب الفاسد"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي كان أبًا ومعلّمًا للمحارب الذي تلعب به؟", a: "Owl", alt: ["البومة", "Great Shinobi Owl", "أوول"] },
  { cat: "بوسات السولز", d: 3, q: "من سيكيرو — من هو البوس اللي كان مستعدًا لقتل ابنه بالتبني لتحقيق هدفه؟", a: "Owl", alt: ["البومة", "Great Shinobi Owl", "أوول"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هو البوس اللي يخفي نفسه داخل جسد دمية ضخمة ويتحكم بها؟", a: "King of Puppets", alt: ["ملك الدمى", "كنق اوف بابتس"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هو البوس اللي يظهر في البداية كدمية عملاقة، لكن الحقيقة أن هناك شخصًا آخر داخلها؟", a: "King of Puppets", alt: ["ملك الدمى", "كنق اوف بابتس"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هو البوس اللي يقاتلك أولًا باستخدام جسد ضخم، ثم يكشف عن شكله الحقيقي؟", a: "King of Puppets", alt: ["ملك الدمى", "كنق اوف بابتس"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي كانت محاربة مخلصة لـ Simon Manus قبل أن تتحول إلى شيء يتجاوز حدود الإنسان؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي تحولت من محاربة مدرعة إلى كائن أسرع بكثير في المرحلة الثانية؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي تستخدم البرق كسلاح رئيسي في المرحلة الثانية؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي تخلع درعها وتكشف قوتها الحقيقية بعد أن تبدأ المرحلة الثانية؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي تقاتل بسيف طويل ودرع ضخم قبل أن تبدأ باستخدام البرق؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي تواجهها في Ascension Bridge؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "من Lies of P — من هي البوس اللي كانت تُعرف كواحدة من أقوى أتباع Simon Manus؟", a: "Laxasia", alt: ["لاكسيا", "Laxasia the Complete", "لاكساسيا"] },
  // ---- الدفعة الإضافية ----
  { cat: "فيزياء", d: 1, q: "جسم كتلته 2 كجم يتسارع 3 م/ث² — كم القوة بالنيوتن؟", a: "6", alt: ["ستة", "٦"], info: "القانون الثاني لنيوتن: ق = ك × ت، فـ 2×3 = 6 نيوتن." },
  { cat: "فيزياء", d: 3, q: "وش الكمية اللي تبقى ثابتة بالتصادم المرن وغير المرن معًا؟", a: "الزخم", alt: ["كمية الحركة", "Momentum"], info: "الطاقة الحركية تضيع بالتصادم غير المرن، لكن الزخم يبقى محفوظًا دائمًا." },
  { cat: "فيزياء", d: 2, q: "وش يسمى تردد النظام اللي يهتز عنده بأكبر سعة؟", a: "الرنين", alt: ["Resonance", "التردد الرنيني"], info: "الرنين هو سبب انهيار جسر تاكوما 1940 من الرياح." },
  { cat: "فيزياء", d: 3, q: "لو نصّفت المسافة بين شحنتين، القوة بينهما تتضاعف كم؟", a: "أربع", alt: ["4", "اربع مرات"], info: "قانون كولوم: القوة تتناسب عكسيًا مع مربع المسافة، فنصف المسافة = أربعة أضعاف." },
  { cat: "فيزياء", d: 2, q: "وش نوع المرايا اللي تعطي صورة مصغّرة دائمًا وتُستخدم بمرايا السيارة الجانبية؟", a: "محدبة", alt: ["Convex", "المحدبة"], info: "لهذا مكتوب عليها «الأجسام أقرب مما تبدو» — تصغّر لتوسّع مجال الرؤية." },
  { cat: "فيزياء", d: 3, q: "وش الجسيم اللي يحمل القوة النووية القوية بين الكواركات؟", a: "الغلوون", alt: ["جلوون", "Gluon"], info: "الغلوون يربط الكواركات، وقوته تزيد كل ما ابتعدت — عكس بقية القوى." },
  { cat: "فيزياء", d: 2, q: "وش وحدة قياس الكمية المادية (عدد الجسيمات) بالنظام الدولي؟", a: "المول", alt: ["mole", "مول"], info: "المول = 6.022×10²³ جسيم، وهو عدد أفوغادرو." },
  { cat: "فيزياء", d: 2, q: "سلك طوله تضاعف ومساحة مقطعه ثابتة — مقاومته تتغير كيف؟", a: "تتضاعف", alt: ["تصير ضعفين", "تزيد الضعف"], info: "المقاومة تتناسب طرديًا مع الطول وعكسيًا مع المساحة." },
  { cat: "فيزياء", d: 3, q: "وش يسمى الحد الأقصى لدقة قياس الموقع والسرعة معًا؟", a: "مبدأ عدم اليقين", alt: ["هايزنبرغ", "اللايقين"], info: "مبدأ هايزنبرغ: كل ما دقّ قياس الموقع، قلّت دقة قياس الزخم." },
  { cat: "فيزياء", d: 2, q: "الصوت أسرع بأي وسط: الهواء ولا الحديد؟", a: "الحديد", alt: ["الصلب", "iron"], info: "الصوت يحتاج وسطًا ينقله، وكل ما زادت صلابة الوسط زادت سرعته: 343 م/ث بالهواء ونحو 5000 بالحديد." },
  { cat: "علوم", d: 3, q: "وش الرقم الذري للكربون؟", a: "6", alt: ["ستة", "٦"], info: "6 بروتونات، وقدرته على تكوين أربع روابط جعلته أساس كل جزيئات الحياة." },
  { cat: "علوم", d: 3, q: "وش العملية اللي تنتقل فيها جزيئات المذيب عبر غشاء شبه منفذ؟", a: "الأسموزية", alt: ["التناضح", "Osmosis", "الخاصية الأسموزية"], info: "الماء يتحرك من التركيز الأقل للأعلى — نفس السبب اللي يخلي الخيار ينكمش بالملح." },
  { cat: "علوم", d: 2, q: "وش الصبغة اللي تعطي الدم لونه الأحمر وتحمل الأكسجين؟", a: "الهيموغلوبين", alt: ["هيموجلوبين", "Hemoglobin"], info: "جزيء واحد يحمل أربعة جزيئات أكسجين، وسبب لونه ذرة الحديد بمركزه." },
  { cat: "علوم", d: 3, q: "وش نوع الرابطة بين ذرتي الأكسجين بجزيء O2؟", a: "تساهمية مزدوجة", alt: ["تساهمية", "ثنائية", "مزدوجة"], info: "كل ذرة تحتاج إلكترونين لتكتمل، فتتشاركان زوجين — رابطة مزدوجة." },
  { cat: "علوم", d: 3, q: "كم زوج قواعد تقريبًا بجينوم الإنسان (بالمليار)؟", a: "3", alt: ["ثلاثة", "٣", "3 مليار"], info: "لو طبعته كتبًا لملأ مكتبة، ومع ذلك يتسع داخل نواة خلية مجهرية." },
  { cat: "علوم", d: 3, q: "وش المستوى التصنيفي الأعلى: المملكة ولا الشعبة؟", a: "المملكة", alt: ["Kingdom"], info: "الترتيب: مملكة ← شعبة ← طائفة ← رتبة ← فصيلة ← جنس ← نوع." },
  { cat: "علوم", d: 2, q: "وش الحمض الموجود بالمعدة ويهضم البروتين؟", a: "الهيدروكلوريك", alt: ["HCl", "حمض الهيدروكلوريك"], info: "درجة حموضته 1.5 تقريبًا — قوي كفاية يذيب المعدن، والمخاط هو اللي يحمي جدار معدتك." },
  { cat: "علوم", d: 2, q: "وش العنصر الأساسي بالرمل والزجاج ورقائق الحاسوب؟", a: "السيليكون", alt: ["سيليكون", "Silicon"], info: "ثاني أكثر عنصر بقشرة الأرض بعد الأكسجين، وعليه قامت وادي السيليكون." },
  { cat: "علوم", d: 3, q: "وش تسمى الكائنات اللي تصنع غذاءها بنفسها؟", a: "ذاتية التغذية", alt: ["منتجات", "Autotroph"], info: "النباتات وبعض البكتيريا — وهي قاعدة كل سلسلة غذائية بالكوكب." },
  { cat: "علوم", d: 2, q: "وش أشد أنواع الإشعاع النووي اختراقًا؟", a: "غاما", alt: ["Gamma", "جاما"], info: "تحتاج ألواح رصاص أو خرسانة سميكة لإيقافها، وهي موجة كهرومغناطيسية مو جسيم." },
  { cat: "فضاء", d: 2, q: "وش أقرب كوكب للأرض من حيث متوسط المسافة عبر السنة؟", a: "عطارد", alt: ["Mercury"], info: "مفاجئ لكنه صحيح: عطارد يقضي وقتًا أطول قريبًا منا لأنه يدور بسرعة حول الشمس." },
  { cat: "فضاء", d: 2, q: "كم قمر للمريخ وش أسماءهم؟", a: "فوبوس وديموس", alt: ["فوبوس", "ديموس", "Phobos Deimos"], info: "الاسمان يونانيان ويعنيان «الخوف» و«الرعب» — رفيقا إله الحرب." },
  { cat: "فضاء", d: 2, q: "وش يسمى حزام الكويكبات بين المريخ والمشتري؟", a: "حزام الكويكبات", alt: ["Asteroid Belt", "الحزام الرئيسي"], info: "كتلته كلها أقل من كتلة قمرنا، وما هو حطام كوكب كما يُشاع." },
  { cat: "فضاء", d: 3, q: "كم سنة تقريبًا عمر الكون بالمليار؟", a: "13.8", alt: ["13.8 مليار", "14", "13"], info: "حُسب من سرعة تمدد الكون وإشعاع الخلفية الكوني." },
  { cat: "فضاء", d: 2, q: "وش يسمى تحول النجم لعملاق أحمر ثم قزم أبيض — مصير شمسنا؟", a: "قزم أبيض", alt: ["القزم الأبيض", "White Dwarf"], info: "شمسنا بعد 5 مليارات سنة ستبتلع عطارد والزهرة ثم تنكمش لقزم أبيض بحجم الأرض." },
  { cat: "فضاء", d: 3, q: "وش أول قمر صناعي أُطلق بالتاريخ وبأي سنة؟", a: "سبوتنيك", alt: ["Sputnik", "سبوتنك"], info: "أطلقه السوفييت 1957 وأشعل سباق الفضاء، وكان يبث صفيرًا سمعه العالم." },
  { cat: "فضاء", d: 3, q: "وش المسافة اللي تقطعها الأرض حول الشمس بالسنة الواحدة تقريبًا (بمليون كم)؟", a: "940", alt: ["940 مليون", "900", "نحو مليار"], info: "أنت تسافر نحو 30 كم بالثانية وأنت جالس مكانك." },
  { cat: "فضاء", d: 2, q: "وش الظاهرة اللي تخلي القمر يبين أحمر وقت الخسوف الكلي؟", a: "تشتت الضوء", alt: ["انكسار الضوء", "الغلاف الجوي", "تشتت رايلي"], info: "غلافنا الجوي يشتت الأزرق ويمرر الأحمر — نفس سبب احمرار الغروب." },
  { cat: "فضاء", d: 1, q: "وش أكبر كوكب صخري بالمجموعة الشمسية؟", a: "الأرض", alt: ["Earth"], info: "الكواكب الصخرية أربعة: عطارد والزهرة والأرض والمريخ." },
  { cat: "فضاء", d: 3, q: "كم يستغرق دوران الشمس حول مركز المجرة تقريبًا (بمليون سنة)؟", a: "230", alt: ["225", "250", "نحو 230 مليون"], info: "تسمى «السنة المجرية»، والشمس أكملت نحو 20 دورة منذ نشأتها." },
  { cat: "جسم الإنسان", d: 3, q: "كم عدد العضلات بجسم الإنسان تقريبًا؟", a: "600", alt: ["ستمئة", "٦٠٠", "640"], info: "أكبرها عضلة الأرداف وأصغرها داخل الأذن الوسطى." },
  { cat: "جسم الإنسان", d: 2, q: "وش السائل اللي يحيط بالدماغ والحبل الشوكي؟", a: "السائل النخاعي", alt: ["السائل الدماغي الشوكي", "CSF"], info: "يعمل كوسادة تمنع ارتطام الدماغ بالجمجمة، ويجدد نفسه عدة مرات باليوم." },
  { cat: "جسم الإنسان", d: 2, q: "وش الفيتامين المسؤول عن تخثر الدم؟", a: "K", alt: ["كي", "فيتامين ك"], info: "تصنعه بكتيريا أمعائك جزئيًا، ولهذا نقصه نادر عند البالغين." },
  { cat: "جسم الإنسان", d: 3, q: "كم عدد الأسنان الدائمة بالفم الكامل؟", a: "32", alt: ["اثنين وثلاثين", "٣٢"], info: "20 لبنية بالطفولة تُستبدل، ثم تُضاف الأضراس ومنها ضروس العقل الأربعة." },
  { cat: "جسم الإنسان", d: 2, q: "وش أسرع خلية بجسمك من ناحية سرعة التجدد؟", a: "خلايا الأمعاء", alt: ["بطانة الأمعاء", "خلايا الجهاز الهضمي"], info: "تتجدد كل 3-5 أيام لأنها تتعرض للأحماض والاحتكاك باستمرار." },
  { cat: "جسم الإنسان", d: 2, q: "وش الجزء من العين المسؤول عن الرؤية بالضوء الخافت؟", a: "العصي", alt: ["الخلايا العصوية", "Rods"], info: "العصي حساسة للضوء لكنها لا تميّز الألوان — لهذا كل شي رمادي بالظلام." },
  { cat: "جسم الإنسان", d: 1, q: "كم دقيقة تقريبًا يقدر الدماغ يعيش بدون أكسجين قبل الضرر؟", a: "4", alt: ["أربع", "٤", "4-6"], info: "بعد 4-6 دقائق يبدأ الضرر الدائم — لهذا الإنعاش الفوري حاسم." },
  { cat: "جسم الإنسان", d: 2, q: "وش نصف الدماغ المسؤول عادةً عن اللغة عند أغلب الناس؟", a: "الأيسر", alt: ["اليسار", "النصف الأيسر"], info: "عند نحو 95% من اليمناويين، والنسبة أقل عند العسراويين." },
  { cat: "جسم الإنسان", d: 2, q: "وش أكبر شريان بجسم الإنسان؟", a: "الأورطي", alt: ["الأبهر", "Aorta"], info: "قطره كخرطوم الحديقة، وينقل الدم من القلب لكل الجسم." },
  { cat: "جسم الإنسان", d: 2, q: "كم لتر هواء تقريبًا تسع الرئتان للبالغ (السعة الكلية)؟", a: "6", alt: ["ستة", "٦", "6 لتر"], info: "لكن التنفس العادي يستخدم نصف لتر فقط من كل نفس." },
  { cat: "تاريخ", d: 3, q: "كم سنة استمرت الدولة العثمانية تقريبًا؟", a: "600", alt: ["ستمئة", "623", "٦٠٠"], info: "من 1299 إلى 1922 — نحو 623 سنة، من أطول الإمبراطوريات عمرًا." },
  { cat: "تاريخ", d: 3, q: "وش المعركة اللي أوقفت الزحف الإسلامي بأوروبا الغربية 732؟", a: "بلاط الشهداء", alt: ["بواتييه", "Tours"], info: "سنة 732 بفرنسا، وأوقفت التوسع شمال جبال البرانس." },
  { cat: "تاريخ", d: 2, q: "من الخليفة العباسي اللي بنى بغداد؟", a: "المنصور", alt: ["أبو جعفر المنصور"], info: "بناها دائرية سنة 762 وسماها «مدينة السلام»." },
  { cat: "تاريخ", d: 2, q: "وش الحضارة اللي بنت مدينة ماتشو بيتشو؟", a: "الإنكا", alt: ["الانكا", "Inca"], info: "بجبال البيرو على ارتفاع 2400 متر، وبُنيت بلا ملاط ولا عجلات." },
  { cat: "تاريخ", d: 3, q: "في أي سنة سقطت الأندلس نهائيًا بسقوط غرناطة؟", a: "1492", alt: ["١٤٩٢"], info: "بتسليم أبي عبدالله الصغير مفاتيح غرناطة — نفس سنة رحلة كولومبوس." },
  { cat: "تاريخ", d: 3, q: "وش الاسم اللي أُطلق على الوباء اللي قتل ثلث أوروبا بالقرن 14؟", a: "الطاعون الأسود", alt: ["الموت الأسود", "Black Death"], info: "1347-1351، وغيّر بنية أوروبا الاقتصادية والاجتماعية كليًا." },
  { cat: "تاريخ", d: 3, q: "من أول امرأة حكمت مصر كفرعون بلقب ملك؟", a: "حتشبسوت", alt: ["Hatshepsut"], info: "حكمت 22 سنة، وحاول خلفاؤها محو اسمها من الآثار." },
  { cat: "تاريخ", d: 2, q: "وش الثورة اللي بدأت 1789 وأسقطت الملكية الفرنسية؟", a: "الثورة الفرنسية", alt: ["French Revolution"], info: "شعارها «حرية، مساواة، إخاء» وأنهت الملكية المطلقة بأوروبا." },
  { cat: "تاريخ", d: 2, q: "من القائد اللي وحّد المغول وأسس أكبر إمبراطورية برية متصلة؟", a: "جنكيز خان", alt: ["Genghis Khan"], info: "إمبراطوريته امتدت من الصين لأوروبا الشرقية — أكبر إمبراطورية برية متصلة بالتاريخ." },
  { cat: "تاريخ", d: 3, q: "في أي سنة انتهت الحرب الباردة بتفكك الاتحاد السوفيتي؟", a: "1991", alt: ["١٩٩١"], info: "بانحلال الاتحاد السوفيتي لخمس عشرة دولة مستقلة." },
  { cat: "جغرافيا", d: 3, q: "وش أطول نهر بأوروبا؟", a: "الفولغا", alt: ["الفولجا", "Volga"], info: "3500 كم بروسيا، ويصب ببحر قزوين لا بمحيط." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة الوحيدة اللي تحدها دولة واحدة بس (غير الجزر)؟", a: "البرتغال", alt: ["Portugal", "كندا"], info: "البرتغال تحدها إسبانيا فقط — وكوريا الجنوبية مثال آخر بحدود واحدة." },
  { cat: "جغرافيا", d: 2, q: "وش أكبر صحراء بالعالم بشكل مطلق (بما فيها الباردة)؟", a: "أنتاركتيكا", alt: ["القطب الجنوبي", "Antarctica"], info: "الصحراء تُعرّف بقلة الهطول لا بالحرارة — والقطب الجنوبي أجف مكان بالأرض." },
  { cat: "جغرافيا", d: 2, q: "وش المحيط الأصغر مساحة؟", a: "المتجمد الشمالي", alt: ["القطبي الشمالي", "Arctic"], info: "ويتقلص جليده بمعدل متسارع، مما فتح ممرات ملاحية جديدة." },
  { cat: "جغرافيا", d: 2, q: "كم عدد الدول العربية الأعضاء بجامعة الدول العربية؟", a: "22", alt: ["اثنين وعشرين", "٢٢"], info: "تأسست 1945 بسبع دول ووصلت 22." },
  { cat: "جغرافيا", d: 1, q: "وش أكبر مدينة بالعالم من حيث عدد السكان؟", a: "طوكيو", alt: ["Tokyo"], info: "منطقتها الحضرية تضم أكثر من 37 مليون نسمة." },
  { cat: "جغرافيا", d: 2, q: "وش الجبل الأعلى بأفريقيا؟", a: "كليمنجارو", alt: ["كلمنجارو", "Kilimanjaro"], info: "5895 متر بتنزانيا، وهو بركان خامد وجليده يذوب بسرعة." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة اللي عندها أطول ساحل بالعالم؟", a: "كندا", alt: ["Canada"], info: "نحو 200 ألف كم بسبب تعرجاتها وجزرها الكثيرة." },
  { cat: "جغرافيا", d: 2, q: "وش أقل قارة سكانًا؟", a: "أنتاركتيكا", alt: ["القطب الجنوبي", "Antarctica"], info: "لا سكان دائمين — فقط باحثون بمحطات علمية." },
  { cat: "جغرافيا", d: 2, q: "كم منطقة زمنية تمر بروسيا؟", a: "11", alt: ["إحدى عشرة", "١١"], info: "من كالينينغراد لكامتشاتكا، لهذا رأس السنة يُحتفل به 11 مرة داخل الدولة." },
  { cat: "عام", d: 2, q: "كم عدد الحروف بالأبجدية الإنجليزية؟", a: "26", alt: ["ستة وعشرين", "٢٦"] },
  { cat: "عام", d: 2, q: "وش أكثر لغة يتحدثها الناس كلغة أم بالعالم؟", a: "الصينية", alt: ["الماندرين", "Mandarin"] },
  { cat: "عام", d: 2, q: "وش رمز عنصر الفضة الكيميائي؟", a: "Ag", alt: ["اي جي", "فضة"] },
  { cat: "عام", d: 2, q: "كم عدد قطع الدومينو بالطقم الكلاسيكي؟", a: "28", alt: ["ثمانية وعشرين", "٢٨"] },
  { cat: "عام", d: 2, q: "وش أكبر عضو داخلي بجسم الإنسان؟", a: "الكبد", alt: ["كبد", "Liver"] },
  { cat: "عام", d: 2, q: "كم عدد الألوان بعلم قوس قزح المستخدم عالميًا؟", a: "6", alt: ["ستة", "٦", "سبعة"] },
  { cat: "عام", d: 2, q: "وش الشهر الوحيد اللي يتغير عدد أيامه؟", a: "فبراير", alt: ["شباط", "February"] },
  { cat: "عام", d: 2, q: "كم عدد النقاط بحبة نرد واحدة (مجموع كل الأوجه)؟", a: "21", alt: ["واحد وعشرين", "٢١"] },
  { cat: "عام", d: 1, q: "وش المعدن الأكثر توصيلًا للكهرباء؟", a: "الفضة", alt: ["Silver", "فضة"], info: "أفضل موصل للكهرباء، لكن النحاس يُستخدم أكثر لرخصه." },
  { cat: "عام", d: 2, q: "كم عدد بحور الشعر العربي الخليلية؟", a: "16", alt: ["ستة عشر", "١٦", "15"] },
  { cat: "السعودية", d: 2, q: "وش أطول جسر بحري يربط السعودية بدولة خليجية؟", a: "جسر الملك فهد", alt: ["الملك فهد", "جسر البحرين"] },
  { cat: "السعودية", d: 3, q: "وش أول مدينة سعودية دخلتها الكهرباء؟", a: "جدة", alt: ["Jeddah"] },
  { cat: "السعودية", d: 3, q: "كم عدد أبواب المسجد الحرام تقريبًا؟", a: "100", alt: ["مئة", "٩٥", "نحو مئة"] },
  { cat: "السعودية", d: 2, q: "وش المشروع السعودي الترفيهي جنوب الرياض؟", a: "القدية", alt: ["Qiddiya"] },
  { cat: "السعودية", d: 2, q: "وش أعلى مبنى بالسعودية حاليًا؟", a: "برج المملكة", alt: ["مركز المملكة", "أبراج البيت"] },
  { cat: "السعودية", d: 3, q: "في أي سنة أُنشئت هيئة الترفيه السعودية؟", a: "2016", alt: ["٢٠١٦"] },
  { cat: "السعودية", d: 2, q: "وش الاسم القديم لمدينة الرياض؟", a: "حجر اليمامة", alt: ["حجر", "اليمامة"] },
  { cat: "السعودية", d: 2, q: "وش أكبر جامعة سعودية من حيث عدد الطلاب؟", a: "الملك سعود", alt: ["جامعة الملك سعود"] },
  { cat: "السعودية", d: 1, q: "وش المنطقة السعودية اللي فيها جبال طويق؟", a: "الرياض", alt: ["نجد", "وسط السعودية"] },
  { cat: "السعودية", d: 2, q: "وش أول قطار سريع بالسعودية يربط مكة والمدينة؟", a: "قطار الحرمين", alt: ["الحرمين السريع", "Haramain"] },
  { cat: "رياضة", d: 2, q: "كم لاعب بفريق البيسبول داخل الملعب؟", a: "9", alt: ["تسعة", "٩"] },
  { cat: "رياضة", d: 3, q: "كم يبلغ ارتفاع سلة كرة السلة بالمتر؟", a: "3.05", alt: ["ثلاثة", "3", "3.05 متر"] },
  { cat: "رياضة", d: 2, q: "وش الرياضة اللي فيها مصطلح Hole in One؟", a: "الجولف", alt: ["Golf", "قولف"] },
  { cat: "رياضة", d: 1, q: "كم شوط بمباراة الهوكي على الجليد؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "رياضة", d: 2, q: "من أكثر دولة فازت بكأس العالم لكرة القدم؟", a: "البرازيل", alt: ["Brazil"] },
  { cat: "رياضة", d: 2, q: "كم عدد الجولات القصوى بنزال الملاكمة للمحترفين على اللقب؟", a: "12", alt: ["اثنا عشر", "١٢"] },
  { cat: "رياضة", d: 2, q: "وش أقدم بطولة تنس كبرى بالعالم؟", a: "ويمبلدون", alt: ["Wimbledon"], info: "بدأت 1877، وما زالت الوحيدة التي تُلعب على العشب بين البطولات الأربع." },
  { cat: "رياضة", d: 3, q: "كم مسافة سباق الفورمولا 1 كحد أدنى تقريبًا (بالكيلومتر)؟", a: "305", alt: ["300", "نحو 305"] },
  { cat: "رياضة", d: 2, q: "وش الدولة اللي استضافت أول أولمبياد حديث 1896؟", a: "اليونان", alt: ["Greece", "أثينا"] },
  { cat: "رياضة", d: 1, q: "كم لاعب بفريق كرة اليد داخل الملعب؟", a: "7", alt: ["سبعة", "٧"] },
  { cat: "تقنية", d: 2, q: "وش أول متصفح ويب رسومي انتشر بشكل واسع؟", a: "موزاييك", alt: ["Mosaic", "نتسكيب"] },
  { cat: "تقنية", d: 2, q: "وش تعني SSD مقابل HDD من ناحية الأجزاء المتحركة؟", a: "ما فيه أجزاء متحركة", alt: ["بدون أجزاء متحركة", "ما فيها حركة"] },
  { cat: "تقنية", d: 2, q: "كم عدد الأرقام بعنوان MAC بالنظام السداسي عشري؟", a: "12", alt: ["اثنا عشر", "١٢"] },
  { cat: "تقنية", d: 2, q: "وش نظام التشغيل مفتوح المصدر اللي طوّره لينوس تورفالدس؟", a: "لينكس", alt: ["Linux"], info: "طوّره تورفالدس كمشروع شخصي 1991، واليوم يشغّل أغلب خوادم العالم وأندرويد." },
  { cat: "تقنية", d: 3, q: "وش المنفذ الافتراضي لبروتوكول HTTPS؟", a: "443", alt: ["٤٤٣"] },
  { cat: "تقنية", d: 2, q: "وش يعني اختصار URL؟", a: "محدد موقع الموارد", alt: ["Uniform Resource Locator", "عنوان الموقع"] },
  { cat: "تقنية", d: 2, q: "من أسس شركة مايكروسوفت مع بول ألن؟", a: "بيل غيتس", alt: ["بيل جيتس", "Bill Gates"], info: "أسسها 1975، وصفقة نظام DOS مع IBM هي التي صنعت الإمبراطورية." },
  { cat: "تقنية", d: 2, q: "وش أول هاتف ذكي بشاشة لمس بدون لوحة مفاتيح غيّر السوق؟", a: "آيفون", alt: ["iPhone", "الآيفون"] },
  { cat: "تقنية", d: 2, q: "وش نوع التشفير اللي يستخدم مفتاحين عام وخاص؟", a: "غير متماثل", alt: ["Asymmetric", "المفتاح العام"] },
  { cat: "تقنية", d: 3, q: "كم بايت بالكيلوبايت بالنظام الثنائي؟", a: "1024", alt: ["١٠٢٤"], info: "لأن الحاسوب يعد بالنظام الثنائي: 2 أس 10 = 1024، مو 1000." },
  { cat: "منطق وألغاز", d: 3, q: "عندك 3 مفاتيح كهرباء برا وغرفة فيها 3 لمبات، تدخل مرة وحدة بس — كيف تعرف؟", a: "تحس حرارة اللمبة", alt: ["بالحرارة", "تشغل وحدة وتطفيها وتحس"] },
  { cat: "منطق وألغاز", d: 3, q: "لو قلت لك: الجملة التالية صحيحة. الجملة السابقة خاطئة — وش هذي؟", a: "مفارقة", alt: ["تناقض", "paradox", "مغالطة منطقية"] },
  { cat: "منطق وألغاز", d: 3, q: "عمر أحمد نصف عمر أخوه، ولما كان أحمد 6 كان أخوه 12 — اليوم أحمد 40، كم عمر أخوه؟", a: "46", alt: ["ستة وأربعين", "٤٦"] },
  { cat: "منطق وألغاز", d: 2, q: "وش الرقم اللي إذا قسمته على نصفه وأضفت 8 يعطيك 10؟", a: "أي رقم", alt: ["كل الأرقام", "أي عدد", "الكل"] },
  { cat: "منطق وألغاز", d: 2, q: "بسباق وسبقت اللي بالمركز الثاني — بأي مركز صرت؟", a: "الثاني", alt: ["2", "الثاني مو الأول"] },
  { cat: "منطق وألغاز", d: 3, q: "معك 12 كرة وحدة مختلفة الوزن وميزان كفتين — كم وزنة كحد أدنى؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "منطق وألغاز", d: 2, q: "المتسلسلة: 1، 11، 21، 1211، 111221 — وش القاعدة؟", a: "وصف الرقم السابق", alt: ["تقرأ الي قبله", "العد والقول", "look and say"] },
  { cat: "منطق وألغاز", d: 2, q: "كم مثلث بشكل يتكون من مثلث كبير مقسوم لأربعة مثلثات صغيرة؟", a: "5", alt: ["خمسة", "٥"] },
  { cat: "منطق وألغاز", d: 1, q: "صندوق فيه 3 جوارب سود و3 بيض بالظلام — كم جورب تسحب لتضمن زوج متطابق؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "منطق وألغاز", d: 3, q: "لو كل الورود تذبل وبعض الأشياء اللي تذبل جميلة — هل بالضرورة بعض الورود جميلة؟", a: "لا", alt: ["لأ", "مو بالضرورة", "no"] },
  { cat: "دليلين", d: 1, q: "دليل ١: رمزه Fe. دليل ٢: أكثر عنصر بكتلة الأرض. وش هو؟", a: "الحديد", alt: ["حديد", "Iron"] },
  { cat: "دليلين", d: 2, q: "دليل ١: أطول حيوان بري. دليل ٢: لسانه أزرق بطول نص متر. مين؟", a: "الزرافة", alt: ["زرافة"] },
  { cat: "دليلين", d: 2, q: "دليل ١: مدينة سعودية على البحر. دليل ٢: بوابة الحرمين ومنها يدخل الحجاج. وين؟", a: "جدة", alt: ["Jeddah"] },
  { cat: "دليلين", d: 3, q: "دليل ١: تنبأ فيه مندليف قبل اكتشافه. دليل ٢: رمزه Ge. وش هو؟", a: "الجرمانيوم", alt: ["جرمانيوم", "Germanium"] },
  { cat: "دليلين", d: 2, q: "دليل ١: عالم إيطالي. دليل ٢: حوكم لأنه قال إن الأرض تدور. مين؟", a: "غاليليو", alt: ["جاليليو", "Galileo"] },
  { cat: "دليلين", d: 3, q: "دليل ١: أكبر قمر بالمجموعة الشمسية. دليل ٢: يتبع المشتري. مين؟", a: "غانيميد", alt: ["جانيميد", "Ganymede"] },
  { cat: "دليلين", d: 2, q: "دليل ١: ما فيه أجزاء متحركة. دليل ٢: أسرع من الهارد التقليدي. وش هو؟", a: "SSD", alt: ["اس اس دي", "القرص الصلب الصلب"] },
  { cat: "دليلين", d: 2, q: "دليل ١: يُقاس بالباسكال. دليل ٢: ينخفض كل ما ارتفعت. وش هو؟", a: "الضغط الجوي", alt: ["الضغط", "الضغط الهوائي"] },
  { cat: "دليلين", d: 2, q: "دليل ١: أُطلق 1990. دليل ٢: صوّر أعمق صور للكون قبل جيمس ويب. وش هو؟", a: "هابل", alt: ["Hubble", "تلسكوب هابل"] },
  { cat: "دليلين", d: 2, q: "دليل ١: عاصمة على نهرين. دليل ٢: بناها المنصور دائرية. وين؟", a: "بغداد", alt: ["Baghdad"] },
  { cat: "الأغرب", d: 1, q: "مين الغريب: الألماس، الجرافيت، الفحم، الحديد؟", a: "الحديد", alt: ["Iron"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: القاهرة، الرياض، بيروت، أنقرة — من ناحية اللغة الرسمية؟", a: "أنقرة", alt: ["Ankara", "تركيا"] },
  { cat: "الأغرب", d: 3, q: "مين الغريب: الأورطي، الوريد الأجوف، الشريان الرئوي، الوريد الرئوي — من ناحية الأكسجين؟", a: "الوريد الرئوي", alt: ["الوريد الرئوي لأنه مؤكسج"] },
  { cat: "الأغرب", d: 3, q: "مين الغريب: الهيليوم، الهيدروجين، النيتروجين، الأرغون — من ناحية الخمول؟", a: "النيتروجين", alt: ["الهيدروجين", "نيتروجين"] },
  { cat: "الأغرب", d: 1, q: "مين الغريب: زحل، المشتري، أورانوس، المريخ؟", a: "المريخ", alt: ["Mars"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: ويمبلدون، رولان غاروس، الأوبن الأمريكي، الدوري الإنجليزي؟", a: "الدوري الإنجليزي", alt: ["البريميرليق", "Premier League"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: نوبل، بوليتزر، أوسكار، غرامي — من ناحية المجال؟", a: "نوبل", alt: ["Nobel"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: بايثون، جافا، سي بلس بلس، لينكس؟", a: "لينكس", alt: ["Linux"] },
  { cat: "الأغرب", d: 3, q: "مين الغريب: التمثيل الضوئي، التنفس الخلوي، التخمر، التبخر؟", a: "التبخر", alt: ["evaporation"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: الأحساء، البتراء، الحِجر، الدرعية — من ناحية الدولة؟", a: "البتراء", alt: ["Petra", "الأردن"] },
  { cat: "الرابط المشترك", d: 3, q: "الحديد والنيكل — وش يكوّنانه بمركز الأرض؟", a: "اللب", alt: ["النواة", "لب الأرض", "Core"] },
  { cat: "الرابط المشترك", d: 3, q: "واط وأمبير وفولت — وش يجمعهم؟", a: "الكهرباء", alt: ["وحدات كهربائية", "الكهربائية"] },
  { cat: "الرابط المشترك", d: 3, q: "1969 و1972 و1986 — وش الكارثة/الحدث الفضائي المشترك؟", a: "رحلات فضائية", alt: ["أحداث فضاء", "محطات الفضاء"] },
  { cat: "الرابط المشترك", d: 3, q: "الأحساء وجدة التاريخية والحِجر والدرعية — وش يجمعهم؟", a: "تراث عالمي", alt: ["اليونسكو", "مواقع اليونسكو"] },
  { cat: "الرابط المشترك", d: 3, q: "الأمازون والنيل واليانغتسي والميسيسيبي — وش الترتيب اللي يجمعهم؟", a: "أطول الأنهار", alt: ["أنهار", "أطول أنهار العالم"] },
  { cat: "الرابط المشترك", d: 3, q: "غاما وبيتا وألفا — وش يجمعهم؟", a: "إشعاع نووي", alt: ["أنواع الإشعاع", "الإشعاع"] },
  { cat: "الرابط المشترك", d: 3, q: "الغلوتين والكابسيسين والكافيين — وش يجمعهم؟", a: "مركبات بالطعام", alt: ["مواد كيميائية بالأكل", "مركبات غذائية"] },
  { cat: "الرابط المشترك", d: 3, q: "شرودنغر وهايزنبرغ وبور — وش المجال اللي يجمعهم؟", a: "ميكانيكا الكم", alt: ["الكم", "فيزياء الكم"] },
  { cat: "الرابط المشترك", d: 3, q: "هرمز وباب المندب والبوسفور — وش يجمعهم؟", a: "مضائق", alt: ["ممرات مائية", "مضائق استراتيجية"] },
  { cat: "الرابط المشترك", d: 3, q: "القادسية واليرموك ونهاوند — وش يجمعهم؟", a: "فتوحات إسلامية", alt: ["معارك الفتح", "معارك المسلمين"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: اختراع الورق ولا اختراع البارود؟", a: "الورق", alt: ["paper"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: تأسيس بغداد ولا فتح الأندلس؟", a: "فتح الأندلس", alt: ["الأندلس"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما صدر أول: ويندوز 95 ولا أول موقع ويب؟", a: "أول موقع ويب", alt: ["الويب", "الموقع"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: الديناصورات ولا حشرة الصرصور؟", a: "الصرصور", alt: ["الصراصير"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما اكتُشف أول: نبتون ولا بلوتو؟", a: "نبتون", alt: ["Neptune"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "أيهما تأسس أول: أرامكو ولا شركة سابك؟", a: "أرامكو", alt: ["Aramco"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما وقع أول: الثورة الفرنسية ولا استقلال أمريكا؟", a: "استقلال أمريكا", alt: ["أمريكا", "الاستقلال الأمريكي"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: الأهرامات ولا ستونهنج؟", a: "ستونهنج", alt: ["Stonehenge"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما اختُرع أول: التلغراف ولا الهاتف؟", a: "التلغراف", alt: ["Telegraph"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "مين ولد أول: ابن سينا ولا ابن الهيثم؟", a: "ابن الهيثم", alt: ["الحسن بن الهيثم"] },
  { cat: "إيموجي", d: 3, q: "خمّن العنصر: 💎⚫✏️ (نفس الذرة أشكال مختلفة)", a: "الكربون", alt: ["Carbon", "كربون"] },
  { cat: "إيموجي", d: 3, q: "خمّن المفهوم: 🧬🔬👶", a: "الوراثة", alt: ["الجينات", "DNA"] },
  { cat: "إيموجي", d: 3, q: "خمّن الظاهرة: 🌧️💧☁️♻️", a: "دورة الماء", alt: ["دورة المياه"] },
  { cat: "إيموجي", d: 2, q: "خمّن الدولة: 🐼🏯🥢🧱", a: "الصين", alt: ["China"] },
  { cat: "إيموجي", d: 1, q: "خمّن المكان: 🕋🕌🇸🇦", a: "مكة", alt: ["الحرم", "Mecca"] },
  { cat: "إيموجي", d: 3, q: "خمّن العلم: ⚗️🧪⚛️", a: "الكيمياء", alt: ["Chemistry"] },
  { cat: "إيموجي", d: 3, q: "خمّن المصطلح: 💰📈📉🐂🐻", a: "البورصة", alt: ["سوق الأسهم", "الأسهم"] },
  { cat: "إيموجي", d: 1, q: "خمّن الجهاز: 🔭🌌🛰️", a: "التلسكوب", alt: ["المرقاب", "Telescope"] },
  { cat: "إيموجي", d: 3, q: "خمّن المصطلح: 🧠🤖💭", a: "الذكاء الاصطناعي", alt: ["AI"] },
  { cat: "إيموجي", d: 2, q: "خمّن الحدث: ⚽🏆🌍🇶🇦", a: "كأس العالم", alt: ["مونديال قطر", "كأس العالم 2022"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح بيضة القبان؟", a: "المرجّح", alt: ["الفيصل", "اللي يرجح الكفة"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "كمّل: من جدّ…؟", a: "وجد" },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى: يبني قصورًا بالهواء؟", a: "أوهام", alt: ["أحلام مستحيلة", "خيال"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح نقطة اللاعودة؟", a: "ما فيه رجعة", alt: ["لا رجعة", "تجاوز الحد"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "كمّل بيت المتنبي: وإذا كانت النفوس كبارًا…؟", a: "تعبت في مرادها الأجسام", alt: ["تعبت في مرادها الاجسام"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى: ضرب عصفورين بحجر واحد؟", a: "فايدتين بعمل واحد", alt: ["هدفين بضربة", "إنجازين"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح خيط رفيع؟", a: "فرق بسيط", alt: ["حد فاصل دقيق", "فاصل دقيق"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "كمّل: رب ضارة…؟", a: "نافعة" },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى: يمشي على قشر بيض؟", a: "يتعامل بحذر شديد", alt: ["حذر", "بحذر"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "كمّل المثل: إذا كان الكلام من فضة فالسكوت…؟", a: "من ذهب", alt: ["ذهب"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش المادة اللي تخثر الحليب لصنع الجبن؟", a: "المنفحة", alt: ["الأنفحة", "Rennet"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش الفرق بين الشوكولاتة الداكنة والبيضاء — البيضاء ما فيها؟", a: "مسحوق الكاكاو", alt: ["الكاكاو", "صلبات الكاكاو"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش أكثر بهار مغشوش بالعالم بسبب سعره؟", a: "الزعفران", alt: ["زعفران"] },
  { cat: "طعام ومطبخ", d: 3, q: "عند أي درجة مئوية يغلي الماء على قمة إفرست تقريبًا؟", a: "70", alt: ["سبعين", "٦٨", "نحو 70"] },
  { cat: "طعام ومطبخ", d: 1, q: "وش المشروب اللي يمر بتخمير ثم تحميص ثم طحن؟", a: "القهوة", alt: ["البن"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش الحمض اللي يعطي الليمون حموضته؟", a: "الستريك", alt: ["حمض الستريك", "Citric"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش نوع الطبخ اللي يستخدم الفراغ ودرجة حرارة دقيقة بحمام مائي؟", a: "سو فيد", alt: ["Sous Vide", "سوفيد"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش الأرز الأكثر لزوجة والمستخدم بالسوشي؟", a: "القصير الحبة", alt: ["الياباني", "short grain"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش المادة اللي تجعل الفلفل الأسود لاذعًا (غير الكابسيسين)؟", a: "البيبيرين", alt: ["Piperine", "بيبيرين"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش أقدم مشروب كحولي معروف تاريخيًا صُنع من العسل؟", a: "الميد", alt: ["Mead", "نبيذ العسل"] },
  { cat: "حيوانات", d: 1, q: "كم معدة للبقرة؟", a: "4", alt: ["أربع", "٤", "أربعة"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان اللي يقدر يعيش سنة كاملة بدون أكل؟", a: "التمساح", alt: ["الثعبان", "الأفعى"] },
  { cat: "حيوانات", d: 2, q: "وش الحشرة الأكثر فتكًا بالإنسان تاريخيًا؟", a: "البعوض", alt: ["البعوضة", "Mosquito"] },
  { cat: "حيوانات", d: 3, q: "وش الحيوان الوحيد اللي يورّث لبنه وهو يبيض؟", a: "خلد الماء", alt: ["البلاتيبوس", "Platypus"] },
  { cat: "حيوانات", d: 1, q: "كم قلب للحبار؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "حيوانات", d: 2, q: "وش أطول فترة حمل بمملكة الحيوان؟", a: "الفيل", alt: ["فيل", "Elephant"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان اللي ما ينام أبدًا بشكل كامل — نص دماغه بس؟", a: "الدلفين", alt: ["دلفين", "Dolphin"] },
  { cat: "حيوانات", d: 3, q: "وش أصغر طائر بالعالم؟", a: "الطنان", alt: ["طائر الطنان النحلي", "Hummingbird"] },
  { cat: "حيوانات", d: 2, q: "وش المخلوق اللي نجا من كل الانقراضات الخمسة الكبرى؟", a: "القرش", alt: ["أسماك القرش", "العقرب"] },
  { cat: "حيوانات", d: 3, q: "وش الحيوان الملقب مهندس الأنهار لأنه يبني السدود؟", a: "القندس", alt: ["البيفر", "Beaver"] },
  { cat: "سيارات", d: 3, q: "وش القطعة اللي توزع الشرارة على البواجي بالمحركات القديمة؟", a: "الديستربيوتر", alt: ["الموزع", "Distributor"] },
  { cat: "سيارات", d: 2, q: "وش الفرق الأساسي بين الديزل والبنزين بالإشعال؟", a: "الديزل بالضغط", alt: ["بالضغط", "ضغط بدون شرارة"] },
  { cat: "سيارات", d: 3, q: "وش يقيسه رقم السيتان بالديزل؟", a: "سرعة الاشتعال", alt: ["جودة الاشتعال", "قابلية الاشتعال"] },
  { cat: "سيارات", d: 2, q: "وش نظام يوزع عزم الدوران على الأربع عجلات؟", a: "الدفع الرباعي", alt: ["4WD", "AWD"] },
  { cat: "سيارات", d: 3, q: "وش القطعة اللي تحافظ على درجة حرارة المحرك بفتح وقفل مجرى التبريد؟", a: "الثرموستات", alt: ["الثرموستيت", "Thermostat"] },
  { cat: "سيارات", d: 3, q: "وش أول شركة استخدمت حزام الأمان ثلاثي النقاط وتنازلت عن براءته؟", a: "فولفو", alt: ["Volvo"] },
  { cat: "سيارات", d: 2, q: "وش يعني رقم مثل 225/45R17 على الإطار — الـ17 وش تعني؟", a: "قطر الجنط", alt: ["حجم الرنق", "بوصة الجنط"] },
  { cat: "سيارات", d: 2, q: "وش الوقود اللي تستخدمه سيارات الهيدروجين ووش ناتج عادمها؟", a: "ماء", alt: ["الماء", "بخار ماء"] },
  { cat: "سيارات", d: 2, q: "وش أسرع سيارة إنتاج بالعالم من حيث السرعة القصوى المسجلة؟", a: "بوغاتي", alt: ["Bugatti", "شيرون", "SSC"] },
  { cat: "سيارات", d: 2, q: "وش وظيفة الديفرنشال بالسيارة؟", a: "يسمح للعجلات بسرعات مختلفة", alt: ["فرق السرعة بالمنعطفات", "توزيع العزم"] },
  { cat: "اختراعات", d: 3, q: "من اخترع المحرك البخاري وطوّره ليشغّل المصانع؟", a: "جيمس واط", alt: ["واط", "James Watt"], info: "لم يخترعه من الصفر لكنه ضاعف كفاءته، ووحدة القدرة «واط» سُميت باسمه." },
  { cat: "اختراعات", d: 3, q: "وش أول مادة اصطناعية للتخدير استُخدمت بالجراحة؟", a: "الإيثر", alt: ["ايثر", "Ether"], info: "قبله كانت الجراحة تُجرى والمريض واعٍ — كان الطبيب الأسرع هو الأفضل." },
  { cat: "اختراعات", d: 3, q: "من اخترع الترمومتر الزئبقي ومقياسه المعروف؟", a: "فهرنهايت", alt: ["Fahrenheit"], info: "مقياسه جعل تجمد الماء 32 وغليانه 212، وما زال مستخدمًا بأمريكا." },
  { cat: "اختراعات", d: 3, q: "وش الاختراع اللي جاء من فشل صنع لاصق قوي ونتج عنه ورق ملاحظات؟", a: "بوست إت", alt: ["Post-it", "الورق اللاصق"], info: "باحث بـ3M أراد لاصقًا قويًا فطلع ضعيفًا، وزميله استخدمه كعلامات بكتاب الترانيم." },
  { cat: "اختراعات", d: 3, q: "من طوّر أول لقاح لشلل الأطفال ورفض تسجيل براءته؟", a: "سالك", alt: ["جوناس سالك", "Salk"], info: "لما سُئل عن براءة الاختراع قال: «هل تُسجَّل براءة على الشمس؟»" },
  { cat: "اختراعات", d: 2, q: "وش أول جهاز اتصال لاسلكي عبر الأطلسي ومن وراه؟", a: "ماركوني", alt: ["Marconi", "الراديو"], info: "1901 — وأثبت أن الموجات تتبع انحناء الأرض عكس ما توقع العلماء." },
  { cat: "اختراعات", d: 3, q: "وش المادة اللي اكتشفها رونتغن بالصدفة وثوّرت الطب؟", a: "الأشعة السينية", alt: ["أشعة إكس", "X-ray"], info: "سماها «إكس» لأنه لم يعرف طبيعتها، وأول صورة كانت ليد زوجته." },
  { cat: "اختراعات", d: 2, q: "من اخترع الترانزستور اللي بُني عليه كل جهاز إلكتروني اليوم؟", a: "مختبرات بل", alt: ["Bell Labs", "بل لابز"], info: "1947 — استبدل الصمامات الزجاجية الضخمة وفتح الباب لكل الإلكترونيات." },
  { cat: "اختراعات", d: 3, q: "وش أول محرك بحث بالإنترنت قبل غوغل بسنين؟", a: "آركي", alt: ["Archie", "ياهو"], info: "1990 — كان يفهرس أسماء الملفات فقط لا محتواها." },
  { cat: "اختراعات", d: 3, q: "من صمّم أول حاسوب ميكانيكي قابل للبرمجة نظريًا بالقرن 19؟", a: "تشارلز بابيج", alt: ["بابيج", "Babbage"], info: "«المحرك التحليلي» لم يُبنَ بحياته، لكن تصميمه سبق عصره بقرن." },
  { cat: "بوسات إلدن رينق", d: 1, q: "بوس تقاتله بسطح مائي والانعكاس جزء من جو المعركة، وهو ساحرة القمر بإلدن رينق؟", a: "Rennala", alt: ["رينالا"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من إلدن رينق — بوس يستدعي نسخ منه كل ما نزلت صحته، ثنائي بأزياء بيضاء وسوداء؟", a: "Godskin Duo", alt: ["غودسكن", "جودسكين"] },
  { cat: "بوسات السولز", d: 3, q: "بوس بلودبورن اللي يمثل عنكبوت بعقل بشري ويحرس سرًا كونيًا؟", a: "Rom", alt: ["روم", "Rom the Vacuous Spider"] },
  { cat: "بوسات السولز", d: 3, q: "بوس دارك سولز 3 اللي هو تنين رمادي متآكل بمقبرة، وضربة واحدة منه تقتل؟", a: "Ancient Wyvern", alt: ["الوايفرن", "التنين القديم"] },
  { cat: "بوسات السولز", d: 3, q: "بوس سيكيرو اللي يقاتلك بمرحلتين بالثلج ويستخدم رمح طويل، حارس القصر؟", a: "Owl", alt: ["البومة", "الأب", "Great Shinobi Owl"] },
  { cat: "بوسات السولز", d: 3, q: "بوس Lies of P اللي هو أخوين ميكانيكيين بمطارق عملاقة بالمصنع؟", a: "Black Rabbit Brotherhood", alt: ["الأرنب الأسود", "الإخوة"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "بوس إلدن رينق اللي يمثل تنين البرق العملاق بجبل جيلمير؟", a: "Fortissax", alt: ["فورتساكس"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من نايترين — البوس اللي يمثل الوحش الأول والأصعب بالليلة الثالثة؟", a: "Nightlord", alt: ["نايتلورد", "اللورد"] },
  { cat: "بوسات السولز", d: 3, q: "بوس دارك سولز الأول اللي معركته بالظلام الدامس وتحتاج مصباح؟", a: "Four Kings", alt: ["الملوك الأربعة", "الاربع ملوك"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "بوس إلدن رينق DLC اللي يمثل أسدًا يرقص بعنصرين متغيرين؟", a: "Dancing Lion", alt: ["الأسد الراقص"] },
  { cat: "لور السولز", d: 3, q: "وش اسم الحلقة اللي انكسرت وبدأ التشظي بإلدن رينق؟", a: "إلدن رينق", alt: ["Elden Ring", "الحلقة"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — مين الشخصية اللي تدير أكاديمية رايا لوكاريا قبل سقوطها؟", a: "Rennala", alt: ["رينالا"] },
  { cat: "لور السولز", d: 3, q: "وش اسم الوباء اللي يصيب من يستخدم الإحياء كثير بسيكيرو؟", a: "Dragonrot", alt: ["تعفن التنين", "دراقون روت"] },
  { cat: "لور السولز", d: 3, q: "من بلودبورن — وش الطائفة اللي تعارض الكنيسة وتصطاد الوحوش بيارنام؟", a: "Hunters", alt: ["الصيادون", "صيادو الوحوش"] },
  { cat: "لور السولز", d: 3, q: "من صانع الدمى اللي بنى البطل بـLies of P؟", a: "Geppetto", alt: ["جيبيتو"] },
  { cat: "لور السولز", d: 3, q: "وش المدينة اللي تبدأ فيها دارك سولز الأولى كسجن للاموات؟", a: "Undead Asylum", alt: ["ملجأ الأموات", "الأسايلوم"] },
  { cat: "لور السولز", d: 3, q: "وش اسم النار اللي إذا انطفت يبدأ عصر الظلام بدارك سولز؟", a: "النار الأولى", alt: ["First Flame"] },
  { cat: "لور السولز", d: 3, q: "مين الشخصية اللي تبيعك الترقيات بإلدن رينق بالكنيسة الأولى؟", a: "Twin Maiden Husks", alt: ["العرائس التوأم", "التوأم"] },
  { cat: "لور السولز", d: 3, q: "وش المخلوق اللي يعتبر أصل كل التنانين بدارك سولز؟", a: "التنانين القديمة", alt: ["Everlasting Dragons", "التنانين الخالدة"] },
  { cat: "لور السولز", d: 3, q: "وش القارة أو الأرض اللي تدور فيها أحداث إلدن رينق؟", a: "Lands Between", alt: ["الأراضي البينية", "الأراضي الوسطى"] },
  { cat: "أوفرواتش", d: 2, q: "وش تصنيف البطل Reinhardt؟", a: "دبابة", alt: ["Tank", "تانك"] },
  { cat: "أوفرواتش", d: 3, q: "من البطل اللي يقدر يقلّد قدرات الأعداء أو يعيد إحياء الفريق؟", a: "Mercy", alt: ["ميرسي"] },
  { cat: "أوفرواتش", d: 2, q: "وش الخريطة اللي تدور بمصر وفيها معبد أنوبيس؟", a: "Temple of Anubis", alt: ["معبد أنوبيس", "انوبيس"] },
  { cat: "أوفرواتش", d: 2, q: "من البطل الروسي بدرع مسقط وسلاح ثقيل؟", a: "Zarya", alt: ["زاريا"] },
  { cat: "أوفرواتش", d: 2, q: "وش اسم قدرة D.Va النهائية اللي تفجّر الميكا؟", a: "Self-Destruct", alt: ["التدمير الذاتي", "الانفجار"] },
  { cat: "أوفرواتش", d: 2, q: "من البطل الأومنيك اللي يقدر يقلّد بطل آخر بالكامل؟", a: "Echo", alt: ["إيكو", "ايكو"] },
  { cat: "أوفرواتش", d: 2, q: "وش الدولة اللي منها البطل Ana؟", a: "مصر", alt: ["Egypt"] },
  { cat: "أوفرواتش", d: 2, q: "من الشخصية اللي هي بنت آنا وتقاتل بالصواريخ؟", a: "Pharah", alt: ["فرح", "فارا"] },
  { cat: "أوفرواتش", d: 1, q: "وش عدد الأدوار الأساسية بأوفرواتش 2؟", a: "3", alt: ["ثلاثة", "٣", "دبابة دعم هجوم"] },
  { cat: "أوفرواتش", d: 2, q: "من البطل اللي سلاحه قوس ويطلق سهم التنين؟", a: "Hanzo", alt: ["هانزو"] },
  { cat: "ألعاب فيديو", d: 1, q: "وش أول لعبة باعت أكثر من 100 مليون نسخة؟", a: "Minecraft", alt: ["ماينكرافت", "تتريس"] },
  { cat: "ألعاب فيديو", d: 1, q: "وش الشركة اللي اشترت Bethesda و Activision؟", a: "مايكروسوفت", alt: ["Microsoft"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش أول لعبة استخدمت الحفظ التلقائي بشكل واسع؟", a: "Zelda", alt: ["زيلدا", "The Legend of Zelda"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش اسم أول جهاز منزلي للألعاب بالتاريخ؟", a: "Magnavox Odyssey", alt: ["ماغنافوكس", "أوديسي"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش اللعبة اللي بدأت نوع الباتل رويال قبل ببجي وفورتنايت؟", a: "DayZ", alt: ["ديزي", "H1Z1", "آرما"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش المحرك اللي بُنيت عليه Valorant و Fortnite؟", a: "Unreal Engine", alt: ["أنريل"] },
  { cat: "ألعاب فيديو", d: 3, q: "وش أغلى لعبة تطويرًا بالتاريخ تقريبًا؟", a: "GTA 6", alt: ["GTA V", "ستار سيتيزن"] },
  { cat: "ألعاب فيديو", d: 1, q: "وش الشركة اليابانية اللي أنقذت صناعة الألعاب بعد انهيار 1983؟", a: "نينتندو", alt: ["Nintendo"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش أول لعبة إلكترونية دخلت الفضاء فعليًا؟", a: "تتريس", alt: ["Tetris"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش أشهر رمز غش بتاريخ الألعاب (فوق فوق تحت تحت...)؟", a: "كونامي كود", alt: ["Konami Code", "شفرة كونامي"] },
  { cat: "أزياء الشخصيات", d: 2, q: "معطف أسود طويل ونظارة شمسية دائرية وحركة بطيئة بالهواء؟", a: "Neo", alt: ["نيو", "The Matrix"] },
  { cat: "أزياء الشخصيات", d: 3, q: "درع ذهبي وخوذة بأجنحة وسلاح رمح، بوس إلدن رينق يمثل الفارس الأول؟", a: "Godfrey", alt: ["غودفري"] },
  { cat: "أزياء الشخصيات", d: 2, q: "عباءة بنية وقلنسوة وسيف ضوئي أزرق؟", a: "Jedi", alt: ["جيداي", "Obi-Wan"] },
  { cat: "أزياء الشخصيات", d: 1, q: "بدلة حمراء وقناع أسود بعينين بيضاوين وشبكة على القماش؟", a: "Spider-Man", alt: ["سبايدرمان", "الرجل العنكبوت"] },
  { cat: "أزياء الشخصيات", d: 2, q: "قناع أبيض بابتسامة وبدلة حمراء، من مسلسل سرقة إسباني؟", a: "دالي", alt: ["Dali", "قناع دالي"] },
  { cat: "أزياء الشخصيات", d: 3, q: "معطف جلد أسود وشعر أسود مصفف للخلف وبدلة رسمية، قاتل مأجور أصلع؟", a: "Agent 47", alt: ["هيتمان", "Hitman"] },
  { cat: "أزياء الشخصيات", d: 2, q: "درع فولاذي كامل وقلب أزرق مضيء بالصدر؟", a: "Iron Man", alt: ["آيرون مان", "الرجل الحديدي"] },
  { cat: "أزياء الشخصيات", d: 2, q: "شعر أبيض طويل ودرع أسود وسيفان، صياد وحوش بعيون قطة؟", a: "Geralt", alt: ["غيرالت"] },
  { cat: "أزياء الشخصيات", d: 2, q: "قبعة قش وسترة حمراء وندبة تحت العين اليسرى؟", a: "Luffy", alt: ["لوفي"] },
  { cat: "أزياء الشخصيات", d: 1, q: "بدلة سوداء بأذنين مدببتين وعباءة طويلة ورمز خفاش؟", a: "Batman", alt: ["باتمان"] },
  { cat: "وين المكان؟", d: 2, q: "مدينة مبنية على 118 جزيرة موصولة بـ400 جسر؟", a: "البندقية", alt: ["فينيسيا", "Venice"] },
  { cat: "وين المكان؟", d: 2, q: "أكبر غابة مطيرة بالعالم وتُسمى رئة الأرض؟", a: "الأمازون", alt: ["Amazon", "غابات الأمازون"] },
  { cat: "وين المكان؟", d: 2, q: "منطقة بالمحيط الهادئ فيها 75% من براكين العالم؟", a: "حزام النار", alt: ["Ring of Fire", "حلقة النار"] },
  { cat: "وين المكان؟", d: 2, q: "مدينة سعودية تراثية بالطين شمال الرياض ومهد الدولة الأولى؟", a: "الدرعية", alt: ["درعية"] },
  { cat: "وين المكان؟", d: 2, q: "أكبر مسطح ملحي بالعالم ببوليفيا يعكس السما كمرآة؟", a: "سالار دي أويوني", alt: ["أويوني", "Uyuni"] },
  { cat: "وين المكان؟", d: 2, q: "صحراء منغوليا والصين الشهيرة؟", a: "غوبي", alt: ["Gobi", "جوبي"] },
  { cat: "وين المكان؟", d: 2, q: "جزيرة يابانية جنوبية معروفة بشواطئها وثقافتها المختلفة؟", a: "أوكيناوا", alt: ["Okinawa"] },
  { cat: "وين المكان؟", d: 2, q: "مدينة تركية قديمة تحت الأرض كانت تأوي آلاف الناس؟", a: "كابادوكيا", alt: ["Cappadocia", "ديرينكويو"] },
  { cat: "وين المكان؟", d: 2, q: "أكبر شعاب مرجانية بالعالم شمال شرق أستراليا؟", a: "الحاجز المرجاني العظيم", alt: ["Great Barrier Reef", "الحاجز المرجاني"] },
  { cat: "وين المكان؟", d: 3, q: "واحة سعودية بالربع الخالي أو منطقة نجران الأثرية المعروفة بالرسوم الصخرية؟", a: "نجران", alt: ["Najran"] },
  { cat: "مين قالها؟", d: 2, q: "من قال: العلم نور والجهل ظلام — منسوبة لأي إمام؟", a: "الشافعي", alt: ["الإمام الشافعي"] },
  { cat: "مين قالها؟", d: 1, q: "من قال: أنا لست فاشلاً، لقد وجدت 10 آلاف طريقة لا تعمل؟", a: "إديسون", alt: ["توماس إديسون", "Edison"] },
  { cat: "مين قالها؟", d: 1, q: "من قال: كن التغيير الذي تريد أن تراه بالعالم؟", a: "غاندي", alt: ["Gandhi", "غاندى"] },
  { cat: "مين قالها؟", d: 2, q: "من قال: الحرب استمرار للسياسة بوسائل أخرى؟", a: "كلاوزفيتز", alt: ["Clausewitz", "كلاوزويتز"] },
  { cat: "مين قالها؟", d: 1, q: "من قال: تخيّل أنك تعيش كل يوم كأنه آخر يوم — بخطاب ستانفورد؟", a: "ستيف جوبز", alt: ["جوبز", "Steve Jobs"] },
  { cat: "مين قالها؟", d: 2, q: "شاعر جاهلي قال: قفا نبكِ من ذكرى حبيب ومنزل؟", a: "امرؤ القيس", alt: ["امرؤ القيس", "امرء القيس"] },
  { cat: "مين قالها؟", d: 2, q: "من قال: كل شيء يجب أن يُبسّط قدر الإمكان، لكن ليس أكثر؟", a: "أينشتاين", alt: ["اينشتاين"] },
  { cat: "مين قالها؟", d: 2, q: "خليفة قال: متى استعبدتم الناس وقد ولدتهم أمهاتهم أحرارًا؟", a: "عمر بن الخطاب", alt: ["عمر", "الفاروق"] },
  { cat: "مين قالها؟", d: 2, q: "من قال: العقل السليم بالجسم السليم — مصدرها روماني؟", a: "جوفينال", alt: ["Juvenal", "جوفنال"] },
  { cat: "مين قالها؟", d: 2, q: "من قال: أعرف نفسك — منقوشة على معبد دلفي وتُنسب لسقراط؟", a: "سقراط", alt: ["Socrates"] },
  { cat: "وش الغرض؟", d: 3, q: "جهاز يحوّل التيار المستمر لمتردد بأنظمة الطاقة الشمسية؟", a: "الإنفرتر", alt: ["العاكس", "Inverter"] },
  { cat: "وش الغرض؟", d: 3, q: "قطعة تمنع رجوع التيار وتحمي الدائرة، رمزها مثلث بخط؟", a: "الدايود", alt: ["Diode", "الثنائي"] },
  { cat: "وش الغرض؟", d: 3, q: "أداة تقيس زاوية الميل وتُستخدم بالبناء والمساحة؟", a: "الثيودوليت", alt: ["ثيودوليت", "Theodolite"] },
  { cat: "وش الغرض؟", d: 3, q: "جهاز طبي يصوّر الأنسجة الرخوة بمجال مغناطيسي بدون إشعاع؟", a: "الرنين المغناطيسي", alt: ["MRI", "رنين"] },
  { cat: "وش الغرض؟", d: 3, q: "أداة بالمختبر تفصل السوائل حسب كثافتها بالدوران السريع؟", a: "الطرد المركزي", alt: ["السنترفيوج", "Centrifuge"] },
  { cat: "وش الغرض؟", d: 3, q: "قطعة بالسيارة تحوّل الحركة الدورانية لخطية بنظام التوجيه؟", a: "الرك", alt: ["Rack and Pinion", "المسنن"] },
  { cat: "وش الغرض؟", d: 3, q: "جهاز يقيس شدة الحرارة عن بعد بالأشعة تحت الحمراء؟", a: "الكاميرا الحرارية", alt: ["Thermal Camera", "المقياس الحراري"] },
  { cat: "وش الغرض؟", d: 2, q: "جهاز بالطائرة يسجّل كل بيانات الرحلة ولونه برتقالي مو أسود؟", a: "الصندوق الأسود", alt: ["Black Box", "مسجل الرحلة"] },
  { cat: "وش الغرض؟", d: 3, q: "قطعة تخفض جهد الكهرباء العالي قبل ما يوصل بيتك؟", a: "المحول", alt: ["الترانس", "Transformer"] },
  { cat: "وش الغرض؟", d: 1, q: "أداة تحدد اتجاه الشمال بالاعتماد على المجال المغناطيسي؟", a: "البوصلة", alt: ["Compass"] },
  { cat: "لو كنت مكانك", d: 3, q: "علقت بسيارة تغرق بالماء — تفتح الباب ولا تكسر النافذة؟", a: "تكسر النافذة", alt: ["النافذة", "الشباك"] },
  { cat: "لو كنت مكانك", d: 3, q: "ضاع منك الطريق بالصحراء ليلاً — كيف تحدد الشمال؟", a: "النجم القطبي", alt: ["نجم الشمال", "بولاريس"] },
  { cat: "لو كنت مكانك", d: 2, q: "جاك زلزال وأنت داخل مبنى — تركض برا ولا تختبي تحت طاولة؟", a: "تحت طاولة", alt: ["تختبي", "تحت الطاولة"] },
  { cat: "لو كنت مكانك", d: 2, q: "انقطع الحبل وأنت بمصعد ساقط — القفز باللحظة الأخيرة ينفع؟", a: "لا", alt: ["لأ", "ما ينفع", "no"] },
  { cat: "لو كنت مكانك", d: 2, q: "لدغك عقرب — تمص السم ولا تنظف وتروح المستشفى؟", a: "تنظف وتروح المستشفى", alt: ["المستشفى", "تنظيف وإسعاف"] },
  { cat: "لو كنت مكانك", d: 3, q: "جسمك يرتجف من البرد الشديد — الرجفة معناها جسمك يسوي وش؟", a: "يولّد حرارة", alt: ["ينتج حرارة", "يدفي نفسه"] },
  { cat: "لو كنت مكانك", d: 3, q: "صار حريق بغرفة وفيها دخان كثيف — تمشي واقف ولا تزحف؟", a: "تزحف", alt: ["زاحف", "على الأرض"] },
  { cat: "لو كنت مكانك", d: 3, q: "انسكب حمض على يدك — تمسحه بقماش ولا تغسله بماء غزير؟", a: "ماء غزير", alt: ["الماء", "تغسل بماء"] },
  { cat: "لو كنت مكانك", d: 3, q: "شخص أُغمي عليه ويتنفس — تحطه على أي وضعية؟", a: "وضعية الإفاقة", alt: ["على جنبه", "الجانب", "وضع الاستشفاء"] },
  { cat: "لو كنت مكانك", d: 3, q: "سيارتك بدأت تفقد الفرامل بنزول — وش أفضل تصرف؟", a: "تنزل التروس", alt: ["فرملة المحرك", "تنزيل الغيار", "الفرامل اليدوية تدريجياً"] },
  { cat: "شكل ورسم", d: 3, q: "مستطيل طوله 12 وعرضه 5 — كم قطره؟", a: "13", alt: ["ثلاثة عشر", "١٣"] },
  { cat: "شكل ورسم", d: 3, q: "دائرة قطرها 10 — كم مساحتها تقريبًا؟", a: "78.5", alt: ["78", "٧٨"] },
  { cat: "شكل ورسم", d: 3, q: "مكعب حرفه 3 — كم حجمه؟", a: "27", alt: ["سبعة وعشرين", "٢٧"] },
  { cat: "شكل ورسم", d: 3, q: "كم عدد أوجه الهرم الرباعي بالكامل مع القاعدة؟", a: "5", alt: ["خمسة", "٥"] },
  { cat: "شكل ورسم", d: 3, q: "مجموع الزوايا الداخلية للمضلع الخماسي كم درجة؟", a: "540", alt: ["خمسمئة وأربعين", "٥٤٠"] },
  { cat: "شكل ورسم", d: 2, q: "مثلث متساوي الأضلاع — كم قياس كل زاوية؟", a: "60", alt: ["ستين", "٦٠"] },
  { cat: "شكل ورسم", d: 2, q: "شكل له 8 أضلاع — وش اسمه؟", a: "مثمن", alt: ["ثماني", "Octagon"] },
  { cat: "شكل ورسم", d: 1, q: "كم عدد حروف مستقيمة تحتاج لرسم مربع بأقل عدد خطوط؟", a: "4", alt: ["أربعة", "٤"] },
  { cat: "شكل ورسم", d: 3, q: "شبه منحرف قاعدتاه 6 و10 وارتفاعه 4 — كم مساحته؟", a: "32", alt: ["اثنين وثلاثين", "٣٢"] },
  { cat: "شكل ورسم", d: 1, q: "كم محور تماثل بالمربع؟", a: "4", alt: ["أربعة", "٤"] },
  { cat: "إيموجي", d: 3, q: "خمّن الظاهرة: 🌊🌕⬆️⬇️", a: "المد والجزر", alt: ["المد", "الجزر"] },
  { cat: "إيموجي", d: 3, q: "خمّن العملية: 🌱☀️💨➡️🍬", a: "التمثيل الضوئي", alt: ["البناء الضوئي", "photosynthesis"] },
  { cat: "إيموجي", d: 3, q: "خمّن المصطلح: ♟️👑🕰️ = ضغط الوقت بالشطرنج؟", a: "زوغزوانغ", alt: ["ضغط الوقت", "Zeitnot", "زايتنوت"] },
  { cat: "إيموجي", d: 2, q: "خمّن المثل: 🐦✋ > 🔟🌳", a: "عصفور باليد ولا عشرة على الشجرة", alt: ["عصفور باليد"] },
  { cat: "إيموجي", d: 2, q: "خمّن الدولة: 🌋🧊♨️🇮🇸", a: "آيسلندا", alt: ["ايسلندا", "Iceland"] },
  { cat: "إيموجي", d: 1, q: "خمّن المفهوم الفيزيائي: 🍎⬇️🌍", a: "الجاذبية", alt: ["الجذب", "Gravity"] },
  { cat: "إيموجي", d: 3, q: "خمّن الحدث التاريخي: 🧱🇩🇪1989💥", a: "سقوط جدار برلين", alt: ["جدار برلين"] },
  { cat: "إيموجي", d: 3, q: "خمّن المصطلح الطبي: 🫀⚡📈", a: "تسارع القلب", alt: ["خفقان", "تسرع القلب", "Tachycardia"] },
  { cat: "إيموجي", d: 3, q: "خمّن الظاهرة الفلكية: 🌑➡️☀️🌍🌑", a: "الكسوف", alt: ["كسوف الشمس"] },
  { cat: "إيموجي", d: 3, q: "خمّن المصطلح: ♻️🌡️📈🏭", a: "الاحتباس الحراري", alt: ["الاحترار العالمي", "الاحتباس"] },
  { cat: "لو كنت مكانك", d: 2, q: "اشتعل زيت بالمقلاة — تغطيها ولا ترمي عليها ماء؟", a: "تغطيها", alt: ["الغطاء", "أغطيها"] },
  { cat: "لو كنت مكانك", d: 2, q: "غصّ شخص بالأكل وهو يسعل بقوة — تضربه على ظهره ولا تخليه يسعل؟", a: "تخليه يسعل", alt: ["يسعل", "اتركه يسعل"] },
  { cat: "لو كنت مكانك", d: 2, q: "جبت كيبلات لبطارية ميتة — أي قطب توصله أول؟", a: "الموجب", alt: ["الأحمر", "+", "موجب"] },
  { cat: "لو كنت مكانك", d: 1, q: "شفت البرق وتبي تعرف كم يبعد بالكيلومتر — تعد الثواني للرعد وتقسم على كم؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "لو كنت مكانك", d: 1, q: "انقطعت الكهرباء — كم ساعة يصمد أكل الثلاجة إذا ما فتحت بابها؟", a: "4", alt: ["أربع", "اربع ساعات"] },
  { cat: "لو كنت مكانك", d: 3, q: "سيارتك بدأت تتزحلق على ماء (Hydroplaning) — تفرمل ولا ترفع رجلك عن البنزين؟", a: "ترفع رجلك", alt: ["ترفع عن البنزين", "لا تفرمل", "تسيب البنزين"] },
  { cat: "لو كنت مكانك", d: 3, q: "شخص يغرق قدامك وما تعرف تسبح — وش الصح؟", a: "ترمي له شي يطفو", alt: ["ترمي طوق", "لا تنزل", "ترمي حبل"] },
  { cat: "لو كنت مكانك", d: 3, q: "لدغتك أفعى بيدك — ترفع اليد فوق مستوى القلب ولا تحتها؟", a: "تحتها", alt: ["تحت مستوى القلب", "تنزلها"] },
  { cat: "لو كنت مكانك", d: 2, q: "جسمك انحرق حرق بسيط — تحط عليه ثلج ولا ماء جاري فاتر؟", a: "ماء جاري", alt: ["ماء فاتر", "ماء جاري فاتر"] },
  { cat: "أزياء الشخصيات", d: 2, q: "عباءة بيضاء بغطاء راس مدبب وشفرة مخفية بالساعد وحزام أحمر؟", a: "Assassin", alt: ["Altair", "اساسن كريد", "الأساسن"] },
  { cat: "أزياء الشخصيات", d: 2, q: "بدلة زرقاء وشعر أشقر منتصب وسيف أعرض من صاحبه؟", a: "Cloud", alt: ["كلاود", "Cloud Strife"] },
  { cat: "أزياء الشخصيات", d: 2, q: "معطف رمادي طويل وقبعة ثلاثية الأطراف وسلاح يتحول لمنشار؟", a: "The Hunter", alt: ["الصياد", "صياد بلودبورن"] },
  { cat: "أزياء الشخصيات", d: 2, q: "قبعة ساحرة زرقاء وأربع أذرع وجسد دمية بعين قمرية؟", a: "Ranni", alt: ["رانّي", "راني"] },
  { cat: "أزياء الشخصيات", d: 3, q: "بدلة برتقالية HEV ونظارة وعتلة حديد، وما ينطق كلمة طول اللعبة؟", a: "Gordon Freeman", alt: ["غوردون فريمان"] },
  { cat: "مين قالها؟", d: 2, q: "شاعر عربي قال: الخيل والليل والبيداء تعرفني؟", a: "المتنبي", alt: ["ابو الطيب المتنبي"] },
  { cat: "مين قالها؟", d: 3, q: "مين قال: أعطني حرية التعبير وخذ ما شئت — منسوبة لفيلسوف تنوير فرنسي؟", a: "فولتير", alt: ["Voltaire"] },
  { cat: "مين قالها؟", d: 2, q: "عالم فيزياء قال: كل شي نسبي — وصاحب أشهر معادلة بالتاريخ؟", a: "أينشتاين", alt: ["اينشتاين"] },
  { cat: "وين المكان؟", d: 2, q: "مدينة إيطالية شوارعها ماء وتغرق تدريجيًا كل سنة؟", a: "البندقية", alt: ["فينيسيا", "Venice"] },
  { cat: "وين المكان؟", d: 2, q: "أكبر واحة نخيل بالعالم وتقع شرق السعودية؟", a: "الأحساء", alt: ["الاحساء"] },
  { cat: "وين المكان؟", d: 3, q: "العاصمة الأعلى ارتفاعًا عن سطح البحر بالعالم؟", a: "لاباز", alt: ["La Paz"] },
  { cat: "أوفرواتش", d: 2, q: "وش عدد الأبطال وقت إطلاق أوفرواتش الأولى 2016؟", a: "21", alt: ["واحد وعشرين"] },
  { cat: "أوفرواتش", d: 2, q: "وش الوضع اللي انحذف من أوفرواتش 2 وكان أساس اللعبة الأولى؟", a: "6v6", alt: ["ستة ضد ستة", "2-2-2"] },
  { cat: "أوفرواتش", d: 3, q: "من البطل الوحيد اللي يقدر يشفي نفسه وفريقه بنفس القدرة الصوتية؟", a: "Lucio", alt: ["لوسيو"] },
  { cat: "لور السولز", d: 3, q: "وش اسم عصر ما بعد انطفاء النار الأولى بدارك سولز؟", a: "عصر الظلام", alt: ["Age of Dark", "عصر الإنسان"] },
  { cat: "لور السولز", d: 3, q: "مين الشخصية اللي تحرق نفسها لتفتح لك طريق الشجرة بإلدن رينق؟", a: "Melina", alt: ["ميلينا"] },
  { cat: "لور السولز", d: 3, q: "وش اسم المادة النفيسة اللي يستخرجونها من الوحوش بـLies of P؟", a: "Ergo", alt: ["الإرغو", "ايرقو"] },
  { cat: "شكل ورسم", d: 3, q: "مثلث أضلاعه 5 و12 — كم الوتر إذا كان قائم الزاوية؟", a: "13", alt: ["ثلاثة عشر", "١٣"] },
  { cat: "شكل ورسم", d: 2, q: "دائرة نصف قطرها 7 — كم محيطها تقريبًا (باي=22/7)؟", a: "44", alt: ["أربعة وأربعين", "٤٤"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح برج عاجي؟", a: "انعزال عن الواقع", alt: ["العزلة", "بعيد عن الناس"] },
  { cat: "أمثال ومصطلحات", d: 2, q: "وش معنى: رمى الكرة بملعب غيره؟", a: "حوّل المسؤولية", alt: ["نقل المسؤولية", "تهرب"] },
  { cat: "فيزياء", d: 2, q: "جسم على سطح خشن يتحرك بسرعة ثابتة — وش محصلة القوى عليه؟", a: "صفر", alt: ["zero", "تساوي صفر"], info: "قانون نيوتن الأول: السرعة الثابتة تعني إن الاحتكاك يعادل قوة الدفع تمامًا." },
  { cat: "فيزياء", d: 2, q: "رفعت صندوق ومشيت فيه أفقيًا 10 أمتار — كم الشغل اللي بذلته ضد الجاذبية؟", a: "صفر", alt: ["zero", "لا شغل"], info: "الشغل = قوة × إزاحة باتجاه القوة. الجاذبية عمودية والحركة أفقية، فالزاوية 90 والشغل صفر." },
  { cat: "فيزياء", d: 3, q: "جسيم تنبأ فيه باولي عشان يفسر الطاقة الضايعة بتحلل بيتا، وما انكشف إلا بعد 26 سنة؟", a: "النيوترينو", alt: ["نيوترينو", "Neutrino"], info: "سمّاه فيرمي «النيوترينو» أي النيوتروني الصغير، وانكُشف تجريبيًا 1956." },
  { cat: "فيزياء", d: 2, q: "لو ضاعفت سرعة سيارة، طاقتها الحركية تتضاعف كم مرة؟", a: "أربع", alt: ["4", "اربع مرات", "أربعة"], info: "الطاقة الحركية = ½ك×ع². تربيع السرعة يعني أربعة أضعاف — ولهذا الحوادث بالسرعة العالية أفتك بكثير." },
  { cat: "فيزياء", d: 3, q: "وش القانون اللي يمنعك توصل الصفر المطلق بعدد خطوات محدود؟", a: "الثالث", alt: ["القانون الثالث", "الثالث للديناميكا الحرارية"], info: "القانون الثالث للديناميكا الحرارية — تقدر تقترب من -273.15 لكن ما توصلها أبدًا." },
  { cat: "فيزياء", d: 2, q: "مقاومتان 6 و 3 أوم على التوازي — كم المقاومة المكافئة؟", a: "2", alt: ["اثنين", "٢", "2 أوم"], info: "بالتوازي: 1/م = 1/6 + 1/3 = 1/2، فالمكافئة 2 أوم — أقل من أصغر مقاومة." },
  { cat: "فيزياء", d: 3, q: "وش وحدة قياس شدة الإضاءة بالنظام الدولي السبع الأساسية؟", a: "كانديلا", alt: ["Candela", "الشمعة"], info: "الكانديلا قريبة من ضوء شمعة واحدة، ومنها جاء اسمها." },
  { cat: "فيزياء", d: 3, q: "أس ثابت بلانك بوحدة جول·ثانية — 10 أس كم؟", a: "-34", alt: ["ناقص 34", "34-", "سالب 34"], info: "6.626×10⁻³⁴ — ثابت يحدد أصغر كمية طاقة ممكنة، وهو أساس ميكانيكا الكم." },
  { cat: "فيزياء", d: 3, q: "ظاهرة كهروضوئية: زودت شدة الضوء بس تردده تحت العتبة — كم إلكترون ينطلق؟", a: "صفر", alt: ["ولا واحد", "لا شيء", "zero"], info: "أينشتاين أخذ نوبل على تفسيرها: التردد هو اللي يحرر الإلكترون مو الشدة." },
  { cat: "فيزياء", d: 3, q: "وش الجسيم الحامل للقوة الكهرومغناطيسية؟", a: "الفوتون", alt: ["فوتون", "Photon"], info: "الفوتون بلا كتلة، ولهذا يسافر بسرعة الضوء." },
  { cat: "فيزياء", d: 3, q: "جسم كتلته تزيد كل ما اقترب من سرعة الضوء — وش اسم المعامل اللي يحسب هذا؟", a: "معامل لورنتز", alt: ["لورنتز", "Lorentz", "جاما"], info: "معامل لورنتز يقترب من اللانهاية عند سرعة الضوء — لهذا ما يقدر جسم له كتلة يوصلها." },
  { cat: "فيزياء", d: 3, q: "البندول: ضاعفت طوله أربع مرات — زمنه الدوري يتضاعف كم؟", a: "مرتين", alt: ["2", "ضعفين", "اثنين"], info: "الزمن الدوري يتناسب مع الجذر التربيعي للطول، وجذر 4 = 2." },
  { cat: "فيزياء", d: 2, q: "وش القوة الأضعف بين القوى الأساسية الأربع؟", a: "الجاذبية", alt: ["الجاذبيه", "Gravity"], info: "أضعف من الكهرومغناطيسية بـ 10³⁶ مرة — مغناطيس صغير يغلب جاذبية الأرض كلها." },
  { cat: "فيزياء", d: 3, q: "تجربة الشق المزدوج تثبت إن الإلكترون يتصرف كـ…؟", a: "موجة وجسيم", alt: ["موجة", "ازدواجية", "موجة وجسيم معًا"], info: "أشهر تجربة بالفيزياء: الإلكترون يصنع نمط تداخل كموجة، لكنه يُرصد كجسيم." },
  { cat: "فيزياء", d: 3, q: "وش يسمى الحد الأدنى للطاقة اللازمة لتحرير إلكترون من سطح المعدن؟", a: "دالة الشغل", alt: ["اقتران الشغل", "Work Function", "شغل الاقتران"], info: "دالة الشغل تختلف من معدن لمعدن، ومنها اختيار معادن معينة بالخلايا الشمسية." },
  { cat: "فيزياء", d: 3, q: "صوت سيارة إسعاف يرتفع تردده وهي جاية وينخفض وهي رايحة — أي عالم؟", a: "دوبلر", alt: ["Doppler", "دوبلير"], info: "نفس المبدأ يستخدمه الفلكيون لقياس ابتعاد المجرات عنا (الانزياح الأحمر)." },
  { cat: "فيزياء", d: 3, q: "أي نوع أشعة نووية توقفها ورقة عادية؟", a: "ألفا", alt: ["alpha", "الفا"], info: "ألفا نواة هيليوم ثقيلة فتُوقف بسهولة، لكنها خطيرة جدًا لو دخلت الجسم." },
  { cat: "فيزياء", d: 2, q: "وش يسمى تحول المادة من صلبة لغازية مباشرة بدون سيولة؟", a: "التسامي", alt: ["تسامي", "Sublimation"], info: "مثاله الثلج الجاف (ثاني أكسيد الكربون الصلب) واليود." },
  { cat: "علوم", d: 2, q: "العضية اللي لها DNA خاص فيها وتورث من الأم فقط؟", a: "الميتوكوندريا", alt: ["ميتوكندريا", "Mitochondria"], info: "يُعتقد إنها كانت بكتيريا مستقلة ابتلعتها خلية قديمة وتعايشتا — نظرية التعايش الداخلي." },
  { cat: "علوم", d: 3, q: "الإنزيم اللي يفك التفاف الحلزون المزدوج قبل النسخ؟", a: "الهيليكيز", alt: ["هيليكاز", "Helicase"], info: "يشتغل كسحّاب يفتح الشريطين ليسمح للبلمرة تنسخهما." },
  { cat: "علوم", d: 1, q: "وش الرقم الهيدروجيني للماء النقي عند 25 درجة؟", a: "7", alt: ["سبعة", "٧"], info: "7 يعني متعادل — تحته حمضي وفوقه قاعدي، والمقياس لوغاريتمي فكل درجة = 10 أضعاف." },
  { cat: "علوم", d: 2, q: "مرض نقص فيتامين C اللي كان يقتل البحارة زمان؟", a: "الإسقربوط", alt: ["اسقربوط", "Scurvy"], info: "قتل أكثر من مليوني بحّار، وحُلّ لما اكتشفوا إن الحمضيات تمنعه." },
  { cat: "علوم", d: 2, q: "وش العنصر اللي رمزه K؟", a: "البوتاسيوم", alt: ["بوتاسيوم", "Potassium"], info: "الرمز من اسمه اللاتيني Kalium. ينظّم نبض قلبك وانقباض عضلاتك." },
  { cat: "علوم", d: 3, q: "كم عدد جزيئات ATP الصافية من جزيء جلوكوز واحد بالتنفس الهوائي (التقدير الشائع)؟", a: "38", alt: ["36", "ثمانية وثلاثين", "٣٨"], info: "الرقم الدقيق يختلف بين 30 و38 حسب كفاءة النقل، والشائع بالمناهج 38." },
  { cat: "علوم", d: 3, q: "وش يسمى عدد أفوغادرو تقريبًا — 6.022 مضروبة في 10 أس كم؟", a: "23", alt: ["ثلاثة وعشرين", "٢٣"], info: "6.022×10²³ — عدد الجسيمات بالمول الواحد من أي مادة." },
  { cat: "علوم", d: 3, q: "العالم اللي رتّب الجدول الدوري وترك فراغات لعناصر ما انكشفت بعد؟", a: "مندليف", alt: ["Mendeleev", "مندلييف"], info: "تنبأ بخصائص عناصر لم تُكتشف بعد، ولما اكتُشفت طابقت تنبؤاته بدقة مذهلة." },
  { cat: "علوم", d: 3, q: "وش القاعدة النيتروجينية الموجودة بالـRNA بدل الثايمين؟", a: "اليوراسيل", alt: ["يوراسيل", "Uracil"], info: "اليوراسيل أرخص طاقيًا للخلية، والثايمين أثبت — لهذا الحمض النووي الدائم يستخدمه." },
  { cat: "علوم", d: 3, q: "وش الغاز النبيل الأكثر وفرة بالغلاف الجوي للأرض؟", a: "الأرغون", alt: ["ارجون", "Argon", "أرجون"], info: "نحو 1% من الهواء، ويُستخدم بلحام المعادن لأنه خامل ما يتفاعل." },
  { cat: "علوم", d: 3, q: "عملية انقسام تنتج خلايا بنصف عدد الكروموسومات — وش اسمها؟", a: "الانقسام المنصف", alt: ["الميوزس", "Meiosis", "الاختزالي"], info: "بها تتكوّن الحيوانات المنوية والبويضات، وهي سبب التنوع الوراثي." },
  { cat: "علوم", d: 2, q: "وش هرمون تنظيم السكر اللي يفرزه البنكرياس ويخفّض الجلوكوز؟", a: "الأنسولين", alt: ["انسولين", "Insulin"], info: "نقصه أو مقاومة الجسم له هو ما نسميه السكري." },
  { cat: "علوم", d: 3, q: "وش المستوى التصنيفي اللي يجي مباشرة فوق النوع؟", a: "الجنس", alt: ["Genus", "الجنس"], info: "الاسم العلمي لأي كائن يتكون من الجنس ثم النوع، مثل Homo sapiens." },
  { cat: "علوم", d: 2, q: "وش أثقل عنصر طبيعي موجود بالطبيعة؟", a: "اليورانيوم", alt: ["يورانيوم", "Uranium"], info: "رقمه الذري 92، وكل ما بعده يُصنَّع بالمختبرات." },
  { cat: "علوم", d: 3, q: "وش تسمى القدرة على تكوين روابط تساهمية أربع — خاصية جعلت الكربون أساس الحياة؟", a: "الرباعية", alt: ["رباعي التكافؤ", "التكافؤ الرباعي", "أربع روابط"], info: "بها يكوّن الكربون سلاسل وحلقات لا نهائية — أساس الكيمياء العضوية." },
  { cat: "فضاء", d: 2, q: "الكوكب الوحيد اللي يدور عكس اتجاه بقية الكواكب حول محوره؟", a: "الزهرة", alt: ["فينوس", "Venus"], info: "يومها أطول من سنتها: 243 يومًا أرضيًا للدوران حول نفسها مقابل 225 حول الشمس." },
  { cat: "فضاء", d: 3, q: "وش يسمى الحد اللي ما يقدر الضوء يهرب منه حول الثقب الأسود؟", a: "أفق الحدث", alt: ["افق الحدث", "Event Horizon"], info: "عنده تتساوى سرعة الهروب مع سرعة الضوء، وما بعده لا رجعة." },
  { cat: "فضاء", d: 2, q: "أقرب مجرة كبيرة لنا واللي بتصطدم فينا بعد مليارات السنين؟", a: "أندروميدا", alt: ["اندروميدا", "Andromeda"], info: "بتصطدم بمجرتنا بعد نحو 4 مليارات سنة، لكن النجوم لن تتصادم لتباعدها الهائل." },
  { cat: "فضاء", d: 3, q: "كم سنة ضوئية تقريبًا يبعد عنا أقرب نجم بعد الشمس؟", a: "4.2", alt: ["أربعة", "4", "اربع سنوات ضوئية", "4.24"], info: "بروكسيما سنتوري — لو سافرت بأسرع مركبة صنعناها لاحتجت آلاف السنين." },
  { cat: "فضاء", d: 3, q: "وش أكبر قمر بالمجموعة الشمسية — أكبر من عطارد نفسه؟", a: "غانيميد", alt: ["جانيميد", "Ganymede"], info: "قمر للمشتري، وله مجال مغناطيسي خاص به — الوحيد بين الأقمار." },
  { cat: "فضاء", d: 3, q: "قمر زحل اللي فيه بحيرات ميثان سائل وغلاف جوي كثيف؟", a: "تيتان", alt: ["Titan"], info: "الجسم الوحيد غير الأرض اللي على سطحه سوائل مستقرة." },
  { cat: "فضاء", d: 3, q: "وش يسمى الحد اللي تتفكك عنده الأجسام بفعل مد الجاذبية قرب كوكب؟", a: "حد روش", alt: ["روش", "Roche"], info: "حلقات زحل يُرجّح أنها بقايا قمر تفكك داخل هذا الحد." },
  { cat: "فضاء", d: 3, q: "وش الإشعاع اللي يعتبر أقوى دليل على الانفجار العظيم؟", a: "إشعاع الخلفية الكوني", alt: ["الخلفية الكونية", "CMB", "اشعاع الخلفية"], info: "حرارة متبقية من الكون المبكر، اكتُشفت بالصدفة 1964 كضجيج بهوائي." },
  { cat: "فضاء", d: 3, q: "كم بالمئة تقريبًا من الكون مادة عادية نشوفها؟", a: "5", alt: ["خمسة", "٥", "5%"], info: "الباقي 27% مادة مظلمة و68% طاقة مظلمة — لا نعرف ما هما." },
  { cat: "فضاء", d: 2, q: "المسبار الوحيد اللي خرج للفضاء بين النجمي وأُطلق 1977؟", a: "فوياجر 1", alt: ["Voyager 1", "فوييجر", "فوياجر"], info: "يحمل قرصًا ذهبيًا فيه أصوات وصور من الأرض لأي حضارة تجده." },
  { cat: "فضاء", d: 2, q: "البقعة الحمراء العظيمة على المشتري — وش هي؟", a: "عاصفة", alt: ["إعصار", "storm", "عاصفة عملاقة"], info: "إعصار أكبر من الأرض مستمر منذ 350 سنة على الأقل، وهو يتقلص تدريجيًا." },
  { cat: "فضاء", d: 3, q: "وش يسمى النجم النيوتروني اللي يدور بسرعة ويرسل نبضات منتظمة؟", a: "نجم نابض", alt: ["بلسار", "Pulsar", "النابض"], info: "دقته بالتوقيت تنافس الساعات الذرية، وملعقة من مادته تزن مليارات الأطنان." },
  { cat: "جسم الإنسان", d: 1, q: "كم فقرة عنقية عند الإنسان — ونفس العدد عند الزرافة؟", a: "7", alt: ["سبعة", "٧"], info: "الزرافة لها نفس العدد لكن كل فقرة بطول 25 سم — من أقوى أدلة التطور المشترك." },
  { cat: "جسم الإنسان", d: 2, q: "وش الغدة اللي تسمى سيدة الغدد لأنها تتحكم بالباقي؟", a: "النخامية", alt: ["الغدة النخامية", "Pituitary"], info: "بحجم حبة حمص أسفل الدماغ، وتتحكم بالنمو والتكاثر والغدة الدرقية." },
  { cat: "جسم الإنسان", d: 1, q: "كم حجرة بقلب الإنسان؟", a: "4", alt: ["أربع", "اربعة", "٤"], info: "أذينان يستقبلان الدم وبطينان يضخانه — والبطين الأيسر أقواهما." },
  { cat: "جسم الإنسان", d: 3, q: "وش الوعاء الوحيد اللي يحمل دم غير مؤكسج وهو شريان؟", a: "الشريان الرئوي", alt: ["الرئوي", "Pulmonary artery"], info: "لأن التسمية حسب الاتجاه: الشريان يخرج من القلب والوريد يدخل إليه." },
  { cat: "جسم الإنسان", d: 2, q: "كم عظمة بالكف الواحد (اليد كاملة من الرسغ)؟", a: "27", alt: ["سبعة وعشرين", "٢٧"], info: "أكثر من ربع عظام جسمك بيديك الاثنتين — وهذا سر براعة اليد البشرية." },
  { cat: "جسم الإنسان", d: 3, q: "وش الجزء من الدماغ المسؤول عن التوازن والتناسق الحركي؟", a: "المخيخ", alt: ["مخيخ", "Cerebellum"], info: "يحتوي أكثر من نصف خلايا دماغك العصبية رغم صغر حجمه." },
  { cat: "جسم الإنسان", d: 3, q: "العصب القحفي العاشر اللي يتحكم بنبض القلب والهضم — وش اسمه؟", a: "العصب الحائر", alt: ["الحائر", "المبهم", "Vagus"], info: "أطول عصب قحفي، ويربط الدماغ بالقلب والرئتين والمعدة — وتحفيزه يهدئ التوتر." },
  { cat: "جسم الإنسان", d: 2, q: "وش فصيلة الدم المعروفة بالمعطي العام؟", a: "O سالب", alt: ["او سالب", "O-", "صفر سالب"], info: "ما فيه مستضدات A ولا B ولا Rh، فما يهاجمه جهاز مناعة أحد." },
  { cat: "جسم الإنسان", d: 3, q: "الوحدة الوظيفية بالكلى اللي تفلتر الدم — وش اسمها؟", a: "النفرون", alt: ["نفرون", "Nephron"], info: "بكل كلية نحو مليون نفرون، وتفلتر دمك كله نحو 40 مرة باليوم." },
  { cat: "جسم الإنسان", d: 3, q: "وش الهرمون اللي يفرزه الجسم بالظلام وينظم النوم؟", a: "الميلاتونين", alt: ["ميلاتونين", "Melatonin"], info: "الضوء الأزرق من الشاشات يوقف إفرازه — ولهذا الجوال قبل النوم يضر." },
  { cat: "جسم الإنسان", d: 3, q: "كم زوج ضلوع بالقفص الصدري؟", a: "12", alt: ["اثنا عشر", "١٢", "اثنعشر"], info: "12 زوجًا، آخر زوجين «عائمان» ما يتصلان بعظم القص." },
  { cat: "جسم الإنسان", d: 2, q: "وش أطول عصب بجسم الإنسان؟", a: "العصب الوركي", alt: ["الوركي", "النسا", "Sciatic"], info: "يمتد من أسفل الظهر للقدم، والتهابه هو «عرق النسا»." },
  { cat: "تاريخ", d: 3, q: "معاهدة أنهت حرب الثلاثين عامًا وأسست مفهوم الدولة القومية الحديثة؟", a: "وستفاليا", alt: ["Westphalia", "ويستفاليا", "صلح وستفاليا"], info: "1648 — أسست مبدأ السيادة: كل دولة تحكم أرضها بلا تدخل خارجي." },
  { cat: "تاريخ", d: 2, q: "وش الاسم اللي عُرفت فيه القسطنطينية بعد الفتح العثماني؟", a: "إسلامبول", alt: ["اسطنبول", "Istanbul", "اسلامبول"], info: "بقيت تُعرف بالاسمين حتى غُيّر رسميًا لإسطنبول سنة 1930." },
  { cat: "تاريخ", d: 2, q: "من الخليفة الأموي اللي نُقلت بعهده العاصمة لدمشق؟", a: "معاوية", alt: ["معاوية بن أبي سفيان"], info: "نقلها من الكوفة، وبها بدأ عهد الدولة الأموية سنة 661." },
  { cat: "تاريخ", d: 3, q: "كم سنة استمرت حرب المئة عام فعليًا؟", a: "116", alt: ["مئة وستة عشر", "١١٦"], info: "من 1337 إلى 1453 — الاسم تقريبي، وفيها ظهرت جان دارك." },
  { cat: "تاريخ", d: 3, q: "المعركة اللي فتحت العراق للمسلمين بعد سقوط الفرس؟", a: "القادسية", alt: ["قادسية"], info: "سنة 636 بقيادة سعد بن أبي وقاص، وأنهت السيطرة الساسانية." },
  { cat: "تاريخ", d: 3, q: "الخليفة العباسي اللي أسس بيت الحكمة وازدهرت بعهده الترجمة؟", a: "المأمون", alt: ["مامون"], info: "أعظم مركز ترجمة بالتاريخ — نُقلت فيه علوم اليونان والفرس والهند للعربية." },
  { cat: "تاريخ", d: 3, q: "وش الوثيقة الإنجليزية 1215 اللي حدّت سلطة الملك وصارت أصل الدساتير؟", a: "الماجنا كارتا", alt: ["ماجنا كارتا", "Magna Carta"], info: "أول وثيقة تُخضع الملك للقانون، وأساس فكرة الدستور الحديث." },
  { cat: "تاريخ", d: 2, q: "من القائد المسلم اللي هزم المغول بعين جالوت؟", a: "قطز", alt: ["سيف الدين قطز"], info: "1260 — أول هزيمة كبرى للمغول أوقفت زحفهم غربًا نهائيًا." },
  { cat: "تاريخ", d: 2, q: "الحدث اللي أشعل الحرب العالمية الأولى مباشرة — اغتيال من؟", a: "فرانز فرديناند", alt: ["الأرشيدوق فرانز", "فرديناند", "Franz Ferdinand"], info: "اغتيل بسراييفو 1914، فتسلسلت التحالفات حتى اشتعلت أوروبا كلها." },
  { cat: "تاريخ", d: 3, q: "في أي سنة تأسست الدولة السعودية الأولى؟", a: "1744", alt: ["١٧٤٤"], info: "بالدرعية باتفاق الإمام محمد بن سعود والشيخ محمد بن عبدالوهاب." },
  { cat: "تاريخ", d: 2, q: "وش الحضارة اللي اخترعت الكتابة المسمارية؟", a: "السومرية", alt: ["سومر", "السومريون"], info: "بجنوب العراق نحو 3200 ق.م — أقدم نظام كتابة معروف." },
  { cat: "تاريخ", d: 3, q: "من آخر خلفاء بني أمية بالأندلس اللي سقطت دولته 1031؟", a: "هشام الثالث", alt: ["هشام", "هشام III"] },
  { cat: "تاريخ", d: 3, q: "الاتفاقية السرية 1916 اللي قسمت المشرق العربي بين بريطانيا وفرنسا؟", a: "سايكس بيكو", alt: ["سايكس-بيكو", "Sykes Picot"], info: "رسمت حدود الدول العربية الحالية، وانكشفت لما نشرها السوفييت بعد الثورة." },
  { cat: "جغرافيا", d: 3, q: "وش الدولة الوحيدة اللي تقع بقارتين ولها عاصمتان معترف فيهما؟", a: "تركيا", alt: ["Turkey"], info: "إسطنبول بأوروبا وآسيا، والعاصمة الرسمية أنقرة." },
  { cat: "جغرافيا", d: 2, q: "وش أطول نهر بآسيا؟", a: "اليانغتسي", alt: ["يانغتسي", "Yangtze", "اليانجتسي"], info: "6300 كم بالصين، وعليه سد الممرات الثلاثة أكبر محطة كهرومائية بالعالم." },
  { cat: "جغرافيا", d: 2, q: "وش البحيرة اللي تقع أخفض من سطح البحر وما فيها كائنات حية؟", a: "البحر الميت", alt: ["بحر ميت", "Dead Sea"], info: "ملوحته عشرة أضعاف البحر العادي، ولهذا تطفو فوقه بلا سباحة." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة اللي فيها أكبر عدد جزر بالعالم (أكثر من 200 ألف)؟", a: "السويد", alt: ["Sweden"], info: "أكثر من 260 ألف جزيرة، أغلبها صخور صغيرة بأرخبيل بحر البلطيق." },
  { cat: "جغرافيا", d: 2, q: "وش المضيق اللي يمر فيه ثلث نفط العالم المنقول بحرًا؟", a: "هرمز", alt: ["مضيق هرمز", "Hormuz"], info: "بين عُمان وإيران، وأضيق نقطة فيه نحو 33 كم فقط." },
  { cat: "جغرافيا", d: 3, q: "وش العاصمة الأعلى ارتفاعًا بالعالم؟", a: "لاباز", alt: ["La Paz", "لا باز"], info: "3600 متر ببوليفيا — الهواء فيها رقيق لدرجة تصعّب على الزوار التنفس." },
  { cat: "جغرافيا", d: 2, q: "كم دولة تشترك بحدود مع البرازيل؟", a: "10", alt: ["عشرة", "١٠"], info: "تحد كل دول أمريكا الجنوبية عدا تشيلي والإكوادور." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة الإفريقية الوحيدة اللي ما استُعمرت أبدًا؟", a: "إثيوبيا", alt: ["اثيوبيا", "الحبشة", "Ethiopia"], info: "هزمت إيطاليا بمعركة عدوة 1896، ولها تقويمها وأبجديتها الخاصة." },
  { cat: "جغرافيا", d: 2, q: "وش أكبر شبه جزيرة بالعالم؟", a: "شبه الجزيرة العربية", alt: ["الجزيرة العربية", "العربية"], info: "3.2 مليون كم² — أكبر من نصف أوروبا." },
  { cat: "جغرافيا", d: 2, q: "وش خط العرض اللي يقسم الأرض لنصفين متساويين؟", a: "خط الاستواء", alt: ["الاستواء", "Equator"], info: "طوله نحو 40 ألف كم، وعنده تكون الجاذبية أضعف قليلًا بسبب دوران الأرض." },
  { cat: "جغرافيا", d: 2, q: "وش الدولة اللي عاصمتها الرسمية ثلاث مدن مختلفة؟", a: "جنوب أفريقيا", alt: ["جنوب افريقيا", "South Africa"], info: "بريتوريا تنفيذية، وكيب تاون تشريعية، وبلومفونتين قضائية." },
  { cat: "جغرافيا", d: 2, q: "وش أكبر جزيرة بالعالم (بدون احتساب أستراليا كقارة)؟", a: "غرينلاند", alt: ["جرينلاند", "Greenland"], info: "تتبع الدنمارك، و80% منها مغطى بالجليد." },
  { cat: "عام", d: 1, q: "كم لون أساسي بالطباعة (نظام CMYK)؟", a: "4", alt: ["أربعة", "اربع", "٤"] },
  { cat: "عام", d: 2, q: "وش أقدم جامعة ما زالت تعمل بالعالم؟", a: "القرويين", alt: ["جامعة القرويين", "Al Quaraouiyine"], info: "أسستها فاطمة الفهرية بفاس سنة 859، ومعترف بها بغينيس كأقدم جامعة عاملة." },
  { cat: "عام", d: 2, q: "كم مربع على رقعة الشطرنج؟", a: "64", alt: ["أربعة وستين", "٦٤"] },
  { cat: "عام", d: 2, q: "وش المعدن السائل بدرجة حرارة الغرفة؟", a: "الزئبق", alt: ["زئبق", "Mercury"], info: "المعدن الوحيد السائل بدرجة حرارة الغرفة، وسام جدًا بالاستنشاق." },
  { cat: "عام", d: 1, q: "كم عدد الأوتار بالكمان؟", a: "4", alt: ["أربعة", "٤"] },
  { cat: "عام", d: 3, q: "وش أغلى معدن بالعالم من حيث السعر للغرام (أغلى من الذهب)؟", a: "الروديوم", alt: ["روديوم", "Rhodium"], info: "أندر من الذهب بكثير، ويُستخدم بالمحولات الحفازة بالسيارات." },
  { cat: "عام", d: 2, q: "وش يسمى الخوف من الأماكن المغلقة؟", a: "رهاب الأماكن المغلقة", alt: ["كلاستروفوبيا", "Claustrophobia"] },
  { cat: "عام", d: 3, q: "كم يستغرق ضوء القمر ليصل الأرض تقريبًا (بالثواني)؟", a: "1.3", alt: ["ثانية", "ثانية وثلث", "1.28", "1"] },
  { cat: "عام", d: 2, q: "وش أطول كلمة ممكن تكتبها بصف الكيبورد العلوي بالإنجليزي؟", a: "typewriter", alt: ["تايبرايتر"] },
  { cat: "عام", d: 2, q: "وش العملة اللي كانت الأعلى قيمة مقابل الدولار تاريخيًا؟", a: "الدينار الكويتي", alt: ["الكويتي", "دينار كويتي"] },
  { cat: "عام", d: 3, q: "كم عدد عضلات الوجه المستخدمة بالابتسامة تقريبًا (التقدير الشائع)؟", a: "17", alt: ["سبعة عشر", "١٧"] },
  { cat: "السعودية", d: 1, q: "كم عدد الآبار الأولى اللي انطلق منها النفط بالدمام — البئر رقم كم كان الاكتشاف؟", a: "7", alt: ["سبعة", "بئر رقم 7", "الدمام 7"] },
  { cat: "السعودية", d: 2, q: "وش أول مصفاة نفط بُنيت بالسعودية؟", a: "رأس تنورة", alt: ["راس تنورة"] },
  { cat: "السعودية", d: 3, q: "في أي سنة تأسست شركة أرامكو (كاسوك سابقًا)؟", a: "1933", alt: ["١٩٣٣"] },
  { cat: "السعودية", d: 2, q: "وش أكبر واحة نخيل بالعالم وتقع بالسعودية؟", a: "الأحساء", alt: ["الاحساء", "واحة الأحساء"] },
  { cat: "السعودية", d: 2, q: "وش الميناء السعودي الأكبر على البحر الأحمر؟", a: "جدة الإسلامي", alt: ["ميناء جدة", "جدة"] },
  { cat: "السعودية", d: 3, q: "في أي سنة أُعلنت رؤية السعودية 2030؟", a: "2016", alt: ["٢٠١٦"] },
  { cat: "السعودية", d: 3, q: "وش أول جامعة سعودية تأسست وبأي سنة عُرفت باسم جامعة الملك سعود؟", a: "1957", alt: ["١٩٥٧"] },
  { cat: "السعودية", d: 3, q: "وش المدينة السعودية اللي فيها أطول جسر بري يربطها بدولة خليجية؟", a: "الخبر", alt: ["جسر الملك فهد", "الخبر"] },
  { cat: "السعودية", d: 3, q: "كم عدد سكان السعودية تقريبًا بالمليون (أحدث تقدير قريب)؟", a: "32", alt: ["اثنين وثلاثين", "32 مليون", "33"] },
  { cat: "السعودية", d: 3, q: "وش أعلى قمة بالسعودية وكم ارتفاعها تقريبًا بالمتر؟", a: "3000", alt: ["ثلاثة آلاف", "2985", "٣٠٠٠"] },
  { cat: "رياضة", d: 2, q: "كم لاعب بفريق الرجبي الواحد بالنسخة التقليدية؟", a: "15", alt: ["خمسة عشر", "١٥"] },
  { cat: "رياضة", d: 1, q: "وش الرياضة اللي فيها مصطلح Love يعني صفر؟", a: "التنس", alt: ["تنس", "Tennis"] },
  { cat: "رياضة", d: 3, q: "كم ثانية أقصى مدة يحتفظ فيها الفريق بالكرة قبل التسديد بكرة السلة (NBA)؟", a: "24", alt: ["أربعة وعشرين", "٢٤"] },
  { cat: "رياضة", d: 2, q: "من اللاعب الوحيد اللي فاز بكأس العالم ثلاث مرات؟", a: "بيليه", alt: ["Pele", "بيلي"], info: "فاز 1958 و1962 و1970 — لا أحد كرر الإنجاز حتى اليوم." },
  { cat: "رياضة", d: 2, q: "كم مرة فازت ريال مدريد بدوري أبطال أوروبا حتى 2024؟", a: "15", alt: ["خمسة عشر", "١٥"] },
  { cat: "رياضة", d: 3, q: "وش المسافة الرسمية للماراثون بالأمتار؟", a: "42195", alt: ["42.195", "42 كم و195 متر", "42195 متر"], info: "المسافة حُددت 1908 لتناسب مسار سباق لندن أمام شرفة العائلة المالكة." },
  { cat: "رياضة", d: 3, q: "في أي سنة أُقيمت أول بطولة كأس عالم لكرة القدم؟", a: "1930", alt: ["١٩٣٠"] },
  { cat: "رياضة", d: 2, q: "كم لاعب بفريق الهوكي على الجليد داخل الملعب؟", a: "6", alt: ["ستة", "٦"] },
  { cat: "رياضة", d: 2, q: "وش أسرع رياضة مضرب من حيث سرعة الكرة؟", a: "الريشة الطائرة", alt: ["البادمنتون", "Badminton", "ريشة طائرة"], info: "الريشة تتجاوز 400 كم/س — أسرع من أي كرة برياضة أخرى." },
  { cat: "تقنية", d: 3, q: "كم بت بعنوان IPv4؟", a: "32", alt: ["اثنين وثلاثين", "٣٢"] },
  { cat: "تقنية", d: 2, q: "وش يعني اختصار RAM؟", a: "ذاكرة الوصول العشوائي", alt: ["Random Access Memory", "الذاكرة العشوائية"] },
  { cat: "تقنية", d: 2, q: "وش أول رسالة أُرسلت عبر أربانت وانقطعت بمنتصفها؟", a: "LO", alt: ["لو", "lo"] },
  { cat: "تقنية", d: 3, q: "كم عدد البتات بعنوان IPv6؟", a: "128", alt: ["مئة وثمانية وعشرين", "١٢٨"] },
  { cat: "تقنية", d: 2, q: "من كتب أول خوارزمية بالتاريخ وتُعتبر أول مبرمجة؟", a: "آدا لوفلايس", alt: ["ادا لوفلايس", "Ada Lovelace", "ادا"], info: "كتبت أول خوارزمية للمحرك التحليلي قبل وجود الحواسيب بقرن." },
  { cat: "تقنية", d: 3, q: "وش يسمى الخطأ البرمجي اللي سُمّي على حشرة حقيقية وُجدت داخل حاسوب؟", a: "باق", alt: ["Bug", "بق", "خلل"] },
  { cat: "تقنية", d: 3, q: "كم لون يمثله نظام RGB بـ 24 بت (بالمليون تقريبًا)؟", a: "16.7", alt: ["16 مليون", "ستة عشر مليون", "16.7 مليون"] },
  { cat: "تقنية", d: 2, q: "وش البروتوكول المسؤول عن ترجمة أسماء المواقع لعناوين IP؟", a: "DNS", alt: ["دي ان اس", "نظام أسماء النطاقات"], info: "يشبه دفتر عناوين الإنترنت — يحوّل الاسم لرقم يفهمه الجهاز." },
  { cat: "تقنية", d: 2, q: "وش لغة البرمجة اللي طوّرها دينيس ريتشي وبُني عليها يونكس؟", a: "سي", alt: ["C", "لغة سي"], info: "بُني عليها يونكس، وأغلب اللغات الحديثة ورثت صياغتها." },
  { cat: "تقنية", d: 3, q: "كم كيلوبايت بالميجابايت الواحد بالنظام الثنائي؟", a: "1024", alt: ["١٠٢٤", "ألف وأربعة وعشرين"], info: "لأن الحاسوب يعد بالنظام الثنائي: 2 أس 10 = 1024، مو 1000." },
  { cat: "منطق وألغاز", d: 3, q: "مضرب وكرة بـ 110 ريال، والمضرب أغلى من الكرة بـ 100 — كم سعر الكرة؟", a: "5", alt: ["خمسة", "٥", "5 ريال"] },
  { cat: "منطق وألغاز", d: 3, q: "5 مكائن تصنع 5 قطع بـ5 دقايق — كم دقيقة تحتاج 100 مكينة لـ100 قطعة؟", a: "5", alt: ["خمسة", "٥"] },
  { cat: "منطق وألغاز", d: 3, q: "زنبق يتضاعف كل يوم ويغطي البركة بـ48 يوم — بأي يوم يغطي نصفها؟", a: "47", alt: ["سبعة وأربعين", "٤٧"] },
  { cat: "منطق وألغاز", d: 2, q: "ساعة حائط واقفة تمامًا — كم مرة باليوم تعطي الوقت الصحيح؟", a: "مرتين", alt: ["2", "اثنتين"] },
  { cat: "منطق وألغاز", d: 3, q: "عندك 8 كرات وحدة أثقل وميزان كفتين — كم وزنة كحد أدنى تحتاج؟", a: "2", alt: ["مرتين", "اثنتين", "٢"] },
  { cat: "منطق وألغاز", d: 3, q: "عندك حبلان يحترق كل واحد بساعة لكن بشكل غير منتظم — كيف تقيس 45 دقيقة؟", a: "تشعل الأول من طرفيه", alt: ["من الطرفين", "تولع واحد من طرفين والثاني من طرف"] },
  { cat: "منطق وألغاز", d: 3, q: "ثلاث صناديق كلها ملصقاتها غلط: تفاح، برتقال، مخلوط — كم حبة تسحب لتعرف الكل؟", a: "1", alt: ["وحدة", "واحدة", "حبة وحدة"] },
  { cat: "منطق وألغاز", d: 3, q: "لو رميت عملة عادلة 3 مرات، وش احتمال تطلع صورة 3 مرات؟", a: "الثمن", alt: ["1/8", "ثمن", "12.5%"] },
  { cat: "منطق وألغاز", d: 1, q: "25 حصان و5 مضامير بس (5 بكل سباق) — كم سباق أقل عدد لتعرف أسرع ثلاثة؟", a: "7", alt: ["سبعة", "٧"] },
  { cat: "منطق وألغاز", d: 3, q: "عمر الأب 3 أضعاف عمر ابنه، وبعد 12 سنة يصير الضعف — كم عمر الابن الحين؟", a: "12", alt: ["اثنا عشر", "١٢"] },
  { cat: "منطق وألغاز", d: 3, q: "حارسان: واحد يصدق دايم وواحد يكذب دايم — كم سؤال تحتاج لتعرف الباب الصح؟", a: "1", alt: ["سؤال واحد", "واحد"] },
  { cat: "منطق وألغاز", d: 3, q: "3 أشخاص دفعوا 30 ريال ورجّع لهم 5 وأخذ الموظف 2 — وين راح الريال الناقص؟", a: "ما فيه ناقص", alt: ["الحساب غلط", "لا يوجد", "المسألة مغالطة"] },
  { cat: "منطق وألغاز", d: 3, q: "غرفة فيها 23 شخص — احتمال يتشارك اثنان بنفس يوم الميلاد أكثر من كم بالمئة؟", a: "50", alt: ["خمسين", "٥٠", "50%"] },
  { cat: "منطق وألغاز", d: 3, q: "وش الرقم اللي إذا ضربته بنفسه وأضفت له نفسه يصير 30؟", a: "5", alt: ["خمسة", "٥"] },
  { cat: "منطق وألغاز", d: 3, q: "المتسلسلة: 2، 6، 12، 20، 30 — وش الجاي؟", a: "42", alt: ["اثنين وأربعين", "٤٢"] },
  { cat: "منطق وألغاز", d: 2, q: "المتسلسلة: 1، 4، 9، 16، 25 — وش القاعدة؟", a: "مربعات", alt: ["الأعداد المربعة", "تربيع", "المربعات الكاملة"] },
  { cat: "دليلين", d: 2, q: "دليل ١: عنصر رمزه Hg. دليل ٢: سائل بدرجة حرارة الغرفة. وش هو؟", a: "الزئبق", alt: ["زئبق", "Mercury"] },
  { cat: "دليلين", d: 3, q: "دليل ١: عاصمة ما هي أشهر مدن بلدها. دليل ٢: بلدها قارة كاملة. وش هي؟", a: "كانبرا", alt: ["Canberra"] },
  { cat: "دليلين", d: 2, q: "دليل ١: 7 فقرات عنقية. دليل ٢: قلبه 11 كيلو. مين؟", a: "الزرافة", alt: ["زرافة"] },
  { cat: "دليلين", d: 2, q: "دليل ١: أُطلق 1977. دليل ٢: يحمل قرصًا ذهبيًا فيه أصوات الأرض. وش هو؟", a: "فوياجر", alt: ["Voyager", "فوياجر 1"] },
  { cat: "دليلين", d: 2, q: "دليل ١: عالم نمساوي. دليل ٢: قطته بالمثال حية وميتة بنفس الوقت. مين؟", a: "شرودنغر", alt: ["شرودنجر", "Schrodinger"] },
  { cat: "دليلين", d: 2, q: "دليل ١: يومه أطول من سنته. دليل ٢: يدور عكس بقية الكواكب. مين؟", a: "الزهرة", alt: ["فينوس", "Venus"] },
  { cat: "دليلين", d: 2, q: "دليل ١: أول مبرمجة بالتاريخ. دليل ٢: بنت الشاعر بايرون. مين؟", a: "آدا لوفلايس", alt: ["ادا لوفلايس", "Ada Lovelace"] },
  { cat: "دليلين", d: 2, q: "دليل ١: ما استُعمرت أبدًا. دليل ٢: تقويمها متأخر 7 سنين عن الميلادي. وش الدولة؟", a: "إثيوبيا", alt: ["اثيوبيا", "Ethiopia"] },
  { cat: "دليلين", d: 2, q: "دليل ١: أخف عنصر. دليل ٢: وقوده يشغّل الشمس. وش هو؟", a: "الهيدروجين", alt: ["هيدروجين", "Hydrogen"] },
  { cat: "دليلين", d: 2, q: "دليل ١: فاز بنوبل مرتين بمجالين مختلفين. دليل ٢: امرأة بولندية. مين؟", a: "ماري كوري", alt: ["كوري", "Marie Curie"], info: "الوحيدة الفائزة بنوبل في مجالين علميين مختلفين." },
  { cat: "دليلين", d: 2, q: "دليل ١: يُقاس بالكانديلا. دليل ٢: من الوحدات السبع الأساسية. وش هو؟", a: "شدة الإضاءة", alt: ["الإضاءة", "الاضاءة"] },
  { cat: "دليلين", d: 2, q: "دليل ١: مدينة على قارتين. دليل ٢: كانت عاصمة لثلاث إمبراطوريات. وين؟", a: "إسطنبول", alt: ["اسطنبول", "Istanbul"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: الزئبق، الحديد، البروم، الذهب — من ناحية الحالة؟", a: "البروم", alt: ["برومين", "Bromine"] },
  { cat: "الأغرب", d: 3, q: "مين الغريب: الهيليوم، النيون، الأرغون، الأكسجين؟", a: "الأكسجين", alt: ["اكسجين", "Oxygen"] },
  { cat: "الأغرب", d: 3, q: "مين الغريب: القادسية، اليرموك، حطين، بدر — من ناحية الخصم؟", a: "حطين", alt: ["معركة حطين"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: عطارد، الزهرة، الأرض، المشتري — من ناحية التركيب؟", a: "المشتري", alt: ["Jupiter", "المشترى"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: نيوتن، جول، باسكال، أمبير — من ناحية نوع الكمية؟", a: "أمبير", alt: ["امبير", "Ampere"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: النيل، الأمازون، اليانغتسي، بحر قزوين؟", a: "بحر قزوين", alt: ["قزوين", "Caspian"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: الجزائر، السودان، ليبيا، مصر — من ناحية المساحة الأكبر؟", a: "الجزائر", alt: ["Algeria"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: الميتوكوندريا، البلاستيدة، النواة، الريبوسوم — من ناحية DNA خاص؟", a: "الريبوسوم", alt: ["ريبوسوم", "Ribosome"] },
  { cat: "الأغرب", d: 2, q: "مين الغريب: باريس، برلين، فيينا، أوسلو — من ناحية اليورو؟", a: "أوسلو", alt: ["اوسلو", "Oslo"] },
  { cat: "الرابط المشترك", d: 3, q: "الأرغون والكريبتون والزينون — وش المجموعة اللي تجمعهم؟", a: "الغازات النبيلة", alt: ["النبيلة", "الخاملة"] },
  { cat: "الرابط المشترك", d: 3, q: "1744 و1824 و1932 — وش الحدث اللي يجمع هالتواريخ بالسعودية؟", a: "الدول السعودية الثلاث", alt: ["تأسيس الدول السعودية", "الدولة الأولى والثانية والثالثة"] },
  { cat: "الرابط المشترك", d: 3, q: "الأدينين والغوانين والسيتوزين — وش الجزيء اللي تدخل فيه؟", a: "الحمض النووي", alt: ["DNA", "دي ان اي"] },
  { cat: "الرابط المشترك", d: 3, q: "روتردام وشنغهاي وسنغافورة — وش يجمعهم؟", a: "أكبر موانئ", alt: ["موانئ", "أكبر الموانئ بالعالم"] },
  { cat: "الرابط المشترك", d: 3, q: "كانديلا ومول وكلفن — وش يجمعهم؟", a: "وحدات أساسية", alt: ["الوحدات السبع", "النظام الدولي", "وحدات SI الأساسية"] },
  { cat: "الرابط المشترك", d: 2, q: "1969 و1972 — وش الحدث الفضائي اللي يحصره هالمدى؟", a: "الهبوط على القمر", alt: ["رحلات أبولو", "القمر", "أبولو"] },
  { cat: "الرابط المشترك", d: 2, q: "هرمز وباب المندب وملقا — وش يجمعهم؟", a: "مضائق", alt: ["مضائق بحرية", "ممرات ملاحية"] },
  { cat: "الرابط المشترك", d: 1, q: "لوفر وأورسيه وبومبيدو — وين تلقاهم كلهم؟", a: "باريس", alt: ["Paris", "فرنسا"] },
  { cat: "قبل ولا بعد؟", d: 1, q: "أيهما أقدم: الأهرامات ولا الماموث الصوفي (آخر جماعة منه)؟", a: "الأهرامات", alt: ["الاهرامات"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: جامعة أكسفورد ولا إمبراطورية الأزتك؟", a: "أكسفورد", alt: ["اكسفورد"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما أقدم: كليوباترا ولا بناء الهرم الأكبر؟", a: "الهرم", alt: ["الهرم الأكبر", "بناء الهرم"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "أيهما اختُرع أول: الفاكس ولا الهاتف؟", a: "الفاكس", alt: ["Fax"] },
  { cat: "قبل ولا بعد؟", d: 3, q: "أيهما ظهر أول على الأرض: القروش ولا الأشجار؟", a: "القروش", alt: ["اسماك القرش", "القرش"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "أيهما أقدم: سقوط غرناطة ولا اكتشاف كولومبوس لأمريكا؟", a: "سقوط غرناطة", alt: ["غرناطة"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "أيهما تأسس أول: أرامكو ولا المملكة العربية السعودية بشكلها الحالي؟", a: "المملكة", alt: ["السعودية", "التوحيد"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "أيهما صدر أول: أول آيفون ولا يوتيوب؟", a: "يوتيوب", alt: ["YouTube"] },
  { cat: "قبل ولا بعد؟", d: 2, q: "مين حكم أول: هارون الرشيد ولا صلاح الدين؟", a: "هارون الرشيد", alt: ["الرشيد"] },
  { cat: "وش الغرض؟", d: 3, q: "قطعة بالمحرك تحوّل الحركة الترددية للمكابس لحركة دورانية؟", a: "عمود المرفق", alt: ["الكرنك", "Crankshaft", "عمود الكرنك"] },
  { cat: "وش الغرض؟", d: 3, q: "جهاز يقيس شدة الزلازل ويسجل الموجات على ورق؟", a: "السيزموغراف", alt: ["سيزموغراف", "مرسمة الزلازل", "Seismograph"] },
  { cat: "وش الغرض؟", d: 3, q: "جهاز يفصل مكونات السائل بالطرد المركزي — يستخدمونه بمختبرات الدم؟", a: "الطرد المركزي", alt: ["السنترفيوج", "Centrifuge", "جهاز الطرد المركزي"] },
  { cat: "وش الغرض؟", d: 3, q: "قطعة كهربائية تخزن الشحنة وتفرغها بسرعة — رمزها خطين متوازيين؟", a: "المكثف", alt: ["مكثف", "Capacitor"] },
  { cat: "وش الغرض؟", d: 3, q: "صمام يسمح للتيار يمر باتجاه واحد بس؟", a: "الدايود", alt: ["دايود", "Diode", "الثنائي"] },
  { cat: "وش الغرض؟", d: 3, q: "غرض بالمفاعل النووي يمتص النيوترونات ويتحكم بسرعة التفاعل؟", a: "قضبان التحكم", alt: ["قضبان الضبط", "Control rods"] },
  { cat: "وش الغرض؟", d: 3, q: "أداة تقيس الضغط الجوي وتتنبأ بالطقس؟", a: "البارومتر", alt: ["بارومتر", "Barometer"] },
  { cat: "وش الغرض؟", d: 2, q: "قطعة تغيّر جهد الكهرباء من عالي لمنخفض بالمحطات؟", a: "المحول", alt: ["الترانس", "Transformer", "محول"] },
  { cat: "مين قالها؟", d: 2, q: "عالم قال: قف على أكتاف العمالقة — وهو صاحب قوانين الحركة؟", a: "نيوتن", alt: ["Newton"] },
  { cat: "مين قالها؟", d: 2, q: "قائد روماني اختصر انتصاره بثلاث كلمات: أتيت، رأيت، انتصرت؟", a: "يوليوس قيصر", alt: ["قيصر", "Caesar"] },
  { cat: "مين قالها؟", d: 2, q: "فيلسوف قال: أنا أعلم أني لا أعلم شيئًا؟", a: "سقراط", alt: ["Socrates"] },
  { cat: "مين قالها؟", d: 2, q: "عالم قال إن الله لا يلعب النرد رفضًا لعشوائية الكم؟", a: "أينشتاين", alt: ["اينشتاين", "Einstein"] },
  { cat: "مين قالها؟", d: 2, q: "خليفة راشد قال: لو عثرت بغلة بالعراق لسُئلت عنها؟", a: "عمر بن الخطاب", alt: ["عمر", "الفاروق"] },
  { cat: "مين قالها؟", d: 3, q: "عالم مسلم قال إن على الباحث أن يشك بكل ما يقرأ — مؤسس المنهج التجريبي بالبصريات؟", a: "ابن الهيثم", alt: ["الحسن بن الهيثم"] },
  { cat: "وين المكان؟", d: 3, q: "صحراء بتشيلي بعض محطاتها ما سجّلت مطر أبدًا بتاريخ الرصد؟", a: "أتاكاما", alt: ["اتاكاما", "Atacama"] },
  { cat: "وين المكان؟", d: 3, q: "بحيرة روسية فيها خُمس المياه العذبة السائلة بالعالم وأعمق بحيرة؟", a: "بايكال", alt: ["Baikal"] },
  { cat: "وين المكان؟", d: 2, q: "مدينة نبطية منحوتة بالصخر الوردي بالأردن؟", a: "البتراء", alt: ["بترا", "Petra"] },
  { cat: "وين المكان؟", d: 2, q: "أخفض نقطة يابسة على وجه الأرض؟", a: "البحر الميت", alt: ["بحر ميت", "Dead Sea"] },
  { cat: "وين المكان؟", d: 2, q: "جزيرة فيها براكين نشطة فوق أنهار جليدية شمال الأطلسي؟", a: "آيسلندا", alt: ["ايسلندا", "Iceland"] },
  { cat: "وين المكان؟", d: 2, q: "موقع أثري سعودي منحوت بالصخر يعود للأنباط شمال المدينة؟", a: "الحجر", alt: ["مدائن صالح", "الحِجر", "العلا"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح كعب أخيل؟", a: "نقطة الضعف", alt: ["نقطة ضعف", "الضعف الوحيد"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح حصان طروادة بالاستخدام الحديث؟", a: "خدعة من الداخل", alt: ["اختراق", "برنامج خبيث", "خديعة"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى عاد بخفي حنين؟", a: "رجع خالي اليدين", alt: ["خسر", "بلا فايدة", "صفر اليدين"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "مصطلح صندوق باندورا يعني فتح…؟", a: "شرور لا تنتهي", alt: ["مصائب", "مشاكل كثيرة", "سلسلة مصائب"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى المثل: الحديد بالحديد يُفلح؟", a: "القوة تقابل بالقوة", alt: ["الشدة بالشدة", "المثل بالمثل"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "كمّل بيت المتنبي: على قدر أهل العزم…؟", a: "تأتي العزائم", alt: ["تاتي العزائم"] },
  { cat: "أمثال ومصطلحات", d: 3, q: "وش معنى مصطلح سيف ديموقليس؟", a: "خطر محدق دائم", alt: ["تهديد دائم", "خطر معلق"] },
  { cat: "بوسات السولز", d: 2, q: "بوس بلودبورن الأخير بالـDLC، ورث دم الطفل ويقاتلك بثلاث مراحل؟", a: "Orphan of Kos", alt: ["يتيم كوس", "أورفان أوف كوس"] },
  { cat: "بوسات السولز", d: 3, q: "بوس دارك سولز 3 اللي يظهر بشكل شجرة عملاقة وله نقطة ضعف بالوجه المخفي؟", a: "Curse-Rotted Greatwood", alt: ["الشجرة الملعونة", "Greatwood"] },
  { cat: "بوسات السولز", d: 3, q: "بوس سيكيرو اللي يقاتلك بثلاث مراحل وآخرها يطلق البرق وتقدر ترجعه عليه؟", a: "Genichiro", alt: ["جينيتشيرو", "غينيتشيرو"] },
  { cat: "بوسات السولز", d: 3, q: "بوس Lies of P اللي يقاتلك بمرحلتين وسلاحه رمح كهربائي، تواجهه بالكاتدرائية؟", a: "Laxasia", alt: ["لاكسيا", "لاكساسيا"] },
  { cat: "بوسات السولز", d: 3, q: "بوس بلودبورن اللي معركته كلها تحتاج تستخدم صندوق الموسيقى عشان يتوقف لحظة؟", a: "Father Gascoigne", alt: ["غاسكوين", "الأب غاسكوين"] },
  { cat: "بوسات إلدن رينق", d: 1, q: "من نايترين — البوس اللي يعتبر التنين الجليدي ويهاجم من السما بالليلة الثالثة؟", a: "Adel", alt: ["أدل", "ادل"] },
  { cat: "بوسات السولز", d: 3, q: "بوس دارك سولز الأول اللي كل ما قطعت جزء منه انقسم لاثنين؟", a: "Pinwheel", alt: ["بينويل", "الطاحونة"] },
  { cat: "لور السولز", d: 2, q: "وش اسم أول رون عظيم تحصل عليه غالبًا بإلدن رينق (من ستورمفيل)؟", a: "رون غودريك", alt: ["غودريك", "Godrick"] },
  { cat: "لور السولز", d: 3, q: "من إلدن رينق — وش اسم النظام اللي فيه ماريكا كسرت الحلقة وبدأ عصر التشظي؟", a: "الشاترينغ", alt: ["التشظي", "Shattering", "حرب التشظي"] },
  { cat: "لور السولز", d: 3, q: "من الإله اللي شارك النار الأولى مع غوين وسُرقت منه بدارك سولز؟", a: "نيتو", alt: ["Nito", "نيتوه"] },
  { cat: "لور السولز", d: 3, q: "وش أصل الخلود بسيكيرو — من يمنح البطل قدرة الرجوع للحياة؟", a: "التنين الإلهي", alt: ["الوريث الإلهي", "Divine Heir", "الدراقون"] },
  { cat: "لور السولز", d: 3, q: "وش المادة اللي كانوا يستخرجونها بـLies of P وسببت جنون سكان كرات؟", a: "الإرغو", alt: ["Ergo", "ايرقو"] },
  { cat: "لور السولز", d: 3, q: "من بلودبورن — وش اسم الطائفة اللي كانت تجري تجارب الدم القديم بيارنام؟", a: "كنيسة الشفاء", alt: ["Healing Church", "الكنيسة"] },
  { cat: "لور السولز", d: 3, q: "مين الشخصية اللي تعطيك ماء البحيرة المقدس وترافقك بإلدن رينق كساحرة؟", a: "Melina", alt: ["ميلينا"] },
  { cat: "أوفرواتش", d: 2, q: "كم بطل كان بأوفرواتش وقت الإطلاق 2016؟", a: "21", alt: ["واحد وعشرين", "٢١"] },
  { cat: "أوفرواتش", d: 2, q: "وش الاسم الحقيقي لسومبرا؟", a: "Olivia Colomar", alt: ["أوليفيا", "اوليفيا كولومار"] },
  { cat: "أوفرواتش", d: 2, q: "وش الدولة اللي منها بطل الدعم Baptiste؟", a: "هايتي", alt: ["Haiti"] },
  { cat: "أوفرواتش", d: 2, q: "وش اسم القرد الفضائي الآخر عدو وينستون؟", a: "Hammond", alt: ["هامند", "Wrecking Ball"] },
  { cat: "أوفرواتش", d: 3, q: "من البطل اللي كان الأومنيك المسالم وقُتل وصار رمزًا لحركة سلام؟", a: "Mondatta", alt: ["مونداتا"] },
  { cat: "أوفرواتش", d: 2, q: "وش المنظمة اللي تنتمي لها ويدوميكر وريبر؟", a: "Talon", alt: ["تالون"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش أول لعبة فيديو تُلعب بالفضاء فعليًا على متن مكوك؟", a: "تتريس", alt: ["Tetris"] },
  { cat: "ألعاب فيديو", d: 2, q: "من مبرمج لعبة تتريس الأصلية وبأي دولة؟", a: "أليكسي باجيتنوف", alt: ["باجيتنوف", "Pajitnov", "الكسي"] },
  { cat: "ألعاب فيديو", d: 3, q: "وش انهيار سوق ألعاب الفيديو الشهير وبأي سنة صار؟", a: "1983", alt: ["١٩٨٣", "انهيار 1983"] },
  { cat: "ألعاب فيديو", d: 3, q: "وش اسم اللعبة اللي دفنوا نسخها بصحراء نيو مكسيكو لفشلها الذريع؟", a: "E.T.", alt: ["اي تي", "ET"] },
  { cat: "ألعاب فيديو", d: 2, q: "وش أول لعبة حصلت على تصنيف عمري رسمي بأمريكا وأشعلت الجدل؟", a: "Mortal Kombat", alt: ["مورتال كومبات"] },
  { cat: "ألعاب فيديو", d: 3, q: "كم استغرق تطوير Duke Nukem Forever من الإعلان للإصدار (بالسنوات)؟", a: "15", alt: ["خمسة عشر", "١٥", "14"] },
  { cat: "ألعاب فيديو", d: 3, q: "وش الشركة اللي طوّرت أول محرك 3D حقيقي مع Wolfenstein و Doom؟", a: "id Software", alt: ["ايدي سوفتوير", "id"] },
  { cat: "ألعاب فيديو", d: 3, q: "وش اسم أول شخصية نسائية قابلة للعب ببطولة لعبة كبيرة سنة 1986؟", a: "Samus", alt: ["ساموس", "سامس"] },
  { cat: "أزياء الشخصيات", d: 3, q: "معطف أحمر طويل وقبعة كاوبوي وشعر أشقر، وبطل لعبة عن مصاصي دماء بالغرب؟", a: "Alucard", alt: ["الوكارد"] },
  { cat: "أزياء الشخصيات", d: 3, q: "بدلة سوداء بخطوط حمراء وقناع بعين واحدة مضيئة، بطل لعبة تسلل يابانية؟", a: "Raiden", alt: ["رايدن"] },
  { cat: "أزياء الشخصيات", d: 2, q: "عباءة بيضاء بغطاء راس مدبب وشفرة مخفية بالساعد؟", a: "Assassin", alt: ["الأساسن", "Altair", "اساسن كريد"] },
  { cat: "أزياء الشخصيات", d: 3, q: "درع ثقيل بلون ذهبي وتاج مكسور، بوس بلعبة يابانية يمثل ملكًا سقط؟", a: "Godfrey", alt: ["غودفري", "جودفري"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش التفاعل الكيميائي المسؤول عن اللون البني والنكهة عند شوي اللحم؟", a: "تفاعل ميلارد", alt: ["ميلارد", "Maillard"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش المادة اللي تعطي الفلفل الحار حرارته؟", a: "الكابسيسين", alt: ["كابسيسين", "Capsaicin"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش الطعم الخامس المعترف فيه علميًا بعد الحلو والمالح والحامض والمر؟", a: "أومامي", alt: ["اومامي", "Umami"] },
  { cat: "طعام ومطبخ", d: 1, q: "وش الغاز اللي تفرزه الخميرة ويخلي العجين ينتفخ؟", a: "ثاني أكسيد الكربون", alt: ["CO2", "ثاني اكسيد الكربون"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش المادة اللي بالبصل وتخليك تدمع لما تقطعه؟", a: "مركب كبريتي", alt: ["الكبريت", "حمض كبريتيك", "مركبات الكبريت"] },
  { cat: "طعام ومطبخ", d: 3, q: "وش البروتين بالقمح اللي يعطي العجين مرونته ويتحسس منه بعض الناس؟", a: "الغلوتين", alt: ["جلوتين", "Gluten"] },
  { cat: "طعام ومطبخ", d: 2, q: "القهوة موطنها الأصلي أي دولة قبل ما تنتشر عبر اليمن؟", a: "إثيوبيا", alt: ["اثيوبيا", "Ethiopia"] },
  { cat: "طعام ومطبخ", d: 2, q: "وش أغلى نوع لحم بالعالم يُشتهر بتشحيمه الرخامي ومن اليابان؟", a: "واغيو", alt: ["Wagyu", "كوبي", "واقيو"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان اللي دمه أزرق بسبب النحاس بدل الحديد؟", a: "الأخطبوط", alt: ["اخطبوط", "سرطان البحر"] },
  { cat: "حيوانات", d: 3, q: "وش المخلوق اللي يقدر يعكس دورة حياته نظريًا ويعتبر خالدًا بيولوجيًا؟", a: "قنديل البحر الخالد", alt: ["Turritopsis", "قنديل البحر"] },
  { cat: "حيوانات", d: 1, q: "كم قلب بالأخطبوط؟", a: "3", alt: ["ثلاثة", "٣"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان اللي عينه أكبر من دماغه؟", a: "النعامة", alt: ["نعامة", "Ostrich"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان الوحيد اللي ما يقدر يقفز؟", a: "الفيل", alt: ["فيل", "Elephant"] },
  { cat: "حيوانات", d: 2, q: "وش المخلوق اللي يتنفس من جلده كليًا بدون رئتين؟", a: "الضفدع", alt: ["ضفدع", "السلمندر"] },
  { cat: "حيوانات", d: 3, q: "وش الطائر الوحيد اللي يقدر يطير للخلف؟", a: "الطنان", alt: ["طائر الطنان", "Hummingbird"] },
  { cat: "حيوانات", d: 2, q: "وش الحيوان اللي بصمة أنفه فريدة مثل بصمة الإنسان؟", a: "الكلب", alt: ["كلب", "الأبقار"] },
  { cat: "اختراعات", d: 3, q: "المايكروويف انكتشف بالصدفة لما ذاب شي بجيب مهندس رادار — وش ذاب؟", a: "لوح شوكولاتة", alt: ["شوكولاتة", "الشوكولاته"], info: "المهندس بيرسي سبنسر كان يجرّب رادارًا فذاب لوح الشوكولاتة بجيبه." },
  { cat: "اختراعات", d: 2, q: "وش الاختراع اللي جاء من مراقبة بذور نبات تلتصق بفرو الكلب؟", a: "الفيلكرو", alt: ["فيلكرو", "Velcro", "اللاصق"] },
  { cat: "اختراعات", d: 1, q: "من العالم الصربي اللي طوّر التيار المتردد ونافس إديسون؟", a: "تسلا", alt: ["نيكولا تسلا", "Tesla"] },
  { cat: "اختراعات", d: 2, q: "البلوتوث سُمّي على ملك من أي دولة اسكندنافية؟", a: "الدنمارك", alt: ["دنمارك", "Denmark"], info: "الملك هارالد «بلوتوث» وحّد الدنمارك والنرويج — كما توحّد التقنية الأجهزة." },
  { cat: "اختراعات", d: 3, q: "وش أول مادة بلاستيكية صناعية بالكامل بالتاريخ؟", a: "الباكليت", alt: ["باكلايت", "Bakelite"] },
  { cat: "اختراعات", d: 3, q: "من العالم المسلم اللي وضع أسس علم الجبر وكتابه صار مصدر كلمة Algorithm؟", a: "الخوارزمي", alt: ["خوارزمي"], info: "من اسمه اللاتيني Algoritmi جاءت «خوارزمية»، ومن كتابه جاءت «الجبر»." },
  { cat: "اختراعات", d: 3, q: "وش الجهاز اللي اخترعه ابن الهيثم وشرح فيه انتقال الضوء؟", a: "الغرفة المظلمة", alt: ["القمرة", "Camera Obscura", "بيت الضوء"], info: "ابن الهيثم أثبت أن الرؤية بدخول الضوء للعين لا بخروج شعاع منها." },
  { cat: "سيارات", d: 2, q: "وش يقيسه عداد الـRPM؟", a: "دورات المحرك", alt: ["لفات المحرك", "دورات بالدقيقة"] },
  { cat: "سيارات", d: 2, q: "وش يمنعه نظام ABS تحديدًا وقت الفرملة القوية؟", a: "قفل العجلات", alt: ["انغلاق الإطارات", "تزحلق العجلات"] },
  { cat: "سيارات", d: 2, q: "وش وظيفة التيربو تحديدًا؟", a: "يضغط الهواء", alt: ["ضغط الهواء الداخل", "زيادة كثافة الهواء"] },
  { cat: "سيارات", d: 2, q: "وش أول سيارة إنتاج بخط تجميع متحرك غيّرت الصناعة؟", a: "فورد موديل T", alt: ["Model T", "موديل تي"] },
  { cat: "سيارات", d: 2, q: "وش يعني رقم الأوكتان بالبنزين؟", a: "مقاومة الاحتراق المبكر", alt: ["مقاومة الطرق", "مقاومة الانفجار الذاتي"] },
  { cat: "سيارات", d: 3, q: "وش القطعة اللي تحوّل غازات العادم السامة لأقل ضررًا؟", a: "المحول الحفاز", alt: ["الكتلايزر", "Catalytic Converter", "الحفاز"] },
  { cat: "سيارات", d: 3, q: "وش نوع المحرك اللي ما فيه مكابس ويستخدم روتور مثلثي؟", a: "فانكل", alt: ["Wankel", "الدوار", "روتاري"] },
  { cat: "سيارات", d: 2, q: "أول علامة سيارات كهربائية سعودية أُعلن عنها 2022؟", a: "سير", alt: ["Ceer", "سيير"] },
  // ============ Engineering Questions ============
  { cat: "Engineering Questions", d: 1, q: "What term refers to the rate at which velocity changes over time?", a: "Acceleration", opts: ["Acceleration", "Velocity", "Momentum", "Displacement"] },
  { cat: "Engineering Questions", d: 1, q: "What polymer-based material can bacteria be engineered to eat to help environmental sustainability?", a: "Plastic", opts: ["Cellulose", "Plastic", "Rubber", "Asphalt"] },
  { cat: "Engineering Questions", d: 2, q: "Abrams’ law describes the strength of which building material made from fine and coarse aggregate bonded together?", a: "Concrete", opts: ["Concrete", "Grout", "Asphalt", "Mortar"] },
  { cat: "Engineering Questions", d: 3, q: "What is the moment of an 8 N force acting at a perpendicular distance of 5 m?", a: "40 Nm", opts: ["1.6 Nm", "400 Nm", "40 Nm", "13 Nm"] },
  { cat: "Engineering Questions", d: 2, q: "CTE stands for coefficient of thermal what?", a: "Expansion", opts: ["Extension", "Exchange", "Expansion", "Emission"] },
  { cat: "Engineering Questions", d: 3, q: "What ancient engineering device uses stored potential energy to fling a projectile and is sometimes referred to as a trebuchet?", a: "Catapult", opts: ["Onager", "Ballista", "Battering ram", "Catapult"] },
  { cat: "Engineering Questions", d: 3, q: "The equation T = F × d × sin(?) gives which moment-of-force measure that makes an object rotate?", a: "Torque", opts: ["Momentum", "Torque", "Work", "Impulse"] },
  { cat: "Engineering Questions", d: 2, q: "What term beginning with F means to machine a flat surface, such as the end of a shaft on a lathe?", a: "Face", opts: ["Feed", "Flute", "Fillet", "Face"] },
  { cat: "Engineering Questions", d: 1, q: "What generic building material is used to buffer a structure against unwanted temperature, acoustics, fire, or impact?", a: "Insulation", opts: ["Cladding", "Sealant", "Membrane", "Insulation"] },
  { cat: "Engineering Questions", d: 1, q: "What chemical makes up the majority of petroleum by weight?", a: "Carbon", opts: ["Nitrogen", "Carbon", "Sulfur", "Hydrogen"] },
  { cat: "Engineering Questions", d: 1, q: "What simple machine is a rigid rod with a fixed hinge called a fulcrum?", a: "Lever", opts: ["Lever", "Wedge", "Pulley", "Inclined plane"] },
  { cat: "Engineering Questions", d: 3, q: "Which element with atomic number 24 gives stainless steel much of its resistance to rusting?", a: "Chromium", opts: ["Manganese", "Chromium", "Molybdenum", "Nickel"] },
  { cat: "Engineering Questions", d: 3, q: "What is the term for the continued extension of an object while under a steady load?", a: "Creep", opts: ["Relaxation", "Creep", "Fatigue", "Yielding"] },
  { cat: "Engineering Questions", d: 1, q: "What field studies what an object such as an airplane does to the air around it?", a: "Aerodynamics", opts: ["Kinematics", "Thermodynamics", "Hydrodynamics", "Aerodynamics"] },
  { cat: "Engineering Questions", d: 1, q: "Which engineering discipline of mechanics studies how liquids and gases move and are affected by forces?", a: "Fluid", opts: ["Solid", "Fluid", "Continuum", "Statics"] },
  { cat: "Engineering Questions", d: 2, q: "What fixture goes around a shaft to prevent leaks on moving parts, unlike a flat gasket?", a: "Seal", opts: ["O-ring groove", "Seal", "Gasket", "Bushing"] },
  { cat: "Engineering Questions", d: 3, q: "Invar is an iron alloy containing which ferromagnetic element that gives it a low coefficient of thermal expansion?", a: "Nickel", opts: ["Cobalt", "Titanium", "Nickel", "Chromium"] },
  { cat: "Engineering Questions", d: 3, q: "What type of bridge has projecting beams or trusses supported on piers and anchored by counterbalancing members?", a: "Cantilever", opts: ["Arch", "Truss", "Suspension", "Cantilever"] },
  { cat: "Engineering Questions", d: 1, q: "What does CAD stand for in engineering?", a: "Computer-aided design", opts: ["Controlled automated design", "Computer-aided design", "Computer-aided drafting", "Computer-analyzed data"] },
  { cat: "Engineering Questions", d: 2, q: "The point at which a material breaks under stress is known as what?", a: "Ultimate strength", opts: ["Yield strength", "Proportional limit", "Elastic limit", "Ultimate strength"] },
  { cat: "Engineering Questions", d: 1, q: "What is the standard unit for measuring energy in engineering?", a: "Joule", opts: ["Pascal", "Newton", "Joule", "Watt"] },
  { cat: "Engineering Questions", d: 2, q: "Which law states that pressure and volume are inversely proportional in a closed system at constant temperature?", a: "Boyle's Law", opts: ["Boyle's Law", "Gay-Lussac's Law", "Charles's Law", "Avogadro's Law"] },
  { cat: "Engineering Questions", d: 1, q: "What is the primary metal used in electrical wiring?", a: "Copper", opts: ["Aluminum", "Silver", "Copper", "Steel"] },
  { cat: "Engineering Questions", d: 3, q: "Which structural element primarily resists bending?", a: "Beam", opts: ["Strut", "Beam", "Column", "Cable"] },
  { cat: "Engineering Questions", d: 3, q: "What is the term for the bending of light through different mediums?", a: "Refraction", opts: ["Dispersion", "Refraction", "Reflection", "Diffraction"] },
  { cat: "Engineering Questions", d: 2, q: "Archimedes is known for which engineering principle?", a: "Buoyancy principle", opts: ["Lever principle", "Displacement principle", "Buoyancy principle", "Hydrostatic paradox"] },
  { cat: "Engineering Questions", d: 1, q: "Round 35.6754 to two decimal places.", a: "35.68", opts: ["35.7", "35.68", "35.680", "35.67"] },
  { cat: "Engineering Questions", d: 3, q: "In an order of 2000 hexagonal nuts, 40 were defective. What percentage was defective?", a: "2%", opts: ["0.2%", "4%", "20%", "2%"] },
  { cat: "Engineering Questions", d: 3, q: "The potential energy of a vertically raised body is ______ the kinetic energy of a vertically falling body.", a: "Equal to", opts: ["Greater than", "Less than", "Equal to", "Half of"] },
  { cat: "Engineering Questions", d: 3, q: "The point through which the whole weight of the body acts, irrespective of its position, is known as what?", a: "Centre of gravity", opts: ["Centroid", "Centre of gravity", "Metacentre", "Moment of inertia"] },
  { cat: "Engineering Questions", d: 2, q: "The rate of change of momentum is directly proportional to the impressed force and occurs in the same direction. What law is this?", a: "Newton's second law of motion", opts: ["Newton's second law of motion", "Newton's third law of motion", "Law of conservation of momentum", "Newton's first law of motion"] },
  { cat: "Engineering Questions", d: 3, q: "In ideal machines, mechanical advantage is ______ velocity ratio.", a: "Equal to", opts: ["Double", "Less than", "Greater than", "Equal to"] },
  { cat: "Engineering Questions", d: 3, q: "What is the angular velocity in rad/s of a body rotating at N revolutions per minute?", a: "2πN/60", opts: ["2πN/30", "N/60", "2πN/60", "πN/60"] },
  { cat: "Engineering Questions", d: 3, q: "The minimum force required to slide a body of weight W on a rough horizontal plane is?", a: "F = μW", opts: ["F = W/μ", "F = μW²", "F = μW", "F = μ/W"] },
  { cat: "Engineering Questions", d: 3, q: "What is the moment of inertia of a square of side a about its diagonal?", a: "A4/12", opts: ["a⁴/6", "A4/12", "a⁴/24", "a⁴/3"] },
  { cat: "Engineering Questions", d: 3, q: "A differential pulley block has larger and smaller diameters of 100 mm and 80 mm respectively. Its velocity ratio is?", a: "5", opts: ["10", "2.5", "20", "5"] },
  { cat: "Engineering Questions", d: 2, q: "What is the purpose of the exhaust duct?", a: "Straighten exhaust gas-flow", opts: ["Reduce noise", "Straighten exhaust gas-flow", "Cool exhaust gases", "Increase fuel flow"] },
  { cat: "Engineering Questions", d: 2, q: "Carbon monoxide gas is poisonous and odorless, and has what color?", a: "No color", opts: ["No color", "Light green", "Pale blue", "Yellow"] },
  { cat: "Engineering Questions", d: 2, q: "Stationary vanes positioned between rotor discs in a compressor are used to do what?", a: "Direct air and increase pressure", opts: ["Reduce pressure", "Cool the airflow", "Increase gas velocity", "Direct air and increase pressure"] },
  { cat: "Engineering Questions", d: 2, q: "What two fluids are combined to make up common jet fuel?", a: "Kerosene and gasoline", opts: ["Gasoline and methanol", "Kerosene and gasoline", "Naphtha and benzene", "Diesel and alcohol"] },
  { cat: "Engineering Questions", d: 3, q: "Before installing separable bearings, what must you ensure?", a: "Bearings are a matched set", opts: ["Clearance is zero", "Races are interchangeable", "Bearings are pre-lubricated", "Bearings are a matched set"] },
  { cat: "Engineering Questions", d: 1, q: "The ability to do work is the definition of what?", a: "Energy", opts: ["Energy", "Power", "Momentum", "Force"] },
  { cat: "Engineering Questions", d: 2, q: "Which section of a jet engine introduces and burns fuel?", a: "Turbine", opts: ["Turbine", "Exhaust", "Combustion chamber", "Compressor"] },
  { cat: "Engineering Questions", d: 3, q: "Where is the highest point of temperature reached in an engine?", a: "Combustion section", opts: ["Compressor section", "Combustion section", "Exhaust nozzle", "Turbine section"] },
  { cat: "Engineering Questions", d: 3, q: "What is the recommended method of expanding a bearing race before installation?", a: "Hot-oil-bath", opts: ["Open flame", "Hot-oil-bath", "Hydraulic press", "Dry ice"] },
  { cat: "Engineering Questions", d: 3, q: "What is the most common type of fuel nozzle system?", a: "Pressure-atomizing", opts: ["Simplex slinger", "Pressure-atomizing", "Duplex airblast", "Vaporizing"] },
  { cat: "Engineering Questions", d: 2, q: "Which type of duct decreases velocity and increases gas pressure as gas passes through it?", a: "Divergent", opts: ["Convergent-divergent", "Divergent", "Constant-area", "Convergent"] },
  { cat: "Engineering Questions", d: 2, q: "Why must the temperature of compressed air in a jet engine be raised?", a: "Increase energy", opts: ["To lower pressure", "Increase energy", "To reduce density", "To cool the turbine"] },
  { cat: "Engineering Questions", d: 3, q: "What is the most probable cause of a jet-engine flameout at 40,000 ft with constant engine RPM of 50 percent?", a: "The RPM is too low", opts: ["The RPM is too high", "Fuel is over-rich", "The RPM is too low", "Compressor stall"] },
  { cat: "Engineering Questions", d: 3, q: "What type of flame speed are swirl-type fuel nozzles normally used to provide?", a: "High", opts: ["Constant", "Low", "Variable", "High"] },
  { cat: "Engineering Questions", d: 2, q: "Why does air temperature gradually rise across a jet-engine compressor to the diffuser outlet?", a: "Compression", opts: ["Compression", "Expansion", "Friction", "Combustion"] },
  { cat: "Engineering Questions", d: 2, q: "What is the most chemically correct ratio for burning fuel in a combustion chamber?", a: "15:1", opts: ["15:1", "8:1", "10:1", "20:1"] },
  { cat: "Engineering Questions", d: 3, q: "Torque is transferred from the power unit to the safety coupling on the reduction gearbox by the what?", a: "Torque shaft", opts: ["Drive gear", "Torque shaft", "Accessory shaft", "Splined coupling"] },
  { cat: "Engineering Questions", d: 1, q: "The purpose of the turbine section is to convert what into torque?", a: "Energy", opts: ["Pressure", "Thrust", "Velocity", "Energy"] },
  { cat: "Engineering Questions", d: 1, q: "Which law can be summed up with the words action and reaction?", a: "Newton's third law of motion", opts: ["Newton's first law of motion", "Newton's third law of motion", "Newton's second law of motion", "Law of inertia"] },
  { cat: "Engineering Questions", d: 2, q: "An aircraft taxiing at a steady speed can be used to demonstrate which law?", a: "Newton's first law of motion", opts: ["Newton's second law of motion", "Bernoulli's principle", "Newton's first law of motion", "Newton's third law of motion"] },
  { cat: "Engineering Questions", d: 1, q: "What is the unit of electrical current?", a: "Ampere", opts: ["Ohm", "Volt", "Watt", "Ampere"] },
  { cat: "Engineering Questions", d: 2, q: "Convert T = -10°C to Kelvin.", a: "263 K", opts: ["253 K", "263 K", "283 K", "10 K"] },
  { cat: "Engineering Questions", d: 2, q: "The accumulation in steady states is equal to what?", a: "0", opts: ["1", "Infinity", "The input rate", "0"] },
  { cat: "Engineering Questions", d: 3, q: "If the open end of a sealed-end manometer is exposed to the atmosphere, the device functions as what?", a: "Barometer", opts: ["Piezometer", "Barometer", "Manometer", "Thermometer"] },
  { cat: "Engineering Questions", d: 3, q: "For the equation y² = a e^(-b/x), what are the slope and intercept after linearization, respectively?", a: "-b, ln a", opts: ["-b/2, ln a", "-b, 2 ln a", "b, ln a", "-b, ln a"] },
  { cat: "Engineering Questions", d: 2, q: "Which process has w = 0 for a gas in a rigid container?", a: "Isochoric", opts: ["Isothermal", "Isochoric", "Isobaric", "Adiabatic"] },
  { cat: "Engineering Questions", d: 1, q: "If a gas is heated in a rigid container, all the added heat goes into increasing internal energy. True or false?", a: "True", opts: ["Only if ideal gas", "False", "Only at constant pressure", "True"] },
  { cat: "Engineering Questions", d: 1, q: "A system has Δu = -250 J and does w = +400 J. What is heat q?", a: "150 J", opts: ["150 J", "-650 J", "-150 J", "650 J"] },
  { cat: "Engineering Questions", d: 3, q: "A gas is compressed in an insulated cylinder. Which is most likely true?", a: "Δu > 0", opts: ["Δu < 0", "Δu = 0", "q > 0", "Δu > 0"] },
  { cat: "Engineering Questions", d: 2, q: "Which thermodynamic process has q = 0?", a: "Adiabatic", opts: ["Isobaric", "Isothermal", "Adiabatic", "Isochoric"] },
  { cat: "Engineering Questions", d: 3, q: "What reagent is used in the bromination of benzene?", a: "Br2", opts: ["HBr", "NaBr", "Br2", "Br2 / FeBr3"] },
  { cat: "Engineering Questions", d: 3, q: "What is the role of FeCl3 in chlorination of benzene?", a: "Catalyst", opts: ["Reducing agent", "Oxidizing agent", "Solvent", "Catalyst"] },
  { cat: "Engineering Questions", d: 3, q: "The most common reactions involving aromatics are what type of reactions?", a: "Substitution", opts: ["Addition", "Rearrangement", "Elimination", "Substitution"] },
  { cat: "Engineering Questions", d: 3, q: "What are the reagent and catalyst used for nitration of benzene?", a: "HNO3 / H2SO4", opts: ["HNO3 / FeCl3", "HNO3 / H2SO4", "HNO3 / HCl", "H2SO4 alone"] },
  { cat: "Engineering Questions", d: 3, q: "Which group is ortho-para directing: -CN, -NO2, -NH3+, or -NH2?", a: "-NH2", opts: ["-NO2", "-CN", "-NH2", "-NH3+"] },
  { cat: "Engineering Questions", d: 3, q: "What is the name for PbCl2?", a: "Lead(II) Chloride", opts: ["Palladium Chloride", "Lead Chlorate", "Lead(IV) Chloride", "Lead(II) Chloride"] },
  { cat: "Engineering Questions", d: 1, q: "What is the formula for barium sulfide?", a: "BaS", opts: ["BaSO4", "BaS", "Ba2S", "Ba2S3"] },
  { cat: "Engineering Questions", d: 3, q: "What is the formula for zinc hydroxide?", a: "Zn(OH)2", opts: ["ZnOH", "Zn2(OH)", "ZnO2H", "Zn(OH)2"] },
  { cat: "Engineering Questions", d: 3, q: "What is the name of CuO?", a: "Copper(II) Oxide", opts: ["Copper Peroxide", "Cobalt Oxide", "Copper(I) Oxide", "Copper(II) Oxide"] },
  { cat: "Engineering Questions", d: 3, q: "What test is used to determine whether an alkene is present?", a: "Bromine water test", opts: ["Bromine water test", "Limewater test", "Fehling's test", "Iodine test"] },
  { cat: "Engineering Questions", d: 2, q: "A large molecule made of small reactive molecules joined together is called what?", a: "Polymer", opts: ["Isotope", "Polymer", "Monomer", "Alloy"] },
  { cat: "Engineering Questions", d: 1, q: "What is a single unit or molecule in a polymer called?", a: "Monomer", opts: ["Isomer", "Compound", "Polymer", "Monomer"] },
  { cat: "Engineering Questions", d: 3, q: "What smaller subunits make up proteins?", a: "Amino acids", opts: ["Fatty acids", "Nucleotides", "Amino acids", "Monosaccharides"] },
  { cat: "Engineering Questions", d: 3, q: "What are the monomers of DNA?", a: "Nucleotides", opts: ["Peptides", "Fatty acids", "Amino acids", "Nucleotides"] },
  { cat: "Engineering Questions", d: 2, q: "Alkenes can join together because they have what type of bond?", a: "Double bond", opts: ["Ionic bond", "Single bond", "Double bond", "Triple bond"] },
  { cat: "Engineering Questions", d: 3, q: "What type of reaction breaks polymers to form monomers?", a: "Hydrolysis", opts: ["Polymerization", "Oxidation", "Hydrolysis", "Condensation"] },
  { cat: "Engineering Questions", d: 3, q: "Which bond joins monomers together?", a: "Covalent", opts: ["Covalent", "Hydrogen", "Metallic", "Ionic"] },
  { cat: "Engineering Questions", d: 1, q: "In the reaction Starch + Water → Glucose, what are the products?", a: "Glucose", opts: ["Sucrose", "Maltose", "Glucose", "Fructose"] },
  { cat: "Engineering Questions", d: 1, q: "The heavy, thick liquid collected at the bottom of a distillation column is often used for what?", a: "Making roads (bitumen)", opts: ["Making roads (bitumen)", "Making plastics", "Jet fuel", "Lubricating oil only"] },
  { cat: "Engineering Questions", d: 2, q: "What is the purpose of the reflux process in industrial distillation?", a: "To improve the purity of the fractions", opts: ["To improve the purity of the fractions", "To remove sulfur", "To lower the temperature", "To increase the yield"] },
  { cat: "Engineering Questions", d: 2, q: "What primary physical property is used to separate different components of crude oil?", a: "Boiling point", opts: ["Viscosity", "Molecular colour", "Boiling point", "Density"] },
  { cat: "Engineering Questions", d: 2, q: "Where in a distillation tower do fractions with the smallest molecules collect?", a: "At the top", opts: ["At the top", "At the furnace", "In the middle", "At the bottom"] },
  { cat: "Engineering Questions", d: 2, q: "Why is crude oil heated in a furnace before entering the distillation tower?", a: "To vaporize the mixture", opts: ["To crack the molecules", "To increase pressure", "To vaporize the mixture", "To remove impurities"] },
  { cat: "Engineering Questions", d: 3, q: "In a distillation column, what are the horizontal levels where vapors condense into liquids called?", a: "Trays", opts: ["Baffles", "Trays", "Plates only", "Condensers"] },
  { cat: "Engineering Questions", d: 3, q: "What happens to the temperature inside a fractional distillation column as you move from bottom to top?", a: "It decreases", opts: ["It stays constant", "It fluctuates", "It increases", "It decreases"] },
  { cat: "Engineering Questions", d: 3, q: "Which gaseous byproduct is primarily released when biodegradable polymers decompose anaerobically in a deep landfill?", a: "Methane", opts: ["Hydrogen sulfide", "Nitrous oxide", "Carbon dioxide", "Methane"] },
  { cat: "Engineering Questions", d: 3, q: "What process describes microorganisms using enzymes to break down polymer chains into metabolic products?", a: "Mineralization", opts: ["Pyrolysis", "Photodegradation", "Mineralization", "Vulcanization"] },
  { cat: "Engineering Questions", d: 1, q: "How many forces of flight are there?", a: "Four", opts: ["Four", "Three", "Five", "Six"] },
  { cat: "Engineering Questions", d: 2, q: "What is Bernoulli's principle used to calculate in airplanes?", a: "Aerodynamic lift", opts: ["Aerodynamic lift", "Engine thrust", "Structural load", "Fuel consumption"] },
  { cat: "Engineering Questions", d: 1, q: "What fluid property describes its internal resistance to flow?", a: "Viscosity", opts: ["Density", "Compressibility", "Viscosity", "Surface tension"] },
  { cat: "Engineering Questions", d: 1, q: "Stress is best described as what?", a: "Internal resistive force", opts: ["External applied force", "Internal resistive force", "Force per unit volume", "Deformation per unit length"] },
  { cat: "Engineering Questions", d: 3, q: "What gear mechanism converts rotary motion into translating motion?", a: "Rack and pinion", opts: ["Rack and pinion", "Bevel gear", "Planetary gear", "Worm gear"] },
  { cat: "Engineering Questions", d: 2, q: "What are the units for thermal conductivity?", a: "W/m·K", opts: ["J/kg·K", "W/m·K", "N/m·K", "W/m²·K"] },
  { cat: "Engineering Questions", d: 1, q: "The measurement of temperature as a thermodynamic property is based on which law of thermodynamics?", a: "Zeroth law of thermodynamics", opts: ["Zeroth law of thermodynamics", "Second law of thermodynamics", "Third law of thermodynamics", "First law of thermodynamics"] },
  { cat: "Engineering Questions", d: 1, q: "Steel containing 0.8% carbon has which structure according to the source question?", a: "Ferrite", opts: ["Martensite", "Cementite", "Ferrite", "Austenite"] },

];

/* ---------- مولد الرياضيات ---------- */
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
function genMathQ(d) {
  let text, ans;
  if (d === 1) {
    const x = rnd(12, 89), y = rnd(12, 89);
    if (Math.random() < 0.5) { text = `${x} + ${y}`; ans = x + y; }
    else { const a2 = Math.max(x, y), b2 = Math.min(x, y); text = `${a2} − ${b2}`; ans = a2 - b2; }
  } else if (d === 2) {
    if (Math.random() < 0.5) { const x = rnd(12, 25), y = rnd(3, 9); text = `${x} × ${y}`; ans = x * y; }
    else { const x = rnd(20, 90), y = rnd(3, 9), z = rnd(11, 40); text = `${z} + ${x} × ${y}`; ans = z + x * y; }
  } else {
    if (Math.random() < 0.5) {
      const p = [10, 15, 20, 25, 40, 60, 75][rnd(0, 6)];
      const N = rnd(2, 12) * 40; text = `${p}% من ${N}`; ans = Math.round((p / 100) * N);
    } else { const x = rnd(11, 19), y = rnd(11, 19); text = `${x} × ${y}`; ans = x * y; }
  }
  return { type: "typed", exact: true, cat: "رياضيات", d, q: "كم ناتج: " + text + "؟", a: String(ans) };
}

/* ---------- أدوات التخزين ---------- */
const jset = async (k, v, shared = true) => {
  try { await window.storage.set(k, JSON.stringify(v), shared); return true; } catch (e) { return false; }
};
const jget = async (k, shared = true) => {
  try { const r = await window.storage.get(k, shared); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
};

/* ---------- الذكاء الاصطناعي ---------- */
async function askClaude(prompt) {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), 9000); // ما ننتظر أكثر من 9 ثواني
  try {
    return await askClaudeInner(prompt, ctrl.signal);
  } finally {
    clearTimeout(killer);
  }
}

async function askClaudeInner(prompt, signal) {
  const res = await fetch("/api/claude", {
    signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "AI request failed");
  return String(data.text || "").replace(/```json|```/g, "").trim();
}


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
    const prompt = `احكم على إجابات لاعبين في لعبة أسئلة عربية. السؤال: "${question}". الإجابة النموذجية: "${modelAnswer}". اقبل الإجابة إذا كانت صحيحة المعنى حتى لو اختلفت الصياغة، أو كانت مرادفًا أو اسمًا بديلاً معروفًا، أو كُتبت بالإنجليزي بدل العربي أو العكس. ارفضها إذا كانت غلط. أرجع JSON فقط: [{"pid":"...","ok":true}]. الإجابات: ${JSON.stringify(unsure)}`;
    const raw = await askClaude(prompt);
    JSON.parse(raw).forEach((v) => { if (v && v.pid && v.ok) map[v.pid] = true; });
  } catch (e) { /* نكتفي بالتصحيح المحلي */ }
  return map;
}

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
const NO_DIFF = ["بوسات السولز", "بوسات إلدن رينق", "لور السولز"];
const noDiff = (c) => NO_DIFF.includes(c);

const INVENTIVE = ["طب وصحة", "اقتصاد وأعمال", "موسيقى", "عمارة ومعالم", "لغات وشعوب", "مقولات", "مين الشخصية؟", "خمّن البوس", "خمّن اللعبة", "بوسات إلدن رينق", "لعبة الحروف", "منطق وألغاز", "أمثال ومصطلحات", "طعام ومطبخ", "حيوانات", "فضاء", "جسم الإنسان", "السعودية", "سيارات", "اختراعات", "أعلام", "شكل ورسم", "وين المكان؟", "مين قالها؟", "وش الغرض؟",
  "الرابط المشترك", "قبل ولا بعد؟", "إيموجي", "دليلين", "الأغرب", "لو كنت مكانك"];
const CLASSIC = CATS.filter((c) => !INVENTIVE.includes(c));
// نضمن 6 فئات مبتكرة + 3 كلاسيكية كل جولة (9 خيارات)
const sampleCats = (picked) => {
  // لو الهوست حدد فئات معيّنة، ما نعرض غيرها
  if (picked && picked.length) {
    return picked.length <= 9 ? shuffle(picked) : shuffle(picked).slice(0, 9);
  }
  return shuffle([...shuffle(INVENTIVE).slice(0, 6), ...shuffle(CLASSIC).slice(0, 3)]);
};

const Sadu = () => (
  <div className="sadu" aria-hidden="true">
    <div className="zz" style={{ "--c": "#D9494F" }} />
    <div className="zz" style={{ "--c": "#F0A32F" }} />
    <div className="zz" style={{ "--c": "#2EC4A6" }} />
  </div>
);

/* ============================================================ */
export default function App() {
  const [screen, setScreen] = useState("home");
  const [role, setRole] = useState(null);
  const [me, setMe] = useState({ pid: genPid(), name: "" });
  const [code, setCode] = useState("");
  const [view, setView] = useState(null);
  const lastVerRef = useRef(0);
  const offsetRef = useRef(0); // فرق التوقيت بين جهاز اللاعب والهوست
  const viewRef = useRef(null);
  const offSamplesRef = useRef([]);
  const mySlotRef = useRef(null);
  const slotDataRef = useRef({});
  const useCounterRef = useRef(0);
  const [myq, setMyq] = useState([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState("");
  const [, forceN] = useState(0);
  const rerender = () => forceN((x) => x + 1);

  const [cfg, setCfg] = useState({ count: 30, src: { bank: true, mine: false }, picked: [], mode: "classic", teamNames: ["", ""] });

  const localRef = useRef({ qIndex: -1, renderAt: 0, answered: false, text: "" });
  const [typedText, setTypedText] = useState("");
  const [myVote, setMyVote] = useState(null);
  const [pendingItem, setPendingItem] = useState(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const lastCatQRef = useRef(-1);
  const [, setTick] = useState(0);

  const hostRef = useRef(null);

  const [storeOk, setStoreOk] = useState("checking"); // checking | ok | unknown

  useEffect(() => {
    (async () => {
      // فحص التخزين: متسامح — نعتبره سليمًا إلا لو فشلت الكتابة والقراءة معًا
      let ok = false;
      const probe = "fz:probe:" + Math.random().toString(36).slice(2, 8);
      try {
        await window.storage.set(probe, "1", true);
        ok = true; // ما رمت استثناء = الكتابة تمت
      } catch (e) { ok = false; }
      if (!ok) {
        try {
          const r = await window.storage.get(probe, true);
          if (r) ok = true;
        } catch (e) { /* لا شيء */ }
      }
      try { await window.storage.delete(probe, true); } catch (e) { /* غير مهم */ }
      setStoreOk(ok ? "ok" : "unknown");
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const savedMe = await jget("fz:me", false);
      if (savedMe && savedMe.pid) setMe(savedMe);
      const savedQ = await jget("fz:myq", false);
      if (Array.isArray(savedQ)) setMyq(savedQ.filter((x) => x.a));
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // نبض العدّاد — يشتغل فقط أثناء السؤال (سلاسة أعلى بباقي الشاشات)
  useEffect(() => {
    if (!view || !["question", "reveal", "event", "catpick", "intro", "bq", "breveal"].includes(view.phase)) return;
    // 4 مرات بالثانية تكفي للعدّاد — 100 مللي كانت تبتلع ضغطات الجوال
    const fast = view.phase === "question" || view.phase === "bq";
    const t = setInterval(() => setTick((x) => x + 1), fast ? 250 : 500);
    return () => clearInterval(t);
  }, [view && view.phase]);

  /* ---------- اختيار سؤال حسب الفئة والجولة ---------- */
  async function questionFor(cat, idx) {
    const h = hostRef.current;
    // الصعوبة تعتمد على كم مرة انختارت هذي الفئة تحديدًا — مو على رقم الجولة
    if (!h.catCount) h.catCount = {};
    h.catCount[cat] = (h.catCount[cat] || 0) + 1;
    const pick = h.catCount[cat];                       // 1 = أول مرة، 2 = ثاني مرة…
    const dT = pick === 1 ? 1 : pick === 2 ? 2 : 3;     // سهل ← متوسط ← صعب
    // النقاط ترتفع مع تكرار الفئة: ×1 → ×1.5 → ×2 → ×3 من الرابعة فصاعدًا
    const heat = pick === 1 ? 1 : pick === 2 ? 1.5 : pick === 3 ? 2 : 3;
    h.heat = heat;
    h.curPick = pick;
    const scale = (d) => Math.round((PTS[d] * heat) / 50) * 50;
    if (cat === "رياضيات") {
      const q = genMathQ(dT);
      return { ...q, pts: scale(q.d) };
    }
    let pool = [];
    if (cfg.src.mine) pool = pool.concat(myq.filter((q) => q.cat === cat).map((q) => ({ type: "typed", ...q })));
    if (cfg.src.bank) pool = pool.concat(BANK.filter((b) => b.cat === cat).map((b) => ({ type: "typed", ...b })));
    pool = pool.filter((q) => !h.used.has(qKey(q)));
    // النمط السريع: الصعوبة عشوائية تمامًا — أي سؤال من أي مستوى
    let cand = pool;
    // ما نكرر نفس الإجابة بنفس الجولة (غودريك مثلاً له أسئلة كثيرة)
    if (h.usedAns && h.usedAns.size) {
      const fresh = cand.filter((q) => !h.usedAns.has(aKey(q)));
      if (fresh.length) cand = fresh;
    }
    // ما نكرر أسئلة طلعت بجولات سابقة — إلا إذا خلصت كل أسئلة الفئة
    if (h.seenAll && h.seenAll.size) {
      const fresh = cand.filter((q) => !h.seenAll.has(qKey(q)));
      if (fresh.length) cand = fresh;
      else cand.forEach((q) => h.seenAll.delete(qKey(q))); // دورة جديدة لهذي الفئة
    }
    if (!cand.length) {
      // احتياطي: من فئات الروم المختارة فقط
      const scope = h.picked && h.picked.length ? BANK.filter((b) => h.picked.includes(b.cat)) : BANK;
      cand = scope.map((b) => ({ type: "typed", ...b })).filter((q) => !h.used.has(qKey(q)));
    }
    if (!cand.length) cand = [genMathQ(dT)];
    const q = cand[Math.floor(Math.random() * cand.length)];
    h.used.add(qKey(q));
    if (h.seenAll) {
      h.seenAll.add(qKey(q));
      jset("fz:seenQ", [...h.seenAll].slice(-1200), false); // نحفظ بالخلفية
    }
    if (h.usedAns) h.usedAns.add(aKey(q));
    if (noDiff(cat)) {
      // بلا تقييم صعوبة: نقاط موحّدة ترتفع مع تكرار الفئة
      return { ...q, nodiff: true, pts: Math.round((500 * heat) / 50) * 50 };
    }
    return { ...q, pts: scale(q.d) || 400 };
  }


  /* ---------- نمط سين جيم: بناء اللوحة ---------- */
  function makeBoard(h) {
    const usable = (arr) => arr.filter(boardReady);
    // فئاتك المختارة أولًا، ثم نكمّل الناقص عشوائيًا
    const pickedOk = shuffle(usable(h.picked || []));
    const picked = pickedOk.slice(0, BOARD_CATS_N);
    if (picked.length < BOARD_CATS_N) {
      const rest = shuffle([...usable(INVENTIVE), ...usable(CLASSIC)])
        .filter((c) => !picked.includes(c));
      picked.push(...rest.slice(0, BOARD_CATS_N - picked.length));
    }
    const taken = new Set();
    const takenAns = new Set();   // ما نكرر نفس الجواب باللوحة كلها
    const pickQ = (cat, pts) => {
      const want = ptsToDiff(pts);
      const fresh = (b) => b.cat === cat && !taken.has(qKey(b)) && !takenAns.has(aKey(b));
      let pool = BANK.filter((b) => fresh(b) && !h.seenAll.has(qKey(b)));
      if (!pool.length) pool = BANK.filter(fresh);
      if (!pool.length) pool = BANK.filter((b) => b.cat === cat && !taken.has(qKey(b)));
      if (!pool.length) return null;
      let cand = noDiff(cat) ? pool : pool.filter((b) => b.d === want);
      // لو ما فيه بالمستوى المطلوب، نجرب الأقرب قبل ما نفتح الكل
      if (!cand.length && !noDiff(cat)) {
        const near = want === 1 ? [2, 3] : want === 2 ? [1, 3] : [2, 1];
        for (const d of near) {
          cand = pool.filter((b) => b.d === d);
          if (cand.length) break;
        }
      }
      if (!cand.length) cand = pool;
      const q = cand[Math.floor(Math.random() * cand.length)];
      taken.add(qKey(q));
      takenAns.add(aKey(q));
      h.seenAll.add(qKey(q));
      return { ...q, type: "typed" };
    };
    jset("fz:seenQ", [...h.seenAll].slice(-1200), false);
    return buildBoard(picked, pickQ);
  }

  function teamOf(h, pid) {
    if (h.teams[0].members.includes(pid)) return 0;
    if (h.teams[1].members.includes(pid)) return 1;
    return -1;
  }

  // توزيع اللاعبين على فريقين بالتناوب
  function autoTeams(h) {
    const pids = Object.keys(h.players);
    h.teams[0].members = []; h.teams[1].members = [];
    pids.forEach((pid, i) => h.teams[i % 2].members.push(pid));
  }

  /* ---------- الآيتمات ---------- */
  function applyItemUse(userPid, itemId, targetPid) {
    const h = hostRef.current;
    if (!h) return false;
    const inv = h.items[userPid] || [];
    const idx = inv.indexOf(itemId);
    if (idx === -1) return false;
    const it = itemById(itemId);
    if (!it) return false;
    const victim = it.target ? targetPid : userPid;
    if (!victim || !h.players[victim]) return false;
    if (it.target && victim === userPid) return false;
    inv.splice(idx, 1);
    h.items[userPid] = inv;
    const userName = h.players[userPid] ? h.players[userPid].name : "لاعب";
    // الدرع يصد أي تخريب
    const vfx = h.fx[victim] || [];
    if (it.target && vfx.includes("shield")) {
      h.itemLog.push({ icon: "🛡️", text: `${h.players[victim].name} صدّ ${it.name} من ${userName}!` });
      return true;
    }
    h.fx[victim] = [...vfx, itemId];
    h.itemLog.push({
      icon: it.icon,
      text: it.target ? `${userName} رمى ${it.name} على ${h.players[victim].name}` : `${userName} رفع درعه`,
    });
    return true;
  }

  function grantItem(pid) {
    const h = hostRef.current;
    if (!h || !h.players[pid]) return null;
    const it = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    h.items[pid] = [...(h.items[pid] || []), it.id];
    return it;
  }

  async function useItem(itemId, targetPid) {
    if (role === "host") {
      const ok = applyItemUse(me.pid, itemId, targetPid);
      if (ok) { await broadcast(); rerender(); }
    } else {
      useCounterRef.current += 1;
      await pushSlot({ use: { q: view.qIndex, item: itemId, target: targetPid, n: useCounterRef.current } }, true);
      setToast("أرسلنا الآيتم ⚡");
    }
  }

  /* ---------- الهوست: بث الحالة ---------- */
  function durFor(h) {
    // الوقت يتحدد بصعوبة السؤال: سهل 40 ث، متوسط 32 ث، صعب 24 ث
    const q = h.questions[h.qIndex];
    const d = q && q.d ? q.d : 2;
    const base = q && q.nodiff ? Math.round(TYPED_SEC * 0.75)
      : (d === 1 ? TYPED_SEC : d === 2 ? Math.round(TYPED_SEC * 0.8) : Math.round(TYPED_SEC * 0.6));
    return h.currentEvent && h.currentEvent.id === "blitz" ? Math.round(base / 2) : base;
  }

  async function broadcast() {
    const h = hostRef.current;
    if (!h) return;
    h.ver = (h.ver || 0) + 1;
    const board = Object.entries(h.players)
      .map(([pid, p]) => ({ pid, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
    const q = h.questions[h.qIndex];
    const pub = {
      code: h.code, phase: h.phase, qIndex: h.qIndex, total: h.total,
      board, judging: !!h.judging, reveal: h.reveal || null, v: h.ver,
      answeredPids: Object.keys(h.answers || {}),
      event: ["event", "question", "closing"].includes(h.phase) ? h.currentEvent || null : null,
      chosenCat: h.chosenCat || null,
      introInfo: h.phase === "intro" && h.questions[h.qIndex]
        ? { d: h.questions[h.qIndex].d, pts: h.questions[h.qIndex].pts, pick: h.curPick || 1, nodiff: !!h.questions[h.qIndex].nodiff } : null,
      items: h.items || {}, fx: h.fx || {}, itemLog: h.itemLog || [],
      canUseItems: ["catpick", "event"].includes(h.phase),
      stageStart: h.stageStart || 0, catStart: h.catStart || 0, autoNext: h.autoNext !== false, qStartAt: h.qStart || 0,
      cm: h.phase === "catpick" ? {
        mode: h.catMode, options: h.catOptions,
        voters: (() => {
          const v = {};
          Object.entries(h.votes || {}).forEach(([pid, cat]) => {
            if (!v[cat]) v[cat] = [];
            v[cat].push(h.players[pid] ? h.players[pid].name : "لاعب");
          });
          return v;
        })(),
        voted: Object.keys(h.votes || {}).length,
        totalPlayers: Object.keys(h.players).length,
      } : null,
      mode: h.mode || "classic",
      allPlayers: Object.entries(h.players).map(([pid, p]) => ({ pid, name: p.name })),
      teams: h.teams ? h.teams.map((t) => ({ name: t.name, color: t.color, score: t.score, members: t.members, pu: t.pu })) : null,
      gboard: h.board ? h.board.map((c) => ({ cat: c.cat, tiles: c.tiles.map((x) => ({ pts: x.pts, state: x.state })) })) : null,
      turn: h.turn, owner: h.owner, answering: h.answering,
      tile: h.tile ? { ci: h.tile.ci, ti: h.tile.ti, pts: h.tile.pts, cat: h.tile.cat } : null,
      bq: h.phase === "bq" && h.tile ? {
        q: h.tile.q.q, svg: h.tile.q.svg || null, img: h.tile.q.img || null, zoom: h.tile.q.zoom || null,
        cat: h.tile.cat, pts: h.tile.pts, dur: h.qDur, opts: h.tile.q.opts || null,
        revealed: !!h.revealed, timeUp: !!h.timeUp,
        answer: h.revealed ? h.tile.q.a : null,
        alt: h.revealed ? (h.tile.q.alt || []) : null,
        info: h.revealed ? (h.tile.q.info || null) : null,
      } : null,
      puActive: h.puActive || {}, puLog: (h.puLog || []).slice(-4), restPid: h.restPid || null,
      pitOn: h.pitOn || [false, false],
      updatedAt: Date.now(),
      q: h.phase === "question" && q ? { q: q.q, svg: q.svg || null, img: q.img || null, zoom: q.zoom || null, nodiff: !!q.nodiff, opts: q.opts || null, pts: q.pts, d: q.d, cat: q.cat, dur: durFor(h) } : null,
    };
    setView(pub); // تحديث فوري للشاشة ثم الحفظ بالخلفية
    await jset(roomKey(h.code), pub);
  }

  /* ---------- الهوست: مزامنة ---------- */
  useEffect(() => {
    if (role !== "host" || screen !== "game") return;
    let busy = false;
    const iv = setInterval(async () => {
      const h = hostRef.current;
      if (!h || busy) return;
      if (h.phase === "cancelled") return;
      if (!["lobby", "question", "catpick", "event", "reveal", "intro", "board", "bq", "breveal", "bend"].includes(h.phase)) return;
      busy = true;
      try {
        // ترشيد الطلبات: مسح شامل نادر، وبعده نقرأ الخانات المشغولة فقط
        h.scanTick = (h.scanTick || 0) + 1;
        const fullScan = h.phase === "lobby" || h.scanTick % 6 === 1 || !h.liveSlots || !h.liveSlots.length;
        const toRead = fullScan
          ? Array.from({ length: MAX_SLOTS }, (_, i) => i + 1)
          : h.liveSlots;
        const slots = await Promise.all(toRead.map((n) => jget(slotKey(h.code, n))));
        if (fullScan) {
          h.liveSlots = toRead.filter((n, i) => slots[i] && slots[i].pid);
        }
        for (const a of slots) {
          if (!a || !a.pid || a.pid === me.pid) continue;
          if (Date.now() - (a.t || 0) > 120000) continue; // خانة قديمة
          if (!h.players[a.pid]) {
            h.players[a.pid] = { name: a.name || "لاعب", score: 0 };
            // بنمط سين جيم: الداخل متأخرًا ينضم للفريق الأقل عددًا
            if (h.mode === "board" && h.board && teamOf(h, a.pid) === -1) {
              const t = h.teams[0].members.length <= h.teams[1].members.length ? 0 : 1;
              h.teams[t].members.push(a.pid);
            }
          }
          if (a.name) h.players[a.pid].name = a.name;
          h.seen[a.pid] = Date.now();
          if (a.ans && a.ans.q === h.qIndex && !(a.pid in h.answers)) {
            h.answers[a.pid] = { text: a.ans.text, ms: a.ans.ms || 0 };
          }
          if (a.vote && a.vote.q === h.qIndex && a.vote.cat) {
            h.votes[a.pid] = a.vote.cat;
          }
          // --- نمط سين جيم ---
          if (h.mode === "board") {
            if (a.pick && h.phase === "board" && teamOf(h, a.pid) === h.turn) {
              const tag = "pk:" + a.pid + ":" + a.pick.n;
              if (!h.doneUses[tag]) { h.doneUses[tag] = 1; await selectTile(a.pick.ci, a.pick.ti); busy = false; return; }
            }
            if (a.pu) {
              const tag = "pu:" + a.pid + ":" + a.pu.n;
              if (!h.doneUses[tag]) {
                h.doneUses[tag] = 1;
                const tm = teamOf(h, a.pid);
                if (tm >= 0) { await applyPowerUp(tm, a.pu.id, a.pu.target); busy = false; return; }
              }
            }
          }
          if (a.use && a.use.q === h.qIndex) {
            const tag = a.pid + ":" + a.use.n;
            if (!h.doneUses) h.doneUses = {};
            if (!h.doneUses[tag]) {
              h.doneUses[tag] = 1;
              applyItemUse(a.pid, a.use.item, a.use.target);
            }
          }
        }
        // --- مؤقتات نمط سين جيم ---
        if (h.phase === "bq" && !h.revealed) {
          if (Date.now() > h.qStart + h.qDur * 1000 + 800) {
            h.revealed = true; h.timeUp = true;
            await broadcast(); busy = false; rerender(); return;
          }
        }
        if (h.phase === "breveal" && h.autoNext !== false && Date.now() - (h.stageStart || 0) > REVEAL_SEC * 1000) {
          await nextTurn(); busy = false; return;
        }
        if (h.phase === "question") {
          // كل من له خانة يُعتبر لاعبًا حاضرًا (ولو تأخر نبضه)
          const active = Object.keys(h.players).filter(
            (pid) => pid === me.pid || Date.now() - (h.seen[pid] || 0) < 90000
          );
          const allAnswered = active.length > 0 && active.every((pid) => pid in h.answers);
          const sinceStart = Date.now() - h.qStart;
          // نمهل 3 ثواني بعد البداية قبل ما نسمح بالإقفال المبكر (وقت وصول الإجابات)
          const mayCloseEarly = allAnswered && sinceStart > 3000;
          const timeUp = Date.now() > h.qStart + durFor(h) * 1000 + 4000;
          if (mayCloseEarly || timeUp) { await closeQuestion(); busy = false; return; }
        }
        // انتقال تلقائي عشان ما ينتظر أحد الهوست
        if (h.autoNext !== false && h.phase === "reveal" && Date.now() - (h.stageStart || 0) > REVEAL_SEC * 1000) {
          await advanceTo(h.qIndex + 1); busy = false; return;
        }
        if (h.autoNext !== false && h.phase === "intro" && Date.now() - (h.stageStart || 0) > INTRO_SEC * 1000) {
          await afterIntro(); busy = false; return;
        }
        if (h.autoNext !== false && h.phase === "event" && Date.now() - (h.stageStart || 0) > EVENT_SEC * 1000) {
          await beginQuestion(h.qIndex); busy = false; return;
        }
        if (h.phase === "catpick") {
          const elapsed = Date.now() - h.catStart;
          const pids = Object.keys(h.players);
          const allVoted = pids.length > 0 && pids.every((pid) => h.votes[pid]);
          if (allVoted || elapsed > VOTE_SEC * 1000) {
            await resolveCat(tallyVotes(h)); busy = false; return;
          }
        }
        await broadcast();
      } catch (e) { /* نحاول بالدورة الجاية */ }
      busy = false;
      rerender();
    }, 1400);
    return () => clearInterval(iv);
  }, [role, screen]);

  function tallyVotes(h) {
    const counts = {};
    Object.values(h.votes).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    let top = [], max = 0;
    for (const [c, n] of Object.entries(counts)) {
      if (n > max) { max = n; top = [c]; } else if (n === max) top.push(c);
    }
    return top.length ? top[rnd(0, top.length - 1)] : h.catOptions[0];
  }

  async function resolveCat(cat) {
    const h = hostRef.current;
    if (!h || h.phase !== "catpick") return;
    h.phase = "prep";
    h.chosenCat = cat;
    h.prepStart = Date.now();
    await broadcast();
    // حارس: لو تأخر التجهيز لأي سبب، نأخذ سؤالًا من البنك فورًا
    let q;
    try {
      q = await Promise.race([
        questionFor(cat, h.qIndex),
        new Promise((res) => setTimeout(() => res(null), 11000)),
      ]);
    } catch (e) { q = null; }
    if (!q) {
      // الاحتياطي يحترم الفئة المختارة، ثم فئات الروم، ثم الكل
      const inCat = BANK.filter((b) => b.cat === cat);
      const inRoom = h.picked && h.picked.length ? BANK.filter((b) => h.picked.includes(b.cat)) : BANK;
      const base = inCat.length ? inCat : inRoom;
      const pool = base.filter((b) => !h.used.has(qKey(b)));
      const pick = (pool.length ? pool : base)[Math.floor(Math.random() * (pool.length || base.length))];
      h.used.add(qKey(pick));
      q = { type: "typed", ...pick, pts: PTS[pick.d] || 400 };
    }
    h.questions[h.qIndex] = q;
    // شاشة شرح الفئة قبل ما يبدأ السؤال
    h.phase = "intro";
    h.stageStart = Date.now();
    await broadcast();
    rerender();
  }

  // بعد شاشة شرح الفئة: نكمل للحدث أو للسؤال مباشرة
  async function afterIntro() {
    const h = hostRef.current;
    if (!h || h.phase !== "intro") return;
    if (isEventSlot(h.qIndex)) {
      h.currentEvent = pickEvent(h);
      if (h.currentEvent.id === "roulette") h.rolled = rnd(1, 10) * 100;
      h.phase = "event";
      h.stageStart = Date.now();
      await broadcast();
      rerender();
    } else {
      h.currentEvent = null;
      await beginQuestion(h.qIndex);
    }
  }


  /* ============ نمط سين جيم: دورة اللعب ============ */
  async function startBoardGame() {
    const h = hostRef.current;
    if (!h) return;
    autoTeams(h);
    h.teams.forEach((t) => { t.score = 0; t.pu = freshPowerUps(); });
    h.usedAns = new Set();
    h.board = makeBoard(h);
    h.turn = 0;
    h.tile = null;
    h.pending = {};       // إجابات الجولة الحالية
    h.puActive = {};      // مفعّلة بهذي الجولة
    h.pitOn = [false, false];
    h.restPid = null;
    h.bphase = "board";
    h.phase = "board";
    await broadcast();
    rerender();
  }

  // الفريق صاحب الدور يختار خانة
  async function selectTile(ci, ti) {
    const h = hostRef.current;
    if (!h || h.phase !== "board") return;
    const cell = h.board[ci] && h.board[ci].tiles[ti];
    if (!cell || cell.state !== "available") return;
    cell.state = "active";
    h.tile = { ci, ti, pts: cell.pts, cat: h.board[ci].cat, q: cell.q };
    h.owner = h.turn;              // الفريق صاحب السؤال
    h.answering = h.turn;          // الفريق اللي يجاوب حاليًا
    h.pending = {};
    h.puActive = {};
    h.qStart = Date.now() + 3000;  // عد تنازلي قصير
    h.qDur = TEAM_SEC;
    h.revealed = false;
    h.timeUp = false;
    h.phase = "bq";
    await broadcast();
    rerender();
  }

  // الإجابة شفهية: الهوست يكشف الجواب ثم يحدد مين جاوب
  async function revealAnswer() {
    const h = hostRef.current;
    if (!h || h.phase !== "bq") return;
    h.revealed = true;
    await broadcast(); rerender();
  }

  // الهوست يمنح النقاط: team = 0 أو 1 أو null (محد جاوب)
  async function awardTile(team) {
    const h = hostRef.current;
    if (!h || h.phase !== "bq") return;
    const t = h.tile;
    const log = [];
    if (team === 0 || team === 1) {
      h.teams[team].score += t.pts;
      log.push({ team, text: `${h.teams[team].name} جاوب صح +${t.pts}` });
      const other = team === 0 ? 1 : 0;
      if (h.pitOn[other]) {
        const cut = Math.round(t.pts / 2);
        h.teams[other].score -= cut;
        log.push({ team: other, text: `🕳️ الحفرة! انخصم ${cut} من ${h.teams[other].name}` });
      }
      h.pitOn = [false, false];
    } else {
      log.push({ team: null, text: "ما أحد جاوب — لا نقاط" });
      const owner = h.owner;
      if (h.pitOn[owner]) {
        const cut = Math.round(t.pts / 2);
        h.teams[owner].score -= cut;
        log.push({ team: owner, text: `🕳️ الحفرة! انخصم ${cut} من ${h.teams[owner].name}` });
      }
      h.pitOn = [false, false];
    }
    await endTile(log, team);
  }

  // تعديل يدوي للنقاط
  async function adjustScore(team, delta) {
    const h = hostRef.current;
    if (!h || !h.teams) return;
    h.teams[team].score += delta;
    await broadcast(); rerender();
  }

  async function endTile(log, winner) {
    const h = hostRef.current;
    const t = h.tile;
    h.board[t.ci].tiles[t.ti].state = "locked";
    h.reveal = {
      cat: t.cat, pts: t.pts, qText: t.q.q, qSvg: t.q.svg || null, qImg: t.q.img || null,
      correctText: t.q.a, log: [...(h.stealLog || []), ...log], winner,
    };
    h.stealLog = null;
    h.restPid = null;
    h.stageStart = Date.now();
    h.phase = "breveal";
    await broadcast(); rerender();
  }

  async function nextTurn() {
    const h = hostRef.current;
    if (!h) return;
    h.reveal = null;
    h.tile = null;
    const left = h.board.some((c) => c.tiles.some((x) => x.state === "available"));
    if (!left) { h.phase = "bend"; await broadcast(); rerender(); return; }
    h.turn = h.turn === 0 ? 1 : 0;
    h.phase = "board";
    await broadcast(); rerender();
  }

  // استخدام وسيلة مساعدة
  async function usePowerUp(id, targetPid) {
    const h = hostRef.current;
    if (!h) return;
    const team = role === "host" ? teamOf(h, me.pid) : -1;
    if (team < 0) return;
    await applyPowerUp(team, id, targetPid);
  }

  async function applyPowerUp(team, id, targetPid) {
    const h = hostRef.current;
    const pu = puById(id);
    if (!h || !pu || (h.teams[team].pu[id] || 0) <= 0) return false;
    const other = team === 0 ? 1 : 0;
    if (pu.when === "board" && h.phase !== "board") return false;
    if (pu.when === "question" && h.phase !== "bq") return false;
    if (pu.when === "question" && h.answering !== team) return false;

    h.teams[team].pu[id] -= 1;
    if (id === "call") { h.qDur += 30; h.puActive["call"] = team; }
    if (id === "double") { h.puActive["double"] = team; }
    if (id === "pit") { h.pitOn[other] = true; }
    if (id === "rest") { h.restPid = targetPid || null; }
    if (id === "trap") { h.pitOn[other] = true; }
    h.puLog = (h.puLog || []).concat([{ icon: pu.icon, text: `${h.teams[team].name} استخدم ${pu.name}` }]);
    await broadcast(); rerender();
    return true;
  }

  /* ---------- الهوست: إغلاق السؤال والتحكيم ---------- */
  async function closeQuestion() {
    const h = hostRef.current;
    if (!h || h.phase !== "question") return;
    const q = h.questions[h.qIndex];
    const ev = h.currentEvent;
    const effPts = ev && ev.id === "roulette" ? (h.rolled || 400) : q.pts;
    h.phase = "closing";
    const entries = Object.entries(h.answers)
      .filter(([, a]) => (a.text || "").trim())
      .map(([pid, a]) => ({ pid, text: a.text }));
    let okMap = {};
    if (q.exact) {
      entries.forEach((en) => { okMap[en.pid] = normNum(en.text) === normNum(q.a); });
    } else {
      h.judging = true;
      await broadcast();
      okMap = entries.length ? await judgeTyped(q.q, q.a, entries, true, q.alt) : {};
      h.judging = false;
    }

    // من وقع عليه "كنسل" تنلغى إجابته
    Object.keys(okMap).forEach((pid) => {
      if ((h.fx[pid] || []).includes("cancel")) okMap[pid] = false;
    });

    const correct = Object.entries(h.answers)
      .filter(([pid]) => okMap[pid])
      .sort((x, y) => (x[1].ms || 0) - (y[1].ms || 0));
    const fastestPid = correct.length ? correct[0][0] : null;

    const results = Object.entries(h.players).map(([pid, p]) => {
      const a = h.answers[pid];
      const ok = !!(a && okMap[pid]);
      let gained = 0;
      if (ok) {
        if (ev && ev.id === "sniper") {
          gained = pid === fastestPid ? effPts + Math.round(effPts / 2) : 0;
        } else if (ev && ev.id === "steal") {
          gained = effPts; // بونص السرعة هنا هو السرقة نفسها
        } else {
          gained = effPts + (pid === fastestPid ? Math.round(effPts / 2) : 0);
        }
        if (ev && ev.id === "double") gained *= 2;
        if ((h.fx[pid] || []).includes("tax")) gained = Math.round(gained / 2);
      } else if (a && ev && ev.id === "risk") {
        gained = -Math.round(effPts / 2);
      }
      p.score += gained;
      return { pid, name: p.name, ok, ms: a ? a.ms : null, gained, fastest: pid === fastestPid && ok, answered: !!a, text: a ? a.text : null };
    });

    // حدث السرقة: الأسرع الصح يسحب نص النقاط من أعلى لاعب غيره
    let stealInfo = null;
    if (ev && ev.id === "steal" && fastestPid) {
      const amount = Math.round(effPts / 2);
      const others = Object.entries(h.players).filter(([pid]) => pid !== fastestPid).sort((x, y) => y[1].score - x[1].score);
      if (others.length && amount > 0) {
        const [vicPid, vic] = others[0];
        vic.score -= amount;
        h.players[fastestPid].score += amount;
        const thiefRow = results.find((r) => r.pid === fastestPid);
        const vicRow = results.find((r) => r.pid === vicPid);
        if (thiefRow) thiefRow.gained += amount;
        if (vicRow) vicRow.gained -= amount;
        stealInfo = { thief: h.players[fastestPid].name, victim: vic.name, amount };
      }
    }

    // جائزة: الفائز بسؤال الحدث ياخذ آيتم تخريب
    let grantInfo = null;
    if (ev && fastestPid) {
      const got = grantItem(fastestPid);
      if (got) grantInfo = { name: h.players[fastestPid].name, item: got };
    }
    const usedFx = h.fx;
    h.fx = {}; // التأثيرات تنتهي بنهاية السؤال

    results.sort((x, y) => y.gained - x.gained || (x.ms || 1e9) - (y.ms || 1e9));
    results.forEach((r) => { r.fx = usedFx[r.pid] || []; });
    h.stageStart = Date.now();
    h.reveal = {
      grant: grantInfo,
      correctText: q.a, qText: q.q, qSvg: q.svg || null, qImg: q.img || null, info: q.info || null, results, pts: effPts, event: ev || null,
      rolled: ev && ev.id === "roulette" ? effPts : null, steal: stealInfo,
    };
    h.phase = "reveal";
    await broadcast();
    rerender();
  }

  /* ---------- الهوست: التنقل ---------- */
  function pickEvent(h) {
    if (!h.eventPool || !h.eventPool.length) h.eventPool = shuffle(EVENTS.map((e) => e.id));
    const id = h.eventPool.pop();
    return EVENTS.find((e) => e.id === id);
  }

  async function beginQuestion(idx) {
    const h = hostRef.current;
    h.qIndex = idx;
    h.answers = {};
    h.qStart = Date.now() + START_DELAY; // الكل يبدأ بنفس اللحظة
    h.phase = "question";
    h.reveal = null;
    localRef.current = { qIndex: idx, renderAt: h.qStart, answered: false, text: "" };
    setTypedText("");
    await broadcast();
    rerender();
  }

  async function advanceTo(idx) {
    const h = hostRef.current;
    if (!h) return;
    h.reveal = null;
    h.currentEvent = null;
    if (idx >= h.total) {
      h.phase = "end";
      await broadcast();
      rerender();
      return;
    }
    h.qIndex = idx;
    h.catMode = "vote"; // التصويت دايم — الأعلى أصواتًا يفوز والتعادل عشوائي
    h.pickerPid = null;
    h.catOptions = sampleCats(h.picked);
    h.votes = {};
    h.catStart = Date.now();
    h.chosenCat = null;
    h.itemLog = [];
    Object.keys(h.players).forEach((pid) => { if (!h.items[pid]) h.items[pid] = []; });
    h.phase = "catpick";
    await broadcast();
    rerender();
  }

  async function startGame() {
    const h = hostRef.current;
    if (!h) return;
    if (h.mode === "board") { await startBoardGame(); return; }
    Object.values(h.players).forEach((p) => { p.score = 0; });
    h.eventPool = null;
    h.used = new Set();
    h.questions = [];
    h.items = {}; h.fx = {}; h.itemLog = [];
    h.catCount = {};
    h.usedAns = new Set();
    Object.keys(h.players).forEach((pid) => { h.items[pid] = []; });
    await advanceTo(0);
  }

  // الهوست يلغي اللعبة — الكل يطلع للرئيسية
  async function cancelGame() {
    const h = hostRef.current;
    if (!h) return;
    h.phase = "cancelled";
    h.reveal = null;
    h.currentEvent = null;
    await broadcast();
    for (let s = 1; s <= MAX_SLOTS; s++) {
      try { await window.storage.delete(slotKey(h.code, s), true); } catch (e) { /* عادي */ }
    }
    hostRef.current = null;
    setScreen("home"); setRole(null); setView(null); setCode("");
    setToast("انلغت اللعبة");
  }

  // أي لاعب يطلع — اللعبة تكمل بدونه
  async function leaveGame() {
    if (role === "player") {
      const s = mySlotRef.current;
      if (s) { try { await window.storage.delete(slotKey(code, s), true); } catch (e) { /* عادي */ } }
      mySlotRef.current = null;
      slotDataRef.current = {};
    }
    setScreen("home"); setRole(null); setView(null); setCode("");
    setToast("طلعت من اللعبة");
  }

  async function playAgain() {
    const h = hostRef.current;
    h.phase = "lobby";
    h.qIndex = 0;
    h.reveal = null;
    h.currentEvent = null;
    h.eventPool = null;
    h.used = new Set();
    h.questions = [];
    h.items = {}; h.fx = {}; h.itemLog = [];
    h.catCount = {};
    h.usedAns = new Set();
    Object.keys(h.players).forEach((pid) => { h.items[pid] = []; });
    Object.values(h.players).forEach((p) => { p.score = 0; });
    await broadcast();
    rerender();
  }

  /* ---------- التصويت / الاختيار ---------- */
  async function castVote(cat) {
    setMyVote(cat);
    if (role === "host") {
      const h = hostRef.current;
      if (!h || h.phase !== "catpick") return;
      h.votes[me.pid] = cat;
    } else {
      await pushSlot({ vote: { q: view.qIndex, cat } }, true);
    }
  }

  /* ---------- إنشاء روم ---------- */
  async function createRoom() {
    if (!me.name.trim()) { setToast("اكتب اسمك أول"); return; }
    if (!cfg.src.bank && !(cfg.src.mine && myq.length)) {
      setToast("لازم تفعّل بنك الأسئلة أو تضيف أسئلتك أول");
      return;
    }
    setLoading("نجهّز الروم…");
    await jset("fz:me", me, false);
    const prevSeen = await jget("fz:seenQ", false);
    const c = genCode();
    // تنظيف أي خانات قديمة لنفس الرمز
    for (let s = 1; s <= MAX_SLOTS; s++) { try { await window.storage.delete(slotKey(c, s), true); } catch (e) { /* ما فيه */ } }
    hostRef.current = {
      code: c, total: cfg.count, questions: [], used: new Set(), qIndex: 0, qStart: 0, phase: "lobby",
      players: { [me.pid]: { name: me.name.trim(), score: 0 } },
      answers: {}, votes: {}, reveal: null, judging: false, currentEvent: null, eventPool: null, ver: 0,
      items: { [me.pid]: [] }, fx: {}, itemLog: [], seen: {}, doneUses: {}, usedAns: new Set(), picked: cfg.picked || [], stageStart: 0, autoNext: cfg.autoNext !== false,
      catMode: "vote", pickerPid: null, catOptions: [], catStart: 0, chosenCat: null, rolled: 0, catCount: {},
      seenAll: new Set(Array.isArray(prevSeen) ? prevSeen : []),
      mode: cfg.mode || "classic",
      teams: [
        { name: (cfg.teamNames && cfg.teamNames[0]) || "الفريق الأول", color: TEAM_COLORS[0], score: 0, members: [], pu: freshPowerUps() },
        { name: (cfg.teamNames && cfg.teamNames[1]) || "الفريق الثاني", color: TEAM_COLORS[1], score: 0, members: [], pu: freshPowerUps() },
      ],
      board: null, turn: 0, tile: null, owner: 0, answering: 0, pending: {},
      puActive: {}, pitOn: [false, false], restPid: null, stealDone: false, puLog: [],
    };
    setCode(c);
    setRole("host");
    setScreen("game");
    setLoading("");
    await broadcast();
  }

  /* ---------- انضمام لاعب ---------- */
  const [joinCode, setJoinCode] = useState("");
  async function joinRoom() {
    if (!me.name.trim()) { setToast("اكتب اسمك أول"); return; }
    const c = joinCode.trim().toUpperCase();
    if (c.length !== 4) { setToast("الرمز 4 حروف"); return; }
    setLoading("ندوّر الروم…");
    let st = null;
    for (let i = 0; i < 3 && !st; i++) {
      if (i) await new Promise((r) => setTimeout(r, 900));
      st = await jget(roomKey(c));
    }
    setLoading("");
    if (!st) {
      setToast("ما لقينا روم «" + c + "» — تأكدون إنكم على نفس الرابط بالضبط");
      return;
    }
    await jset("fz:me", me, false);
    setLoading("نحجز لك مكان…");
    const s = await claimSlot(c);
    setLoading("");
    if (!s) { setToast("الروم ممتلئ (الحد " + MAX_SLOTS + " لاعبين)"); return; }
    mySlotRef.current = s;
    setCode(c);
    setRole("player");
    lastVerRef.current = st.v || 0;
    setView(st);
    setScreen("game");
  }

  // حجز خانة: نجرب الخانات بالترتيب ونتأكد إنها صارت لنا فعلاً
  async function claimSlot(c) {
    for (let s = 1; s <= MAX_SLOTS; s++) {
      const cur = await jget(slotKey(c, s));
      const free = !cur || !cur.pid || cur.pid === me.pid || Date.now() - (cur.t || 0) > 120000;
      if (!free) continue;
      await jset(slotKey(c, s), { pid: me.pid, name: me.name.trim(), t: Date.now() });
      await new Promise((r) => setTimeout(r, 350));
      const back = await jget(slotKey(c, s));
      if (back && back.pid === me.pid) return s;  // تأكدنا إنها لنا
    }
    return null;
  }

  // كتابة حالة اللاعب كاملة في خانته (اسم + إجابة + تصويت + آيتم)
  async function pushSlot(patch, critical) {
    const s = mySlotRef.current;
    if (!s) return false;
    slotDataRef.current = { ...slotDataRef.current, ...patch, pid: me.pid, name: me.name, t: Date.now() };
    let ok = await jset(slotKey(code, s), slotDataRef.current);
    // الإجابات والأصوات مهمة: نعيد المحاولة لو فشلت الكتابة
    if (!ok && critical) {
      for (let i = 0; i < 3 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        slotDataRef.current.t = Date.now();
        ok = await jset(slotKey(code, s), slotDataRef.current);
      }
    }
    return ok;
  }

  /* ---------- اللاعب: مزامنة ---------- */
  useEffect(() => {
    if (role !== "player" || screen !== "game") return;
    let beat = 0;
    let timer = null;
    const loop = async () => {
      // نبض حضور: نعيد كتابة مفتاحنا كل ~6 ثواني تحسبًا لتأخر المزامنة
      beat++;
      if (beat % 10 === 1) pushSlot({}); // نبض حضور كل ~15 ثانية (ترشيد الطلبات)
      const t0 = Date.now();
      const st = await jget(roomKey(code));
      if (st && (st.v || 0) >= lastVerRef.current) {
        lastVerRef.current = st.v || 0;
        // نقدّر فرق الساعة: نأخذ أقل قيمة مقاسة (أقل تأخير شبكة)
        if (st.updatedAt) {
          const rtt = Date.now() - t0;
          const off = t0 + rtt / 2 - st.updatedAt;
          const arr = offSamplesRef.current;
          arr.push(off);
          if (arr.length > 40) arr.shift();
          // أدق عيّنة = أقلها (أقل تأخير تخزين)، وناخذ متوسط أفضل 5 لتقليل الضجيج
          const best = [...arr].sort((a, b) => a - b).slice(0, 5);
          offsetRef.current = best.reduce((s, x) => s + x, 0) / best.length;
        }
        setView(st);
      }
      // وتيرة متغيرة: سريعة بمراحل الانتظار (عشان يوصل السؤال بلا تأخير)، أهدأ أثناء السؤال
      const ph = viewRef.current && viewRef.current.phase;
      const gap = ["lobby", "catpick", "prep", "event"].includes(ph) ? 550 : 1500;
      timer = setTimeout(loop, gap);
    };
    loop();
    return () => clearTimeout(timer);
  }, [role, screen, code]);

  useEffect(() => { viewRef.current = view; setConfirmExit(false); }, [view && view.phase]);

  // لو الهوست ألغى اللعبة، اللاعبين يطلعون تلقائيًا
  useEffect(() => {
    if (role === "player" && view && view.phase === "cancelled") {
      mySlotRef.current = null;
      slotDataRef.current = {};
      setScreen("home"); setRole(null); setView(null); setCode("");
      setToast("الهوست ألغى اللعبة");
    }
  }, [view && view.phase, role]);

  useEffect(() => {
    if (!view) return;
    if (view.phase === "question" && localRef.current.qIndex !== view.qIndex) {
      const official = view.qStartAt ? view.qStartAt + (role === "host" ? 0 : offsetRef.current) : Date.now();
      // لو وصلك السؤال متأخر، ما تنعاقب: وقتك يبدأ من لحظة وصوله لك
      const startLocal = Math.max(official, Date.now());
      localRef.current = { qIndex: view.qIndex, renderAt: startLocal, answered: false, text: "" };
      setTypedText("");
    }
    if (view.phase === "bq" && view.tile) {
      const key = view.tile.ci + ":" + view.tile.ti + ":" + view.answering;
      if (localRef.current.bkey !== key) {
        const off = view.qStartAt ? view.qStartAt + (role === "host" ? 0 : offsetRef.current) : Date.now();
        localRef.current = { bkey: key, qIndex: -1, renderAt: Math.max(off, Date.now()), answered: false, text: "" };
        setTypedText("");
      }
    }
    if (view.phase === "catpick" && lastCatQRef.current !== view.qIndex) {
      lastCatQRef.current = view.qIndex;
      setMyVote(null);
    }
  }, [view && view.phase, view && view.qIndex]);

  /* ---------- إرسال الإجابة ---------- */
  async function answerTyped() {
    if (localRef.current.answered || !typedText.trim()) return;
    if (Date.now() < localRef.current.renderAt) return; // ما بدأ السؤال بعد
    const ms = Date.now() - localRef.current.renderAt;
    localRef.current.answered = true;
    localRef.current.text = typedText.trim();
    rerender();
    const reopen = () => { localRef.current.answered = false; rerender(); };
    if (role === "host") {
      const h = hostRef.current;
      if (h && h.phase === "question" && !(me.pid in h.answers)) h.answers[me.pid] = { text: typedText.trim(), ms };
    } else {
      const sent = await pushSlot({ ans: { q: view.qIndex, text: typedText.trim(), ms } }, true);
      if (!sent) { reopen(); setToast("تعذّر إرسال إجابتك — اضغط أرسل مرة ثانية"); }
    }
  }

  /* ---------- نمط سين جيم: أفعال اللاعب ---------- */
  const myTeam = () => {
    if (!view || !view.teams) return -1;
    if (view.teams[0].members.includes(me.pid)) return 0;
    if (view.teams[1].members.includes(me.pid)) return 1;
    return -1;
  };

  async function pickTile(ci, ti) {
    if (!view || view.phase !== "board") return;
    // الهوست يدير اللوحة للجميع، واللاعب لازم يكون دوره
    if (role === "host") { await selectTile(ci, ti); return; }
    if (myTeam() !== view.turn) return;
    useCounterRef.current += 1;
    await pushSlot({ pick: { ci, ti, n: useCounterRef.current } }, true);
  }

  async function sendPowerUp(id, target) {
    if (role === "host") {
      const h = hostRef.current;
      const t = h.phase === "board" ? h.turn : h.owner;
      await applyPowerUp(t, id, target);
      return;
    }
    const t = myTeam();
    if (t < 0) return;
    useCounterRef.current += 1;
    await pushSlot({ pu: { id, target, n: useCounterRef.current } }, true);
    setToast("أرسلنا الوسيلة ⚡");
  }

  /* ---------- محرر أسئلتي ---------- */
  const [ed, setEd] = useState({ q: "", a: "", alt: "", d: 2, cat: "عام" });
  async function saveMyQuestion() {
    if (!ed.q.trim()) { setToast("اكتب نص السؤال"); return; }
    if (!ed.a.trim()) { setToast("اكتب الإجابة النموذجية"); return; }
    const item = {
      type: "typed", q: ed.q.trim(), a: ed.a.trim(), d: ed.d, cat: ed.cat,
      alt: ed.alt.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
    };
    const next = [...myq, item];
    setMyq(next);
    await jset("fz:myq", next, false);
    setEd({ q: "", a: "", alt: "", d: 2, cat: ed.cat });
    setToast("انحفظ السؤال ✓");
  }
  async function deleteMyQuestion(i) {
    const next = myq.filter((_, idx) => idx !== i);
    setMyq(next);
    await jset("fz:myq", next, false);
  }

  /* ============================ الواجهات ============================ */

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Lalezar&family=Rubik:wght@400;500;700&display=swap');
    :root{
      --bg:#17121F; --sur:#241C31; --sur2:#2E2440; --line:#3D3153;
      --sand:#F3EADA; --dim:#9C90B0; --red:#D9494F; --amber:#F0A32F; --teal:#2EC4A6;
    }
    .fz *{box-sizing:border-box; margin:0; padding:0;}
    /* استجابة فورية للمس بالجوال — بدون تأخير ولا ضغطات ضائعة */
    .fz button, .fz input, .fz textarea, .fz select{
      touch-action:manipulation; -webkit-tap-highlight-color:transparent;}
    .fz button{-webkit-user-select:none; user-select:none;}
    .fz input, .fz textarea{-webkit-user-select:text; user-select:text; font-size:16px;}
    .fz button:active:not(:disabled){opacity:.75;}
    .fz{min-height:100vh; background:var(--bg); color:var(--sand); font-family:'Rubik',sans-serif; direction:rtl;}
    .wrap{max-width:520px; margin:0 auto; padding:20px 16px 48px; animation:fadeUp .28s ease both;}
    @keyframes fadeUp{from{opacity:0; transform:translateY(10px);}to{opacity:1; transform:none;}}
    .disp{font-family:'Lalezar',cursive; font-weight:400; letter-spacing:.5px;}
    .logo{font-family:'Lalezar',cursive; font-size:54px; line-height:1; text-align:center; color:var(--sand); direction:ltr; letter-spacing:2px;}
    .logo span{color:var(--amber);}
    .tag{text-align:center; color:var(--dim); margin-top:6px; font-size:15px;}
    .sadu{display:flex; flex-direction:column; gap:3px; margin:18px 0;}
    .zz{height:6px; opacity:.9;
      background:
        linear-gradient(-45deg, transparent 70%, var(--c) 70%) 0 0/12px 6px repeat-x,
        linear-gradient(45deg, transparent 70%, var(--c) 70%) 6px 0/12px 6px repeat-x;}
    .card{background:var(--sur); border:1px solid var(--line); border-radius:18px; padding:18px; margin-top:14px;}
    .btn{display:block; width:100%; border:none; border-radius:14px; padding:16px; font-size:18px; font-family:'Rubik',sans-serif;
      font-weight:700; cursor:pointer; transition:transform .12s ease, filter .15s ease; color:var(--bg);}
    .btn:active{transform:scale(.96);}
    .btn:focus-visible{outline:3px solid var(--amber); outline-offset:2px;}
    .btn-red{background:var(--red); color:#fff;}
    .btn-amber{background:var(--amber);}
    .btn-ghost{background:transparent; color:var(--sand); border:1.5px solid var(--line);}
    .btn:disabled{opacity:.45; cursor:default;}
    .inp{width:100%; background:var(--sur2); border:1.5px solid var(--line); border-radius:12px; padding:14px;
      color:var(--sand); font-size:17px; font-family:'Rubik',sans-serif; transition:border-color .15s ease;}
    .inp:focus{outline:none; border-color:var(--amber);}
    .lbl{display:block; color:var(--dim); font-size:14px; margin:14px 0 6px;}
    .chips{display:flex; flex-wrap:wrap; gap:8px;}
    .chip{border:1.5px solid var(--line); background:var(--sur2); color:var(--sand); border-radius:999px;
      padding:8px 14px; font-size:14px; cursor:pointer; font-family:'Rubik',sans-serif;
      transition:transform .12s ease, background .15s ease, border-color .15s ease;}
    .chip:active{transform:scale(.94);}
    .chip.on{background:var(--red); border-color:var(--red); color:#fff; font-weight:700;}
    .chip:focus-visible{outline:2px solid var(--amber); outline-offset:2px;}
    .seg{display:flex; gap:8px;}
    .seg .chip{flex:1; text-align:center;}
    .catGrid{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px;}
    .catBtn{border:1.5px solid var(--line); background:var(--sur); color:var(--sand); border-radius:14px;
      padding:18px 10px; font-size:16px; font-weight:700; cursor:pointer; font-family:'Rubik',sans-serif;
      transition:transform .12s ease, border-color .15s ease, background .15s ease;}
    .catBtn:active{transform:scale(.95);}
    .catBtn.on{background:var(--amber); border-color:var(--amber); color:var(--bg);}
    .catBtn:focus-visible{outline:3px solid var(--amber); outline-offset:2px;}
    .codebox{font-family:'Lalezar',cursive; font-size:56px; letter-spacing:12px; text-align:center;
      color:var(--amber); background:var(--sur2); border:2px dashed var(--amber); border-radius:16px; padding:8px 0 2px; direction:ltr;}
    .plist{display:flex; flex-direction:column; gap:8px; margin-top:10px;}
    .prow{display:flex; align-items:center; justify-content:space-between; background:var(--sur2);
      border-radius:12px; padding:12px 14px;}
    .ptsTile{font-family:'Lalezar',cursive; font-size:26px; color:var(--amber); background:var(--sur2);
      border:1.5px solid var(--line); border-radius:12px; padding:2px 14px 0; display:inline-block;}
    .qtext{font-size:22px; font-weight:700; line-height:1.6; margin:14px 0;}
    .fuseTrack{height:10px; background:var(--sur2); border-radius:999px; overflow:hidden; margin-top:14px;}
    .fuseBar{height:100%; background:linear-gradient(90deg, var(--amber), var(--red)); border-radius:999px;
      transition:width .12s linear; margin-inline-start:auto;}
    .meta{display:flex; align-items:center; justify-content:space-between; gap:8px;}
    .badge{font-size:13px; color:var(--dim);}
    .evBanner{display:flex; align-items:center; gap:10px; background:#3A2E1E; border:1.5px solid var(--amber);
      border-radius:14px; padding:10px 14px; margin-top:12px; font-weight:700; color:var(--amber);}
    .evSplash{text-align:center; padding:30px 0 10px;}
    .evIcon{font-size:72px; line-height:1;}
    .evName{font-family:'Lalezar',cursive; font-size:44px; color:var(--amber); margin-top:8px;}
    .introDesc{color:var(--sand); font-size:17px; line-height:1.9; margin-top:14px;
      background:var(--sur); border:1px solid var(--line); border-radius:16px; padding:16px; text-align:center;}
    .evDesc{color:var(--sand); font-size:18px; margin-top:6px; line-height:1.7;}
    .rrow{display:flex; align-items:center; justify-content:space-between; background:var(--sur2);
      border-radius:12px; padding:12px 14px; margin-top:8px;}
    .rrow.ok{border-inline-start:4px solid var(--teal);}
    .rrow.bad{border-inline-start:4px solid var(--red); opacity:.85;}
    .gain{font-family:'Lalezar',cursive; font-size:22px;}
    .correctBox{background:#173330; border:1.5px solid var(--teal); color:var(--teal); border-radius:14px;
      padding:14px; font-size:18px; font-weight:700; text-align:center;}
    .stealBox{background:#33202E; border:1.5px solid var(--red); color:var(--sand); border-radius:14px;
      padding:12px; font-size:16px; font-weight:700; text-align:center; margin-top:10px;}
    .itemGrid{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;}
    .itemBtn{display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center;
      background:var(--sur2); border:1.5px solid var(--line); color:var(--sand); border-radius:14px;
      padding:12px 8px; cursor:pointer; font-family:'Rubik',sans-serif; font-size:13px;
      transition:transform .12s ease, border-color .15s ease;}
    .itemBtn:active{transform:scale(.94);}
    .itemBtn:hover{border-color:var(--amber);}
    .itemBtn:focus-visible{outline:3px solid var(--amber); outline-offset:2px;}
    .logRow{background:var(--sur2); border-radius:10px; padding:8px 12px; font-size:14px; margin-bottom:6px;}
    .fxBanner{display:flex; flex-wrap:wrap; gap:10px; justify-content:center; background:#33202E;
      border:1.5px solid var(--red); border-radius:14px; padding:10px; margin-top:12px;
      font-weight:700; font-size:14px; color:var(--sand);}
    .grantBox{background:#1E3320; border:1.5px solid var(--teal); color:var(--sand); border-radius:14px;
      padding:12px; font-size:16px; font-weight:700; text-align:center; margin-top:10px;}
    .voteTicks{display:block; color:var(--teal); font-size:15px; letter-spacing:2px; margin-top:4px;}
    .voterNames{display:block; color:var(--dim); font-size:11px; letter-spacing:0; font-weight:400; margin-top:2px;}
    .qImg{background:var(--sur2); border:1.5px solid var(--line); border-radius:14px; padding:14px;
      display:flex; justify-content:center; align-items:center; margin-bottom:4px;}
    .qImg svg{width:100%; max-width:260px; height:auto; display:block;}
    .exitBar{display:flex; justify-content:flex-start; margin-bottom:4px;}
    .exitBtn{background:transparent; border:1.5px solid var(--line); color:var(--dim); border-radius:999px;
      padding:6px 14px; font-size:13px; cursor:pointer; font-family:'Rubik',sans-serif; transition:all .15s ease;}
    .exitBtn:hover{border-color:var(--dim); color:var(--sand);}
    .exitBtn.danger{border-color:#5A2A32; color:#C4707A;}
    .exitBtn.danger:hover{border-color:var(--red); color:var(--red);}
    .qPhoto{background:var(--sur2); border:1.5px solid var(--line); border-radius:14px;
      overflow:hidden; margin-bottom:6px; display:block;}
    .qPhoto img{width:100%; display:block; max-height:420px; object-fit:contain;
      transition:transform .3s ease; background:#1B1526;}
    /* مع الزوم نحتاج قص عشان التقريب يبان */
    .qPhoto.zoomed img{aspect-ratio:16/10; object-fit:cover; max-height:none;}
    .catPick{display:flex; flex-wrap:wrap; gap:8px; max-height:230px; overflow-y:auto;
      background:var(--sur); border:1px solid var(--line); border-radius:14px; padding:12px;}
    .scoreBar{display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 12px; justify-content:center;}
    .scoreChip{display:flex; align-items:center; gap:6px; background:var(--sur2); border:1.5px solid var(--line);
      border-radius:999px; padding:5px 12px; font-size:13px; transition:border-color .2s ease;}
    .scoreChip.me{border-color:var(--amber);}
    .scoreChip.done{border-color:var(--teal);}
    .scoreRank{color:var(--dim); font-size:11px; min-width:14px; text-align:center;}
    .scoreName{font-weight:500; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .scoreVal{font-family:'Lalezar',cursive; color:var(--amber); font-size:16px;}
    .scoreTick{color:var(--teal); font-size:12px;}
    .jWrap{max-width:760px;}
    .jTop{display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;}
    .jBrand{font-family:'Lalezar',cursive; font-size:22px; color:var(--amber); letter-spacing:1px;}
    .jBrand b{color:var(--sand); font-weight:400;}
    .jTurn{margin-inline-start:auto; color:#fff; font-weight:700; font-size:13px;
      border-radius:999px; padding:6px 16px;}
    .jTop .exitBar{margin:0;}
    .qHead{display:flex; align-items:center; justify-content:space-between; margin:6px 0;}
    .qPts{font-family:'Lalezar',cursive; font-size:34px; color:var(--amber);}
    .qClock{font-family:'Lalezar',cursive; font-size:26px; color:var(--sand);
      background:var(--sur2); border-radius:12px; padding:2px 16px 0;}
    .qClock.hot{color:#fff; background:var(--red); animation:pl 1s ease-in-out infinite;}
    .jCard{padding:22px;}
    .jCard .qtext{font-size:24px;}
    .ansBox{background:#173330; border:2px solid var(--teal); border-radius:16px;
      padding:18px; text-align:center; font-size:26px; font-weight:700; color:var(--teal);
      margin-top:14px; animation:pp .35s cubic-bezier(.2,1.4,.4,1);}
    .ansLbl{display:block; font-size:12px; color:var(--dim); font-weight:400; margin-bottom:4px;}
    .ansAlt{font-size:13px; color:var(--dim); font-weight:400; margin-top:8px;}
    .ansInfo{font-size:14px; color:var(--sand); font-weight:400; line-height:1.8; margin-top:12px;
      padding-top:12px; border-top:1px solid rgba(46,196,166,.3); text-align:right;}
    .judgeBox{margin-top:16px;}
    .jAward{color:#fff !important; font-size:17px;}
    .puRow{display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:16px;}
    .puBtn{display:flex; align-items:center; gap:6px; background:var(--sur2);
      border:1.5px solid var(--line); color:var(--sand); border-radius:999px;
      padding:8px 14px; font-size:13px; cursor:pointer; font-family:'Rubik',sans-serif;
      transition:all .15s ease;}
    .puBtn:not(:disabled):hover{border-color:var(--amber); color:var(--amber);}
    .puBtn:disabled{opacity:.35; cursor:default;}
    .puBtn b{color:var(--amber);}
    .scoreAdj{display:flex; gap:6px; justify-content:center; margin-top:4px;}
    .scoreAdj button{width:30px; height:26px; border-radius:8px; border:1px solid var(--line);
      background:var(--sur2); color:var(--sand); font-size:16px; cursor:pointer; line-height:1;}
    .scoreAdj button:hover{border-color:var(--amber); color:var(--amber);}
    .teamBar{display:flex; gap:10px; margin:10px 0 14px;}
    .teamCard{flex:1; background:var(--sur); border:2px solid var(--line); border-radius:16px;
      padding:12px 10px; text-align:center; transition:all .25s ease; position:relative;}
    .teamCard.turn{border-color:var(--tc); background:var(--sur2); transform:translateY(-3px);
      box-shadow:0 6px 18px rgba(0,0,0,.35);}
    .teamCard.turn::before{content:""; position:absolute; inset-inline:16px; top:-2px; height:4px;
      background:var(--tc); border-radius:0 0 6px 6px;}
    .teamName{font-weight:700; font-size:14px; color:var(--tc);}
    .teamScore{font-family:'Lalezar',cursive; font-size:30px; color:var(--sand); line-height:1.1;}
    .teamMembers{font-size:11px; color:var(--dim); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .jBoard{display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:12px;}
    .jCol{display:flex; flex-direction:column; gap:5px;}
    .jCat{background:var(--amber); color:var(--bg); border-radius:12px 12px 4px 4px; padding:10px 4px;
      font-size:12px; font-weight:700; text-align:center; min-height:44px; display:flex;
      align-items:center; justify-content:center; line-height:1.3; margin-bottom:3px;}
    .jTile{border:none; background:var(--sur2); color:var(--amber);
      border-radius:10px; padding:14px 4px; font-family:'Lalezar',cursive; font-size:22px;
      cursor:pointer; transition:transform .12s ease, background .15s ease;}
    .jTile:not(:disabled):hover{background:var(--amber); color:var(--bg);}
    .jTile:active:not(:disabled){transform:scale(.93);}
    .jTile.locked{background:transparent; color:#2E2440; cursor:default; box-shadow:inset 0 0 0 1.5px #2E2440;}
    .jTile:disabled{cursor:default;}
    @media (max-width:420px){ .jBoard{gap:5px;} .jCat{font-size:10px;} .jTile{font-size:16px; padding:9px 2px;} }
    .optGrid{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
    .optBtn{background:var(--sur2); border:1.5px solid var(--line); color:var(--sand);
      border-radius:12px; padding:13px 10px; font-size:15px; font-family:'Rubik',sans-serif;
      cursor:pointer; transition:all .15s ease; text-align:center;}
    .optBtn:not(:disabled):hover{border-color:var(--amber); color:var(--amber);}
    .optBtn.on{border-color:var(--amber); background:var(--amber); color:var(--bg); font-weight:700;}
    .optBtn.right{border-color:var(--teal); background:#173330; color:var(--teal); font-weight:700;}
    .optBtn:disabled{opacity:.5; cursor:default;}
    @media (max-width:400px){ .optGrid{grid-template-columns:1fr;} }
    .cdNum{font-family:'Lalezar',cursive; font-size:96px; line-height:1; color:var(--amber);
      animation:cdPop .5s cubic-bezier(.2,1.5,.4,1);}
    @keyframes cdPop{0%{transform:scale(.4); opacity:0;}60%{transform:scale(1.15);}100%{transform:scale(1); opacity:1;}}
    .warnBox{background:#3A2418; border:1.5px solid var(--red); color:var(--sand); border-radius:14px;
      padding:14px; font-size:15px; font-weight:700; margin-bottom:14px; text-align:right;}
    .hiddenQ{background:var(--sur2); border:1.5px dashed var(--line); border-radius:14px; padding:24px;
      text-align:center; font-size:20px; color:var(--dim); margin:14px 0;}
    .podium{display:flex; align-items:flex-end; justify-content:center; gap:10px; margin:22px 0 10px;}
    .pod{flex:1; max-width:120px; text-align:center;}
    .podBar{border-radius:12px 12px 0 0; display:flex; align-items:flex-start; justify-content:center;
      padding-top:8px; font-family:'Lalezar',cursive; font-size:28px; color:var(--bg);}
    .toast{position:fixed; bottom:20px; right:50%; transform:translateX(50%); background:var(--sand); color:var(--bg);
      border-radius:12px; padding:12px 20px; font-weight:700; z-index:50; box-shadow:0 8px 24px rgba(0,0,0,.4); animation:fadeUp .2s ease;}
    .overlay{position:fixed; inset:0; background:rgba(23,18,31,.92); display:flex; flex-direction:column; gap:16px;
      align-items:center; justify-content:center; z-index:40; color:var(--amber); font-size:20px; font-weight:700;}
    .spin{width:44px; height:44px; border:4px solid var(--sur2); border-top-color:var(--amber); border-radius:50%;
      animation:sp 1s linear infinite;}
    @keyframes sp{to{transform:rotate(360deg);}}
    .pulse{animation:pl 1.6s ease-in-out infinite;}
    @keyframes pl{0%,100%{opacity:1;}50%{opacity:.55;}}
    .pop{animation:pp .4s cubic-bezier(.2,1.4,.4,1);}
    @keyframes pp{0%{transform:scale(.6); opacity:0;}100%{transform:scale(1); opacity:1;}}
    .back{background:none; border:none; color:var(--dim); font-size:15px; cursor:pointer; font-family:'Rubik',sans-serif; padding:6px 0;}
    .qcount{font-family:'Lalezar',cursive; color:var(--dim); font-size:18px;}
    .flash{animation:fl .5s ease;}
    @keyframes fl{0%{background:#3A2E1E;}100%{background:var(--sur);}}
    .egg{position:fixed; right:10px; bottom:8px; background:none; border:none; color:var(--dim); opacity:.45;
      font-size:11px; cursor:pointer; font-family:'Rubik',sans-serif; z-index:30;}
    .egg:hover{opacity:.9;}
    select.inp{appearance:none;}
    @media (prefers-reduced-motion: reduce){ .fz *{animation:none!important; transition:none!important;} }
  `;

  /* ---------- الشاشات ---------- */
  const Home = () => (
    <div className="wrap">
      <div style={{ marginTop: 40 }}>
        <div className="logo">SICK <span>TRIVIA</span></div>
        <div className="tag">اكتب جوابك — الأسرع الصح ياخذها ⚡</div>
      </div>
      <Sadu />
      {storeOk === "unknown" && (
        <div className="warnBox" style={{ borderColor: "var(--amber)", background: "#3A2E1E" }}>
          ℹ️ ما قدرنا نتأكد من التخزين
          <div style={{ fontWeight: 400, fontSize: 13, marginTop: 8, lineHeight: 1.8 }}>
            جرّب عادي — غالبًا بيشتغل. ولو ما ظهر الروم:
            <br />تأكدوا إنكم على <b>نفس الرابط المنشور</b>، ولا تفتحونه بوضع التصفح الخفي.
          </div>
        </div>
      )}
      <button className="btn btn-red" onClick={() => setScreen("setup")}>سوّ روم جديد</button>
      <div style={{ height: 10 }} />
      <button className="btn btn-amber" onClick={() => setScreen("join")}>ادخل روم</button>
      <div style={{ height: 10 }} />
      <button className="btn btn-ghost" onClick={() => setScreen("editor")}>أسئلتي ({myq.length})</button>
      <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", marginTop: 24, lineHeight: 1.8 }}>
        كل جولة تصوّتون على الفئة — الأعلى أصواتًا يفوز 🗳️
        <br />وكل 3 أسئلة حدث يقلب اللعبة 🎲
        <br />الفائز بسؤال الحدث ياخذ آيتم تخريب 🎒
      </p>
    </div>
  );

  const Setup = () => (
    <div className="wrap">
      <button className="back" onClick={() => setScreen("home")}>→ رجوع</button>
      <h2 className="disp" style={{ fontSize: 30 }}>إعداد الروم</h2>
      <Sadu />
      <label className="lbl">اسمك</label>
      <input className="inp" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} placeholder="مثلاً: حسين" />

      <label className="lbl">نمط اللعب</label>
      <div className="seg">
        <button className={"chip" + (cfg.mode !== "board" ? " on" : "")}
          onClick={() => setCfg({ ...cfg, mode: "classic" })}>⚡ سريع (فردي)</button>
        <button className={"chip" + (cfg.mode === "board" ? " on" : "")}
          onClick={() => setCfg({ ...cfg, mode: "board", picked: cfg.picked.filter(boardReady) })}>🎯 SICKJEEM (فريقين)</button>
      </div>
      <p style={{ color: "var(--dim)", fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
        {cfg.mode === "board"
          ? "فريقان، لوحة 6 فئات × 6 أسئلة (سهل/متوسط/صعب)، إجابة شفهية والهوست يحكم."
          : "كل واحد لحاله — الأسرع الصح ياخذ بونص، وأحداث وآيتمات تخريب."}
      </p>

      {cfg.mode === "board" && (
        <>
          <label className="lbl">أسماء الفريقين</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" value={cfg.teamNames[0]} maxLength={16}
              style={{ borderColor: TEAM_COLORS[0] }}
              onChange={(e) => setCfg({ ...cfg, teamNames: [e.target.value, cfg.teamNames[1]] })}
              placeholder="الفريق الأول" />
            <input className="inp" value={cfg.teamNames[1]} maxLength={16}
              style={{ borderColor: TEAM_COLORS[1] }}
              onChange={(e) => setCfg({ ...cfg, teamNames: [cfg.teamNames[0], e.target.value] })}
              placeholder="الفريق الثاني" />
          </div>
        </>
      )}
      <label className="lbl" style={{ display: cfg.mode === "board" ? "none" : "block" }}>عدد الأسئلة</label>
      <div className="seg" style={{ display: cfg.mode === "board" ? "none" : "flex" }}>
        {[15, 30, 40].map((n) => (
          <button key={n} className={"chip" + (cfg.count === n ? " on" : "")} onClick={() => setCfg({ ...cfg, count: n })}>{n}</button>
        ))}
      </div>

      <label className="lbl">مصادر الأسئلة</label>
      <div className="chips">
        <button className={"chip" + (cfg.src.bank ? " on" : "")} onClick={() => setCfg({ ...cfg, src: { ...cfg.src, bank: !cfg.src.bank } })}>بنك الأسئلة ({BANK.length})</button>
        <button className={"chip" + (cfg.src.mine ? " on" : "")} onClick={() => setCfg({ ...cfg, src: { ...cfg.src, mine: !cfg.src.mine } })}>أسئلتي ({myq.length})</button>
      </div>

      <label className="lbl">
        {cfg.mode === "board"
          ? (cfg.picked.length
              ? `الفئات (${Math.min(cfg.picked.length, BOARD_CATS_N)} مختارة${cfg.picked.length < BOARD_CATS_N ? ` + ${BOARD_CATS_N - cfg.picked.length} عشوائية` : ""})`
              : `الفئات (${BOARD_CATS_N} عشوائية)`)
          : `الفئات (${cfg.picked.length ? cfg.picked.length + " مختارة" : "الكل — عشوائي"})`}
      </label>
      <div className="chips" style={{ marginBottom: 8 }}>
        <button className="chip" onClick={() => setCfg({ ...cfg, picked: [] })}>
          {cfg.picked.length === 0 ? "✓ " : ""}{cfg.mode === "board" ? "عشوائي" : "الكل"}
        </button>
        {cfg.mode !== "board" && (
          <button className="chip" onClick={() => setCfg({ ...cfg, picked: [...CATS] })}>حدد الكل</button>
        )}
      </div>
      <div className="catPick">
        {CATS.map((c) => {
          const on = cfg.picked.includes(c);
          const weak = cfg.mode === "board" && !boardReady(c);
          return (
            <button key={c} className={"chip" + (on ? " on" : "")}
              disabled={weak}
              title={weak ? "ما فيها أسئلة كافية للوحة (تحتاج 6 إجابات مختلفة)" : undefined}
              style={weak ? { opacity: 0.3, textDecoration: "line-through" } : undefined}
              onClick={() => setCfg({
                ...cfg,
                picked: on ? cfg.picked.filter((x) => x !== c) : [...cfg.picked, c],
              })}>{on ? "✓ " : ""}{c}</button>
          );
        })}
      </div>
      {cfg.mode === "board" ? (
        cfg.picked.length > BOARD_CATS_N && (
          <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 8 }}>
            اخترت {cfg.picked.length} — اللوحة تعرض {BOARD_CATS_N} منها عشوائيًا كل مباراة
          </p>
        )
      ) : (
        cfg.picked.length > 0 && cfg.picked.length < 2 && (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>
            اختر فئتين على الأقل — وإلا كل الأسئلة من فئة وحدة
          </p>
        )
      )}

      <label className="lbl">إيقاع اللعبة</label>
      <div className="chips">
        <button className={"chip" + (cfg.autoNext !== false ? " on" : "")}
          onClick={() => setCfg({ ...cfg, autoNext: cfg.autoNext === false })}>
          {cfg.autoNext !== false ? "✓ " : ""}انتقال تلقائي بين الأسئلة
        </button>
      </div>
      <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 12, lineHeight: 1.8 }}>
        اختر الفئات اللي تبونها فوق — وبكل جولة تصوّتون على وحدة منها 🗳️
        <br />التصحيح يتسامح مع الأخطاء الإملائية ويقبل العربي والإنجليزي.
      </p>

      <div style={{ height: 20 }} />
      <button className="btn btn-red" onClick={createRoom}>جهّز الروم</button>
    </div>
  );

  const Join = () => (
    <div className="wrap">
      <button className="back" onClick={() => setScreen("home")}>→ رجوع</button>
      <h2 className="disp" style={{ fontSize: 30 }}>ادخل روم</h2>
      <Sadu />
      <label className="lbl">اسمك</label>
      <input className="inp" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} placeholder="مثلاً: عبدالله" />
      <label className="lbl">رمز الروم</label>
      <input className="inp" style={{ textAlign: "center", letterSpacing: 8, fontSize: 24, direction: "ltr", textTransform: "uppercase" }}
        value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value)} placeholder="ABCD" />
      <div style={{ height: 20 }} />
      <button className="btn btn-amber" onClick={joinRoom}>ادخل</button>
    </div>
  );

  const Editor = () => (
    <div className="wrap">
      <button className="back" onClick={() => setScreen("home")}>→ رجوع</button>
      <h2 className="disp" style={{ fontSize: 30 }}>أسئلتي</h2>
      <p style={{ color: "var(--dim)", fontSize: 13 }}>أسئلة كتابية — الذكاء الاصطناعي يحكم على الإجابات بمرونة</p>
      <Sadu />
      <div className="card">
        <label className="lbl">نص السؤال</label>
        <input className="inp" value={ed.q} onChange={(e) => setEd({ ...ed, q: e.target.value })} placeholder="اكتب السؤال…" />
        <label className="lbl">الإجابة النموذجية</label>
        <input className="inp" value={ed.a} onChange={(e) => setEd({ ...ed, a: e.target.value })} placeholder="كلمة أو كلمتين" />
        <label className="lbl">إجابات بديلة مقبولة (اختياري — افصل بفاصلة)</label>
        <input className="inp" value={ed.alt} onChange={(e) => setEd({ ...ed, alt: e.target.value })} placeholder="مثال: Malenia، ماليينيا" />
        <label className="lbl">الفئة</label>
        <select className="inp" value={ed.cat} onChange={(e) => setEd({ ...ed, cat: e.target.value })}>
          {CATS.filter((c) => c !== "رياضيات").map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="lbl">الصعوبة</label>
        <div className="seg">
          {[1, 2, 3].map((d) => (
            <button key={d} className={"chip" + (ed.d === d ? " on" : "")} onClick={() => setEd({ ...ed, d })}>
              {DLBL[d]} ({PTS[d]})
            </button>
          ))}
        </div>
        <div style={{ height: 14 }} />
        <button className="btn btn-amber" onClick={saveMyQuestion}>احفظ السؤال</button>
      </div>
      {myq.map((q, i) => (
        <div className="prow" key={i} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 14, flex: 1, marginInlineEnd: 8 }}>
            <span className="ptsTile" style={{ fontSize: 16, padding: "0 8px", marginInlineEnd: 8 }}>{PTS[q.d]}</span>
            <span className="badge">{q.cat} · </span>{q.q}
          </div>
          <button className="chip" onClick={() => deleteMyQuestion(i)}>حذف</button>
        </div>
      ))}
    </div>
  );

  const Lobby = () => (
    <div className="wrap">
      <ExitBar />
      <h2 className="disp" style={{ fontSize: 26, textAlign: "center" }}>رمز الروم</h2>
      <div className="codebox">{code}</div>
      <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", marginTop: 10 }}>
        خل ربعك يفتحون <b>نفس الرابط</b> ويدخلون الرمز
      </p>
      <Sadu />
      <div className="card">
        <div className="meta">
          <b>اللاعبين ({view.board.length})</b>
          <span className="badge pulse">ننتظر البقية…</span>
        </div>
        {role === "host" && view.board.length < 2 && (
          <p className="badge" style={{ marginTop: 8, lineHeight: 1.7 }}>
            ما ظهر أحد بعد؟ تأكدوا إنكم على نفس الرابط المنشور، وخلهم يضغطون «ادخل روم» ويكتبون <b>{code}</b>. يظهرون خلال ثانيتين.
          </p>
        )}
        <div className="plist">
          {view.board.map((p) => (
            <div className="prow" key={p.pid}>
              <span>{p.name}{p.pid === me.pid ? " (أنت)" : ""}</span>
              <span style={{ color: "var(--teal)" }}>جاهز ✓</span>
            </div>
          ))}
        </div>
      </div>
      {view.mode === "board" && (
        <p className="badge" style={{ textAlign: "center", marginTop: 10, lineHeight: 1.8 }}>
          🎯 SICKJEEM — بينقسمون على فريقين تلقائيًا بالتناوب عند البدء
        </p>
      )}
      {role === "host" ? (
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-red" onClick={startGame}>
            {view.mode === "board" ? "ابدأ المباراة (36 سؤال)" : `ابدأ اللعب (${view.total} سؤال)`}
          </button>
        </div>
      ) : (
        <p style={{ textAlign: "center", color: "var(--dim)", marginTop: 16 }} className="pulse">ننتظر الهوست يبدأ…</p>
      )}
    </div>
  );


  // شريط علوي فيه زر الخروج/الإلغاء — يظهر بكل شاشات اللعبة
  const ExitBar = () => (
    <div className="exitBar">
      {role === "host" ? (
        <button className="exitBtn danger" onClick={() => {
          if (confirmExit) { cancelGame(); setConfirmExit(false); }
          else { setConfirmExit(true); setToast("اضغط مرة ثانية عشان تلغي اللعبة للجميع"); }
        }}>{confirmExit ? "متأكد؟ الغِ اللعبة ✕" : "إلغاء اللعبة ✕"}</button>
      ) : (
        <button className="exitBtn" onClick={() => {
          if (confirmExit) { leaveGame(); setConfirmExit(false); }
          else { setConfirmExit(true); setToast("اضغط مرة ثانية عشان تطلع"); }
        }}>{confirmExit ? "متأكد؟ اطلع ✕" : "اطلع من اللعبة ✕"}</button>
      )}
    </div>
  );

  // لوحة النتائج — ظاهرة دائمًا أثناء اللعب
  const ScoreBar = () => {
    if (!view || !view.board || !view.board.length) return null;
    const answered = view.answeredPids || [];
    const inQ = view.phase === "question" || view.phase === "closing";
    const voters = view.cm && view.cm.voters ? Object.values(view.cm.voters).flat() : [];
    return (
      <div className="scoreBar">
        {view.board.map((p, i) => {
          const done = inQ ? answered.includes(p.pid)
            : view.phase === "catpick" ? voters.includes(p.name) : false;
          return (
            <div key={p.pid} className={"scoreChip" + (p.pid === me.pid ? " me" : "") + (done ? " done" : "")}>
              <span className="scoreRank">{i === 0 ? "👑" : i + 1}</span>
              <span className="scoreName">{p.name}</span>
              <span className="scoreVal">{p.score}</span>
              {done && <span className="scoreTick">✓</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const ItemBar = () => {
    if (!view || !view.canUseItems) return null;
    const inv = (view.items && view.items[me.pid]) || [];
    const log = view.itemLog || [];
    if (!inv.length && !log.length) return null;
    const targets = view.board.filter((p) => p.pid !== me.pid);
    return (
      <div className="card" style={{ marginTop: 16 }}>
        {log.map((l, i) => (
          <div key={i} className="logRow">{l.icon} {l.text}</div>
        ))}
        {inv.length > 0 && (
          <div>
            <div className="meta" style={{ marginTop: log.length ? 12 : 0 }}>
              <b style={{ fontSize: 15 }}>🎒 آيتماتك ({inv.length})</b>
              {pendingItem && <button className="chip" onClick={() => setPendingItem(null)}>إلغاء</button>}
            </div>
            {!pendingItem ? (
              <div className="itemGrid">
                {inv.map((id, i) => {
                  const it = itemById(id);
                  if (!it) return null;
                  return (
                    <button key={i} className="itemBtn"
                      onClick={() => (it.target ? setPendingItem({ id, slot: i }) : useItem(id, null))}>
                      <span style={{ fontSize: 24 }}>{it.icon}</span>
                      <b>{it.name}</b>
                      <span className="badge" style={{ fontSize: 11, lineHeight: 1.5 }}>{it.desc}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <p className="badge" style={{ margin: "10px 0 6px" }}>
                  {itemById(pendingItem.id).icon} على مين ترميه؟
                </p>
                {targets.length ? (
                  <div className="chips">
                    {targets.map((p) => (
                      <button key={p.pid} className="chip"
                        onClick={() => { useItem(pendingItem.id, p.pid); setPendingItem(null); }}>{p.name}</button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--red)", fontSize: 14, fontWeight: 700 }}>
                    ما فيه لاعبين ثانيين ظاهرين — انتظر ثانيتين وجرّب
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };


  /* ============ واجهات نمط سين جيم ============ */
  const TeamBar = ({ controls }) => {
    if (!view || !view.teams) return null;
    const mine = myTeam();
    return (
      <div className="teamBar">
        {view.teams.map((t, i) => (
          <div key={i} className={"teamCard" + (view.turn === i ? " turn" : "")}
            style={{ "--tc": t.color }}>
            <div className="teamName">{t.name}{mine === i ? " ★" : ""}</div>
            <div className="teamScore">{t.score}</div>
            {controls && role === "host" ? (
              <div className="scoreAdj">
                <button onClick={() => adjustScore(i, -100)}>−</button>
                <button onClick={() => adjustScore(i, +100)}>+</button>
              </div>
            ) : (
              <div className="teamMembers">{t.members.map((pid) => {
                const p = (view.allPlayers || []).find((x) => x.pid === pid);
                return p ? p.name : null;
              }).filter(Boolean).join(" · ")}</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const PowerBar = ({ where }) => {
    if (!view.teams) return null;
    // الهوست يشغّل وسائل الفريق صاحب الدور
    const t = role === "host" ? (where === "board" ? view.turn : view.owner) : myTeam();
    if (t < 0) return null;
    const mine = view.teams[t].pu || {};
    const list = POWERUPS.filter((p) => p.when === where && (mine[p.id] || 0) > 0);
    const canUse = role === "host"
      ? (where === "board" ? view.phase === "board" : (view.phase === "bq" && !((view.bq || {}).revealed)))
      : (where === "board" ? (view.phase === "board" && view.turn === t)
                           : (view.phase === "bq" && !((view.bq || {}).revealed) && myTeam() === view.owner));
    if (!list.length) return null;
    return (
      <div className="puRow">
        <span className="badge" style={{ width: "100%", textAlign: "center" }}>
          🎒 وسائل {view.teams[t].name}
        </span>
        {list.map((p) => (
          <button key={p.id} className="puBtn" disabled={!canUse} title={p.desc}
            onClick={() => { if (p.id === "rest") setPendingItem({ id: "rest" }); else sendPowerUp(p.id); }}>
            <span style={{ fontSize: 18 }}>{p.icon}</span>
            <span>{p.name}</span>
            <b>×{mine[p.id]}</b>
          </button>
        ))}
        {pendingItem && pendingItem.id === "rest" && (
          <div className="chips" style={{ width: "100%", marginTop: 6 }}>
            <span className="badge">🛑 على مين؟</span>
            {view.teams[t === 0 ? 1 : 0].members.map((pid) => {
              const p = (view.allPlayers || []).find((x) => x.pid === pid);
              return p ? <button key={pid} className="chip" onClick={() => { sendPowerUp("rest", pid); setPendingItem(null); }}>{p.name}</button> : null;
            })}
            <button className="chip" onClick={() => setPendingItem(null)}>إلغاء</button>
          </div>
        )}
      </div>
    );
  };

  const BoardScreen = () => {
    const t = myTeam();
    const myTurn = t === view.turn;
    return (
      <div className="wrap jWrap">
        <div className="jTop">
          <span className="jBrand">SICK<b>JEEM</b></span>
          <span className="jTurn" style={{ background: view.teams[view.turn].color }}>
            دور: {view.teams[view.turn].name}
          </span>
          <ExitBar />
        </div>
        <TeamBar controls />
        {t < 0 && <p className="badge" style={{ textAlign: "center" }}>أنت متفرّج</p>}
        <div className="jBoard">
          {view.gboard.map((c, ci) => (
            <div key={ci} className="jCol">
              <div className="jCat">{c.cat}</div>
              {c.tiles.map((x, ti) => (
                <button key={ti} className={"jTile " + x.state}
                  disabled={x.state !== "available" || (role !== "host" && !myTurn)}
                  onClick={() => pickTile(ci, ti)}>
                  {x.state === "available" ? x.pts : "✓"}
                </button>
              ))}
            </div>
          ))}
        </div>
        {(view.pitOn && t >= 0 && view.pitOn[t]) && (
          <p className="badge" style={{ textAlign: "center", color: "var(--red)", marginTop: 10 }}>
            🕳️ فيه حفرة عليكم هذي الجولة
          </p>
        )}
        <PowerBar where="board" />
      </div>
    );
  };

  const BoardQuestion = () => {
    const b = view.bq;
    if (!b) return null;
    const pre = localRef.current.renderAt - Date.now();
    const elapsed = (Date.now() - localRef.current.renderAt) / 1000;
    const remain = Math.max(0, b.dur - elapsed);
    const muted = view.restPid === me.pid;
    return (
      <div className="wrap jWrap">
        <div className="jTop">
          <span className="jBrand">{b.cat}</span>
          <span className="jTurn" style={{ background: view.teams[view.owner].color }}>
            دور: {view.teams[view.owner].name}
          </span>
          <ExitBar />
        </div>
        <TeamBar />
        <div className="qHead">
          <span className="qPts">{b.pts}</span>
          {!b.revealed && (
            <span className={"qClock" + (remain <= 10 ? " hot" : "")}>
              ⏱ {pre > 0 ? Math.ceil(b.dur) : Math.ceil(remain)}
            </span>
          )}
        </div>
        {!b.revealed && (
          <div className="fuseTrack">
            {pre <= 0 && <div className="fuseBar" style={{ width: Math.max(0, Math.min(100, (remain / b.dur) * 100)) + "%" }} />}
          </div>
        )}
        {(view.puLog || []).map((l, i) => <div key={i} className="logRow" style={{ marginTop: 8 }}>{l.icon} {l.text}</div>)}
        {muted && <div className="hiddenQ">🛑 استريح — ما تشارك بهذا السؤال</div>}
        <div className="card jCard">
          {b.svg && <div className="qImg" dangerouslySetInnerHTML={{ __html: b.svg }} />}
          {b.img && <div className={"qPhoto" + (b.zoom ? " zoomed" : "")}><img src={b.img} alt=""
            onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }}
            style={b.zoom ? {
            transform: `scale(${b.zoom.s || 2})`,
            transformOrigin: `${b.zoom.x != null ? b.zoom.x : 50}% ${b.zoom.y != null ? b.zoom.y : 50}%` } : undefined} /></div>}
          <p className="qtext" style={{ textAlign: "center" }}>{b.q}</p>
          {b.opts && (
            <div className="optGrid" style={{ marginTop: 14 }}>
              {b.opts.map((o) => (
                <div key={o} className={"optBtn" + (b.revealed && o === b.answer ? " right" : "")}>{o}</div>
              ))}
            </div>
          )}
          {b.revealed && (
            <div className="ansBox">
              <span className="ansLbl">الجواب</span>
              {b.answer}
              {b.alt && b.alt.length > 0 && <div className="ansAlt">يُقبل أيضًا: {b.alt.join(" · ")}</div>}
              {b.info && <div className="ansInfo">💡 {b.info}</div>}
            </div>
          )}
        </div>

        {role === "host" ? (
          !b.revealed ? (
            <button className="btn btn-amber" onClick={revealAnswer}>👁️ أظهر الإجابة</button>
          ) : (
            <div className="judgeBox">
              <p className="badge" style={{ textAlign: "center", marginBottom: 8 }}>مين جاوب صح؟</p>
              <button className="btn jAward" style={{ background: view.teams[0].color }}
                onClick={() => awardTile(0)}>{view.teams[0].name} +{b.pts}</button>
              <div style={{ height: 8 }} />
              <button className="btn jAward" style={{ background: view.teams[1].color }}
                onClick={() => awardTile(1)}>{view.teams[1].name} +{b.pts}</button>
              <div style={{ height: 8 }} />
              <button className="btn btn-ghost" onClick={() => awardTile(null)}>محد جاوب ✕</button>
            </div>
          )
        ) : (
          <p className="pulse" style={{ textAlign: "center", color: "var(--dim)", marginTop: 12, fontWeight: 700 }}>
            {b.revealed ? "الهوست يحدد مين جاوب…" : b.timeUp ? "انتهى الوقت" : "جاوبوا بصوت عالي 🗣️"}
          </p>
        )}
        <PowerBar where="question" />
      </div>
    );
  };

  const BoardReveal = () => {
    const r = view.reveal;
    if (!r) return null;
    const left = view.autoNext ? Math.max(0, Math.ceil(REVEAL_SEC - (Date.now() - (view.stageStart || 0)) / 1000)) : null;
    return (
      <div className="wrap">
        <ExitBar />
        <TeamBar />
        <div className="card">
          <div className="meta"><span className="badge">{r.cat}</span><span className="ptsTile">{r.pts}</span></div>
          {r.qSvg && <div className="qImg" style={{ margin: "10px 0" }} dangerouslySetInnerHTML={{ __html: r.qSvg }} />}
          {r.qImg && <div className="qPhoto" style={{ margin: "10px 0" }}><img src={r.qImg} alt="" /></div>}
          <p style={{ color: "var(--dim)", fontSize: 14, marginTop: 8 }}>{r.qText}</p>
          <div style={{ height: 10 }} />
          <div className="correctBox">الجواب: {r.correctText}</div>
          {r.info && <div className="ansInfo" style={{ borderTop: "none", paddingTop: 8 }}>💡 {r.info}</div>}
          {r.log.map((l, i) => (
            <div key={i} className="rrow" style={{ borderInlineStart: `4px solid ${l.team != null ? view.teams[l.team].color : "var(--line)"}` }}>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        {role === "host" ? (
          <button className="btn btn-red" onClick={nextTurn}>
            كمّل ← {left !== null ? "(" + left + ")" : ""}
          </button>
        ) : (
          <p className="pulse" style={{ textAlign: "center", color: "var(--dim)" }}>
            {left !== null ? `نرجع للوحة بعد ${left} ث…` : "ننتظر الهوست…"}
          </p>
        )}
      </div>
    );
  };

  const BoardEnd = () => {
    const [a, b] = view.teams;
    const tie = a.score === b.score;
    const win = a.score > b.score ? a : b;
    return (
      <div className="wrap">
        <h2 className="disp" style={{ fontSize: 34, textAlign: "center", marginTop: 20 }}>
          {tie ? "تعادل!" : `فاز ${win.name} 🏆`}
        </h2>
        <Sadu />
        <div className="teamBar">
          {view.teams.map((t, i) => (
            <div key={i} className="teamCard" style={{ borderColor: t.color, borderWidth: !tie && win.name === t.name ? 3 : 1.5 }}>
              <div className="teamName" style={{ color: t.color }}>{t.name}</div>
              <div className="teamScore" style={{ fontSize: 40 }}>{t.score}</div>
            </div>
          ))}
        </div>
        {role === "host" && (
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-red" onClick={startBoardGame}>جولة ثانية 🔄</button>
          </div>
        )}
        <div style={{ height: 10 }} />
        <button className="btn btn-ghost" onClick={leaveGame}>الرئيسية</button>
      </div>
    );
  };

  const CatPick = () => {
    const cm = view.cm;
    if (!cm) return null;
    const isVote = true;          // التصويت هو الوضع الوحيد
    const canChoose = true;       // الكل يصوّت
    return (
      <div className="wrap">
        <ExitBar />
        <ScoreBar />
        <div className="meta">
          <span className="qcount">سؤال {view.qIndex + 1} / {view.total}</span>
        </div>
        <div className="evSplash pop" style={{ padding: "16px 0 4px" }}>
          <div className="evIcon">🗳️</div>
          <div className="evName" style={{ fontSize: 34 }}>صوّتوا للفئة!</div>
          <div className="evDesc" style={{ fontSize: 15, color: "var(--dim)" }}>
            الأعلى أصواتًا يفوز — ولو صار تعادل نختار بينهم عشوائي 🎲
          </div>
        </div>
        {canChoose ? (
          <div className="catGrid">
            {cm.options.map((c) => {
              const names = (cm.voters && cm.voters[c]) || [];
              return (
                <button key={c} className={"catBtn" + (myVote === c ? " on" : "")} onClick={() => castVote(c)}>
                  <span>{c}</span>
                  {isVote && names.length > 0 && (
                    <span className="voteTicks">
                      {"✓".repeat(Math.min(names.length, 5))}
                      <span className="voterNames">{names.join(" · ")}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center" }}>
            <p className="pulse" style={{ color: "var(--dim)" }}>ننتظر الاختيار…</p>
          </div>
        )}
        {isVote && (
          <p style={{ textAlign: "center", color: myVote ? "var(--teal)" : "var(--dim)", marginTop: 14, fontWeight: 700 }}>
            صوّت {cm.voted || 0} من {cm.totalPlayers || 1}{myVote ? " · اخترت «" + myVote + "» ✓" : ""}
            {view.catStart ? " · " + Math.max(0, Math.ceil(VOTE_SEC - (Date.now() - view.catStart) / 1000)) + " ث" : ""}
          </p>
        )}
        {role === "host" && (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => resolveCat(myVote || cm.options[0])}>
              تخطّ وابدأ السؤال ←
            </button>
          </div>
        )}
        <ItemBar />
      </div>
    );
  };

  const Prep = () => (
    <div className="wrap">
      <ExitBar />
        <ScoreBar />
      <div className="evSplash">
        <div className="spin" style={{ margin: "30px auto 16px" }} />
        <div className="evName" style={{ fontSize: 28 }}>نجهّز سؤال {view.chosenCat}…</div>
        <p className="badge" style={{ marginTop: 10 }}>ثانية وحدة بس</p>
      </div>
    </div>
  );

  const CatIntro = () => {
    const cat = view.chosenCat;
    if (!cat) return null;
    const info = catInfo(cat);
    const left = view.autoNext ? Math.max(0, Math.ceil(INTRO_SEC - (Date.now() - (view.stageStart || 0)) / 1000)) : null;
    return (
      <div className="wrap">
        <ExitBar />
        <ScoreBar />
        <div className="meta">
          <span className="qcount">سؤال {view.qIndex + 1} / {view.total}</span>
        </div>
        <div className="evSplash pop">
          <div className="evIcon">{info.icon}</div>
          <div className="evName" style={{ fontSize: 38 }}>{cat}</div>
          <p className="introDesc">{info.desc}</p>
          {view.introInfo && (
            <div className="meta" style={{ justifyContent: "center", gap: 14, marginTop: 14 }}>
              <span className="ptsTile" style={{ fontSize: 20 }}>{view.introInfo.pts}</span>
              <span className="badge" style={{ fontSize: 15 }}>
                {view.introInfo.nodiff ? "" : DLBL[view.introInfo.d] + " · "}
                {view.introInfo.pick > 1 ? `المرة ${view.introInfo.pick} لهذي الفئة 🔥` : "أول مرة"}
              </span>
            </div>
          )}
        </div>
        <Sadu />
        {role === "host" ? (
          <button className="btn btn-red" onClick={afterIntro}>
            فهمت — ابدأ {left !== null ? "(" + left + ")" : ""}
          </button>
        ) : (
          <p style={{ textAlign: "center", color: "var(--dim)" }} className="pulse">
            {left !== null ? `يبدأ بعد ${left} ث…` : "ننتظر الهوست…"}
          </p>
        )}
      </div>
    );
  };

  const EventSplash = () => {
    const ev = view.event;
    if (!ev) return null;
    return (
      <div className="wrap">
        <ExitBar />
        <ScoreBar />
        <div className="evSplash pop">
          <div className="evIcon">{ev.icon}</div>
          <div className="evName">{ev.name}</div>
          <div className="evDesc">{ev.desc}</div>
          {view.chosenCat && <div className="badge" style={{ marginTop: 10 }}>الفئة: {view.chosenCat}</div>}
        </div>
        <Sadu />
        <ItemBar />
        <div style={{ height: 14 }} />
        {(() => {
          const left = view.autoNext ? Math.max(0, Math.ceil(EVENT_SEC - (Date.now() - (view.stageStart || 0)) / 1000)) : null;
          return role === "host" ? (
            <button className="btn btn-red" onClick={() => beginQuestion(view.qIndex)}>
              يلا — ابدأ السؤال 🎲 {left !== null ? "(" + left + ")" : ""}
            </button>
          ) : (
            <p style={{ textAlign: "center", color: "var(--dim)" }} className="pulse">
              {left !== null ? `يبدأ بعد ${left} ث — استخدم آيتماتك!` : "استعد… الهوست بيبدأ السؤال"}
            </p>
          );
        })()}
      </div>
    );
  };

  const Question = () => {
    const q = view.q;
    if (!q) return null;
    const ev = view.event;
    const fx = (view.fx && view.fx[me.pid]) || [];
    const has = (id) => fx.includes(id);
    const preMs = localRef.current.renderAt - Date.now();
    const elapsed = (Date.now() - localRef.current.renderAt) / 1000;
    const myDur = has("rush") ? q.dur / 2 : q.dur;
    const remain = Math.max(0, myDur - elapsed);
    const answered = localRef.current.answered;
    const blindHidden = (ev && ev.id === "blind" && elapsed > BLIND_SHOW) || (has("vanish") && elapsed > 5);
    const isRoulette = ev && ev.id === "roulette";
    const locked = has("lock") && elapsed < 8;
    const cancelled = has("cancel");
    const foggy = has("fog") && elapsed < myDur / 2;
    return (
      <div className="wrap">
        <ExitBar />
        <ScoreBar />
        <div className="meta">
          <span className="qcount">سؤال {view.qIndex + 1} / {view.total}</span>
          <span className="ptsTile">{isRoulette ? "؟؟" : ev && ev.id === "double" ? q.pts + "×2" : q.pts}</span>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>
          <span className="badge">{q.cat}{q.nodiff ? "" : " · " + DLBL[q.d]}</span>
          <span className="badge">⏱ {preMs > 0 ? Math.round(myDur) : Math.floor(remain)} ث</span>
        </div>
        {ev && (
          <div className="evBanner"><span style={{ fontSize: 22 }}>{ev.icon}</span> {ev.name}: {ev.desc}</div>
        )}
        <div className="fuseTrack">
          {preMs <= 0 && (
            <div className="fuseBar" style={{ width: Math.max(0, Math.min(100, (remain / myDur) * 100)) + "%" }} />
          )}
        </div>
        {fx.length > 0 && (
          <div className="fxBanner">
            {fx.map((id) => { const it = itemById(id); return it ? <span key={id}>{it.icon} {it.name}</span> : null; })}
          </div>
        )}
        {preMs > 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px 18px" }}>
            <div className="cdNum" key={Math.ceil(preMs / 1000)}>{Math.ceil(preMs / 1000)}</div>
            <p style={{ color: "var(--dim)", marginTop: 8 }}>استعدوا… الكل يبدأ بنفس اللحظة</p>
          </div>
        ) : (
        <div className="card flash" key={view.qIndex}>
          {cancelled ? (
            <div className="hiddenQ">🚫 انكنسل سؤالك! تفرّج على الباقي بس</div>
          ) : blindHidden ? (
            <div className="hiddenQ">👻 السؤال اختفى! اكتب من ذاكرتك</div>
          ) : (
            <div style={{
              filter: foggy ? "blur(5px)" : "none",
              transform: has("mirror") ? "scaleX(-1)" : "none",
              transition: "filter .3s ease",
            }}>
              {q.svg && <div className="qImg" dangerouslySetInnerHTML={{ __html: q.svg }} />}
              {q.img && (
                <div className={"qPhoto" + (q.zoom ? " zoomed" : "")}>
                  <img src={q.img} alt="" loading="eager"
                    onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }}
                    style={q.zoom ? {
                      transform: `scale(${q.zoom.s || 2})`,
                      transformOrigin: `${q.zoom.x != null ? q.zoom.x : 50}% ${q.zoom.y != null ? q.zoom.y : 50}%`,
                    } : undefined} />
                </div>
              )}
              <p className="qtext">{q.q}</p>
            </div>
          )}
          {q.opts ? (
            <div className="optGrid">
              {q.opts.map((o) => (
                <button key={o} className={"optBtn" + (typedText === o ? " on" : "")}
                  disabled={answered || remain <= 0 || locked || cancelled}
                  onClick={() => setTypedText(o)}>{o}</button>
              ))}
            </div>
          ) : (
            <input className="inp" value={typedText} disabled={answered || remain <= 0 || locked || cancelled}
              onChange={(e) => setTypedText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") answerTyped(); }}
              placeholder={cancelled ? "ما تقدر تجاوب 🚫" : locked ? `مقفول… ${Math.ceil(8 - elapsed)} ث` : "اكتب إجابتك — عربي أو إنجليزي"} />
          )}
          <div style={{ height: 10 }} />
          <button className="btn btn-amber" disabled={answered || remain <= 0 || locked || cancelled || !typedText.trim()} onClick={answerTyped}>أرسل ⚡</button>
        </div>
        )}
        {answered && <p className="pulse" style={{ textAlign: "center", color: "var(--teal)", marginTop: 12, fontWeight: 700 }}>وصلت إجابتك ✓ ننتظر البقية…</p>}
        {!answered && remain <= 0 && preMs <= 0 && (
          <p className="pulse" style={{ textAlign: "center", color: "var(--red)", marginTop: 12, fontWeight: 700 }}>انتهى الوقت ⏱</p>
        )}
        {view.judging && <p className="pulse" style={{ textAlign: "center", color: "var(--amber)", marginTop: 12, fontWeight: 700 }}>نراجع الإجابات…</p>}
        {role === "host" && (
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={closeQuestion}>اقفل الإجابات الحين</button>
          </div>
        )}
      </div>
    );
  };

  const Reveal = () => {
    const r = view.reveal;
    if (!r) return null;
    return (
      <div className="wrap">
        <ExitBar />
        <ScoreBar />
        <div className="meta">
          <span className="qcount">سؤال {view.qIndex + 1} / {view.total}</span>
          <span className="ptsTile">{r.pts}</span>
        </div>
        {r.event && (
          <div className="evBanner">
            <span style={{ fontSize: 22 }}>{r.event.icon}</span> كان الحدث: {r.event.name}
            {r.rolled ? " — الروليت طلعت " + r.rolled + " نقطة!" : ""}
          </div>
        )}
        <div className="card">
          {r.qSvg && <div className="qImg" style={{ marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: r.qSvg }} />}
          {r.qImg && (
            <div className="qPhoto" style={{ marginBottom: 10 }}>
              <img src={r.qImg} alt="" onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }} />
              <span className="badge" style={{ display: "block", textAlign: "center", marginTop: 6 }}>الصورة كاملة</span>
            </div>
          )}
          <p style={{ color: "var(--dim)", fontSize: 14 }}>{r.qText}</p>
          <div style={{ height: 10 }} />
          <div className="correctBox">الجواب: {r.correctText}</div>
          {r.steal && (
            <div className="stealBox">🦹 {r.steal.thief} سرق {r.steal.amount} نقطة من {r.steal.victim}!</div>
          )}
          {r.grant && (
            <div className="grantBox">🎁 {r.grant.name} كسب آيتم: {r.grant.item.icon} {r.grant.item.name}</div>
          )}
          {r.results.map((p) => (
            <div key={p.pid} className={"rrow " + (p.ok ? "ok" : "bad")}>
              <span>
                {p.fastest ? "⚡ " : ""}{p.name}
                {(p.fx || []).map((id) => { const it = itemById(id); return it ? <span key={id} title={it.name}> {it.icon}</span> : null; })}
                <span className="badge" style={{ marginInlineStart: 8 }}>
                  {p.answered ? (p.text ? "«" + p.text + "» · " : "") + (p.ms / 1000).toFixed(1) + " ث" : "ما جاوب"}
                </span>
              </span>
              <span className="gain" style={{ color: p.gained > 0 ? "var(--teal)" : p.gained < 0 ? "var(--red)" : "var(--dim)" }}>
                {p.gained > 0 ? "+" + p.gained : p.gained < 0 ? "−" + Math.abs(p.gained) : "0"}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <b>الترتيب</b>
          <div className="plist">
            {view.board.map((p, i) => (
              <div className="prow" key={p.pid}>
                <span>{i === 0 ? "👑 " : (i + 1) + ". "}{p.name}</span>
                <span className="ptsTile" style={{ fontSize: 18, padding: "0 10px" }}>{p.score}</span>
              </div>
            ))}
          </div>
                  </div>
        {(() => {
          const left = view.autoNext ? Math.max(0, Math.ceil(REVEAL_SEC - (Date.now() - (view.stageStart || 0)) / 1000)) : null;
          return role === "host" ? (
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-red" onClick={() => advanceTo(view.qIndex + 1)}>
                {view.qIndex + 1 >= view.total ? "النتيجة النهائية 🏆" : `كمّل ← ${left !== null ? "(" + left + ")" : ""}`}
              </button>
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--dim)", marginTop: 14 }} className="pulse">
              {left !== null ? `السؤال الجاي بعد ${left} ث…` : "ننتظر الهوست…"}
            </p>
          );
        })()}
      </div>
    );
  };

  const End = () => {
    const b = view.board;
    const pod = [b[1], b[0], b[2]];
    const heights = [90, 130, 65];
    const colors = ["#B8B8C8", "var(--amber)", "#C98B4E"];
    const medals = ["🥈", "🥇", "🥉"];
    return (
      <div className="wrap">
        <h2 className="disp" style={{ fontSize: 34, textAlign: "center", marginTop: 20 }}>خلصت اللعبة!</h2>
        <Sadu />
        <div className="podium">
          {pod.map((p, i) => p ? (
            <div className="pod" key={p.pid}>
              <div style={{ fontSize: 28 }}>{medals[i]}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div className="podBar" style={{ height: heights[i], background: colors[i] }}>{p.score}</div>
            </div>
          ) : <div className="pod" key={i} />)}
        </div>
        {b.length > 3 && (
          <div className="card">
            {b.slice(3).map((p, i) => (
              <div className="prow" key={p.pid} style={{ marginTop: i ? 8 : 0 }}>
                <span>{i + 4}. {p.name}</span><span>{p.score}</span>
              </div>
            ))}
          </div>
        )}
        {role === "host" && (
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-red" onClick={playAgain}>جولة ثانية 🔄</button>
          </div>
        )}
        <div style={{ height: 10 }} />
        <button className="btn btn-ghost" onClick={leaveGame}>الرئيسية</button>
      </div>
    );
  };

  return (
    <div className="fz">
      <style>{css}</style>
      {screen === "home" && Home()}
      {screen === "setup" && Setup()}
      {screen === "join" && Join()}
      {screen === "editor" && Editor()}
      {screen === "game" && view && (
        view.phase === "board" ? BoardScreen() :
        view.phase === "bq" ? BoardQuestion() :
        view.phase === "breveal" ? BoardReveal() :
        view.phase === "bend" ? BoardEnd() :
        view.phase === "lobby" ? Lobby() :
        view.phase === "catpick" ? CatPick() :
        view.phase === "prep" ? Prep() :
        view.phase === "intro" ? CatIntro() :
        view.phase === "event" ? EventSplash() :
        view.phase === "question" || view.phase === "closing" ? Question() :
        view.phase === "reveal" ? Reveal() :
        view.phase === "end" ? End() : Lobby()
      )}
      {loading && (
        <div className="overlay"><div className="spin" /><div>{loading}</div></div>
      )}
      {toast && <div className="toast">{toast}</div>}
      <button className="egg" onClick={() => setToast("عم عبدالله يقول: بلن 😌")}>بلن عم عبدالله</button>
    </div>
  );
}
