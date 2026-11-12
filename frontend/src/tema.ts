import { useEffect, useState } from "react";
import type { Aparencia } from "./api";

const VARS = [
  "--cor", "--cor-esc", "--cor-texto", "--bg", "--card", "--borda",
  "--logo-url", "--logo-opacidade", "--logo-tam", "--logo-pos", "--logo-rep",
];

/** Paletas prontas (a cor base deriva fundo, cartões e bordas). */
export const PALETAS: { nome: string; cor: string }[] = [
  { nome: "Verde", cor: "#15803d" },
  { nome: "Esmeralda", cor: "#059669" },
  { nome: "Azul", cor: "#1d4ed8" },
  { nome: "Roxo", cor: "#6d28d9" },
  { nome: "Rosa", cor: "#be185d" },
  { nome: "Vermelho", cor: "#b91c1c" },
  { nome: "Laranja", cor: "#c2410c" },
  { nome: "Dourado", cor: "#a16207" },
  { nome: "Grafite", cor: "#374151" },
];

const POSICOES: Record<Aparencia["logo_posicao"], string> = {
  centro: "center", "topo-esq": "top left", "topo-dir": "top right", "base-esq": "bottom left", "base-dir": "bottom right", mosaico: "center",
};

// ---------- cores ----------
function hexParaHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hslParaHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
const css = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 1000) / 10}%)`;

/** Preto ou branco, o que ficar mais legível sobre a cor. */
function textoSobre(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#111111" : "#ffffff";
}
const escuro = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

// ---------- rascunho (prévia ao vivo na tela de Aparência) ----------
let rascunho: { ap: Aparencia; logo: string | null } | null = null;

export function aplicarTema(apSalvo: Aparencia | null | undefined, logoSalvo: string | null) {
  const ap = rascunho ? rascunho.ap : apSalvo;
  const logoUrl = rascunho ? rascunho.logo : logoSalvo;
  const raiz = document.documentElement;
  const set = (k: string, v: string) => raiz.style.setProperty(k, v);

  if (ap?.cor_primaria && /^#[0-9a-f]{6}$/i.test(ap.cor_primaria)) {
    const [h, s, l] = hexParaHsl(ap.cor_primaria);
    const noEscuro = escuro();
    // no modo escuro o destaque é clareado para manter contraste sobre o fundo escuro
    const acento = noEscuro ? hslParaHex(h, s, Math.max(l, 0.58)) : ap.cor_primaria.toLowerCase();
    const [, , la] = hexParaHsl(acento);
    set("--cor", acento);
    set("--cor-esc", noEscuro ? hslParaHex(h, s, Math.min(la + 0.08, 0.8)) : hslParaHex(h, s, la * 0.82));
    set("--cor-texto", textoSobre(acento));
    if (ap.tema_completo) {
      const t = Math.min(0.42, Math.max(0.1, s * 0.55)); // intensidade do tom nos fundos
      if (noEscuro) {
        set("--bg", css(h, t * 0.7, 0.075)); set("--card", css(h, t * 0.65, 0.115)); set("--borda", css(h, t * 0.5, 0.2));
      } else {
        set("--bg", css(h, t, 0.945)); set("--card", css(h, t * 0.5, 0.985)); set("--borda", css(h, t * 0.7, 0.84));
      }
    } else {
      ["--bg", "--card", "--borda"].forEach((v) => raiz.style.removeProperty(v));
    }
  } else {
    ["--cor", "--cor-esc", "--cor-texto", "--bg", "--card", "--borda"].forEach((v) => raiz.style.removeProperty(v));
  }

  if (logoUrl && ap) {
    const mosaico = ap.logo_posicao === "mosaico";
    set("--logo-url", `url("${logoUrl}")`);
    set("--logo-opacidade", String(ap.logo_opacidade / 100));
    set("--logo-tam", `${mosaico ? Math.round(ap.logo_escala * 0.45) : ap.logo_escala}vmin`);
    set("--logo-pos", POSICOES[ap.logo_posicao] ?? "center");
    set("--logo-rep", mosaico ? "repeat" : "no-repeat");
    document.body.classList.add("com-logo");
  } else {
    ["--logo-url", "--logo-opacidade", "--logo-tam", "--logo-pos", "--logo-rep"].forEach((v) => raiz.style.removeProperty(v));
    document.body.classList.remove("com-logo");
  }
}

export function limparTema() {
  VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  document.body.classList.remove("com-logo");
}

/** Pede para o tema SALVO ser aplicado de novo (ex.: ao sair da prévia). */
export const reaplicarTema = () => window.dispatchEvent(new Event("tema:reaplicar"));

/** Prévia ao vivo: aplica o rascunho por cima do tema salvo até ser limpo (null). */
export function definirRascunho(r: { ap: Aparencia; logo: string | null } | null) {
  rascunho = r;
  if (r) aplicarTema(r.ap, r.logo);
  else reaplicarTema();
}

/** Aplica cor e logo enquanto a tela estiver montada. `buscarLogo` devolve a URL da imagem (ou null). */
export function useTema(ap: Aparencia | null | undefined, buscarLogo: () => Promise<string | null> | string | null) {
  const [tick, setTick] = useState(0);
  const chave = ap ? JSON.stringify({ ...ap }) : "";

  useEffect(() => {
    const reagir = () => setTick((t) => t + 1);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    window.addEventListener("tema:reaplicar", reagir);
    mq?.addEventListener("change", reagir); // acompanha o modo claro/escuro do sistema
    return () => { window.removeEventListener("tema:reaplicar", reagir); mq?.removeEventListener("change", reagir); };
  }, []);

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
  }, [chave, tick]);
}
