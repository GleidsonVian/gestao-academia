import { useEffect } from "react";
import type { Aparencia } from "./api";

const VARS = ["--cor", "--cor-esc", "--cor-texto", "--logo-url", "--logo-opacidade"];

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function escurecer(hex: string, f = 0.18) {
  return "#" + rgb(hex).map((c) => Math.round(c * (1 - f)).toString(16).padStart(2, "0")).join("");
}
/** Preto ou branco, o que ficar mais legível sobre a cor escolhida. */
function textoSobre(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#111111" : "#ffffff";
}

export function aplicarTema(ap: Aparencia | null | undefined, logoUrl: string | null) {
  const raiz = document.documentElement;
  if (ap?.cor_primaria && /^#[0-9a-f]{6}$/i.test(ap.cor_primaria)) {
    raiz.style.setProperty("--cor", ap.cor_primaria);
    raiz.style.setProperty("--cor-esc", escurecer(ap.cor_primaria));
    raiz.style.setProperty("--cor-texto", textoSobre(ap.cor_primaria));
  } else {
    ["--cor", "--cor-esc", "--cor-texto"].forEach((v) => raiz.style.removeProperty(v));
  }
  if (logoUrl) {
    raiz.style.setProperty("--logo-url", `url("${logoUrl}")`);
    raiz.style.setProperty("--logo-opacidade", String((ap?.logo_opacidade ?? 8) / 100));
    document.body.classList.add("com-logo");
  } else {
    raiz.style.removeProperty("--logo-url");
    raiz.style.removeProperty("--logo-opacidade");
    document.body.classList.remove("com-logo");
  }
}

export function limparTema() {
  VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  document.body.classList.remove("com-logo");
}

/** Aplica cor e logo enquanto a tela estiver montada. `buscarLogo` devolve a URL da imagem (ou null). */
export function useTema(ap: Aparencia | null | undefined, buscarLogo: () => Promise<string | null> | string | null) {
  const chave = ap ? `${ap.cor_primaria}|${ap.tem_logo}|${ap.logo_versao}|${ap.logo_opacidade}` : "";
  useEffect(() => {
    if (!ap) return;
    let cancelado = false;
    let local: string | null = null;
    (async () => {
      const url = ap.tem_logo ? await buscarLogo() : null;
      if (url && url.startsWith("blob:")) local = url;
      if (!cancelado) aplicarTema(ap, url);
    })();
    return () => {
      cancelado = true;
      if (local) URL.revokeObjectURL(local);
      limparTema();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
}
