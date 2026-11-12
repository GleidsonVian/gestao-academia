import { brl, type Responsavel } from "./api";
import { primeiroNome } from "./contato";

export type ItemLoja = { id: number; nome: string; preco_centavos: number; cores: string[]; tamanhos: string[]; ativo: boolean };
export type Pedido = {
  id: number; item_id: number; item_nome: string; tamanho: string | null; cor: string | null; quantidade: number;
  valor_unit_centavos: number; total_centavos: number; pago: boolean; pago_em: string | null; forma_pagamento: string | null;
  entregue: boolean; entregue_em: string | null; observacao: string | null; criado_em: string;
  aluno: { id: number; nome: string; apelido: string | null; status: string; turma: string | null };
  contatos: Responsavel[];
};
export type ResumoPedidos = {
  pedidos: number; unidades: number; vendido_centavos: number; recebido_centavos: number; a_receber_centavos: number; a_pagar: number; a_entregar: number;
};
export type LinhaProducao = { item: string; cor: string | null; tamanho: string | null; quantidade: number; pagas: number; a_pagar: number };

export const FORMAS_PGTO: [string, string][] = [["pix", "Pix"], ["dinheiro", "Dinheiro"], ["cartao", "Cartão"], ["transferencia", "Transferência"], ["outro", "Outro"]];
export const TAMANHOS_ADULTO = ["PP", "P", "M", "G", "GG", "XG"];
export const TAMANHOS_INFANTIL = ["2", "4", "6", "8", "10", "12", "14", "16"];

/** "Camisa do Grupo · M · Preta" (só o que existir). */
export const descricaoPedido = (p: Pick<Pedido, "item_nome" | "tamanho" | "cor">) => [p.item_nome, p.tamanho, p.cor].filter(Boolean).join(" · ");

/** Converte "99,90" ou "1.234,50" em número (reais). NaN se não for número. */
export const paraReais = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));
export const emReais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

/** Mensagem de cobrança do uniforme; {responsavel} é trocado pelo primeiro nome de quem recebe. */
export function mensagemCobranca(p: Pedido, academia: string, chavePix: string): string {
  const aluno = p.aluno.apelido ? `${p.aluno.nome.split(" ")[0]} (${p.aluno.apelido})` : p.aluno.nome.split(" ")[0];
  const qtd = p.quantidade > 1 ? `${p.quantidade}x ` : "";
  const pix = chavePix.trim() ? ` Pix: ${chavePix.trim()}.` : "";
  return `Olá, {responsavel}! Aviso de ${academia}: ficou pendente o pagamento de ${qtd}${descricaoPedido(p)} de ${aluno}, no valor de ${brl(p.total_centavos)}.${pix} Qualquer dúvida é só chamar!`;
}
export const trocarResponsavel = (texto: string, r: Pick<Responsavel, "nome">) => texto.split("{responsavel}").join(primeiroNome(r.nome));

/** Texto da lista de produção para mandar ao fornecedor/confecção. */
export function textoProducao(linhas: LinhaProducao[], academia: string): string {
  if (!linhas.length) return "Nenhum item pendente de entrega.";
  const porItem = new Map<string, LinhaProducao[]>();
  for (const l of linhas) porItem.set(l.item, [...(porItem.get(l.item) ?? []), l]);
  const blocos = [...porItem.entries()].map(([item, ls]) => {
    const total = ls.reduce((s, l) => s + l.quantidade, 0);
    return `*${item}* (${total})\n` + ls.map((l) => `- ${[l.cor, l.tamanho ? `tam. ${l.tamanho}` : null].filter(Boolean).join(", ") || "sem variação"}: ${l.quantidade}`).join("\n");
  });
  return `Pedido de produção - ${academia}\n\n${blocos.join("\n\n")}\n\nTotal: ${linhas.reduce((s, l) => s + l.quantidade, 0)} peça(s)`;
}

/** CSV (separador ;, com BOM para abrir certo no Excel). */
export function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
