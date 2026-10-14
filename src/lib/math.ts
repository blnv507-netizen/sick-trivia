// @ts-nocheck


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

export { rnd, genMathQ };
