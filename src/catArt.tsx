// @ts-nocheck
/* غلاف الفئة: صورة الفئة إذا موجودة (CAT_INFO[c].img)، وإلا لوحة ملونة بنقشة السدو والإيموجي.
   اللون ثابت لكل فئة (محسوب من اسمها) عشان الفئة دايم تنعرف بلونها. */
import React from "react";
import { imgUrl } from "./lib/img";

const TINTS = ["#D9494F", "#F0A32F", "#2EC4A6", "#8E7CF0", "#E07A3E", "#3E8FE0", "#C2558A", "#5BAF5B"];
export const catTint = (name) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
};

export default function CatArt({ name, icon, img, className = "" }) {
  return (
    <span className={"catArt " + className} style={{ "--t": catTint(name) }} aria-hidden="true">
      {img ? <img src={imgUrl(img)} alt="" loading="lazy" decoding="async" /> : <span className="catEmoji">{icon || "❓"}</span>}
    </span>
  );
}

export const CAT_ART_CSS = `
.catArt{position:relative;display:grid;place-items:center;overflow:hidden;border-radius:14px;
  background:linear-gradient(150deg,var(--t) 0%,color-mix(in srgb,var(--t) 75%,#000) 100%);}
.catArt::after{content:"";position:absolute;inset:auto 0 0 0;height:12px;opacity:.55;background:
  linear-gradient(135deg,transparent 33%,rgba(0,0,0,.18) 33% 66%,transparent 66%) 0 0/12px 12px;}
.catArt img{width:100%;height:100%;object-fit:cover;}
.catEmoji{font-size:var(--emoji,44px);line-height:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25));}
`;
