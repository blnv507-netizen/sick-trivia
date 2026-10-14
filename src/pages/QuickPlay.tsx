// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { CAT_ART_CSS } from "../catArt";
import { AccountChip } from "../account";
import { PTS, DLBL, CATS, TYPED_SEC, BLIND_SHOW, VOTE_SEC, START_DELAY, REVEAL_SEC, EVENT_SEC, INTRO_SEC, CAT_INFO, catInfo, BOARD_CATS_N, TEAM_SEC, TEAM_COLORS, POWERUPS, boardReady, puById, freshPowerUps, buildBoard, ptsToDiff, EVENTS, ITEMS, itemById } from "../data/config";
import { BANK } from "../lib/bank";
import { rnd, genMathQ } from "../lib/math";
import { jset, jget } from "../lib/net";
import { norm, normNum, judgeTyped } from "../lib/judge";
import { shuffle, genCode, genPid, MAX_SLOTS, roomKey, slotKey, qKey, aKey, isEventSlot, noDiff, INVENTIVE, CLASSIC, drawCats, CAT_COUNT } from "../lib/game";
import { CatArt, Sadu } from "../components/ui";
import { FinalCeremony, TopTenOverlay } from "../components/effects";

function App({ acc }) {
  const navigate = useNavigate();
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
  const [catQ, setCatQ] = useState("");
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
    pool = pool.concat(BANK.filter((b) => b.cat === cat).map((b) => ({ type: "typed", ...b })));
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
        aImg: h.revealed ? (h.tile.q.aImg || null) : null,
      } : null,
      showTop: !!h.showTop,
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
          if (a.ans && a.ans.q === h.qIndex && h.phase === "question" && !(a.pid in h.answers)) {
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
        if (h.autoNext !== false && h.phase === "reveal" && !h.showTop && Date.now() - (h.stageStart || 0) > REVEAL_SEC * 1000) {
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
      cat: t.cat, pts: t.pts, qText: t.q.q, qSvg: t.q.svg || null, qImg: t.q.aImg || t.q.img || null, aImgOn: !!t.q.aImg || t.q.cat === "شكل ورسم",
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
    } else if (Array.isArray(q.opts) && q.opts.length) {
      // أسئلة الخيارات: تطابق حرفي مع نص الخيار — المصحح المرن يقبل خيارات غلط قريبة من الجواب
      entries.forEach((en) => { okMap[en.pid] = (en.text || "").trim() === (q.a || "").trim(); });
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
      correctText: q.a, qText: q.q, qSvg: q.svg || null, qImg: q.aImg || q.img || null, aImgOn: !!q.aImg || q.cat === "شكل ورسم", info: q.info || null, results, pts: effPts, event: ev || null,
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

  async function toggleTop() {
    const h = hostRef.current;
    if (!h) return;
    h.showTop = !h.showTop;
    if (!h.showTop) h.stageStart = Date.now(); // يرجع عداد الانتقال من جديد
    await broadcast();
    rerender();
  }

  async function advanceTo(idx) {
    const h = hostRef.current;
    if (!h) return;
    h.reveal = null;
    h.currentEvent = null;
    h.showTop = false;
    if (idx >= h.total) {
      h.phase = "end";
      await broadcast();
      rerender();
      return;
    }
    h.qIndex = idx;
    h.catMode = "vote"; // التصويت دايم — الأعلى أصواتًا يفوز والتعادل عشوائي
    h.pickerPid = null;
    h.catOptions = drawCats(h);
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
    if (acc && !(await acc.gate("room"))) return;   // الجولة الجديدة = لعبة جديدة من الرصيد
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
    if (acc && !(await acc.gate("room"))) return;   // يخصم لعبة من رصيد الحساب
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
      items: { [me.pid]: [] }, fx: {}, itemLog: [], seen: {}, doneUses: {}, usedAns: new Set(), picked: cfg.picked || [], stageStart: 0, autoNext: true,
      catMode: "vote", pickerPid: null, catOptions: [], catDeck: [], catStart: 0, chosenCat: null, rolled: 0, catCount: {},
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
  
  
  /* ============================ الواجهات ============================ */

  const css = `
    /* الخطوط تُحمّل مرة واحدة من src/styles/tokens.css */
    :root{
      /* التوكنز القديمة صارت تشير لهوية «هات الجواب» (src/styles/tokens.css).
         يعني كل شاشات اللعب أخذت نفس ألوان الرئيسية بدون تعديل قواعدها. */
      --bg:var(--hj-bg); --sur:var(--hj-surface); --sur2:var(--hj-bg-2); --line:var(--hj-line);
      --sand:var(--hj-ink); --dim:var(--hj-ink-2);
      --red:var(--hj-bad); --amber:var(--hj-plum); --teal:var(--hj-teal);
      --glow:var(--hj-plum-ring);
      --space-xs:6px; --space-sm:10px; --space-md:14px; --space-lg:20px; --space-xl:30px;
      --radius:16px; --radius-sm:12px; --radius-lg:20px;
      --shadow:0 2px 10px rgba(70,50,20,.08); --shadow-lg:0 10px 30px rgba(70,50,20,.12);
    }
    .fz *{box-sizing:border-box; margin:0; padding:0;}
    /* --- تحسين القراءة والتنفس بالتصميم --- */
    .fz{-webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;}
    .wrap{padding:18px 16px 40px;}
    .card{box-shadow:var(--shadow); border-radius:var(--radius);}
    .qtext{font-size:21px; line-height:1.75; letter-spacing:-.2px;}
    .lbl{font-size:13px; letter-spacing:.3px; color:var(--dim); margin:16px 0 8px; display:block;}
    .btn{border-radius:14px; font-size:16px; padding:15px 20px; letter-spacing:.2px;
      box-shadow:var(--shadow); transition:transform .12s ease, filter .15s ease;}
    .btn:active:not(:disabled){transform:translateY(1px) scale(.995);}
    .btn:hover:not(:disabled){filter:brightness(1.08);}
    .chip{border-radius:999px; padding:9px 15px; font-size:13.5px; transition:all .15s ease;}
    .chip.on{box-shadow:0 0 0 3px var(--glow);}
    .inp{border-radius:14px; padding:15px 16px; font-size:16px; transition:border-color .15s ease;}
    .inp:focus{outline:none; border-color:var(--amber); box-shadow:0 0 0 3px var(--glow);}
    .badge{letter-spacing:.2px;}
    /* تباعد أفضل بين الأقسام */
    .card + .card{margin-top:14px;}
    .seg{gap:8px;}
    /* شريط النتائج أوضح */
    .scoreChip{padding:6px 13px; font-size:13.5px;}
    .scoreVal{font-size:17px;}
    /* اللوحة أنظف */
    .jTile{border-radius:12px; box-shadow:0 2px 8px rgba(70,50,20,.08);}
    .jCat{letter-spacing:.2px; box-shadow:0 2px 8px rgba(70,50,20,.08);}
    /* تمرير أنعم */
    .catPick{scrollbar-width:thin; scrollbar-color:var(--line) transparent;}
    .catPick::-webkit-scrollbar{width:8px;}
    .catPick::-webkit-scrollbar-thumb{background:var(--line); border-radius:8px;}
    .catPick::-webkit-scrollbar-track{background:transparent;}
    /* استجابة فورية للمس بالجوال — بدون تأخير ولا ضغطات ضائعة */
    .fz button, .fz input, .fz textarea, .fz select{
      touch-action:manipulation; -webkit-tap-highlight-color:transparent;}
    .fz button{-webkit-user-select:none; user-select:none;}
    .fz input, .fz textarea{-webkit-user-select:text; user-select:text; font-size:16px;}
    .fz button:active:not(:disabled){opacity:.75;}
    .fz{min-height:100vh; background:var(--bg); color:var(--sand); font-family:var(--hj-body); direction:rtl;}
    .wrap{max-width:540px; margin:0 auto; padding:var(--space-xl) var(--space-lg) var(--space-xl); animation:fadeUp .35s cubic-bezier(.2,.8,.3,1) both;}
    @media (max-width:480px){
      .logo{font-size:46px;}
      .qtext{font-size:21px;}
      .introDesc{font-size:16px; padding:var(--space-md);}
      .wrap{padding:var(--space-lg) var(--space-md) var(--space-lg);}
    }
    @media (max-width:360px){
      .logo{font-size:40px;}
      .btn{font-size:16px; padding:14px 16px;}
      .scoreChip{font-size:13px; padding:6px 10px;}
      .scoreName{max-width:70px;}
    }
    @keyframes fadeUp{from{opacity:0; transform:translateY(14px);}to{opacity:1; transform:none;}}
    @keyframes slideInRight{from{opacity:0; transform:translateX(20px);}to{opacity:1; transform:none;}}
    @keyframes slideInLeft{from{opacity:0; transform:translateX(-20px);}to{opacity:1; transform:none;}}
    @keyframes scaleIn{from{opacity:0; transform:scale(.9);}to{opacity:1; transform:scale(1);}}
    @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
    .disp{font-family:var(--hj-display); font-weight:400; letter-spacing:.5px;}
    /* ---------- إعداد الروم (تصميم جديد) ---------- */
    .setup{max-width:1100px; margin:0 auto; padding:var(--space-lg) var(--space-lg) 120px;}
    .setup>section,.setup>header{animation:fadeUp .35s cubic-bezier(.2,.8,.3,1) both;}
    .setupHead{display:flex; flex-direction:column; align-items:flex-start; gap:6px; margin-bottom:var(--space-lg);}
    .setupHead h1{font-size:40px; line-height:1.1;}
    .setupSec{background:var(--sur); border-radius:20px; padding:var(--space-lg); margin-bottom:var(--space-md);}
    .setupLbl{display:block; font-size:15px; font-weight:700; color:var(--sand); margin-bottom:10px;}
    .modeCards{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
    .modeCard{display:flex; flex-direction:column; align-items:flex-start; gap:4px; text-align:right; padding:16px; border:none; cursor:pointer;
      border-radius:16px; background:var(--sur2); color:var(--sand); font-family:var(--hj-body); outline:2px solid transparent; outline-offset:-2px;
      transition:outline-color .15s ease, background .15s ease;}
    .modeCard b{font-size:19px;}
    .modeCard span:last-child{font-size:14px; color:var(--dim); line-height:1.6;}
    .modeCard.on{background:var(--bg); outline-color:var(--amber);}
    .modeIc{font-size:26px;}
    .teamRow{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;}
    .setupOpts{display:flex; flex-wrap:wrap; gap:var(--space-lg) var(--space-xl);}
    .setupOpts .seg{display:flex; gap:8px; flex-wrap:wrap;}
    .pkHead{display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;}
    .pkSum{font-size:14px; color:var(--amber);}
    .pkActs{display:flex; gap:8px; align-items:center; flex-wrap:nowrap;}
    .setupSec .chip{white-space:nowrap;}
    .pkSearch{width:220px !important; padding:10px 14px !important; font-size:15px !important; margin:0 !important;}
    .pkHint{font-size:13px; color:var(--dim); line-height:1.7; margin:10px 0 14px;}
    .pkGrid{display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;}
    .pkCard{position:relative; display:flex; flex-direction:column; text-align:right; padding:0; border:none; cursor:pointer; overflow:hidden;
      border-radius:16px; background:var(--sur2); color:var(--sand); font-family:var(--hj-body);
      transition:transform .16s cubic-bezier(.23,1,.32,1);}
    .pkCard::before{content:""; position:absolute; inset:0; z-index:1; border-radius:inherit; pointer-events:none; box-shadow:inset 0 0 0 3px transparent; transition:box-shadow .15s ease;}
    .pkCard .catArt{height:96px; border-radius:0; --emoji:46px;}
    .pkCard:hover:not(:disabled)::before{box-shadow:inset 0 0 0 2px var(--line);}
    .pkCard:active:not(:disabled){transform:scale(.97);}
    .pkCard.on::before{box-shadow:inset 0 0 0 3px var(--amber);}
    .pkCard:disabled{opacity:.3; cursor:not-allowed;}
    .pkBody{display:flex; flex-direction:column; gap:3px; padding:10px 12px 12px; flex:1;}
    .pkBody b{font-size:15.5px; line-height:1.35;}
    .pkDesc{font-size:12px; color:var(--dim); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;}
    .pkN{margin-top:auto; padding-top:4px; font-size:12px; color:var(--dim);}
    .pkCheck{position:absolute; top:8px; left:8px; z-index:2; width:28px; height:28px; border-radius:50%; background:var(--amber); color:#1A1622;
      display:grid; place-items:center; font-weight:800; font-size:15px; box-shadow:0 2px 8px rgba(70,50,20,.12);}
    .setupBar{position:fixed; bottom:0; left:0; right:0; z-index:60; display:flex; align-items:center; justify-content:space-between; gap:16px;
      padding:12px max(20px,calc((100vw - 1100px)/2 + 20px)) calc(12px + env(safe-area-inset-bottom,0px));
      background:rgba(255,255,255,.92); backdrop-filter:blur(10px); border-top:1px solid var(--line);}
    .setupBar .btn{width:auto; min-width:220px;}
    .setupBarTxt{display:flex; flex-direction:column; font-size:13px; color:var(--dim);}
    .setupBarTxt b{font-size:16px; color:var(--sand);}
    @media (max-width:600px){
      .modeCards,.teamRow{grid-template-columns:1fr;}
      .pkGrid{grid-template-columns:repeat(2,1fr); gap:10px;}
      .pkCard .catArt{height:78px; --emoji:38px;}
      .pkDesc{display:none;}
      .pkSearch{width:100% !important; flex:1 1 100%;}
      .pkActs{width:100%; flex-wrap:wrap;}
      .setupBar .btn{min-width:0; flex:1;}
      .setupHead h1{font-size:34px;}
    }

    ${CAT_ART_CSS}
    .jeemCta{display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; margin:6px 0 16px; padding:18px 20px; border:none; cursor:pointer;
      border-radius:18px; background:var(--sur); color:var(--sand); text-align:right; font-family:var(--hj-body);
      box-shadow:inset 0 0 0 2px var(--amber); transition:transform .16s cubic-bezier(.23,1,.32,1), background .15s;}
    .jeemCta b{font-family:var(--hj-display); font-weight:400; font-size:30px; line-height:1.1; color:var(--amber);}
    .jeemCta span{font-size:14px; color:var(--dim);}
    .jeemCta:hover{background:var(--sur2);}
    .jeemCta:active{transform:scale(.98);}
    .logo{font-family:var(--hj-display); font-size:54px; line-height:1; text-align:center; color:var(--sand); direction:ltr; letter-spacing:2px;}
    .logo span{color:var(--amber);}
    .tag{text-align:center; color:var(--dim); margin-top:6px; font-size:15px;}
    .sadu{display:flex; flex-direction:column; gap:3px; margin:18px 0;}
    .zz{height:6px; opacity:.9;
      background:
        linear-gradient(-45deg, transparent 70%, var(--c) 70%) 0 0/12px 6px repeat-x,
        linear-gradient(45deg, transparent 70%, var(--c) 70%) 6px 0/12px 6px repeat-x;}
    .card{background:var(--sur); border:1px solid var(--line); border-radius:var(--radius-lg); padding:var(--space-lg); margin-top:var(--space-md);
      box-shadow:var(--shadow); transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;}
    .card:hover{border-color:var(--amber); box-shadow:var(--shadow-lg);}
    .btn{display:block; width:100%; border:none; border-radius:var(--radius); padding:16px 20px; font-size:18px; font-family:var(--hj-body);
      font-weight:700; cursor:pointer; transition:transform .12s ease, filter .15s ease, box-shadow .15s ease, background .15s ease; color:#fff;
      position:relative; overflow:hidden;}
    .btn:active:not(:disabled){transform:scale(.97);}
    .btn:focus-visible{outline:3px solid var(--amber); outline-offset:3px;}
    .btn:not(:disabled):hover{filter:brightness(1.08); box-shadow:var(--shadow-lg);}
    .btn-red{background:var(--hj-plum); color:#fff;}
    .btn-amber{background:var(--amber); color:#fff;}
    .btn-ghost{background:transparent; color:var(--sand); border:1.5px solid var(--line);}
    .btn-ghost:not(:disabled):hover{background:var(--sur2); border-color:var(--amber); color:var(--amber);}
    .btn:disabled{opacity:.45; cursor:default; filter:none; box-shadow:none;}
    .btn::after{content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(255,255,255,.1) 0%, transparent 60%); opacity:0; transition:opacity .2s ease; pointer-events:none;}
    .btn:not(:disabled):hover::after{opacity:1;}
    .inp{width:100%; background:var(--sur2); border:1.5px solid var(--line); border-radius:var(--radius-sm); padding:14px 16px;
      color:var(--sand); font-size:17px; font-family:var(--hj-body); transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;}
    .inp:focus{outline:none; border-color:var(--amber); box-shadow:0 0 0 4px rgba(226,148,15,.15); background:var(--sur);}
    .inp::placeholder{color:var(--dim); opacity:.7;}
    .lbl{display:block; color:var(--dim); font-size:14px; margin:14px 0 6px;}
    .chips{display:flex; flex-wrap:wrap; gap:8px;}
    .chip{border:1.5px solid var(--line); background:var(--sur2); color:var(--sand); border-radius:999px;
      padding:10px 16px; font-size:14px; font-weight:500; cursor:pointer; font-family:var(--hj-body);
      transition:transform .12s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease, color .15s ease;}
    .chip:active:not(:disabled){transform:scale(.94);}
    .chip.on{background:var(--hj-plum); border-color:var(--hj-plum); color:#fff; font-weight:700; box-shadow:0 4px 12px var(--hj-plum-ring);}
    .chip:focus-visible{outline:3px solid var(--amber); outline-offset:3px;}
    .chip:not(.on):not(:disabled):hover{background:var(--sur); border-color:var(--amber); color:var(--amber);}
    .chip:disabled{opacity:.4; cursor:not-allowed;}
    .seg{display:flex; gap:8px;}
    .seg .chip{flex:1; text-align:center;}
    .catGrid{display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:var(--space-lg);}
    @media (max-width:380px){ .catGrid{grid-template-columns:1fr;} .catBtn{padding:var(--space-md);} }
    .catBtn{display:flex; flex-direction:column; align-items:center; gap:6px;
      border:2px solid var(--line); background:var(--sur); color:var(--sand); border-radius:var(--radius);
      padding:var(--space-lg) var(--space-md); font-size:15px; font-weight:700; cursor:pointer; font-family:var(--hj-body);
      transition:transform .12s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease;}
    .catBtn .catIcon{font-size:28px; line-height:1;}
    .catBtn:active:not(:disabled){transform:scale(.96);}
    .catBtn.on{background:linear-gradient(135deg, var(--amber) 0%, var(--hj-plum-dk) 100%); border-color:var(--amber); color:#fff;
      box-shadow:0 6px 20px rgba(226,148,15,.3);}
    .catBtn:focus-visible{outline:3px solid var(--amber); outline-offset:3px;}
    .catBtn:not(.on):not(:disabled):hover{border-color:var(--amber); box-shadow:var(--shadow-lg); transform:translateY(-2px);}
    .catBtn:disabled{opacity:.35; cursor:not-allowed;}
    .codebox{font-family:var(--hj-display); font-size:56px; letter-spacing:12px; text-align:center;
      color:var(--amber); background:var(--sur2); border:2px dashed var(--amber); border-radius:16px; padding:8px 0 2px; direction:ltr;}
    .plist{display:flex; flex-direction:column; gap:8px; margin-top:10px;}
    .prow{display:flex; align-items:center; justify-content:space-between; background:var(--sur2);
      border-radius:12px; padding:12px 14px;}
    .ptsTile{font-family:var(--hj-display); font-size:26px; color:var(--amber); background:var(--sur2);
      border:1.5px solid var(--line); border-radius:12px; padding:2px 14px 0; display:inline-block;}
    .qtext{font-size:23px; font-weight:700; line-height:1.7; margin:16px 0; letter-spacing:.2px;
      color:var(--sand); text-wrap:balance;}
    .fuseTrack{height:8px; background:var(--sur2); border-radius:999px; overflow:hidden; margin-top:var(--space-md);
      box-shadow:inset 0 1px 3px rgba(70,50,20,.10);}
    .fuseBar{height:100%; background:linear-gradient(90deg, var(--amber), var(--red)); border-radius:999px;
      transition:width .12s linear, background .3s ease; margin-inline-start:auto;
      background-size:200% 100%; animation:shimmer 2s linear infinite;}
    .meta{display:flex; align-items:center; justify-content:space-between; gap:8px;}
    .badge{font-size:13px; color:var(--dim);}
    .evBanner{display:flex; align-items:center; gap:10px; background:var(--hj-plum-lt); border:1.5px solid var(--amber);
      border-radius:14px; padding:10px 14px; margin-top:12px; font-weight:700; color:var(--amber);}
    .evSplash{text-align:center; padding:var(--space-xl) 0 var(--space-md);}
    .evIcon{font-size:80px; line-height:1; animation:popIn .6s cubic-bezier(.2,1.4,.4,1);}
    .evName{font-family:var(--hj-display); font-size:48px; color:var(--amber); margin-top:var(--space-md); text-shadow:0 0 20px rgba(226,148,15,.3);}
    .introDesc{color:var(--sand); font-size:18px; line-height:1.9; margin-top:var(--space-lg);
      background:var(--sur); border:1px solid var(--line); border-radius:var(--radius-lg); padding:var(--space-lg); text-align:center;
      box-shadow:var(--shadow);}
    .evDesc{color:var(--sand); font-size:18px; margin-top:var(--space-sm); line-height:1.8;}
    .rrow{display:flex; align-items:center; justify-content:space-between; background:var(--sur);
      border-radius:var(--radius-sm); padding:14px 16px; margin-top:8px;
      transition:transform .15s ease, box-shadow .15s ease; border:1px solid var(--line);}
    .rrow:not(:first-child):hover{transform:translateX(-4px); box-shadow:var(--shadow);}
    .rrow.ok{border-inline-start:4px solid var(--teal); background:var(--hj-teal-lt);}
    .rrow.bad{border-inline-start:4px solid var(--red); background:var(--hj-plum-lt); opacity:.9;}
    .gain{font-family:var(--hj-display); font-size:24px;}
    .correctBox{background:var(--hj-teal-lt); border:1.5px solid var(--teal); color:var(--teal); border-radius:14px;
      padding:14px; font-size:18px; font-weight:700; text-align:center;}
    .stealBox{background:var(--hj-plum-lt); border:1.5px solid var(--red); color:var(--sand); border-radius:14px;
      padding:12px; font-size:16px; font-weight:700; text-align:center; margin-top:10px;}
    .itemGrid{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;}
    .itemBtn{display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center;
      background:var(--sur2); border:1.5px solid var(--line); color:var(--sand); border-radius:14px;
      padding:12px 8px; cursor:pointer; font-family:var(--hj-body); font-size:13px;
      transition:transform .12s ease, border-color .15s ease;}
    .itemBtn:active{transform:scale(.94);}
    .itemBtn:hover{border-color:var(--amber);}
    .itemBtn:focus-visible{outline:3px solid var(--amber); outline-offset:2px;}
    .logRow{background:var(--sur2); border-radius:10px; padding:8px 12px; font-size:14px; margin-bottom:6px;}
    .fxBanner{display:flex; flex-wrap:wrap; gap:10px; justify-content:center; background:var(--hj-plum-lt);
      border:1.5px solid var(--red); border-radius:14px; padding:10px; margin-top:12px;
      font-weight:700; font-size:14px; color:var(--sand);}
    .grantBox{background:var(--hj-teal-lt); border:1.5px solid var(--teal); color:var(--sand); border-radius:14px;
      padding:12px; font-size:16px; font-weight:700; text-align:center; margin-top:10px;}
    .voteTicks{display:block; color:var(--teal); font-size:15px; letter-spacing:2px; margin-top:4px;}
    .voterNames{display:block; color:var(--dim); font-size:11px; letter-spacing:0; font-weight:400; margin-top:2px;}
    .qImg{background:var(--sur2); border:1.5px solid var(--line); border-radius:14px; padding:14px;
      display:flex; justify-content:center; align-items:center; margin-bottom:4px;}
    .qImg svg{width:100%; max-width:260px; height:auto; display:block;}
    .exitBar{display:flex; justify-content:flex-start; margin-bottom:4px;}
    .exitBtn{background:transparent; border:1.5px solid var(--line); color:var(--dim); border-radius:999px;
      padding:6px 14px; font-size:13px; cursor:pointer; font-family:var(--hj-body); transition:all .15s ease;}
    .exitBtn:hover{border-color:var(--dim); color:var(--sand);}
    .exitBtn.danger{border-color:var(--hj-plum-lt); color:var(--hj-bad);}
    .exitBtn.danger:hover{border-color:var(--red); color:var(--red);}
    .qPhoto{background:var(--sur2); border:1.5px solid var(--line); border-radius:14px;
      overflow:hidden; margin-bottom:6px; display:block;}
    .qPhoto img{width:100%; display:block; max-height:420px; object-fit:contain;
      transition:transform .3s ease; background:var(--sur);}
    /* مع الزوم نحتاج قص عشان التقريب يبان */
    .qPhoto.zoomed img{aspect-ratio:16/10; object-fit:cover; max-height:none;}
    .catPick{display:flex; flex-wrap:wrap; gap:8px; max-height:260px; overflow-y:auto;
      background:var(--sur); border:1px solid var(--line); border-radius:var(--radius); padding:var(--space-md);}
    .catPickItem{display:flex; flex-direction:column; align-items:center; gap:4px; min-width:90px; flex:0 0 auto;}
    .catPickItem .chip{padding:12px 16px; font-size:13px; white-space:nowrap;}
    .catPickItem .catIcon{font-size:20px; line-height:1;}
    .scoreBar{display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 16px; justify-content:center;}
    .scoreChip{display:flex; align-items:center; gap:8px; background:var(--sur); border:2px solid var(--line);
      border-radius:999px; padding:8px 14px; font-size:14px; transition:all .2s ease; box-shadow:var(--shadow);}
    .scoreChip.me{border-color:var(--amber); box-shadow:0 0 0 2px rgba(226,148,15,.2), var(--shadow);}
    .scoreChip.done{border-color:var(--teal); background:var(--hj-teal-lt);}
    .scoreRank{color:var(--dim); font-size:12px; min-width:18px; text-align:center; font-weight:700;}
    .scoreName{font-weight:600; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .scoreVal{font-family:var(--hj-display); color:var(--amber); font-size:18px;}
    .scoreTick{color:var(--teal); font-size:14px;}
    .jWrap{max-width:760px;}
    .jTop{display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;}
    .jBrand{font-family:var(--hj-display); font-size:22px; color:var(--amber); letter-spacing:1px;}
    .jBrand b{color:var(--sand); font-weight:400;}
    .jTurn{margin-inline-start:auto; color:#fff; font-weight:700; font-size:13px;
      border-radius:999px; padding:6px 16px;}
    .jTop .exitBar{margin:0;}
    .qHead{display:flex; align-items:center; justify-content:space-between; margin:8px 0 var(--space-md);}
    .qPts{font-family:var(--hj-display); font-size:38px; color:var(--amber);}
    .qClock{font-family:var(--hj-display); font-size:28px; color:var(--sand);
      background:var(--sur); border:2px solid var(--line); border-radius:var(--radius-sm); padding:6px 20px;}
    .qClock.hot{color:#fff; background:var(--red); border-color:var(--red); animation:pulseGlow 1s ease-in-out infinite;}
    @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(217,73,79,.6);}50%{box-shadow:0 0 16px 4px rgba(217,73,79,.4);}}
    .jCard{padding:22px;}
    .jCard .qtext{font-size:24px;}
    .ansBox{background:var(--hj-teal-lt); border:2px solid var(--teal); border-radius:var(--radius-lg);
      padding:var(--space-xl); text-align:center; font-size:28px; font-weight:700; color:var(--teal);
      margin-top:var(--space-lg); animation:scaleIn .4s cubic-bezier(.2,1.4,.4,1);
      box-shadow:0 0 30px rgba(46,196,166,.15), inset 0 0 0 1px rgba(46,196,166,.2);}
    .ansLbl{display:block; font-size:13px; color:var(--dim); font-weight:400; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;}
    .ansAlt{font-size:14px; color:var(--dim); font-weight:400; margin-top:10px;}
    .ansInfo{font-size:15px; color:var(--sand); font-weight:400; line-height:1.8; margin-top:14px;
      padding-top:12px; border-top:1px solid rgba(46,196,166,.3); text-align:right;}
    .judgeBox{margin-top:16px;}
    .jAward{color:#fff !important; font-size:17px;}
    .puRow{display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:16px;}
    .puBtn{display:flex; align-items:center; gap:6px; background:var(--sur2);
      border:1.5px solid var(--line); color:var(--sand); border-radius:999px;
      padding:8px 14px; font-size:13px; cursor:pointer; font-family:var(--hj-body);
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
      box-shadow:0 6px 18px rgba(70,50,20,.12);}
    .teamCard.turn::before{content:""; position:absolute; inset-inline:16px; top:-2px; height:4px;
      background:var(--tc); border-radius:0 0 6px 6px;}
    .teamName{font-weight:700; font-size:14px; color:var(--tc);}
    .teamScore{font-family:var(--hj-display); font-size:30px; color:var(--sand); line-height:1.1;}
    .teamMembers{font-size:11px; color:var(--dim); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .jBoard{display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:12px;}
    .jCol{display:flex; flex-direction:column; gap:5px;}
    .jCat{background:var(--amber); color:#fff; border-radius:12px 12px 4px 4px; padding:10px 4px;
      font-size:12px; font-weight:700; text-align:center; min-height:44px; display:flex;
      align-items:center; justify-content:center; line-height:1.3; margin-bottom:3px;}
    .jTile{border:none; background:var(--sur2); color:var(--amber);
      border-radius:10px; padding:14px 4px; font-family:var(--hj-display); font-size:22px;
      cursor:pointer; transition:transform .12s ease, background .15s ease;}
    .jTile:not(:disabled):hover{background:var(--amber); color:#fff;}
    .jTile:active:not(:disabled){transform:scale(.93);}
    .jTile.locked{background:transparent; color:var(--line); cursor:default; box-shadow:inset 0 0 0 1.5px var(--line);}
    .jTile:disabled{cursor:default;}
    @media (max-width:420px){ .jBoard{gap:5px;} .jCat{font-size:10px;} .jTile{font-size:16px; padding:9px 2px;} }
    .optGrid{display:grid; grid-template-columns:1fr 1fr; gap:10px;}
    .optBtn{background:var(--sur); border:2px solid var(--line); color:var(--sand);
      border-radius:var(--radius-sm); padding:16px 12px; font-size:16px; font-family:var(--hj-body);
      font-weight:500; cursor:pointer; transition:all .15s ease; text-align:center;
      box-shadow:var(--shadow);}
    .optBtn:not(:disabled):hover{border-color:var(--amber); color:var(--amber); transform:translateY(-2px); box-shadow:var(--shadow-lg);}
    .optBtn:active:not(:disabled){transform:scale(.98);}
    .optBtn.on{border-color:var(--amber); background:var(--amber); color:#fff; font-weight:700; box-shadow:0 4px 16px rgba(226,148,15,.3);}
    .optBtn.right{border-color:var(--teal); background:var(--hj-teal-lt); color:var(--teal); font-weight:700; box-shadow:0 4px 16px rgba(46,196,166,.3);}
    .optBtn:disabled{opacity:.4; cursor:not-allowed;}
    @media (max-width:400px){ .optGrid{grid-template-columns:1fr;} }
    .cdNum{font-family:var(--hj-display); font-size:96px; line-height:1; color:var(--amber);
      animation:cdPop .5s cubic-bezier(.2,1.5,.4,1);}
    @keyframes cdPop{0%{transform:scale(.4); opacity:0;}60%{transform:scale(1.15);}100%{transform:scale(1); opacity:1;}}
    .warnBox{background:var(--hj-plum-lt); border:1.5px solid var(--red); color:var(--sand); border-radius:14px;
      padding:14px; font-size:15px; font-weight:700; margin-bottom:14px; text-align:right;}
    .hiddenQ{background:var(--sur2); border:1.5px dashed var(--line); border-radius:14px; padding:24px;
      text-align:center; font-size:20px; color:var(--dim); margin:14px 0;}
    .podium{display:flex; align-items:flex-end; justify-content:center; gap:16px; margin:var(--space-xl) 0 var(--space-lg);}
    .pod{flex:1; max-width:140px; text-align:center; animation:slideInRight .6s cubic-bezier(.2,.8,.3,1) both;}
    .pod:nth-child(1){animation-delay:.1s;}
    .pod:nth-child(2){animation-delay:.2s;}
    .pod:nth-child(3){animation-delay:.3s;}
    .podBar{border-radius:16px 16px 0 0; display:flex; align-items:flex-start; justify-content:center;
      padding-top:12px; font-family:var(--hj-display); font-size:32px; color:#fff; min-height:60px;
      box-shadow:0 -4px 20px rgba(70,50,20,.10);}
    .toast{position:fixed; bottom:20px; right:50%; transform:translateX(50%); background:var(--sand); color:#fff;
      border-radius:12px; padding:12px 20px; font-weight:700; z-index:50; box-shadow:0 8px 24px rgba(70,50,20,.14); animation:fadeUp .2s ease;}
    .overlay{position:fixed; inset:0; background:rgba(246,243,238,.96); display:flex; flex-direction:column; gap:16px;
      align-items:center; justify-content:center; z-index:40; color:var(--amber); font-size:20px; font-weight:700;}
    .spin{width:44px; height:44px; border:4px solid var(--sur2); border-top-color:var(--amber); border-radius:50%;
      animation:sp 1s linear infinite;}
    @keyframes sp{to{transform:rotate(360deg);}}
    .pulse{animation:pl 1.6s ease-in-out infinite;}
    @keyframes pl{0%,100%{opacity:1;}50%{opacity:.55;}}
    .pop{animation:pp .4s cubic-bezier(.2,1.4,.4,1);}
    @keyframes pp{0%{transform:scale(.6); opacity:0;}100%{transform:scale(1); opacity:1;}}
    @keyframes popIn{0%{transform:scale(.3); opacity:0;}50%{transform:scale(1.1);}100%{transform:scale(1); opacity:1;}}
    .back{background:none; border:none; color:var(--dim); font-size:15px; cursor:pointer; font-family:var(--hj-body); padding:6px 0; border-radius:8px;}
    .back:focus-visible{outline:3px solid var(--amber); outline-offset:3px; color:var(--amber);}
    .qcount{font-family:var(--hj-display); color:var(--dim); font-size:18px;}
    .flash{animation:fl .5s ease;}
    @keyframes fl{0%{background:var(--hj-plum-lt);}100%{background:var(--sur);}}
    .egg{position:fixed; right:10px; bottom:8px; background:none; border:none; color:var(--dim); opacity:.45;
      font-size:11px; cursor:pointer; font-family:var(--hj-body); z-index:30;}
    .egg:hover{opacity:.9;}
    select.inp{appearance:none;}
    /* ===== حفل النهاية ===== */
    .fz{--ease-out:cubic-bezier(0.23,1,0.32,1); --ease-in-out:cubic-bezier(0.77,0,0.175,1);
      --gold:linear-gradient(165deg,#FFF4CE 0%,#F2C94C 38%,#D9A227 72%,#A8650B 100%);
      --silver:linear-gradient(165deg,#FFFFFF 0%,var(--hj-line) 40%,#9C9CB4 75%,#6E6E86 100%);
      --bronze:linear-gradient(165deg,#F0C9A8 0%,#C98A52 40%,#A55E27 75%,#6B3812 100%);}
    .confettiCv{position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:60;}
    .fin{position:relative; padding-top:18px;}
    .finHead{text-align:center;}
    .finKick{font-size:13px; letter-spacing:2px; color:var(--dim); font-weight:700;}
    .finTitle{font-size:34px; margin-top:4px; min-height:48px; transition:transform .3s var(--ease-out);}
    .finWin{color:var(--amber); text-shadow:0 0 24px rgba(255,177,61,.45);}
    .stage{position:relative; display:flex; align-items:flex-end; justify-content:center; gap:10px;
      margin:26px auto 0; max-width:440px; padding:0 4px; isolation:isolate;}
    .stage::after{content:""; position:absolute; inset:auto -10px -6px; height:14px; border-radius:50%;
      background:radial-gradient(closest-side,rgba(226,148,15,.10),transparent); z-index:-1;}
    .beams{position:absolute; left:50%; bottom:40px; width:520px; height:520px; margin-left:-260px; z-index:-2;
      border-radius:50%; opacity:0; transform:scale(.9);
      background:repeating-conic-gradient(from 0deg, rgba(255,197,61,.20) 0deg 9deg, transparent 9deg 24deg);
      -webkit-mask:radial-gradient(closest-side,#000 25%,transparent 72%); mask:radial-gradient(closest-side,#000 25%,transparent 72%);
      transition:opacity .9s var(--ease-out), transform .9s var(--ease-out);}
    .fin.done .beams{opacity:1; transform:scale(1); animation:beamSpin 22s linear infinite;}
    @keyframes beamSpin{to{rotate:360deg;}}
    .pcol{flex:1; max-width:136px; min-width:0; display:flex; flex-direction:column; align-items:center;}
    .pcol.empty{visibility:hidden;}
    .who{position:relative; text-align:center; width:100%; margin-bottom:10px;
      opacity:0; transform:translateY(12px) scale(.96);
      transition:opacity .45s var(--ease-out) .35s, transform .45s var(--ease-out) .35s;}
    .pcol.up .who{opacity:1; transform:none;}
    .ava{width:52px; height:52px; margin:0 auto 6px; border-radius:50%; display:grid; place-items:center;
      font-family:var(--hj-display); font-size:26px; color:#fff; border:3px solid var(--sur);
      box-shadow:0 6px 18px rgba(70,50,20,.14);}
    .r1 .ava{width:66px; height:66px; font-size:34px; background:var(--gold); box-shadow:0 0 0 3px rgba(255,197,61,.35),0 8px 26px rgba(255,177,61,.35);}
    .r2 .ava{background:var(--silver);} .r3 .ava{background:var(--bronze);}
    .pname{font-weight:700; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:0 2px;}
    .r1 .pname{font-size:17px; color:var(--amber);}
    .pscore{font-family:var(--hj-display); font-size:22px; line-height:1.1; font-variant-numeric:tabular-nums;}
    .pscore small{font-family:var(--hj-body); font-size:11px; color:var(--dim);}
    .pcol.me .pname::after{content:""; display:block; height:2px; margin:3px auto 0; width:28px; border-radius:2px; background:var(--teal);}
    .crown{position:absolute; top:-30px; left:50%; font-size:30px; translate:-50% 0; opacity:0; transform:translateY(-26px) rotate(-14deg);}
    .fin.done .r1 .crown{animation:crownDrop .7s cubic-bezier(0.34,1.56,0.64,1) .55s both;}
    @keyframes crownDrop{from{opacity:0; transform:translateY(-26px) rotate(-14deg);} to{opacity:1; transform:translateY(0) rotate(-8deg);}}
    .slot{position:relative; width:100%; overflow:hidden; border-radius:14px 14px 0 0;}
    .r1 .slot{height:190px;} .r2 .slot{height:140px;} .r3 .slot{height:104px;}
    .block{position:absolute; inset:0; border-radius:14px 14px 0 0; display:flex; justify-content:center; padding-top:14px;
      transform:translateY(101%); transition:transform .75s var(--ease-out);
      box-shadow:inset 0 2px 0 rgba(255,255,255,.55), inset 0 -18px 30px rgba(0,0,0,.28), 0 -6px 30px rgba(70,50,20,.12);}
    .block::before{content:""; position:absolute; inset:0 0 auto; height:16px; border-radius:14px 14px 0 0;
      background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0));}
    .block::after{content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
      background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);
      transform:translateX(-120%);}
    .fin.done .r1 .block::after{animation:shine 1.6s var(--ease-in-out) 1s 2;}
    @keyframes shine{to{transform:translateX(120%);}}
    .r1 .block{background:var(--gold);} .r2 .block{background:var(--silver);} .r3 .block{background:var(--bronze);}
    .pcol.up .block{transform:translateY(0);}
    .bnum{font-family:var(--hj-display); font-size:58px; line-height:1; color:rgba(0,0,0,.28);
      text-shadow:0 1px 0 rgba(255,255,255,.55);}
    .r1 .bnum{font-size:76px;}
    .qmark{position:absolute; inset:0; display:grid; place-items:center; font-family:var(--hj-display); font-size:54px;
      color:var(--line); border:2px dashed var(--line); border-bottom:none; border-radius:14px 14px 0 0;
      transition:opacity .3s var(--ease-out);}
    .pcol.up .qmark{opacity:0;}
    .pcol.roll .qmark{color:var(--amber); border-color:var(--amber); animation:qPulse .5s ease-in-out infinite alternate;}
    @keyframes qPulse{from{opacity:.45; transform:scale(.97);} to{opacity:1; transform:scale(1.03);}}
    .frows{margin:18px auto 0; max-width:440px; display:flex; flex-direction:column; gap:7px;}
    .frow{display:grid; grid-template-columns:34px 1fr 74px auto; align-items:center; gap:10px;
      background:var(--sur); border:1px solid var(--line); border-radius:12px; padding:9px 12px;
      opacity:0; transform:translateY(10px); transition:opacity .35s var(--ease-out), transform .35s var(--ease-out);}
    .frow.on{opacity:1; transform:none;}
    .frow.me{border-color:var(--teal); box-shadow:0 0 0 1px var(--teal) inset;}
    .frk{font-family:var(--hj-display); font-size:20px; color:var(--dim); text-align:center;}
    .fnm{font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
    .fbar,.t10bar{height:6px; border-radius:6px; background:var(--sur2); overflow:hidden;}
    .fbar i,.t10bar i{display:block; height:100%; border-radius:6px; background:var(--teal); transform-origin:right center;}
    .fsc{font-family:var(--hj-display); font-size:18px; min-width:34px; text-align:left; font-variant-numeric:tabular-nums;}
    .fmore,.fmine{text-align:center; color:var(--dim); font-size:13px; margin-top:10px;}
    .fmine{color:var(--teal); font-weight:700; font-size:15px;}
    .finCtl{display:flex; gap:8px; justify-content:center; margin-top:16px; flex-wrap:wrap;}
    .chipBtn{background:var(--sur2); color:var(--sand); border:1px solid var(--line); border-radius:999px;
      padding:8px 14px; font-family:var(--hj-body); font-size:13px; font-weight:700; cursor:pointer;
      transition:transform .14s var(--ease-out), background-color .2s ease;}
    .chipBtn:active{transform:scale(.97);}
    @media (hover:hover) and (pointer:fine){ .chipBtn:hover{background:var(--line);} }
    /* ===== التوب 10 ===== */
    .t10{position:fixed; inset:0; z-index:45; display:grid; place-items:center; padding:16px;
      background:rgba(246,243,238,.92); backdrop-filter:blur(6px); animation:t10In .2s var(--ease-out) both;}
    @keyframes t10In{from{opacity:0;}to{opacity:1;}}
    .t10card{width:100%; max-width:460px; max-height:92vh; overflow:auto; background:var(--sur);
      border:1px solid var(--line); border-radius:20px; padding:16px; box-shadow:0 24px 60px rgba(70,50,20,.18);
      animation:t10Card .28s var(--ease-out) both;}
    @keyframes t10Card{from{opacity:0; transform:translateY(12px) scale(.97);}to{opacity:1; transform:none;}}
    .t10head{display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;}
    .t10title{font-size:28px; color:var(--amber);}
    .t10row{display:grid; grid-template-columns:34px 1fr 70px auto; gap:10px; align-items:center;
      padding:9px 10px; border-radius:12px; background:var(--sur2); margin-top:6px;
      animation:t10Row .3s var(--ease-out) both;}
    @keyframes t10Row{from{opacity:0; transform:translateY(8px);}to{opacity:1; transform:none;}}
    .t10bar i{animation:t10Bar .6s var(--ease-out) both;}
    @keyframes t10Bar{from{scale:0 1;}}
    .t10rk{font-family:var(--hj-display); font-size:20px; text-align:center; color:var(--dim);}
    .t10row.m1 .t10rk,.t10row.m2 .t10rk,.t10row.m3 .t10rk{color:#fff; border-radius:8px; line-height:30px;}
    .t10row.m1 .t10rk{background:var(--gold);} .t10row.m2 .t10rk{background:var(--silver);} .t10row.m3 .t10rk{background:var(--bronze);}
    .t10row.m1{box-shadow:inset 0 0 0 1px rgba(255,197,61,.45);}
    .t10row.me{box-shadow:inset 0 0 0 1.5px var(--teal);}
    .t10nm{font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
    .t10sc{font-family:var(--hj-display); font-size:19px; min-width:34px; text-align:left; font-variant-numeric:tabular-nums;}
    .t10mine{text-align:center; color:var(--teal); font-weight:700; margin-top:12px;}
    .t10wait{text-align:center; color:var(--dim); font-size:13px; margin-top:12px;}
    @media (max-width:380px){ .r1 .slot{height:160px;} .r2 .slot{height:118px;} .r3 .slot{height:88px;} .bnum{font-size:46px;} .r1 .bnum{font-size:60px;} .finTitle{font-size:28px;} }
    @media (prefers-reduced-motion: reduce){ .fz .block,.fz .who,.fz .frow{transition:opacity .2s ease!important;} .fz .block{transform:none;} .fz .pcol:not(.up) .block{opacity:0;} .beams{display:none;} }
    @media (prefers-reduced-motion: reduce){ .fz *{animation:none!important; transition:none!important;} }
  

    /* ==========================================================
       اللعب السريع
       ========================================================== */

    .qBack{font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;
      background:var(--sur); color:var(--sand); border:1px solid var(--line);
      border-radius:999px; padding:9px 18px; transition:border-color .15s ease;}
    .qBack:hover{border-color:var(--amber);}

    .qHead{text-align:center; padding:10px 18px 0;}
    .qTitle{font-family:var(--hj-display); font-weight:400; color:var(--sand);
      font-size:clamp(32px,8vw,52px); line-height:1.1; margin:0;}
    .qSub{color:var(--dim); font-size:15px; margin:8px 0 0;}

    .qBar{display:flex; flex-wrap:wrap; gap:12px; justify-content:center; align-items:center;
      margin:22px auto 0; padding:0 18px;}
    .qCounts{display:flex; align-items:center; gap:7px; background:var(--sur);
      border:1px solid var(--line); border-radius:999px; padding:6px 8px 6px 16px;}
    .qCountsL{font-size:13.5px; color:var(--dim);}
    .qCount{font-family:var(--hj-display); font-size:19px; cursor:pointer; min-width:42px;
      height:38px; border-radius:999px; border:0; background:var(--sur2); color:var(--sand);
      transition:background .15s ease, color .15s ease;}
    .qCount:hover{background:var(--line);}
    .qCount.on{background:var(--amber); color:#fff;}
    .qRand{font-family:inherit; font-size:14.5px; font-weight:700; cursor:pointer;
      background:var(--sur); color:var(--sand); border:1px solid var(--line);
      border-radius:999px; padding:11px 20px; transition:border-color .15s ease;}
    .qRand:hover{border-color:var(--teal);}

    .qMeta{display:flex; gap:10px; justify-content:center; align-items:center; flex-wrap:wrap;
      margin-top:16px; font-size:13.5px; color:var(--dim);}
    .qMeta .qOk{color:var(--teal); font-weight:700;}
    .qDot{opacity:.45;}
    .qClear{font-family:inherit; font-size:13px; cursor:pointer; background:none;
      border:0; color:var(--red); text-decoration:underline; padding:0 4px;}

    .qGrid{display:grid; gap:11px; padding:20px 18px 0; max-width:1120px; margin:0 auto;
      grid-template-columns:repeat(auto-fill,minmax(104px,1fr));}
    .qCard{font-family:inherit; cursor:pointer; padding:8px 7px 11px; position:relative;
      background:var(--sur); border:2px solid var(--line); border-radius:16px;
      display:flex; flex-direction:column; align-items:center; gap:7px;
      transition:border-color .15s ease, transform .15s ease, opacity .15s ease;}
    .qCard:hover{transform:translateY(-2px); border-color:var(--amber);}
    .qCard img{width:100%; aspect-ratio:1; object-fit:cover; border-radius:11px;
      background:var(--sur2); display:block;}
    .qCardN{font-size:12.5px; color:var(--sand); line-height:1.35; text-align:center;}
    .qCard.on{border-color:var(--teal); background:var(--hj-teal-lt);}
    .qCard.off{opacity:.42;}
    .qCard.off:hover{transform:none; border-color:var(--line);}
    .qTick{position:absolute; top:-8px; inset-inline-end:-6px; width:26px; height:26px;
      border-radius:50%; background:var(--teal); color:#fff; font-size:14px;
      display:grid; place-content:center; box-shadow:var(--shadow);}

    .qStartWrap{position:sticky; bottom:0; padding:16px 18px 20px; margin-top:22px;
      background:linear-gradient(to top,var(--bg) 62%,transparent);}
    .qStart{font-family:inherit; font-weight:700; font-size:17px; cursor:pointer;
      display:block; width:100%; max-width:440px; margin:0 auto; border:0;
      border-radius:999px; padding:17px 24px; color:#fff;
      background:linear-gradient(118deg,var(--hj-plum),var(--hj-plum-dk));
      box-shadow:var(--shadow-lg); transition:filter .15s ease, transform .14s ease;}
    .qStart:hover:not(:disabled){filter:brightness(1.06);}
    .qStart:active:not(:disabled){transform:translateY(1px);}
    .qStart:disabled{background:var(--sur2); color:var(--dim); box-shadow:none; cursor:not-allowed;}

    /* ---- شاشة اللعب ---- */
    .qPlay{min-height:100dvh; display:flex; flex-direction:column; background:var(--bg);}
    .qPbar{height:4px; background:var(--sur2); flex:0 0 auto;}
    .qPbar i{display:block; height:100%; background:linear-gradient(90deg,var(--amber),var(--red));
      transition:width .35s var(--ease-out,ease);}
    .qTop{display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:12px 18px; flex:0 0 auto;}
    .qTop .qBack{padding:7px 14px;}
    .qProg{font-size:13.5px; color:var(--dim); font-variant-numeric:tabular-nums;}
    .qScore{font-family:var(--hj-display); font-size:25px; color:var(--amber);
      font-variant-numeric:tabular-nums;}

    .qStage{flex:1; width:100%; max-width:660px; margin:0 auto; padding:8px 18px 36px;}
    .qCatRow{display:flex; align-items:center; gap:12px; margin-bottom:18px;}
    .qCatImg{width:50px; height:50px; border-radius:13px; object-fit:cover;
      background:var(--sur2); flex:0 0 auto;}
    .qCatName{font-family:var(--hj-display); font-size:19px; color:var(--sand); line-height:1.2;}
    .qDiff{font-size:12.5px; color:var(--dim); margin-top:2px;}

    .qQ{font-size:clamp(19px,4.6vw,25px); line-height:1.7; color:var(--sand);
      background:var(--sur); border:1px solid var(--line); border-radius:var(--radius-lg);
      padding:22px 20px; margin:0; box-shadow:var(--shadow);}

    .qOpts{display:grid; gap:10px; margin-top:16px;}
    .qOpt{font-family:inherit; font-size:16px; cursor:pointer; text-align:start;
      background:var(--sur); color:var(--sand); border:2px solid var(--line);
      border-radius:14px; padding:15px 18px; line-height:1.6;
      transition:border-color .15s ease, background .15s ease;}
    .qOpt:hover{border-color:var(--amber); background:var(--hj-plum-lt);}

    .qForm{margin-top:16px; display:grid; gap:10px;}
    .qInput{font-family:inherit; font-size:17px; width:100%; color:var(--sand);
      background:var(--sur); border:2px solid var(--line); border-radius:14px; padding:16px 18px;}
    .qInput:focus{outline:none; border-color:var(--amber); box-shadow:0 0 0 3px var(--glow);}
    .qFormBtns{display:flex; gap:10px;}
    .qSend{font-family:inherit; font-size:16px; font-weight:700; cursor:pointer; flex:1;
      border:0; border-radius:14px; padding:15px; color:#fff; background:var(--teal);
      transition:filter .15s ease;}
    .qSend:hover:not(:disabled){filter:brightness(1.07);}
    .qSend:disabled{background:var(--sur2); color:var(--dim); cursor:not-allowed;}
    .qSkip{font-family:inherit; font-size:15px; cursor:pointer; flex:0 0 auto;
      background:var(--sur); color:var(--dim); border:1px solid var(--line);
      border-radius:14px; padding:15px 20px;}
    .qSkip:hover{border-color:var(--red); color:var(--red);}

    .qVerdict{margin-top:16px; border-radius:var(--radius-lg); padding:20px;
      border:2px solid; animation:fadeUp .25s cubic-bezier(.2,.8,.3,1) both;}
    .qVerdict.right{border-color:var(--teal); background:var(--hj-teal-lt);}
    .qVerdict.wrong{border-color:var(--red); background:var(--hj-plum-lt);}
    .qVerdict b{font-family:var(--hj-display); font-weight:400; font-size:28px; display:block;}
    .qVerdict.right b{color:var(--teal);}
    .qVerdict.wrong b{color:var(--red);}
    .qAns{margin-top:8px; font-size:16px; color:var(--sand);}
    .qAns span{font-weight:700;}
    .qInfo{margin:10px 0 0; font-size:14.5px; line-height:1.85; color:var(--dim);}
    .qNext{font-family:inherit; font-size:16px; font-weight:700; cursor:pointer;
      margin-top:16px; width:100%; border:0; border-radius:14px; padding:15px;
      color:#fff; background:var(--sand); transition:filter .15s ease;}
    .qNext:hover{filter:brightness(1.3);}

    .qDoneHero{margin-top:0; padding-top:72px;}
    .qDoneK{font-family:var(--hj-display); font-size:24px; color:var(--hj-plum-lt); margin-bottom:4px;}
    .qDoneHero .hLogo{font-size:clamp(68px,18vw,124px); font-variant-numeric:tabular-nums;}

    @media (prefers-reduced-motion:reduce){
      .qCard:hover{transform:none;}
      .qVerdict{animation:none;}
      .qPbar i{transition:none;}
    }


    /* ---- إصلاح اتجاه النص والأرقام ---- */
    .qSub{display:flex; flex-wrap:wrap; gap:10px; justify-content:center; align-items:center;}
    .qSub span + span::before{content:""; display:inline-block; width:4px; height:4px;
      border-radius:50%; background:var(--line); margin-inline-end:10px; vertical-align:middle;}
    .qProg b{font-weight:700; color:var(--sand); font-variant-numeric:tabular-nums;}
    .qDiff{display:flex; gap:9px; align-items:center;}
    .qDiff span + span::before{content:""; display:inline-block; width:3px; height:3px;
      border-radius:50%; background:var(--dim); opacity:.6; margin-inline-end:9px; vertical-align:middle;}
    .qMeta b{font-weight:700; font-variant-numeric:tabular-nums;}
    .qDot{width:4px; height:4px; border-radius:50%; background:var(--line); display:inline-block;}

    /* ---- توسيط مسرح السؤال ---- */
    .qStage{display:flex; flex-direction:column; justify-content:center;}
    @media(max-height:720px){ .qStage{justify-content:flex-start;} }


    /* ===== بطاقات الفئات — نفس شكل اللعب السريع ===== */
    .pkGrid{grid-template-columns:repeat(auto-fill,minmax(126px,1fr)) !important; gap:11px !important;}
    .pkCard{background:var(--sur) !important; border:2px solid var(--line) !important;
      padding:8px 7px 10px !important; gap:7px; align-items:center !important;
      text-align:center !important; border-radius:16px !important;}
    .pkCard::before{display:none !important;}
    .pkCard .catArt{height:auto !important; width:100% !important; aspect-ratio:1 !important;
      border-radius:11px !important; overflow:hidden;}
    .pkCard .catArt::after{display:none !important;}
    .pkCard .catArt img{width:100%; height:100%; object-fit:cover;}
    .pkCard:hover:not(:disabled){transform:translateY(-2px); border-color:var(--amber) !important;}
    .pkCard.on{border-color:var(--teal) !important; background:var(--hj-teal-lt) !important;}
    .pkBody{padding:0 2px !important; gap:2px !important; align-items:center; text-align:center;}
    .pkBody b{font-size:12.8px !important; line-height:1.35 !important;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;}
    .pkDesc{display:none !important;}
    .pkN{margin-top:3px !important; padding-top:0 !important; font-size:11px !important; opacity:.85;}
    .pkCheck{top:-8px !important; left:auto !important; inset-inline-end:-6px !important;
      width:26px !important; height:26px !important; background:var(--teal) !important;
      color:#fff !important; font-size:14px !important;}

    .catGrid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr)) !important; gap:11px !important;}
    .catBtn{padding:9px 8px 11px !important; gap:8px !important; border-width:2px !important;
      border-radius:16px !important; align-items:center !important; text-align:center !important;}
    .catBtn .catArt{width:100%; aspect-ratio:1; height:auto; border-radius:11px; overflow:hidden;}
    .catBtn .catArt::after{display:none;}
    .catBtn .catArt img{width:100%; height:100%; object-fit:cover;}
    .catBtn > span:not(.catArt):not(.voteTicks){font-size:13px; line-height:1.35; color:var(--sand);}
    .catBtn.on{border-color:var(--teal) !important; background:var(--hj-teal-lt) !important;}
    .voterNames{display:block; font-size:10.5px; color:var(--dim); margin-top:2px;}

    @media(max-width:420px){
      .pkGrid{grid-template-columns:repeat(3,1fr) !important;}
      .catGrid{grid-template-columns:repeat(2,1fr) !important;}
    }
    @media (prefers-reduced-motion:reduce){ .pkCard:hover:not(:disabled){transform:none;} }



    /* ==========================================================
       الرئيسية — هوية «هات الجواب»  (برقوقي + فيروزي على كريمي)
       الألوان من src/styles/tokens.css
       ========================================================== */
    .nh{background:var(--hj-bg); color:var(--hj-ink); font-family:var(--hj-body);
      min-height:100vh; overflow-x:hidden;}
    .nh *{box-sizing:border-box;}

    /* ---- الشريط العلوي ---- */
    .nhBar{display:flex; align-items:center; justify-content:space-between; gap:14px;
      padding:16px clamp(16px,4vw,46px); position:relative; z-index:5;}
    .nhMark{font-family:var(--hj-display); font-weight:700; font-size:19px;
      color:var(--hj-ink); letter-spacing:-.01em;}
    .nhMark i{font-style:normal; color:var(--hj-plum);}

    /* ---- الواجهة: شطر مائل ---- */
    .nhHero{display:grid; gap:0; align-items:stretch;
      grid-template-columns:1fr; padding:0 0 clamp(26px,5vw,56px);}
    @media(min-width:980px){
      .nhHero{grid-template-columns:1.04fr .96fr; grid-template-rows:1fr;
        min-height:clamp(520px,66vh,680px);}
    }
    .nhHeroText{padding:clamp(18px,4vw,40px) clamp(16px,4vw,46px) clamp(30px,5vw,46px);
      display:flex; flex-direction:column; justify-content:center;}
    .nhEyebrow{font-size:11.5px; font-weight:600; letter-spacing:.17em;
      color:var(--hj-plum); margin:0 0 18px;}

    /* الشعار: «هات» مفرّغة و«الجواب» مصمتة */
    .nhLogo{font-family:var(--hj-display); font-weight:700; margin:0;
      font-size:clamp(3.1rem,8.4vw,7rem); line-height:.95; letter-spacing:-.018em;}
    .nhLogo .o{color:transparent; -webkit-text-stroke:2px var(--hj-plum);
      paint-order:stroke fill; letter-spacing:.04em;}
    .nhLogo .s{color:var(--hj-ink); display:block;}
    @media(min-width:980px){ .nhLogo .o{-webkit-text-stroke-width:2.6px;} }

    .nhTag{font-size:clamp(15.5px,1.9vw,19px); line-height:1.75; color:var(--hj-ink-2);
      margin:20px 0 0; max-width:34ch; font-weight:300;}
    .nhTag b{font-weight:600; color:var(--hj-ink);}

    .nhFacts{display:flex; flex-wrap:wrap; gap:0; margin-top:30px;
      border-top:1px solid var(--hj-line); padding-top:18px;}
    .nhFact{padding-inline-end:clamp(18px,3vw,34px); margin-inline-end:clamp(18px,3vw,34px);
      border-inline-end:1px solid var(--hj-line);}
    .nhFact:last-child{border-inline-end:0; margin-inline-end:0; padding-inline-end:0;}
    .nhFact b{display:block; font-family:var(--hj-display); font-weight:600;
      font-size:clamp(23px,3vw,31px); line-height:1; color:var(--hj-plum);
      font-variant-numeric:tabular-nums;}
    .nhFact span{display:block; font-size:12px; color:var(--hj-ink-3); margin-top:5px;}

    /* ---- فسيفساء الفئات المائلة ---- */
    .nhMosaic{position:relative; overflow:hidden; background:var(--hj-plum);
      min-height:330px;
      clip-path:polygon(0 0, 100% 0, 100% 100%, 0 100%);}
    @media(min-width:980px){
      .nhMosaic{clip-path:polygon(0 0, 88% 0, 100% 100%, 0 100%);}
    }
    .nhMosaic::after{content:""; position:absolute; inset:0; pointer-events:none;
      background:linear-gradient(180deg,var(--hj-plum) 0%,transparent 16%,transparent 84%,var(--hj-plum) 100%);}
    .nhCols{position:absolute; inset:-8% -4%; display:grid; gap:10px;
      grid-template-columns:repeat(3,1fr); transform:rotate(-7deg) scale(1.22);}
    .nhCol{display:flex; flex-direction:column; gap:10px;}
    .nhCol img{width:100%; aspect-ratio:1; object-fit:cover; border-radius:var(--hj-r);
      display:block; background:var(--hj-plum-dk);}
    .nhCol--a{animation:nhDrift 46s linear infinite;}
    .nhCol--b{animation:nhDrift 58s linear infinite reverse;}
    .nhCol--c{animation:nhDrift 52s linear infinite;}
    @keyframes nhDrift{from{transform:translateY(0)} to{transform:translateY(-50%)}}

    /* ---- الأقسام ---- */
    .nhSec{padding:clamp(46px,7vw,86px) clamp(16px,4vw,46px) 0;
      max-width:1240px; margin:0 auto;}
    .nhHead{display:flex; align-items:baseline; gap:14px; flex-wrap:wrap;
      border-bottom:2px solid var(--hj-ink); padding-bottom:12px; margin-bottom:26px;}
    .nhH2{font-family:var(--hj-display); font-weight:600; margin:0;
      font-size:clamp(1.65rem,4vw,2.5rem); line-height:1.15; letter-spacing:-.015em;}
    .nhCount{margin-inline-start:auto; font-size:12.5px; color:var(--hj-ink-3);
      font-variant-numeric:tabular-nums;}

    /* ---- بطاقتا الأنماط ---- */
    .nhModes{display:grid; gap:14px; grid-template-columns:1fr;}
    @media(min-width:860px){ .nhModes{grid-template-columns:1.12fr 1fr;} }
    .nhMode{background:var(--hj-surface); border:1px solid var(--hj-line);
      border-inline-start:5px solid var(--hj-plum); border-radius:var(--hj-r);
      padding:clamp(22px,3vw,34px); display:flex; flex-direction:column; gap:10px;}
    .nhMode--b{border-inline-start-color:var(--hj-teal);}
    .nhKicker{font-size:11px; font-weight:600; letter-spacing:.14em; color:var(--hj-plum);}
    .nhMode--b .nhKicker{color:var(--hj-teal-dk);}
    .nhMode h3{font-family:var(--hj-display); font-weight:600; margin:0;
      font-size:clamp(1.5rem,2.8vw,2rem); line-height:1.2; color:var(--hj-ink);}
    .nhMode p{margin:0; font-size:14.8px; line-height:1.9; color:var(--hj-ink-2); font-weight:300;}
    .nhBtns{display:flex; flex-wrap:wrap; gap:9px; margin-top:8px;}
    .nhBtn{font-family:var(--hj-body); font-size:14.5px; font-weight:600; cursor:pointer;
      border:1.5px solid transparent; border-radius:var(--hj-r-sm); padding:12px 26px;
      transition:background .16s var(--hj-ease), color .16s var(--hj-ease),
        border-color .16s var(--hj-ease), transform .12s var(--hj-ease);}
    .nhBtn:active{transform:translateY(1px);}
    .nhBtn--fill{background:var(--hj-plum); color:#fff;}
    .nhBtn--fill:hover{background:var(--hj-plum-dk);}
    .nhMode--b .nhBtn--fill{background:var(--hj-teal);}
    .nhMode--b .nhBtn--fill:hover{background:var(--hj-teal-dk);}
    .nhBtn--line{background:transparent; color:var(--hj-ink); border-color:var(--hj-line);}
    .nhBtn--line:hover{border-color:var(--hj-plum); color:var(--hj-plum);}
    .nhBtn:focus-visible{outline:3px solid var(--hj-plum-ring); outline-offset:2px;}

    /* ---- شبكة الفئات ---- */
    .nhGrid{display:grid; gap:12px;
      grid-template-columns:repeat(auto-fill,minmax(112px,1fr));}
    .nhCat{text-align:center; margin:0;}
    .nhCat img{width:100%; aspect-ratio:1; object-fit:cover; display:block;
      border-radius:var(--hj-r); background:var(--hj-bg-2);
      border:1px solid var(--hj-line-soft);
      transition:transform .18s var(--hj-ease), border-color .18s var(--hj-ease);}
    .nhCat:hover img{transform:translateY(-3px); border-color:var(--hj-plum);}
    .nhCat figcaption{font-size:12px; color:var(--hj-ink-2); margin-top:8px;
      line-height:1.4; font-weight:400;}

    /* ---- الخطوات ---- */
    .nhSteps{list-style:none; counter-reset:nhs; margin:0; padding:0;
      display:grid; gap:clamp(16px,2.5vw,26px); grid-template-columns:1fr;}
    @media(min-width:760px){ .nhSteps{grid-template-columns:repeat(3,1fr);} }
    .nhSteps li{counter-increment:nhs; display:grid; gap:7px;
      border-top:1px solid var(--hj-line); padding-top:16px;}
    .nhSteps li::before{content:counter(nhs,decimal-leading-zero);
      font-family:var(--hj-display); font-weight:700; font-size:34px; line-height:1;
      color:transparent; -webkit-text-stroke:1.6px var(--hj-plum);
      font-variant-numeric:tabular-nums;}
    .nhSteps b{font-size:16px; font-weight:600; color:var(--hj-ink);}
    .nhSteps span{font-size:14.3px; line-height:1.85; color:var(--hj-ink-2); font-weight:300;}

    /* ---- التذييل ---- */
    .nhFoot{margin-top:clamp(50px,7vw,84px); border-top:1px solid var(--hj-line);
      padding:26px clamp(16px,4vw,46px) 40px; display:flex; flex-wrap:wrap;
      gap:12px; align-items:center; justify-content:space-between;
      font-size:12.5px; color:var(--hj-ink-3);}
    .nhFoot b{font-family:var(--hj-display); font-weight:600; font-size:17px; color:var(--hj-ink-2);}

    /* ---- تنبيه التخزين ---- */
    .nhWarn{max-width:620px; margin:22px auto 0; background:var(--hj-surface);
      border:1px solid var(--hj-line); border-inline-start:4px solid var(--hj-warn);
      border-radius:var(--hj-r); padding:16px 18px; font-size:14px; line-height:1.8;
      color:var(--hj-ink-2);}
    .nhWarn b{color:var(--hj-ink);}

    @media (prefers-reduced-motion:reduce){
      .nhCol--a,.nhCol--b,.nhCol--c{animation:none;}
      .nhCat:hover img{transform:none;}
      .nhBtn:active{transform:none;}
    }

`;

  /* ---------- الشاشات ---------- */
  const Home = () => {
    const catList = CATS.filter((c) => (CAT_INFO[c] || {}).img);
    /* ثلاثة أعمدة للفسيفساء، كل عمود مكرر مرتين عشان الحركة تلف بسلاسة */
    const cols = [0, 1, 2].map((n) => {
      const part = catList.filter((_, i) => i % 3 === n).slice(0, 7);
      return part.concat(part);
    });
    return (
    <div className="nh">
      <div className="nhBar">
        <span className="nhMark">هات <i>الجواب</i></span>
        <AccountChip acc={acc} />
      </div>

      <section className="nhHero">
        <div className="nhHeroText">
          <p className="nhEyebrow">لعبة أسئلة عربية</p>
          <h1 className="nhLogo"><span className="o">هات</span> <span className="s">الجواب</span></h1>
          <p className="nhTag">
            اكتب جوابك — <b>الأسرع الصح ياخذها</b>. العبوها من جوالاتكم بكود،
            أو على شاشة وحدة بين الربع.
          </p>
          <div className="nhFacts">
            <div className="nhFact"><b>{catList.length}</b><span>فئة</span></div>
            <div className="nhFact"><b>٦</b><span>فئات باللوحة</span></div>
            <div className="nhFact"><b>٢</b><span>طور لعب</span></div>
          </div>
        </div>

        <div className="nhMosaic" aria-hidden="true">
          <div className="nhCols">
            {cols.map((col, ci) => (
              <div className={"nhCol nhCol--" + "abc"[ci]} key={ci}>
                {col.map((c, i) => (
                  <img key={c + i} src={CAT_INFO[c].img} alt=""
                    loading={i < col.length / 2 ? "eager" : "lazy"}
                    decoding="async" width="200" height="200" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {storeOk === "unknown" && (
        <div className="nhWarn">
          <b>ما قدرنا نتأكد من التخزين.</b> جرّب عادي — غالبًا بيشتغل.
          ولو ما ظهر الروم، تأكدوا إنكم على نفس الرابط المنشور، ولا تفتحونه بوضع التصفح الخفي.
        </div>
      )}

      <section className="nhSec" id="modes">
        <div className="nhHead"><h2 className="nhH2">طورين للعب</h2></div>
        <div className="nhModes">
          <div className="nhMode">
            <span className="nhKicker">أونلاين · يحتاج كود</span>
            <h3>اللعب السريع</h3>
            <p>كل واحد على جواله. سوّ روم، أرسل الكود لربعك، وتصوّتون على الفئة كل جولة — والأسرع الصح ياخذ النقاط.</p>
            <div className="nhBtns">
              <button className="nhBtn nhBtn--fill" onClick={() => setScreen("setup")}>سوّ روم</button>
              <button className="nhBtn nhBtn--line" onClick={() => setScreen("join")}>عندي كود</button>
            </div>
          </div>
          <div className="nhMode nhMode--b">
            <span className="nhKicker">محلي · بدون كود</span>
            <h3>طور الفئات</h3>
            <p>تلفزيون واحد والكل حوله. فريقين، ٦ فئات، نقاط ٢٠٠ و٤٠٠ و٦٠٠، وثلاث وسائل مساعدة.</p>
            <div className="nhBtns">
              <button className="nhBtn nhBtn--fill" onClick={() => { navigate("/categories"); }}>افتحها</button>
            </div>
          </div>
        </div>
      </section>

      <section className="nhSec">
        <div className="nhHead">
          <h2 className="nhH2">الفئات</h2>
          <span className="nhCount">{catList.length} فئة</span>
        </div>
        <div className="nhGrid">
          {catList.map((c) => (
            <figure className="nhCat" key={c}>
              <img src={CAT_INFO[c].img} alt="" loading="lazy" decoding="async" width="200" height="200" />
              <figcaption>{c}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="nhSec">
        <div className="nhHead"><h2 className="nhH2">كيف تلعبونها</h2></div>
        <ol className="nhSteps">
          <li><b>اختر الطور</b><span>أونلاين بكود مع ربعك، أو محلي على شاشة وحدة.</span></li>
          <li><b>اختر الفئات</b><span>من {catList.length} فئة، وكل فئة لها طريقتها.</span></li>
          <li><b>اكتب جوابك</b><span>تصحيح فوري، والنقاط تنحسب حسب صعوبة السؤال.</span></li>
        </ol>
      </section>

      <footer className="nhFoot">
        <b>هات الجواب</b>
        <span>لعبة أسئلة عربية</span>
      </footer>
    </div>
    );
  };

  const Setup = () => {
    const isBoard = cfg.mode === "board";
    const q = norm(catQ || "");
    const list = CATS.filter((c) => !q || norm(c).includes(q) || norm((CAT_INFO[c] || {}).desc || "").includes(q));
    const togglePick = (c) => setCfg({ ...cfg, picked: cfg.picked.includes(c) ? cfg.picked.filter((x) => x !== c) : [...cfg.picked, c] });
    const pickedTxt = isBoard
      ? (cfg.picked.length ? `${Math.min(cfg.picked.length, BOARD_CATS_N)} مختارة${cfg.picked.length < BOARD_CATS_N ? ` + ${BOARD_CATS_N - cfg.picked.length} عشوائية` : ""}` : `${BOARD_CATS_N} فئات عشوائية`)
      : (cfg.picked.length ? `${cfg.picked.length} فئة مختارة` : "كل الفئات");
    return (
      <div className="setup">
        <header className="setupHead">
          <button className="back" onClick={() => setScreen("home")}>→ رجوع</button>
          <h1 className="disp">سوّ روم</h1>
        </header>

        <section className="setupSec">
          <label className="setupLbl" htmlFor="hostName">اسمك</label>
          <input id="hostName" className="inp" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} placeholder="مثلاً: حسين" maxLength={20} />
        </section>

        {/* اختيار النمط انشال: الروم دايم «سريع».
            لوحة الفريقين صارت طور الفئات على /categories. */}

        {!isBoard && (
          <section className="setupSec setupOpts">
            <div>
              <div className="setupLbl">عدد الأسئلة</div>
              <div className="seg">
                {[15, 30, 40].map((n) => (
                  <button key={n} className={"chip" + (cfg.count === n ? " on" : "")} onClick={() => setCfg({ ...cfg, count: n })}>{n}</button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="setupSec">
          <div className="pkHead">
            <div>
              <div className="setupLbl" style={{ marginBottom: 2 }}>الفئات</div>
              <div className="pkSum">{pickedTxt}</div>
            </div>
            <div className="pkActs">
              <input className="inp pkSearch" placeholder="ابحث عن فئة" value={catQ} onChange={(e) => setCatQ(e.target.value)} aria-label="ابحث عن فئة" />
              {!isBoard && <button className="chip" onClick={() => setCfg({ ...cfg, picked: [...CATS] })}>حدد الكل</button>}
              <button className="chip" disabled={!cfg.picked.length} onClick={() => setCfg({ ...cfg, picked: [] })}>{isBoard ? "عشوائي" : "مسح الاختيار"}</button>
            </div>
          </div>
          <p className="pkHint">
            {isBoard
              ? "اختر 6 فئات للوحة، أو خلّها عشوائية. الفئات اللي ما فيها أسئلة كافية للوحة مقفلة."
              : "اختر الفئات اللي تبونها، وكل جولة تصوّتون على وحدة منها. إذا ما اخترت شي تدخل كل الفئات."}
          </p>
          <div className="pkGrid">
            {list.map((c) => {
              const on = cfg.picked.includes(c);
              const weak = isBoard && !boardReady(c);
              const info = CAT_INFO[c] || {};
              return (
                <button key={c} className={"pkCard" + (on ? " on" : "")} disabled={weak} aria-pressed={on}
                  title={weak ? "ما فيها أسئلة كافية للوحة" : info.desc} onClick={() => togglePick(c)}>
                  <CatArt cat={c} />
                  <span className="pkBody">
                    <b>{c}</b>
                    
                    <span className="pkN">{c === "رياضيات" ? "أسئلة تتولد" : `${CAT_COUNT[c] || 0} سؤال`}</span>
                  </span>
                  {on && <span className="pkCheck" aria-hidden="true">✓</span>}
                </button>
              );
            })}
            {!list.length && <p className="pkHint">ما فيه فئة بهالاسم.</p>}
          </div>
          {isBoard && cfg.picked.length > BOARD_CATS_N && (
            <p className="pkHint" style={{ color: "var(--amber)" }}>اخترت {cfg.picked.length}، واللوحة تعرض {BOARD_CATS_N} منها عشوائيًا كل مباراة.</p>
          )}
          {!isBoard && cfg.picked.length === 1 && (
            <p className="pkHint" style={{ color: "var(--red)" }}>اختر فئتين على الأقل، وإلا كل الأسئلة بتكون من فئة وحدة.</p>
          )}
        </section>

        <div className="setupBar">
          <div className="setupBarTxt">
            <b>{isBoard ? "لوحة الفريقين" : `${cfg.count} سؤال`}</b>
            <span>{pickedTxt}</span>
          </div>
          <button className="btn btn-red" onClick={createRoom}>جهّز الروم</button>
        </div>
      </div>
    );
  };

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
          🎯 لعبة الفئات — بينقسمون على فريقين تلقائيًا بالتناوب عند البدء
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
          <span className="jBrand">هات<b>الجواب</b></span>
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
          {b.aImg ? <div className="qPhoto"><img key={b.aImg} src={b.aImg} alt=""
            onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }} /></div>
          : b.img && <div className={"qPhoto" + (b.zoom ? " zoomed" : "")}><img src={b.img} alt=""
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

  // تنقّل بلوحة المفاتيح (الأسهم) داخل شبكة أزرار
  const onGridKey = (sel, cols) => (e) => {
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (!keys.includes(e.key)) return;
    const root = e.currentTarget;
    const btns = Array.from(root.querySelectorAll(sel)).filter((b) => !b.disabled);
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    // في RTL: السهم الأيمن يروح لليسار بصريًا
    let next = i;
    if (e.key === "ArrowDown") next = Math.min(btns.length - 1, i + cols);
    else if (e.key === "ArrowUp") next = Math.max(0, i - cols);
    else if (e.key === "ArrowRight") next = Math.max(0, i - 1);
    else if (e.key === "ArrowLeft") next = Math.min(btns.length - 1, i + 1);
    btns[next] && btns[next].focus();
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
          <div className="catGrid" onKeyDown={onGridKey(".catBtn", 2)}>
            {cm.options.map((c) => {
              const names = (cm.voters && cm.voters[c]) || [];
              const info = CAT_INFO[c];
              return (
                <button key={c} className={"catBtn" + (myVote === c ? " on" : "")} onClick={() => castVote(c)}>
                  <CatArt cat={c} />
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
            <div className="optGrid" onKeyDown={onGridKey(".optBtn", 2)}>
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
          <button className={"btn btn-amber" + (answered ? " pop" : "")} disabled={answered || remain <= 0 || locked || cancelled || !typedText.trim()} onClick={answerTyped}>أرسل ⚡</button>
        </div>
        )}
        {answered && <p className="pop" style={{ textAlign: "center", color: "var(--teal)", marginTop: 12, fontWeight: 700 }}>وصلت إجابتك ✓ ننتظر البقية…</p>}
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
              {!r.aImgOn && <span className="badge" style={{ display: "block", textAlign: "center", marginTop: 6 }}>الصورة كاملة</span>}
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
              <button className="btn btn-ghost" style={{ marginBottom: 10 }} onClick={toggleTop}>🏆 اعرض التوب 10 للكل</button>
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

  const End = () => (
    <div className="wrap">
      <FinalCeremony board={view.board} meId={me.pid} />
      {role === "host" && (
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-red" onClick={playAgain}>جولة ثانية 🔄</button>
        </div>
      )}
      <div style={{ height: 10 }} />
      <button className="btn btn-ghost" onClick={leaveGame}>الرئيسية</button>
    </div>
  );

  return (
    <div className="fz">
      <style>{css}</style>
      {screen === "home" && Home()}
      {screen === "setup" && Setup()}
      {screen === "join" && Join()}
      
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
      {screen === "game" && view && view.showTop && view.phase !== "end" && view.board && (
        <TopTenOverlay board={view.board} meId={me.pid} isHost={role === "host"} onClose={toggleTop} />
      )}
      {toast && <div className="toast">{toast}</div>}
      <button className="egg" onClick={() => setToast("عم عبدالله يقول: بلن 😌")}>بلن عم عبدالله</button>
    </div>
  );
}


export { App };
export default App;
