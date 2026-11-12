import type { Responsavel } from "./api";

/** Só dígitos; remove zeros à esquerda e garante o DDI do Brasil (55). Devolve null se não houver número. */
export function numeroWhats(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 8) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

/** Link wa.me que abre a conversa com o número e a mensagem já escrita. */
export function linkWhats(telefone: string | null | undefined, mensagem: string): string | null {
  const n = numeroWhats(telefone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Link mailto: com destinatário, assunto e corpo preenchidos. */
export function linkEmail(email: string | null | undefined, assunto: string, corpo = ""): string | null {
  const e = (email ?? "").trim();
  if (!EMAIL.test(e)) return null;
  return `mailto:${e}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** Troca {responsavel} pelo primeiro nome de quem vai receber. */
export const montarMensagem = (modelo: string, r: Pick<Responsavel, "nome">) => modelo.split("{responsavel}").join(primeiroNome(r.nome));

export const PARENTESCOS = ["Mãe", "Pai", "Avó", "Avô", "Tio(a)", "Irmão(ã)", "Padrasto/Madrasta", "Responsável legal", "Outro"];
