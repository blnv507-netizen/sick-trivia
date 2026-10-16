// @ts-nocheck
/* بنك الأسئلة — يُحمّل من public/data بدل ما يكون داخل ملف الجافاسكربت.

   ليش: البنك ٢ ميجا. لما كان جزء من الباندل، المتصفح لازم «يهضمه» قبل
   ما يرسم أي شي — وهذا بطيء على الجوال. الحين الموقع يفتح أول، والبنك
   ينزل كملفات بيانات تتخزن في الكاش.

   المصدر الحي صار public/data. تعدّل فئة؟ عدّل ملفها هناك،
   وبعدها: npm run check-bank

   BANK مصفوفة واحدة تتعبّى *في مكانها*، فكل ملف يستوردها يحصل نفس
   المرجع — ما احتجنا نغيّر منطق اللعبة. */

import { loadImgManifest } from "./img";
import { setWorksMap } from "./picker";

/* مجموعة التجربة (أسئلة أول لعبة لكل حساب) — public/data/trial.json */
export const TRIAL = { cats: {} };

export const BANK = [];

/* من index.json — متاحة قبل ما تنزل الأسئلة نفسها */
export const CAT_COUNT = {};        // اسم الفئة -> عدد الأسئلة
export const UNIQUE_ANSWERS = {};   // اسم الفئة -> عدد الإجابات الفريدة

let state = "idle";     // idle | loading | ready | error
let pending = null;

export const bankReady = () => state === "ready";

/* ملاحظة: لا تستخدم cache:"force-cache" هنا.
   معناها «خذ النسخة المخزّنة ولا تسأل الخادم»، فأي لاعب فتح الموقع قبل
   إضافة فئة يظل عنده بنك قديم للأبد. بدون هذا الخيار يسأل المتصفح الخادم
   «تغيّر الملف؟» ويرد 304 لو ما تغيّر — سريع وصحيح. */
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " → " + r.status);
  return r.json();
}

/* تُستدعى مرة وحدة عند إقلاع التطبيق. الاستدعاءات المتكررة ترجع نفس الوعد. */
export function loadBank() {
  if (pending) return pending;
  state = "loading";

  pending = (async () => {
    /* بصمات الصور تنزل مع الفهرس، فأول صورة تطلع برابطها النهائي (ويتخزن سنة) */
    const [index, , worksMap, trial] = await Promise.all([
      fetchJSON("/data/index.json"), loadImgManifest(),
      fetchJSON("/data/works-map.json").catch(() => null),   // أعمال/سلاسل: عشان نفس الفلم/المسلسل ما يتكرر باللعبة
      fetchJSON("/data/trial.json").catch(() => null),
    ]);
    setWorksMap(worksMap);
    if (trial && trial.cats) TRIAL.cats = trial.cats;

    for (const c of index.categories) {
      CAT_COUNT[c.name] = c.count;
      UNIQUE_ANSWERS[c.name] = c.uniqueAnswers;
    }

    /* الفئات تنزل بالتوازي، وكل ملف يتخزن بالكاش لحاله —
       يعني تعديل فئة وحدة ما يبطّل كاش الباقي. */
    const parts = await Promise.all(
      index.categories.map((c) =>
        fetchJSON("/data/" + c.file).catch((e) => {
          console.error("فشل تحميل فئة:", c.name, e);
          return [];
        })
      )
    );

    BANK.length = 0;
    for (const part of parts) BANK.push(...part);

    state = "ready";
    return BANK;
  })().catch((e) => {
    state = "error";
    pending = null;
    throw e;
  });

  return pending;
}
