// @ts-nocheck
import React from "react";
import { useNavigate } from "react-router";
import Jeem from "../Jeem";
import { BANK } from "../data/bank";
import { CATS, CAT_INFO } from "../data/config";
import { genMathQ } from "../lib/math";

export default function CategoriesPage({ acc }) {
  const navigate = useNavigate();
  return <Jeem bank={BANK} cats={CATS} info={CAT_INFO} genMath={genMathQ} acc={acc} onExit={() => navigate("/")} />;
}
