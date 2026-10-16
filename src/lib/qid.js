/* معرّف ثابت قصير لكل سؤال (11 حرف تقريبًا) — نفسه في المتصفح وفي سكربتات scripts/.
   يُستخدم لـ: الأسئلة اللي لعبها الحساب (Supabase played_questions)، مجموعة التجربة، ووسوم الأعمال.
   مبني على الفئة والسؤال والجواب والصورة/المقطع، فتعديل نص السؤال يعطيه معرّف جديد. */

// cyrb53: هاش 53-بت سريع وثابت
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const qid = (q) => cyrb53([q.cat || "", q.q || "", q.a || "", q.img || "", q.clip || ""].join("\n")).toString(36);
