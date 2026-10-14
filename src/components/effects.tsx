// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { sfxState, SFX } from "../lib/sfx";

/* ---------- قصاصات وشرائط (Canvas) ---------- */
function Confetti({ fire }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr; };
    resize(); window.addEventListener("resize", resize);
    const W = () => cv.width / dpr, H = () => cv.height / dpr;
    const cols = ["#E2940F", "#119C80", "#D9434E", "#3E8FE0", "#8B7CF6", "#FFC53D"];
    const P: any[] = [];
    const burst = (x, dir, n = 90) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + dir * (0.15 + Math.random() * 0.5);
        const sp = 10 + Math.random() * 10;
        P.push({ k: "p", x, y: H() + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 6 + Math.random() * 6, h: 9 + Math.random() * 9,
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: cols[i % cols.length], life: Math.random() * 20 });
      }
    };
    const streamer = () => ({ k: "s", x: Math.random() * W(), y: -20 - Math.random() * 120, vy: 1.8 + Math.random() * 1.8,
      len: 55 + Math.random() * 55, ph: Math.random() * 6, amp: 6 + Math.random() * 9, c: cols[Math.floor(Math.random() * cols.length)] });
    burst(0, 1); burst(W(), -1);
    const tms = [setTimeout(() => { burst(W() * 0.25, 1, 60); burst(W() * 0.75, -1, 60); }, 850)];
    const t0 = performance.now();
    let id = 0, spawned = 0;
    const tick = (now) => {
      const el = now - t0;
      while (el < 5200 && spawned < el / 70) { P.push(streamer()); spawned++; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W(), H());
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        if (p.k === "p") {
          p.life++; p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.3; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.life * 0.18));
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        } else {
          p.y += p.vy; p.ph += 0.09;
          ctx.strokeStyle = p.c; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath();
          for (let s = 0; s <= 12; s++) {
            const yy = p.y - (s * p.len) / 12, xx = p.x + Math.sin(p.ph + s * 0.55) * p.amp;
            if (s) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
          }
          ctx.stroke();
        }
        if (p.y > H() + 140) P.splice(i, 1);
      }
      if (P.length || el < 5200) id = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W(), H());
    };
    id = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(id); tms.forEach(clearTimeout); window.removeEventListener("resize", resize); };
  }, [fire]);
  return <canvas ref={ref} className="confettiCv" aria-hidden="true" />;
}

function CountUp({ to, on, ms = 1000 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) { setV(0); return; }
    let id = 0; const t0 = performance.now();
    const f = (n) => { const k = Math.min(1, (n - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f);
    return () => cancelAnimationFrame(id);
  }, [on, to]);
  return <>{v}</>;
}

/* ---------- حفل النهاية: 10 ← 4 ثم المنصة 3 ← 2 ← طبول ← 1 ---------- */
function FinalCeremony({ board, meId }) {
  const top = board.slice(0, 10);
  const rest = top.slice(3);
  const R = rest.length;
  const [step, setStep] = useState(0);
  const [boom, setBoom] = useState(0);
  const [muted, setMuted] = useState(!sfxState.on);
  const tms = useRef([]);
  const DONE = R + 4;
  useEffect(() => {
    const at = (ms, fn) => tms.current.push(setTimeout(fn, ms));
    for (let k = 1; k <= R; k++) at(700 + (k - 1) * 480, () => { setStep(k); SFX.tick(k); });
    const base = 700 + R * 480 + 450;
    at(base, () => { setStep(R + 1); if (top[2]) SFX.thud(0); });
    at(base + 1150, () => { setStep(R + 2); if (top[1]) SFX.thud(1); });
    at(base + 2100, () => { setStep(R + 3); SFX.roll(2.3); });
    at(base + 4500, () => { setStep(DONE); setBoom((b) => b + 1); SFX.fanfare(); });
    return () => tms.current.forEach(clearTimeout);
  }, []);
  const skip = () => { tms.current.forEach(clearTimeout); tms.current = []; setStep(DONE); setBoom((b) => b + 1); };
  const toggleMute = () => { sfxState.on = !sfxState.on; setMuted(!sfxState.on); };
  const done = step >= DONE;
  const podOn = [step >= DONE, step >= R + 2, step >= R + 1]; // 1st, 2nd, 3rd
  const rolling = step === R + 3;
  const myRank = board.findIndex((p) => p.pid === meId);
  const winner = top[0];
  const order = [1, 0, 2]; // يمين→يسار بالـRTL: الثاني، الأول، الثالث
  const nums = ["١", "٢", "٣"];
  return (
    <div className={"fin" + (done ? " done" : "")}>
      <Confetti fire={boom} />
      <div className="finHead">
        <div className="finKick">النتائج النهائية</div>
        <h2 className="disp finTitle" aria-live="polite">
          {done && winner ? <>البطل: <span className="finWin">{winner.name}</span></> : rolling ? "والمركز الأول…" : "مين بطل الجولة؟"}
        </h2>
      </div>

      <div className="stage">
        <div className="beams" aria-hidden="true" />
        {order.map((r) => {
          const p = top[r];
          if (!p) return <div className="pcol empty" key={"e" + r} />;
          const on = podOn[r];
          return (
            <div key={p.pid} className={"pcol r" + (r + 1) + (on ? " up" : "") + (r === 0 && rolling ? " roll" : "") + (p.pid === meId ? " me" : "")}>
              <div className="who">
                {r === 0 && <div className="crown" aria-hidden="true">👑</div>}
                <div className="ava">{(p.name || "?").trim().charAt(0)}</div>
                <div className="pname">{p.name}{p.pid === meId ? " (أنت)" : ""}</div>
                <div className="pscore"><CountUp to={p.score} on={on} /> <small>نقطة</small></div>
              </div>
              <div className="slot">
                <div className="qmark" aria-hidden="true">?</div>
                <div className="block"><span className="bnum">{nums[r]}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {R > 0 && (
        <div className="frows">
          {rest.map((p, j) => {
            const on = step >= R - j;
            const pct = winner && winner.score > 0 ? Math.max(0.04, Math.min(1, p.score / winner.score)) : 0.04;
            return (
              <div key={p.pid} className={"frow" + (on ? " on" : "") + (p.pid === meId ? " me" : "")}>
                <span className="frk">{j + 4}</span>
                <span className="fnm">{p.name}{p.pid === meId ? " (أنت)" : ""}</span>
                <span className="fbar"><i style={{ transform: "scaleX(" + pct + ")" }} /></span>
                <span className="fsc">{p.score}</span>
              </div>
            );
          })}
        </div>
      )}
      {board.length > 10 && done && <div className="fmore">+{board.length - 10} لاعب بعد التوب 10</div>}
      {done && myRank >= 10 && <div className="fmine">مركزك: #{myRank + 1} — {board[myRank].score} نقطة</div>}

      <div className="finCtl">
        {!done ? <button className="chipBtn" onClick={skip}>تخطّي ⏭</button>
          : <button className="chipBtn" onClick={() => { setBoom((b) => b + 1); SFX.fanfare(); }}>احتفل مرة ثانية 🎉</button>}
        <button className="chipBtn" onClick={toggleMute} aria-pressed={muted}>{muted ? "🔇 الصوت مقفل" : "🔊 الصوت"}</button>
      </div>
    </div>
  );
}

/* ---------- التوب 10 أثناء اللعبة (الهوست يعرضه للكل) ---------- */
function TopTenOverlay({ board, meId, isHost, onClose }) {
  useEffect(() => { SFX.whoosh(); }, []);
  const top = board.slice(0, 10);
  const lead = top[0] && top[0].score > 0 ? top[0].score : 1;
  const myRank = board.findIndex((p) => p.pid === meId);
  return (
    <div className="t10" role="dialog" aria-modal="true" aria-label="التوب 10">
      <div className="t10card">
        <div className="t10head">
          <span className="disp t10title">التوب 10</span>
          {isHost && <button className="chipBtn" onClick={onClose}>إخفاء ✕</button>}
        </div>
        {top.map((p, i) => (
          <div key={p.pid} className={"t10row" + (i < 3 ? " m" + (i + 1) : "") + (p.pid === meId ? " me" : "")} style={{ animationDelay: i * 60 + "ms" }}>
            <span className="t10rk">{i + 1}</span>
            <span className="t10nm">{p.name}{p.pid === meId ? " (أنت)" : ""}</span>
            <span className="t10bar"><i style={{ transform: "scaleX(" + Math.max(0.04, Math.min(1, p.score / lead)) + ")", animationDelay: 120 + i * 60 + "ms" }} /></span>
            <span className="t10sc">{p.score}</span>
          </div>
        ))}
        {myRank >= 10 && <div className="t10mine">مركزك: #{myRank + 1} — {board[myRank].score} نقطة</div>}
        {!isHost && <p className="t10wait">الهوست يكمّل اللعبة…</p>}
      </div>
    </div>
  );
}


export { Confetti, CountUp, FinalCeremony, TopTenOverlay };
