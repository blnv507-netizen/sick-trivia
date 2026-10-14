// @ts-nocheck
import React from "react";
import CatArtBase from "../catArt";
import { CAT_INFO } from "../data/config";

const CatArt = ({ cat }) => <CatArtBase name={cat} icon={(CAT_INFO[cat] || {}).icon} img={(CAT_INFO[cat] || {}).img} />;

const Sadu = () => (
  <div className="sadu" aria-hidden="true">
    <div className="zz" style={{ "--c": "#D9494F" }} />
    <div className="zz" style={{ "--c": "#F0A32F" }} />
    <div className="zz" style={{ "--c": "#2EC4A6" }} />
  </div>
);


export { CatArt, Sadu };
