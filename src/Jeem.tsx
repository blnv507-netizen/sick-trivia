// @ts-nocheck
/* ==================================================================
   سيك جيم — نمط الشاشة الوحدة (على طريقة سين جيم وقولبها)
   المضيف يشغّل اللعبة على شاشة وحدة (تلفزيون/لابتوب) والفرق حوله.
   6 فئات × 6 أسئلة (200/400/600 لكل جهة) + مساعدات لكل فريق.
   الحالة تنحفظ بالمتصفح: لو انقفلت الصفحة تكمّل من مكانك.
   ================================================================== */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { AccountChip } from "./account";
import CatArt, { CAT_ART_CSS, catTint } from "./catArt";
import { imgUrl, preload, isBoxImg, boxBg, markBoxReady } from "./lib/img";

const SAVE_KEY = "sj:classic:v1";
const SEEN_KEY = "sj:classic:seen";
const VALUES = [200, 400, 600];
const DIFF = { 200: 1, 400: 2, 600: 3 };
const TEAM_COLORS = ["var(--hj-bad)", "var(--hj-teal)", "var(--hj-plum)", "var(--hj-plum)"];
const HELPERS = [
  { id: "double", icon: "×2", name: "الدبل", desc: "يضاعف نقاط السؤال إذا جاوبتوا صح. فعّلوه قبل كشف الإجابة." },
  { id: "two", icon: "✌️", name: "جوابين", desc: "تقدرون تقولون إجابتين بدل وحدة على نفس السؤال." },
  { id: "call", icon: "📞", name: "اتصال بصديق", desc: "30 ثانية تتصلون فيها على أي أحد يساعدكم." },
];

const qKey = (q) => (q.cat || "") + "|" + (q.q || "") + "|" + (q.img || "");
const norm = (s) => String(s || "").trim().toLowerCase()
  .replace(/[أإآٱ]/g, "ا").replace(/[ةه]/g, "ه").replace(/[ىي]/g, "ي")
  .replace(/[\u064B-\u0652\u0640]/g, "").replace(/\s+/g, " ");
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين ممتلئ أو مقفل */ } };

/* صوتيات خفيفة بدون ملفات */
let _ac = null;
const beep = (f = 660, dur = 0.12, type = "sine", vol = 0.15) => {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === "suspended") _ac.resume();
    const o = _ac.createOscillator(), g = _ac.createGain(), t = _ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(_ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* الصوت مو ضروري */ }
};
const sfx = {
  pick: () => beep(520, 0.08, "triangle", 0.12),
  reveal: () => { beep(440, 0.1, "sine"); setTimeout(() => beep(660, 0.14, "sine"), 90); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.14), i * 90)),
  none: () => beep(220, 0.25, "sawtooth", 0.06),
};

export default function Jeem({ bank, cats, info, genMath, onExit, acc }) {
  /* ---------- البيانات ---------- */
  const byCat = useMemo(() => {
    const m = {};
    for (const q of bank) (m[q.cat] = m[q.cat] || []).push(q);
    return m;
  }, [bank]);
  // الفئة تصلح للوحة إذا فيها 6 إجابات مختلفة على الأقل (أو رياضيات المولّدة)
  const usable = useMemo(() => cats.filter((c) =>
    (c === "رياضيات" && genMath) || new Set((byCat[c] || []).map((q) => norm(q.a))).size >= 6), [cats, byCat]);

  /* ---------- الحالة ---------- */
  const fresh = () => ({
    phase: "intro", teams: [mkTeam(0), mkTeam(1)], picked: [], board: [], turn: 0,
    cur: null, reveal: false, timer: 45, qStart: 0, doubleOn: false, callUntil: 0, log: [],
  });
  function mkTeam(i, name) {
    return { name: name || ["الفريق الأحمر", "الفريق الأخضر", "الفريق الأصفر", "الفريق البنفسجي"][i], color: TEAM_COLORS[i], score: 0, used: {} };
  }
  const saved = useRef(load(SAVE_KEY, null));
  const [S, setS] = useState(() => ({ ...fresh(), phase: "intro" }));
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState([]);
  const [confirm, setConfirm] = useState(null);

  const set = (patch, keepUndo) => setS((s) => {
    const n = typeof patch === "function" ? patch(s) : { ...s, ...patch };
    if (keepUndo) setUndo((u) => [...u.slice(-9), s]);
    return n;
  });

  // حفظ تلقائي لأي لعبة شغالة
  useEffect(() => {
    if (S.phase === "intro") return;
    store(SAVE_KEY, S);
  }, [S]);

  // احتفال النهاية
  useEffect(() => {
    if (S.phase !== "end") return;
    sfx.win(); const t = setTimeout(sfx.win, 450);
    return () => clearTimeout(t);
  }, [S.phase]);

  // نافذة "!" بكروت الفئات: وحدة مفتوحة بس. الضغط برا يقفلها، وما يختار الكرت اللي تحته
  const [infoCat, setInfoCat] = useState(null);
  const swallowClick = useRef(false);
  // مستمع دايم: الضغطة اللي قفلت النافذة تنبلع قبل ما توصل لـ React (النافذة تنقفل قبل ما توصل الضغطة)
  useEffect(() => {
    const click = (e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); e.preventDefault(); } };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  useEffect(() => {
    if (!infoCat) return;
    const down = (e) => {
      if (e.target.closest(".sj-cat-pop, .sj-cat-info")) return;
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 600);   // لو ما جت ضغطة (سحب مثلًا) ما نبلع اللي بعدها
      setInfoCat(null);
    };
    const key = (e) => {
      if (e.key !== "Escape") return;
      document.querySelector(`.sj-cat-info[aria-expanded="true"]`)?.focus();
      setInfoCat(null);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [infoCat]);
  useEffect(() => { if (S.phase !== "cats") setInfoCat(null); }, [S.phase]);

  // تحميل مسبق: لما تطلع اللوحة تنزل صور أسئلتها بالخلفية (أولوية منخفضة، كم وحدة بنفس الوقت)،
  // ولما ينفتح سؤال تبدأ صورة جوابه فورًا عشان الكشف يطلع بدون انتظار
  useEffect(() => {
    if (S.phase === "board") {
      preload(S.board.flatMap((col) => col.cells.filter((c) => !c.done && c.q).map((c) => c.q.img)).filter(Boolean), "low");
    } else if (S.phase === "q" && S.cur) {
      const q = S.board[S.cur.ci].cells[S.cur.k].q;
      if (q && q.aImg) preload(q.aImg, "auto");
    }
  }, [S.phase, S.board, S.cur]);

  // نبض العداد بشاشة السؤال
  useEffect(() => {
    if (S.phase !== "q") return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [S.phase]);

  /* ---------- اختيار الأسئلة ---------- */
  function buildBoard(picked) {
    const seen = new Set(load(SEEN_KEY, []));
    const takenAns = new Set();
    const pickQ = (cat, d) => {
      if (cat === "رياضيات" && genMath) return { ...genMath(d), cat };
      const all = (byCat[cat] || []).filter((q) => !takenAns.has(norm(q.a)));
      const unseen = all.filter((q) => !seen.has(qKey(q)));
      const pool = unseen.length ? unseen : all;
      const order = d === 1 ? [1, 2, 3] : d === 2 ? [2, 1, 3] : [3, 2, 1];
      for (const want of order) {
        const c = pool.filter((q) => (q.d || 2) === want);
        if (c.length) { const q = c[Math.floor(Math.random() * c.length)]; takenAns.add(norm(q.a)); seen.add(qKey(q)); return q; }
      }
      const q = pool[Math.floor(Math.random() * pool.length)];
      if (q) { takenAns.add(norm(q.a)); seen.add(qKey(q)); }
      return q || null;
    };
    const board = picked.map((cat) => {
      takenAns.clear();
      // كل قيمة مرتين: جهة يمين وجهة يسار
      const cells = [];
      for (const side of [0, 1]) for (const v of VALUES) cells.push({ pts: v, side, q: pickQ(cat, DIFF[v]), done: false, by: null });
      return { cat, cells };
    });
    store(SEEN_KEY, [...seen].slice(-4000));
    return board;
  }

  /* ---------- أفعال اللعبة ---------- */
  const startNew = () => {
    if (acc && acc.enabled && !acc.user) { acc.setModal("auth"); return; }   // لازم حساب قبل ما تبدأ
    setUndo([]); set({ ...fresh(), phase: "setup" });
  };
  const resume = () => { setS(saved.current); setUndo([]); };

  const togglePick = (cat) => {
    sfx.pick();
    set((s) => {
      if (s.picked.includes(cat)) return { ...s, picked: s.picked.filter((c) => c !== cat) };
      if (s.picked.length >= 6) return s;
      return { ...s, picked: [...s.picked, cat] };
    });
  };
  const fillRandom = () => set((s) => {
    const rest = shuffle(usable.filter((c) => !s.picked.includes(c)));
    return { ...s, picked: [...s.picked, ...rest].slice(0, 6) };
  });
  const [starting, setStarting] = useState(false);
  const startBoard = async () => {
    if (starting) return;
    setStarting(true);
    const ok = acc ? await acc.gate("jeem") : true;   // يخصم لعبة من الرصيد (من السيرفر)
    setStarting(false);
    if (!ok) return;
    set((s) => ({ ...s, board: buildBoard(s.picked), phase: "board", turn: 0 }));
  };

  const openCell = (ci, k) => {
    const cell = S.board[ci].cells[k];
    if (cell.done || !cell.q) return;
    sfx.pick();
    set({ phase: "q", cur: { ci, k }, reveal: false, qStart: Date.now(), doubleOn: false, callUntil: 0 });
  };
  const backToBoard = () => set({ phase: "board", cur: null, reveal: false, doubleOn: false, callUntil: 0 });
  const doReveal = () => { if (!S.reveal) { sfx.reveal(); set({ reveal: true, revealAt: Date.now() }); } };

  const award = (ti) => set((s) => {
    const { ci, k } = s.cur;
    const cell = s.board[ci].cells[k];
    const mult = s.doubleOn && ti === s.turn ? 2 : 1;
    const gain = ti == null ? 0 : cell.pts * mult;
    ti == null ? sfx.none() : sfx.win();
    const board = s.board.map((col, i) => i !== ci ? col : {
      ...col, cells: col.cells.map((c, j) => j !== k ? c : { ...c, done: true, by: ti }),
    });
    const teams = s.teams.map((t, i) => i === ti ? { ...t, score: t.score + gain } : t);
    const left = board.some((col) => col.cells.some((c) => !c.done && c.q));
    return {
      ...s, board, teams, phase: left ? "board" : "end", cur: null, reveal: false, doubleOn: false, callUntil: 0,
      turn: (s.turn + 1) % s.teams.length,
      log: [...s.log, { cat: board[ci].cat, pts: cell.pts, ti, gain }],
    };
  }, true);

  const applyHelper = (id) => set((s) => {
    const t = s.teams[s.turn];
    if (t.used[id]) return s;
    const teams = s.teams.map((x, i) => i === s.turn ? { ...x, used: { ...x.used, [id]: true } } : x);
    const extra = id === "double" ? { doubleOn: true } : id === "call" ? { callUntil: Date.now() + 30000 } : {};
    sfx.pick();
    return { ...s, teams, ...extra };
  }, true);

  const adjust = (ti, d) => set((s) => ({ ...s, teams: s.teams.map((t, i) => i === ti ? { ...t, score: t.score + d } : t) }), true);
  const doUndo = () => { if (!undo.length) return; setS(undo[undo.length - 1]); setUndo((u) => u.slice(0, -1)); };
  const endGame = () => { store(SAVE_KEY, null); saved.current = null; setS(fresh()); setUndo([]); };

  // اختصارات لوحة المفاتيح للمضيف
  useEffect(() => {
    const h = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (S.phase === "q") {
        if (e.code === "Space") { e.preventDefault(); doReveal(); }
        else if (S.reveal && /^[1-4]$/.test(e.key) && +e.key <= S.teams.length) award(+e.key - 1);
        else if (S.reveal && e.key === "0") award(null);
        else if (e.key === "Escape" && !S.reveal) backToBoard();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [S]);

  /* ---------- الشاشات ---------- */
  const Logo = ({ small }) => (
    <div className={"sj-logo" + (small ? " sm" : "")}>
      <span>لعبة</span><span className="sj-logo-j">الفئات</span>
    </div>
  );
  const Weave = () => <div className="sj-weave" aria-hidden="true" />;

  const Intro = () => {
    const qCount = bank.length;
    return (
      <div className="sj-intro">
        <header className="sj-top">
          <Logo small />
          <div className="sj-tools">
            <button className="sj-link" onClick={onExit}>الرئيسية</button>
            {acc && <AccountChip acc={acc} />}
          </div>
        </header>
        <section className="sj-hero">
          <div className="sj-hero-copy">
            <Logo />
            <p className="sj-hero-sub">فريقين، ست فئات، وست وثلاثين سؤال على شاشة وحدة. افتحوها على التلفزيون واجتمعوا.</p>
            <div className="sj-hero-cta">
              <button className="sj-btn sj-btn-main" onClick={startNew}>ابدأ لعبة جديدة</button>
              {saved.current && saved.current.phase && saved.current.phase !== "end" && (
                <button className="sj-btn sj-btn-ghost" onClick={resume}>كمّل اللعبة السابقة</button>
              )}
            </div>
            <div className="sj-facts">
              <span><b>{usable.length}</b> فئة</span>
              <span><b>{qCount.toLocaleString("ar")}</b> سؤال</span>
              <span><b>2–4</b> فرق</span>
            </div>
          </div>
          <div className="sj-hero-board" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sj-mini" style={{ animationDelay: i * 70 + "ms" }}>
                <div><i>200</i><i>400</i><i>600</i></div>
                <span>{(info[usable[i * 3 % usable.length]] || {}).icon || "❓"}</span>
                <div><i>200</i><i>400</i><i>600</i></div>
              </div>
            ))}
          </div>
        </section>
        <Weave />
        <section className="sj-how">
          <h2>طريقة اللعب</h2>
          <ol>
            <li><b>سمّوا الفرق</b><span>من فريقين إلى أربعة، وكل فريق له لونه.</span></li>
            <li><b>اختاروا ست فئات</b><span>كل فريق يختار فئاته بالدور، أو خلّوها عشوائية.</span></li>
            <li><b>اختاروا سؤال من اللوحة</b><span>200 سهل، 400 متوسط، 600 صعب. الدور يتبدّل بعد كل سؤال.</span></li>
            <li><b>المضيف يكشف الإجابة</b><span>ويضغط على الفريق اللي جاوب صح، والنقاط تنحسب تلقائيًا.</span></li>
          </ol>
        </section>
        <section className="sj-helpers">
          <h2>المساعدات</h2>
          <p className="sj-muted">كل فريق عنده ثلاث مساعدات، كل وحدة تنستخدم مرة وحدة باللعبة.</p>
          <div className="sj-helper-row">
            {HELPERS.map((h) => (
              <div key={h.id} className="sj-helper">
                <div className="sj-helper-ic">{h.icon}</div>
                <b>{h.name}</b>
                <span>{h.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  const Setup = () => (
    <div className="sj-page">
      <header className="sj-top">
        <button className="sj-link" onClick={() => set({ phase: "intro" })}>رجوع</button>
        <Logo small />
        <button className="sj-link" onClick={onExit}>الرئيسية</button>
      </header>
      <h1 className="sj-h1">الفرق</h1>
      <div className="sj-teams-setup">
        {S.teams.map((t, i) => (
          <div key={i} className="sj-team-in" style={{ "--tc": t.color }}>
            <span className="sj-dot" />
            <input value={t.name} maxLength={18} aria-label={"اسم الفريق " + (i + 1)}
              onChange={(e) => set((s) => ({ ...s, teams: s.teams.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
            {S.teams.length > 2 && (
              <button className="sj-x" aria-label="حذف الفريق" onClick={() => set((s) => ({ ...s, teams: s.teams.filter((_, j) => j !== i).map((x, j) => ({ ...x, color: TEAM_COLORS[j] })) }))}>✕</button>
            )}
          </div>
        ))}
        {S.teams.length < 4 && (
          <button className="sj-add" onClick={() => set((s) => ({ ...s, teams: [...s.teams, mkTeam(s.teams.length)] }))}>+ فريق</button>
        )}
      </div>
      <h2 className="sj-h2">وقت الإجابة</h2>
      <div className="sj-seg">
        {[30, 45, 60, 90].map((v) => (
          <button key={v} className={S.timer === v ? "on" : ""} onClick={() => set({ timer: v })}>{v} ثانية</button>
        ))}
      </div>
      <div className="sj-foot">
        <button className="sj-btn sj-btn-main" disabled={S.teams.some((t) => !t.name.trim())} onClick={() => set({ phase: "cats" })}>اختاروا الفئات</button>
      </div>
    </div>
  );

  const Cats = () => {
    const n = S.teams.length;
    const per = Math.floor(6 / n) || 1;
    // دور الاختيار: كل فريق ياخذ نصيبه بالترتيب، والباقي حر
    const pickerIdx = S.picked.length < per * n ? Math.floor(S.picked.length / per) % n : null;
    const owner = (idx) => (idx < per * n ? Math.floor(idx / per) % n : null);
    const list = usable.filter((c) => !search.trim() || norm(c).includes(norm(search)) || norm((info[c] || {}).desc).includes(norm(search)));
    return (
      <div className="sj-page sj-wide">
        <header className="sj-top">
          <button className="sj-link" onClick={() => set({ phase: "setup" })}>رجوع</button>
          <Logo small />
          <button className="sj-link" onClick={onExit}>الرئيسية</button>
        </header>
        <div className="sj-catbar">
          <div>
            <h1 className="sj-h1">اختاروا 6 فئات</h1>
            <p className="sj-muted">
              {S.picked.length >= 6 ? "جاهزين." : pickerIdx != null
                ? <>الدور على <b style={{ color: S.teams[pickerIdx].color }}>{S.teams[pickerIdx].name}</b> يختار</>
                : "اختاروا الباقي"}
            </p>
          </div>
          <div className="sj-slots" aria-label="الفئات المختارة">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const c = S.picked[i]; const o = owner(i);
              return (
                <button key={i} className={"sj-slot" + (c ? " full" : "")} style={{ "--tc": o != null ? S.teams[o].color : "var(--line)" }}
                  onClick={() => c && togglePick(c)} title={c ? "شيل " + c : ""}>
                  {c ? <><span>{(info[c] || {}).icon}</span><em>{c}</em></> : <em>{i + 1}</em>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sj-catctl">
          <input className="sj-search" placeholder="ابحث عن فئة" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="sj-btn sj-btn-ghost sm" onClick={fillRandom} disabled={S.picked.length >= 6}>كمّل عشوائي</button>
        </div>
        <div className="sj-catgrid">
          {list.map((c) => {
            const i = S.picked.indexOf(c); const o = i >= 0 ? owner(i) : null;
            const count = c === "رياضيات" ? "∞" : (byCat[c] || []).length;
            const open = infoCat === c;
            const popId = "sj-pop-" + c.replace(/[^\p{L}\p{N}]+/gu, "-");
            /* الكرت حاوية فيها زرين جنب بعض (زر داخل زر ما يصير): الاختيار، و"!" للمعلومات */
            return (
              <div key={c} className={"sj-cat" + (i >= 0 ? " on" : "") + (open ? " open" : "")}
                style={{ "--tc": i >= 0 ? (o != null ? S.teams[o].color : "var(--sand)") : "transparent" }}>
                <button className="sj-cat-pick" disabled={i < 0 && S.picked.length >= 6} aria-pressed={i >= 0}
                  onClick={() => togglePick(c)}>
                  <CatArt name={c} icon={(info[c] || {}).icon} img={(info[c] || {}).img} />
                  <b>{c}</b>
                  {i >= 0 && <span className="sj-cat-check" aria-hidden="true">✓</span>}
                </button>
                <button className="sj-cat-info" aria-label={"معلومات عن فئة " + c} aria-expanded={open} aria-controls={open ? popId : undefined}
                  onClick={() => setInfoCat(open ? null : c)}>!</button>
                {open && (
                  <div className="sj-cat-pop" id={popId} role="dialog" aria-label={c}>
                    <p>{(info[c] || {}).desc || "أسئلة متنوعة من هذي الفئة."}</p>
                    <span className="sj-cat-n">{count === "∞" ? "أسئلة تتولد كل مرة" : `${count} سؤال`}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="sj-foot sticky">
          <button className="sj-btn sj-btn-main" disabled={S.picked.length < 6 || starting} onClick={startBoard}>
            {S.picked.length < 6 ? `باقي ${6 - S.picked.length}` : starting ? "لحظة…" : acc && acc.enabled ? "ابدأ اللعب (لعبة من رصيدك)" : "ابدأ اللعب"}
          </button>
        </div>
      </div>
    );
  };

  const Scores = ({ big }) => (
    <div className={"sj-scores" + (big ? " big" : "")}>
      {S.teams.map((t, i) => (
        <div key={i} className={"sj-score" + (S.turn === i ? " turn" : "")} style={{ "--tc": t.color }}>
          <div className="sj-score-name">{t.name}</div>
          <div className="sj-score-row">
            <button aria-label="ناقص 100" onClick={() => adjust(i, -100)}>−</button>
            <b>{t.score}</b>
            <button aria-label="زائد 100" onClick={() => adjust(i, 100)}>+</button>
          </div>
          <div className="sj-score-help">
            {HELPERS.map((h) => <span key={h.id} className={t.used[h.id] ? "used" : ""} title={h.name}>{h.icon}</span>)}
          </div>
        </div>
      ))}
    </div>
  );

  const Board = () => {
    const done = S.board.reduce((n, c) => n + c.cells.filter((x) => x.done).length, 0);
    return (
      <div className="sj-boardpage">
        <header className="sj-top">
          <Logo small />
          <div className="sj-turn" style={{ "--tc": S.teams[S.turn].color }}>
            الدور على <b>{S.teams[S.turn].name}</b>
          </div>
          <div className="sj-tools">
            <button className="sj-link" onClick={doUndo} disabled={!undo.length}>تراجع</button>
            <button className="sj-link" onClick={() => setConfirm("end")}>إنهاء</button>
          </div>
        </header>
        <div className="sj-board">
          {S.board.map((col, ci) => (
            <div key={ci} className="sj-block">
              {[0, 1].map((side) => (
                <div key={side} className={"sj-vals s" + side}>
                  {col.cells.map((cell, k) => cell.side !== side ? null : (
                    <button key={k} className={"sj-val" + (cell.done ? " done" : "") + (!cell.q ? " empty" : "")}
                      style={{ "--tc": cell.by != null ? S.teams[cell.by].color : "transparent" }}
                      disabled={cell.done || !cell.q} onClick={() => openCell(ci, k)}
                      aria-label={`${col.cat} ${cell.pts}`}>
                      {cell.done ? (cell.by != null ? "✓" : "—") : cell.pts}
                    </button>
                  ))}
                </div>
              ))}
              <div className="sj-block-cat" style={{ "--t": catTint(col.cat) }}>
                {(info[col.cat] || {}).img
                  ? <img className="sj-block-img" src={imgUrl(info[col.cat].img)} alt="" decoding="async" />
                  : <span className="sj-block-ic">{(info[col.cat] || {}).icon || "❓"}</span>}
                <b>{col.cat}</b>
              </div>
            </div>
          ))}
        </div>
        <div className="sj-progress"><i style={{ width: (done / 36) * 100 + "%" }} /></div>
        <Scores />
      </div>
    );
  };

  const Question = () => {
    const { ci, k } = S.cur;
    const col = S.board[ci], cell = col.cells[k], q = cell.q, team = S.teams[S.turn];
    const el = Math.floor(((S.reveal && S.revealAt ? S.revealAt : now) - S.qStart) / 1000);  // العداد يوقف عند كشف الإجابة
    const main = Math.max(0, S.timer - el);
    const steal = main === 0 ? Math.max(0, 15 - (el - S.timer)) : 15;
    const callLeft = S.callUntil ? Math.max(0, Math.ceil((S.callUntil - now) / 1000)) : 0;
    const pct = main > 0 ? main / S.timer : steal / 15;
    const opts = Array.isArray(q.opts) ? q.opts : null;
    const shown = S.reveal && q.aImg ? q.aImg : q.img;
    return (
      <div className="sj-qpage">
        <header className="sj-qtop">
          <button className="sj-link" onClick={backToBoard} disabled={S.reveal}>رجوع للوحة</button>
          <div className="sj-qmeta">
            <span>{(info[col.cat] || {}).icon} {col.cat}</span>
            <b className="sj-qpts">{S.doubleOn ? cell.pts * 2 : cell.pts}</b>
          </div>
          <div className="sj-turn" style={{ "--tc": team.color }}>{main > 0 ? <>يجاوب <b>{team.name}</b></> : <b>دور السرقة</b>}</div>
        </header>

        <main className="sj-qbody">
          <div className={"sj-timer" + (main === 0 ? " steal" : "") + (main <= 5 && main > 0 ? " hurry" : "")} style={{ "--p": pct, "--tc": main > 0 ? team.color : "var(--amber)" }}>
            <span>{main > 0 ? main : steal}</span>
          </div>
          <h1 className={"sj-qtext" + (opts || q.img || q.svg ? " media" : "")} dir="auto">{q.q}</h1>
          {q.svg && <div className="sj-qsvg" dangerouslySetInnerHTML={{ __html: q.svg }} />}
          {shown && (isBoxImg(shown)
            ? <div key={shown} className="sj-qimg box" style={boxBg(shown)}>
                <img src={imgUrl(shown)} alt="" fetchPriority="high" decoding="async" onLoad={markBoxReady}
                  onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }} />
              </div>
            : <img key={shown} className="sj-qimg" src={imgUrl(shown)} alt="" fetchPriority="high" decoding="async"
                onError={(ev) => { ev.currentTarget.style.display = "none"; }} />)}
          {opts && (
            <div className="sj-opts">
              {opts.map((o, i) => (
                <div key={i} className={"sj-opt" + (S.reveal && o === q.a ? " right" : S.reveal ? " dim" : "")}>
                  <i>{["أ", "ب", "ج", "د", "هـ"][i]}</i><span dir="auto">{o}</span>
                </div>
              ))}
            </div>
          )}
          {S.reveal && (
            <div className="sj-answer">
              <div className="sj-answer-lbl">الإجابة</div>
              <div className="sj-answer-txt" dir="auto">{q.a}</div>
              {q.info && <p className="sj-answer-info">{q.info}</p>}
            </div>
          )}
        </main>

        <footer className="sj-qfoot">
          {!S.reveal ? (
            <>
              <div className="sj-qhelp">
                {HELPERS.map((h) => (
                  <button key={h.id} className={"sj-hbtn" + (team.used[h.id] ? " used" : "") + ((h.id === "double" && S.doubleOn) ? " active" : "")}
                    disabled={team.used[h.id]} onClick={() => applyHelper(h.id)} title={h.desc}>
                    <span>{h.icon}</span>{h.name}
                  </button>
                ))}
              </div>
              <button className="sj-btn sj-btn-main lg" onClick={doReveal}>اكشف الإجابة</button>
            </>
          ) : (
            <div className="sj-award">
              <div className="sj-award-lbl">مين جاوب صح؟</div>
              <div className="sj-award-row">
                {S.teams.map((t, i) => (
                  <button key={i} className="sj-award-btn" style={{ "--tc": t.color }} onClick={() => award(i)}>
                    {t.name}
                    <small>+{cell.pts * (S.doubleOn && i === S.turn ? 2 : 1)}</small>
                  </button>
                ))}
                <button className="sj-award-btn none" onClick={() => award(null)}>ولا أحد</button>
              </div>
            </div>
          )}
        </footer>

        {callLeft > 0 && (
          <div className="sj-call" role="dialog" aria-label="اتصال بصديق">
            <div className="sj-call-ic">📞</div>
            <div className="sj-call-n">{callLeft}</div>
            <button className="sj-btn sj-btn-ghost sm" onClick={() => set({ callUntil: 0 })}>خلصنا</button>
          </div>
        )}
      </div>
    );
  };

  const End = () => {
    const ranked = S.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.score - a.score);
    const tie = ranked.length > 1 && ranked[0].score === ranked[1].score;
    return (
      <div className="sj-end">
        <div className="sj-confetti" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <i key={i} style={{ left: (i * 37) % 100 + "%", background: TEAM_COLORS[i % 4], animationDelay: (i % 10) * 0.18 + "s", animationDuration: 2.6 + (i % 5) * 0.4 + "s" }} />
          ))}
        </div>
        <Logo small />
        <div className="sj-end-lbl">{tie ? "تعادل!" : "الفائز"}</div>
        <h1 className="sj-end-name" style={{ color: ranked[0].color }}>{tie ? ranked.filter((t) => t.score === ranked[0].score).map((t) => t.name).join(" و ") : ranked[0].name}</h1>
        <div className="sj-end-list">
          {ranked.map((t, r) => (
            <div key={t.i} className="sj-end-row" style={{ "--tc": t.color }}>
              <span>{r + 1}</span><b>{t.name}</b><em>{t.score}</em>
            </div>
          ))}
        </div>
        <div className="sj-hero-cta">
          <button className="sj-btn sj-btn-main" onClick={() => { endGame(); startNew(); }}>لعبة جديدة</button>
          <button className="sj-btn sj-btn-ghost" onClick={() => { endGame(); onExit(); }}>الرئيسية</button>
        </div>
      </div>
    );
  };

  return (
    <div className="sj" dir="rtl">
      <style>{CSS}</style>
      {S.phase === "intro" && Intro()}
      {S.phase === "setup" && Setup()}
      {S.phase === "cats" && Cats()}
      {S.phase === "board" && Board()}
      {S.phase === "q" && S.cur && Question()}
      {S.phase === "end" && End()}
      {confirm === "end" && (
        <div className="sj-modal" role="dialog" aria-modal="true">
          <div className="sj-modal-box">
            <b>تنهون اللعبة الحين؟</b>
            <p className="sj-muted">بتطلع لكم النتيجة النهائية.</p>
            <div className="sj-hero-cta">
              <button className="sj-btn sj-btn-main" onClick={() => { setConfirm(null); set({ phase: "end" }); }}>إنهاء</button>
              <button className="sj-btn sj-btn-ghost" onClick={() => setConfirm(null)}>كمّلوا</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   التصميم: نسيج السدو — ليل بنفسجي غامق، وألوان السدو (أحمر، زعفراني،
   فيروزي) هي ألوان الفرق نفسها، فاللون دايم يعني فريق.
   ================================================================== */
const CSS = `
${CAT_ART_CSS}
/* الخطوط من src/styles/tokens.css */
.sj{--bg:var(--hj-bg);--bg2:var(--hj-surface);--sur:var(--hj-surface);--sur2:var(--hj-bg-2);
  --line:var(--hj-line);--sand:var(--hj-ink);--dim:var(--hj-ink-2);--num:var(--hj-plum-dk);
  --red:var(--hj-bad);--amber:var(--hj-plum);--teal:var(--hj-teal);
  --shadow:var(--hj-shadow);--ease:var(--hj-ease);
  min-height:100vh;background:var(--bg);color:var(--sand);font-family:var(--hj-body),system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;line-height:1.6;}
:where(.sj) *{box-sizing:border-box;margin:0;padding:0;}
:where(.sj) button{font-family:inherit;color:inherit;cursor:pointer;border:0;background:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
:where(.sj) button:disabled{cursor:default;}
.sj :focus-visible{outline:3px solid var(--amber);outline-offset:3px;border-radius:10px;}
.sj input{font-family:inherit;}

/* الشعار: «سيك» هادئة و«جيم» منسوجة بألوان السدو */
.sj-logo{font-family:var(--hj-display);font-size:clamp(64px,11vw,132px);line-height:.9;display:flex;gap:.18em;align-items:baseline;}
.sj-logo.sm{font-size:30px;gap:.2em;}
.sj-logo-j{background:repeating-linear-gradient(135deg,var(--red) 0 .11em,var(--amber) .11em .22em,var(--teal) .22em .33em);
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.sj-weave{height:14px;margin:8px 0;background:
  linear-gradient(135deg,var(--bg) 25%,transparent 25%) 0 0/14px 14px,
  linear-gradient(225deg,var(--bg) 25%,transparent 25%) 0 0/14px 14px,
  repeating-linear-gradient(90deg,var(--red) 0 28px,var(--amber) 28px 56px,var(--teal) 56px 84px);}

.sj-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px clamp(16px,3vw,40px);}
.sj-link{font-size:15px;color:var(--dim);padding:8px 12px;border-radius:10px;transition:color .15s,background .15s;}
.sj-link:hover:not(:disabled){color:var(--sand);background:var(--sur);}
.sj-link:disabled{opacity:.35;}
.sj-muted{color:var(--dim);}

.sj-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:18px;
  padding:16px 30px;border-radius:14px;transition:transform .16s var(--ease),filter .15s,opacity .15s;}
.sj-btn:active:not(:disabled){transform:scale(.97);}
.sj-btn:disabled{opacity:.4;}
.sj-btn.sm{font-size:15px;padding:11px 18px;}
.sj-btn.lg{font-size:22px;padding:20px 44px;}
.sj-btn-main{background:var(--sand);color:#fff;}
.sj-btn-main:hover:not(:disabled){filter:brightness(.92);}
.sj-btn-ghost{background:var(--sur);box-shadow:inset 0 0 0 1.5px var(--line),var(--shadow);}
.sj-btn-ghost:hover:not(:disabled){background:var(--sur2);}

/* ---------- الصفحة الأولى ---------- */
.sj-intro{max-width:1240px;margin:0 auto;padding-bottom:60px;}
.sj-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(24px,5vw,72px);align-items:center;padding:clamp(24px,6vw,72px) clamp(16px,3vw,40px);}
.sj-hero-sub{font-size:clamp(18px,2vw,22px);max-width:30ch;margin:22px 0 30px;color:var(--hj-ink-2);}
.sj-hero-cta{display:flex;gap:12px;flex-wrap:wrap;}
.sj-facts{display:flex;gap:26px;margin-top:34px;color:var(--dim);font-size:15px;}
.sj-facts b{color:var(--sand);font-size:22px;margin-left:4px;}
.sj-hero-board{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;transform:rotate(-3deg);}
.sj-mini{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:5px;background:var(--sur);box-shadow:var(--shadow);padding:8px;border-radius:14px;aspect-ratio:1/1.05;animation:sjDrop .7s var(--ease) both;}
.sj-mini div{display:grid;grid-template-rows:repeat(3,1fr);gap:5px;}
.sj-mini i{font-style:normal;font-family:var(--hj-display);font-size:clamp(12px,1.3vw,17px);display:grid;place-items:center;border-radius:7px;background:var(--sur2);color:var(--num);}
.sj-mini span{display:grid;place-items:center;font-size:clamp(26px,3.4vw,44px);background:var(--bg2);border-radius:9px;}
@keyframes sjDrop{from{opacity:0;transform:translateY(-14px);}to{opacity:1;transform:none;}}

.sj-how,.sj-helpers{padding:44px clamp(16px,3vw,40px) 0;}
.sj-how h2,.sj-helpers h2,.sj-h1{font-family:var(--hj-display);font-weight:400;font-size:clamp(30px,3.4vw,42px);line-height:1.2;}
.sj-how ol{list-style:none;counter-reset:s;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:22px;}
.sj-how li{counter-increment:s;padding-top:18px;border-top:3px solid var(--line);display:flex;flex-direction:column;gap:6px;}
.sj-how li::before{content:counter(s,arabic-indic);font-family:var(--hj-display);font-size:26px;color:var(--amber);}
.sj-how li b{font-size:19px;}
.sj-how li span{color:var(--dim);font-size:15px;}
.sj-helpers .sj-muted{margin-top:6px;}
.sj-helper-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px;}
.sj-helper{display:flex;flex-direction:column;gap:6px;padding:22px;background:var(--bg2);box-shadow:var(--shadow);border-radius:18px;}
.sj-helper-ic{font-family:var(--hj-display);font-size:30px;width:56px;height:56px;display:grid;place-items:center;border-radius:50%;background:var(--sur2);color:var(--amber);margin-bottom:6px;}
.sj-helper b{font-size:19px;}
.sj-helper span{color:var(--dim);font-size:15px;}

/* ---------- الإعداد ---------- */
.sj-page{max-width:720px;margin:0 auto;padding-bottom:120px;}
.sj-page.sj-wide{max-width:1240px;}
.sj-page>.sj-h1,.sj-page>.sj-h2,.sj-page>.sj-teams-setup,.sj-page>.sj-seg,.sj-page>.sj-foot{margin-inline:clamp(16px,3vw,40px);}
.sj-h1{margin-top:20px;}
.sj-h2{font-size:18px;font-weight:700;margin-top:34px;margin-bottom:12px;color:var(--dim);}
.sj-teams-setup{display:flex;flex-direction:column;gap:12px;margin-top:18px;}
.sj-team-in{display:flex;align-items:center;gap:12px;background:var(--sur);border-radius:16px;padding:6px 8px 6px 18px;box-shadow:inset -5px 0 0 var(--tc),var(--shadow);}
.sj-dot{width:14px;height:14px;border-radius:50%;background:var(--tc);flex:none;margin-right:10px;}
.sj-team-in input{flex:1;background:none;border:0;color:var(--sand);font-size:20px;font-weight:700;padding:14px 0;min-width:0;}
.sj-team-in input:focus{outline:none;}
.sj-x{width:40px;height:40px;border-radius:10px;color:var(--dim);}
.sj-x:hover{background:var(--sur2);color:var(--sand);}
.sj-add{border:2px dashed var(--line)!important;border-radius:16px;padding:16px;color:var(--dim);font-size:17px;font-weight:700;}
.sj-add:hover{color:var(--sand);border-color:var(--dim)!important;}
.sj-seg{display:flex;gap:8px;flex-wrap:wrap;}
.sj-seg button{padding:11px 18px;border-radius:12px;background:var(--sur);font-weight:500;}
.sj-seg button.on{background:var(--sand);color:#fff;font-weight:700;}
.sj-foot{margin-top:40px;}
.sj-foot.sticky{position:sticky;bottom:0;padding:16px clamp(16px,3vw,40px) calc(16px + env(safe-area-inset-bottom,0px));margin:0;
  background:linear-gradient(transparent,var(--bg) 35%);display:flex;justify-content:center;}
.sj-foot .sj-btn{min-width:240px;}

/* ---------- اختيار الفئات ---------- */
.sj-catbar{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;padding:0 clamp(16px,3vw,40px);}
.sj-catbar .sj-muted{font-size:17px;margin-top:2px;}
.sj-slots{display:grid;grid-template-columns:repeat(6,minmax(64px,96px));gap:8px;}
.sj-slot{height:74px;border-radius:12px;background:var(--bg2);box-shadow:inset 0 0 0 2px var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;}
.sj-slot em{font-style:normal;font-size:12px;color:var(--dim);line-height:1.2;text-align:center;}
.sj-slot.full{box-shadow:inset 0 0 0 2px var(--tc);background:var(--sur);}
.sj-slot.full span{font-size:24px;}
.sj-slot.full em{color:var(--sand);}
.sj-catctl{display:flex;gap:10px;padding:22px clamp(16px,3vw,40px) 14px;}
.sj-search{flex:1;background:var(--sur);border:0;border-radius:12px;padding:12px 16px;color:var(--sand);font-size:16px;}
.sj-search:focus{outline:2px solid var(--amber);}
.sj-catgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:0 clamp(16px,3vw,40px);}
/* كرت الفئة: الغلاف مربع ياخذ عرض الكرت، وتحته الاسم بس. الوصف والعدد ورا زر "!" */
.sj-catgrid{isolation:isolate;}   /* طبقات الكروت تبقى داخل الشبكة، تحت شريط "ابدأ اللعب" الثابت */
.sj-cat{position:relative;background:var(--bg2);box-shadow:var(--shadow);border-radius:16px;transition:background .15s,transform .16s var(--ease);}
.sj-cat::before{content:"";position:absolute;inset:0;z-index:2;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 3px var(--tc);transition:box-shadow .15s;}
.sj-cat.open{z-index:4;}
.sj-cat-pick{display:flex;flex-direction:column;width:100%;padding:0;border:0;background:none;color:inherit;text-align:center;border-radius:inherit;overflow:hidden;cursor:pointer;}
.sj-cat .catArt{width:100%;height:auto;aspect-ratio:1/1;border-radius:0;--emoji:64px;}
.sj-cat .catArt img{transition:transform .25s var(--ease);}
.sj-cat-pick b{display:block;padding:10px 10px 12px;font-size:16px;line-height:1.35;}
.sj-cat:hover:has(.sj-cat-pick:not(:disabled)){background:var(--sur);}
.sj-cat-pick:hover:not(:disabled) .catArt img{transform:scale(1.04);}
.sj-cat:active:has(.sj-cat-pick:active:not(:disabled)){transform:scale(.98);}
.sj-cat-pick:disabled{opacity:.35;cursor:not-allowed;}
.sj-cat-pick:focus-visible,.sj-cat-info:focus-visible{outline:3px solid var(--amber);outline-offset:2px;}
/* مختارة: حلقة أعرض بلون الفريق + علامة صح + شريط الاسم ملوّن */
.sj-cat.on{background:var(--sur);}
.sj-cat.on::before{box-shadow:inset 0 0 0 4px var(--tc);}
.sj-cat.on .sj-cat-pick b{background:color-mix(in srgb,var(--tc) 16%,transparent);}
.sj-cat-check{position:absolute;top:8px;inset-inline-start:8px;z-index:3;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
  background:var(--tc);color:#fff;font-size:16px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.3);}
/* زر "!" بالزاوية العلوية اليسرى (نهاية السطر بالعربي)، شكله 32px ومساحة اللمس 44px */
.sj-cat-info{position:absolute;top:8px;inset-inline-end:8px;z-index:3;width:32px;height:32px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;
  background:rgba(22,17,15,.62);color:#fff;font-size:17px;font-weight:800;line-height:1;cursor:pointer;backdrop-filter:blur(4px);transition:background .15s;}
.sj-cat-info::after{content:"";position:absolute;inset:-6px;border-radius:50%;}
.sj-cat-info:hover,.sj-cat-info[aria-expanded="true"]{background:var(--sand);}
.sj-cat-pop{position:absolute;top:48px;inset-inline:8px;z-index:5;padding:12px 14px;border-radius:12px;background:var(--sur);color:var(--sand);
  box-shadow:0 0 0 1px var(--line),0 12px 32px rgba(0,0,0,.28);text-align:right;animation:sjPop .14s var(--ease);}
.sj-cat-pop p{margin:0 0 8px;font-size:14px;line-height:1.6;}
.sj-cat-n{font-size:12.5px;font-weight:700;color:var(--dim);}
@keyframes sjPop{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){.sj-cat-pop{animation:none;}.sj-cat .catArt img{transition:none;}}

/* ---------- اللوحة ---------- */
.sj-boardpage{min-height:100vh;display:flex;flex-direction:column;}
.sj-turn{font-size:17px;padding:8px 18px;border-radius:999px;background:var(--sur);box-shadow:inset 0 0 0 2px var(--tc);}
.sj-turn b{color:var(--tc);}
.sj-tools{display:flex;gap:8px;align-items:center;}
.sj-board{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(10px,1.6vw,22px);padding:6px clamp(12px,2.6vw,40px);}
.sj-block{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:clamp(6px,.8vw,10px);background:var(--bg2);box-shadow:var(--shadow);border-radius:20px;padding:clamp(8px,1vw,12px);}
.sj-vals{display:grid;grid-template-rows:repeat(3,1fr);gap:clamp(6px,.8vw,10px);}
.sj-vals.s0{grid-column:1;grid-row:1;}
.sj-vals.s1{grid-column:3;grid-row:1;}
.sj-block-cat{grid-column:2;grid-row:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;
  background:linear-gradient(160deg,var(--t),color-mix(in srgb,var(--t) 72%,#000));border-radius:14px;padding:10px 6px;overflow:hidden;}
.sj-block-img{width:100%;flex:1;min-height:0;object-fit:cover;border-radius:10px;}
.sj-block-ic{font-size:clamp(36px,4.4vw,64px);line-height:1;}
.sj-block-cat b{font-size:clamp(14px,1.35vw,20px);line-height:1.3;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.25);}
.sj-val{font-family:var(--hj-display);font-size:clamp(20px,2.3vw,34px);color:var(--num);background:var(--sur2);border-radius:12px;min-height:clamp(46px,7vh,84px);
  transition:transform .16s var(--ease),background .15s;}
.sj-val:hover:not(:disabled){background:var(--hj-line);}
.sj-val:active:not(:disabled){transform:scale(.95);}
.sj-val.done{background:var(--tc);color:#fff;font-family:'Rubik';font-size:22px;}
.sj-val.done[style*="transparent"]{background:var(--bg);color:var(--line);}
.sj-val.empty{opacity:.25;}
.sj-progress{height:4px;margin:12px clamp(12px,2.6vw,40px) 0;background:var(--sur);border-radius:4px;overflow:hidden;}
.sj-progress i{display:block;height:100%;background:var(--amber);transition:width .5s var(--ease);}

.sj-scores{display:flex;gap:12px;padding:14px clamp(12px,2.6vw,40px) 20px;}
.sj-score{flex:1;background:var(--bg2);border-radius:16px;padding:10px 14px;box-shadow:inset 0 -4px 0 var(--tc),var(--shadow);transition:background .2s;}
.sj-score.turn{background:var(--sur);box-shadow:inset 0 -4px 0 var(--tc),0 0 0 2px var(--tc);}
.sj-score-name{font-weight:700;font-size:16px;color:var(--tc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sj-score-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.sj-score-row b{font-family:var(--hj-display);font-weight:400;font-size:clamp(28px,3vw,40px);line-height:1.2;}
.sj-score-row button{width:32px;height:32px;border-radius:9px;background:var(--sur2);color:var(--dim);font-size:18px;opacity:.55;transition:opacity .15s;}
.sj-score:hover .sj-score-row button{opacity:1;}
.sj-score-help{display:flex;gap:6px;font-size:13px;}
.sj-score-help span{background:var(--sur2);border-radius:8px;padding:1px 7px;font-family:var(--hj-display);color:var(--amber);}
.sj-score-help span.used{opacity:.25;text-decoration:line-through;}

/* ---------- السؤال ---------- */
.sj-qpage{min-height:100vh;display:flex;flex-direction:column;}
.sj-qtop{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:16px clamp(16px,3vw,40px);}
.sj-qtop .sj-turn{justify-self:end;}
.sj-qtop>.sj-link{justify-self:start;}
.sj-qmeta{display:flex;align-items:center;gap:14px;font-size:18px;color:var(--dim);}
.sj-qpts{font-family:var(--hj-display);font-weight:400;font-size:34px;color:var(--num);}
.sj-qbody{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:10px clamp(16px,5vw,80px);text-align:center;}
.sj-timer{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(var(--tc) calc(var(--p)*360deg),var(--sur) 0);transition:background .25s linear;}
.sj-timer span{width:78px;height:78px;border-radius:50%;background:var(--bg);display:grid;place-items:center;font-family:var(--hj-display);font-size:36px;}
.sj-timer.hurry span{color:var(--red);}
.sj-timer.steal span{color:var(--amber);}
.sj-qtext{font-size:clamp(26px,3.6vw,52px);font-weight:700;line-height:1.45;max-width:26ch;text-wrap:balance;}
.sj-qtext.media{font-size:clamp(22px,2.6vw,38px);}
.sj-qimg{max-width:min(92vw,820px);max-height:46vh;border-radius:16px;object-fit:contain;}
.sj-qimg.box{width:min(92vw,46vh,520px);height:auto;aspect-ratio:1/1;max-width:none;max-height:none;position:relative;overflow:hidden;isolation:isolate;
  background:linear-gradient(110deg,#1a1512 35%,#2c231d 50%,#1a1512 65%) 0 0/300% 100%;animation:sjShim 1.4s linear infinite;}
.sj-qimg.box::before{content:"";position:absolute;inset:-32px;z-index:-1;background:var(--bg) center/cover no-repeat;filter:blur(22px) brightness(.62) saturate(1.1);opacity:0;transition:opacity .25s;}
.sj-qimg.box img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;opacity:0;transition:opacity .18s ease;animation:sjShow 0s 4s forwards;}
/* لين تتحمّل الصورة: خلفية داكنة تلمع بهدوء، بدون وميض أبيض. الحجم ثابت فما فيه قفزة */
.sj-qimg.box.ready{animation:none;background:#1a1512;}
.sj-qimg.box.ready::before,.sj-qimg.box.ready img{opacity:1;}
@keyframes sjShim{from{background-position:100% 0;}to{background-position:0 0;}}
@keyframes sjShow{to{opacity:1;}}
@media (prefers-reduced-motion:reduce){.sj-qimg.box{animation:none;}}
.sj-qsvg{width:min(80vw,460px);}
.sj-qsvg svg{width:100%;height:auto;--sand:var(--hj-bg);}
.sj-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:min(92vw,860px);}
.sj-opt{display:flex;align-items:center;gap:12px;background:var(--sur);border-radius:14px;padding:14px 18px;font-size:clamp(17px,1.8vw,22px);text-align:start;transition:opacity .3s,background .3s;}
.sj-opt i{font-style:normal;font-family:var(--hj-display);color:var(--amber);font-size:22px;}
.sj-opt.right{background:var(--teal);color:#fff;}
.sj-opt.right i{color:#fff;}
.sj-opt.dim{opacity:.35;}
.sj-answer{animation:sjReveal .5s var(--ease) both;display:flex;flex-direction:column;align-items:center;gap:6px;}
.sj-answer-lbl{font-size:15px;color:var(--dim);}
.sj-answer-txt{font-family:var(--hj-display);font-size:clamp(40px,6vw,84px);line-height:1.15;color:var(--teal);}
.sj-answer-info{max-width:60ch;color:var(--hj-ink-2);font-size:clamp(16px,1.6vw,20px);}
@keyframes sjReveal{from{opacity:0;transform:scale(.94) translateY(8px);filter:blur(4px);}to{opacity:1;transform:none;filter:none;}}

.sj-qfoot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px clamp(16px,3vw,40px) calc(22px + env(safe-area-inset-bottom,0px));}
.sj-qhelp{display:flex;gap:8px;flex-wrap:wrap;}
.sj-hbtn{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;background:var(--sur);font-weight:500;font-size:15px;transition:background .15s;}
.sj-hbtn span{font-family:var(--hj-display);color:var(--amber);font-size:18px;}
.sj-hbtn:hover:not(:disabled){background:var(--sur2);}
.sj-hbtn.used{opacity:.3;text-decoration:line-through;}
.sj-hbtn.active{background:var(--amber);color:#fff;opacity:1;text-decoration:none;}
.sj-hbtn.active span{color:#fff;}
.sj-award{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;}
.sj-award-lbl{color:var(--dim);font-size:16px;}
.sj-award-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.sj-award-btn{min-width:180px;padding:16px 24px;border-radius:16px;background:var(--tc);color:#fff;font-size:20px;font-weight:800;display:flex;flex-direction:column;align-items:center;
  transition:transform .16s var(--ease),filter .15s;}
.sj-award-btn small{font-family:var(--hj-display);font-weight:400;font-size:18px;opacity:.8;}
.sj-award-btn:hover{filter:brightness(1.08);}
.sj-award-btn:active{transform:scale(.96);}
.sj-award-btn.none{--tc:var(--sur2);color:var(--sand);justify-content:center;font-weight:700;}

.sj-call{position:fixed;inset:auto 24px 24px auto;background:var(--sur);border-radius:20px;padding:18px 22px;display:flex;align-items:center;gap:16px;
  box-shadow:0 18px 50px rgba(70,50,20,.18),inset 0 0 0 2px var(--amber);animation:sjReveal .35s var(--ease) both;}
.sj-call-ic{font-size:30px;}
.sj-call-n{font-family:var(--hj-display);font-size:44px;color:var(--amber);min-width:2ch;text-align:center;}

/* ---------- النهاية ---------- */
.sj-end{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px 16px;overflow:hidden;text-align:center;}
.sj-end-lbl{font-size:20px;color:var(--dim);margin-top:24px;}
.sj-end-name{font-family:var(--hj-display);font-weight:400;font-size:clamp(56px,10vw,130px);line-height:1;animation:sjReveal .8s var(--ease) .2s both;}
.sj-end-list{display:flex;flex-direction:column;gap:8px;width:min(92vw,460px);margin:18px 0 26px;}
.sj-end-row{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:12px;background:var(--bg2);border-radius:14px;padding:12px 18px;box-shadow:inset -5px 0 0 var(--tc);}
.sj-end-row span{font-family:var(--hj-display);color:var(--dim);font-size:22px;}
.sj-end-row b{text-align:right;font-size:19px;}
.sj-end-row em{font-style:normal;font-family:var(--hj-display);font-size:28px;color:var(--tc);}
.sj-confetti{position:absolute;inset:0;pointer-events:none;}
.sj-confetti i{position:absolute;top:-20px;width:10px;height:16px;border-radius:2px;animation:sjFall linear infinite;}
@keyframes sjFall{to{transform:translateY(110vh) rotate(540deg);}}

.sj-modal{position:fixed;inset:0;background:rgba(30,25,20,.35);display:grid;place-items:center;padding:20px;z-index:20;animation:sjFade .2s ease both;}
.sj-modal-box{background:var(--sur);border-radius:20px;padding:26px;width:min(420px,100%);display:flex;flex-direction:column;gap:10px;}
.sj-modal-box b{font-size:21px;}
.sj-modal-box .sj-hero-cta{margin-top:10px;}
@keyframes sjFade{from{opacity:0;}to{opacity:1;}}

/* ---------- الجوال ---------- */
@media (max-width:900px){
  .sj-hero{grid-template-columns:1fr;}
  .sj-hero-board{transform:none;order:-1;}
  .sj-how ol{grid-template-columns:1fr 1fr;}
  .sj-helper-row{grid-template-columns:1fr;}
  .sj-board{grid-template-columns:repeat(2,1fr);}
  .sj-slots{grid-template-columns:repeat(6,1fr);width:100%;}
}
@media (max-width:560px){
  .sj-hero-board{display:none;}
  .sj-how ol{grid-template-columns:1fr;}
  .sj-board{grid-template-columns:1fr;}
  .sj-catgrid{grid-template-columns:repeat(2,1fr);}
  .sj-cat .catArt{--emoji:48px;}
  .sj-cat-pick b{font-size:14.5px;padding:8px 8px 10px;}
  .sj-scores{flex-wrap:wrap;}
  .sj-score{flex:1 1 40%;}
  .sj-qtop{grid-template-columns:1fr;justify-items:center;}
  .sj-qtop .sj-turn{justify-self:center;}
  .sj-opts{grid-template-columns:1fr;}
  .sj-award-btn{min-width:140px;}
  .sj-qfoot{justify-content:center;}
  .sj-slot{height:62px;}
}
@media (prefers-reduced-motion:reduce){
  .sj *{animation:none!important;transition:none!important;}
}
`;
