import { primeiroNome } from "./contato";

export type Destinatario = { nome: string; parentesco: string | null; telefone: string | null; email: string | null; alunos: string[] };
export type ContextoAviso = { academia: string; turma: string | null; data: string; hora: string | null };

/** Mensagem padrão de cancelamento. {responsavel}, {alunos}, {academia}, {dia}, {data}, {hora} e {turma} são trocados na hora. */
export const MODELO_CANCELAMENTO =
  "Olá, {responsavel}! Aviso de {academia}: a aula de {dia}, {data}{hora}{turma} foi *cancelada*. " +
  "Não haverá treino para {alunos} nesse dia. Qualquer dúvida é só chamar!";

/** "Ana", "Ana e Pedro", "Ana, Pedro e Lia" */
export function listaNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const diaSemana = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
const diaMes = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Monta o texto para uma pessoa; sem `dest`, vira a versão para o grupo da turma ("pessoal"). */
export function preencher(modelo: string, ctx: ContextoAviso, dest?: Destinatario): string {
  const valores: Record<string, string> = {
    responsavel: dest ? primeiroNome(dest.nome) : "pessoal",
    alunos: dest ? listaNomes(dest.alunos.map(primeiroNome)) : "a turma",
    academia: ctx.academia,
    dia: diaSemana(ctx.data),
    data: diaMes(ctx.data),
    hora: ctx.hora ? ` às ${ctx.hora}` : "",
    turma: ctx.turma ? ` da turma ${ctx.turma}` : "",
  };
  return modelo.replace(/\{(responsavel|alunos|academia|dia|data|hora|turma)\}/g, (_, k: string) => valores[k]);
}

/** Identifica a pessoa (telefone, senão e-mail, senão nome) para marcar quem já foi avisado. */
export const chaveDest = (d: Destinatario) =>
  (d.telefone ?? "").replace(/\D/g, "").slice(-11) || (d.email ?? "").toLowerCase() || d.nome.toLowerCase();

/** WhatsApp sem número: abre o seletor de conversas/grupos já com a mensagem. */
export const linkGrupo = (mensagem: string) => `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

/** mailto para todos em cópia oculta; `longo` avisa que alguns programas de e-mail podem cortar o link. */
export function emailTodos(emails: string[], assunto: string, corpo: string): { href: string | null; longo: boolean } {
  const lista = Array.from(new Set(emails.map((e) => e.trim()).filter(Boolean)));
  if (!lista.length) return { href: null, longo: false };
  const href = `mailto:?bcc=${lista.join(",")}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  return { href, longo: href.length > 1800 };
}

const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem lembrar */ } };
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lembrarModelo = (m: string) => guardar("aviso_modelo_cancelamento", m);
export const modeloSalvo = () => ler("aviso_modelo_cancelamento") ?? MODELO_CANCELAMENTO;
export const lembrarEnviados = (aulaId: number, chaves: string[]) => guardar(`aviso_enviados_${aulaId}`, JSON.stringify(chaves));
export const enviadosSalvos = (aulaId: number): string[] => {
  try { return JSON.parse(ler(`aviso_enviados_${aulaId}`) ?? "[]"); } catch { return []; }
};
