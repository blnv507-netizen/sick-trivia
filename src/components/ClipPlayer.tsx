// @ts-nocheck
/* مشغّل مقاطع «مقاطع فن أجنبي»: زر تشغيل/إعادة يشغّل الصوت بس (NNN.m4a)،
   وزر «اعرض الفيديو» يبدّل للفيديو (NNN.mp4) ويشغّله من البداية.
   بدون أدوات المتصفح: ما فيه اسم ملف ولا تنزيل ولا قائمة كلك يمين ولا تشغيل تلقائي.
   الصوت يبدأ ينزل أول ما ينفتح السؤال (preload=auto)؛ الفيديو ما ينزل إلا لو انطلب. */
import React, { useEffect, useRef, useState } from "react";
import { imgUrl } from "../lib/img";

const CSS = `
.clipP{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:560px;margin:0 auto;}
.clipP-stage{position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#1a1512;
  display:flex;align-items:center;justify-content:center;}
.clipP-stage.audio{aspect-ratio:auto;height:96px;background:var(--hj-plum-lt,#F1EAF8);border:1.5px solid var(--hj-line,#E2D9CB);}
.clipP-stage video{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;}
.clipP-wave{display:flex;align-items:center;gap:5px;height:44px;}
.clipP-wave i{width:6px;border-radius:3px;background:var(--hj-plum,#6B3FA0);height:10px;opacity:.55;transition:height .2s;}
.clipP.playing .clipP-wave i{opacity:1;animation:clipWave 1s ease-in-out infinite;}
.clipP-wave i:nth-child(2){animation-delay:-.8s!important}.clipP-wave i:nth-child(3){animation-delay:-.6s!important}
.clipP-wave i:nth-child(4){animation-delay:-.4s!important}.clipP-wave i:nth-child(5){animation-delay:-.2s!important}
.clipP-wave i:nth-child(6){animation-delay:-.7s!important}.clipP-wave i:nth-child(7){animation-delay:-.3s!important}
@keyframes clipWave{0%,100%{height:10px}50%{height:40px}}
.clipP-bar{position:absolute;inset:auto 0 0 0;height:5px;background:rgba(255,255,255,.18);}
.clipP-stage.audio .clipP-bar{background:rgba(107,63,160,.15);}
.clipP-bar b{display:block;height:100%;width:var(--p,0%);background:var(--hj-plum,#6B3FA0);}
.clipP-stage:not(.audio) .clipP-bar b{background:#fff;}
.clipP-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;opacity:.8;}
.clipP-stage.audio .clipP-wait{display:none;}
.clipP-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
.clipP button{font-family:inherit;cursor:pointer;border:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 20px;border-radius:999px;
  font-size:16px;font-weight:600;transition:transform .12s,background .15s;}
.clipP button:active{transform:scale(.97);}
.clipP-main{background:var(--hj-plum,#6B3FA0);color:#fff;min-width:148px;}
.clipP-main:hover{background:var(--hj-plum-dk,#4E2C77);}
.clipP-alt{background:var(--hj-surface,#fff);color:var(--hj-ink,#2A1B2E);border:1.5px solid var(--hj-line,#E2D9CB)!important;}
.clipP-alt:hover{background:var(--hj-bg-2,#EFE9DE);}
.clipP-err{font-size:14px;color:var(--hj-bad,#C03B52);}
@media (prefers-reduced-motion:reduce){.clipP.playing .clipP-wave i{animation:none;height:26px;}}
`;

const stopMenu = (e) => e.preventDefault();

export default function ClipPlayer({ base }) {
  const aRef = useRef(null), vRef = useRef(null);
  const [mode, setMode] = useState("audio");       // audio | video
  const [st, setSt] = useState("idle");            // idle | playing | paused | ended
  const [p, setP] = useState(0);
  const [wait, setWait] = useState(false);
  const [err, setErr] = useState(false);
  const aSrc = imgUrl(base + ".m4a"), vSrc = imgUrl(base + ".mp4");

  // سؤال جديد = مشغّل جديد (key={base} عند الاستخدام). لما يطلع المشغّل (كشف الإجابة) يوقف الصوت والفيديو
  useEffect(() => () => { [aRef.current, vRef.current].forEach((m) => m && m.pause()); }, []);

  const el = () => (mode === "video" ? vRef.current : aRef.current);

  const start = (m, fromTop) => {
    if (!m) return;
    if (fromTop) m.currentTime = 0;
    const r = m.play();
    if (r && r.catch) r.catch((e) => { if (!e || e.name !== "AbortError") setErr(true); });
  };

  const onMain = () => {
    const m = el();
    if (!m) return;
    if (st === "playing") { m.pause(); return; }
    start(m, st !== "paused");
  };

  const toggleMode = () => {
    const next = mode === "audio" ? "video" : "audio";
    const cur = el();
    if (cur) cur.pause();
    setMode(next);
    setSt("idle"); setP(0);
    // الفيديو ينضاف للصفحة بعد الرندر، فالتشغيل بعده بلحظة — بنفس ضغطة المستخدم في أغلب المتصفحات
    if (next === "audio") start(aRef.current, true);
    else requestAnimationFrame(() => start(vRef.current, true));
  };

  const bind = (on) => on ? {
    onPlay: () => { setSt("playing"); setErr(false); },
    onPause: (e) => { if (!e.currentTarget.ended) setSt("paused"); },
    onEnded: () => { setSt("ended"); setP(100); },
    onTimeUpdate: (e) => { const m = e.currentTarget; if (m.duration) setP((m.currentTime / m.duration) * 100); },
    onWaiting: () => setWait(true), onPlaying: () => setWait(false), onCanPlay: () => setWait(false),
    onError: () => setErr(true),
  } : {};

  const label = st === "playing" ? "⏸ وقّف" : st === "paused" ? "▶ كمّل" : st === "ended" ? "↻ عيد" : "▶ شغّل";

  return (
    <div className={"clipP" + (st === "playing" ? " playing" : "")} onContextMenu={stopMenu}>
      <style>{CSS}</style>
      <audio ref={aRef} src={aSrc} preload="auto" {...bind(mode === "audio")} />
      <div className={"clipP-stage" + (mode === "audio" ? " audio" : "")}>
        {mode === "video"
          ? <video ref={vRef} src={vSrc} preload="auto" playsInline disablePictureInPicture disableRemotePlayback
              controlsList="nodownload noplaybackrate noremoteplayback" {...bind(true)} />
          : <div className="clipP-wave" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} />)}</div>}
        {mode === "video" && wait && st === "playing" && <div className="clipP-wait">يحمّل…</div>}
        <div className="clipP-bar"><b style={{ "--p": p + "%" }} /></div>
      </div>
      <div className="clipP-row">
        <button type="button" className="clipP-main" onClick={onMain}
          aria-label={(st === "ended" ? "عيد " : st === "playing" ? "وقّف " : "شغّل ") + (mode === "video" ? "الفيديو" : "الصوت")}>{label}</button>
        <button type="button" className="clipP-alt" onClick={toggleMode}>{mode === "audio" ? "🎬 اعرض الفيديو" : "🔊 الصوت بس"}</button>
      </div>
      {err && <div className="clipP-err" role="status">ما اشتغل المقطع — اضغط تشغيل مرة ثانية</div>}
    </div>
  );
}
