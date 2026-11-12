import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, brl, fmtData } from "../api";
import { useAuth } from "../auth";
import { linkEmail, linkWhats } from "../contato";
import CatalogoUniformes from "../components/CatalogoUniformes";
import PedidoForm from "../components/PedidoForm";
import ProducaoUniformes from "../components/ProducaoUniformes";
import {
  FORMAS_PGTO, baixarCsv, descricaoPedido, mensagemCobranca, trocarResponsavel,
  type ItemLoja, type Pedido, type ResumoPedidos,
} from "../uniformes";

type Situacao = "todos" | "a_pagar" | "pago" | "a_entregar" | "entregue";
const ROTULO_FORMA = Object.fromEntries(FORMAS_PGTO);

function lerPix() { try { return localStorage.getItem("uniformes_pix") ?? ""; } catch { return ""; } }

/** Controle de camisas e uniformes: quem comprou, tamanho, cor, pagamento e entrega. */
export default function Uniformes() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState<"pedidos" | "producao" | "catalogo">("pedidos");
  const [itens, setItens] = useState<ItemLoja[]>([]);
  const [todosItens, setTodosItens] = useState<ItemLoja[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [resumo, setResumo] = useState<ResumoPedidos | null>(null);
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [itemId, setItemId] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ pedido?: Pedido; aluno?: number } | null>(
    params.get("novo") ? { aluno: params.get("aluno") ? Number(params.get("aluno")) : undefined } : null,
  );
  const [pix, setPix] = useState(lerPix);
  const [erro, setErro] = useState("");

  const carregarItens = useCallback(() => {
    api.get<ItemLoja[]>("/api/itens").then(setItens);
    api.get<ItemLoja[]>("/api/itens?inativos=true").then(setTodosItens);
  }, []);
  const carregar = useCallback(() => {
    const qs = new URLSearchParams({ situacao });
    if (itemId) qs.set("item_id", itemId);
    if (q.trim()) qs.set("q", q.trim());
    api.get<Pedido[]>(`/api/pedidos?${qs}`).then(setPedidos).catch((e) => setErro(e.message));
    api.get<ResumoPedidos>("/api/pedidos/resumo").then(setResumo);
  }, [situacao, itemId, q]);

  useEffect(carregarItens, [carregarItens]);
  useEffect(() => { const t = setTimeout(carregar, 200); return () => clearTimeout(t); }, [carregar]);
  useEffect(() => { if (params.get("novo")) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarPix = (v: string) => { setPix(v); try { localStorage.setItem("uniformes_pix", v); } catch { /* ok */ } };
  const agir = async (fn: () => Promise<unknown>) => { setErro(""); try { await fn(); carregar(); } catch (e) { setErro((e as Error).message); } };
  const situacaoPedido = (p: Pedido, corpo: object) => agir(() => api.put(`/api/pedidos/${p.id}/situacao`, corpo));
  const excluir = (p: Pedido) => confirm(`Excluir o pedido de ${p.aluno.nome} (${descricaoPedido(p)})?`) && agir(() => api.del(`/api/pedidos/${p.id}`));

  function exportar() {
    if (!pedidos) return;
    baixarCsv("pedidos-uniformes.csv", [["Aluno", "Apelido", "Turma", "Item", "Tamanho", "Cor", "Quantidade", "Valor unitário (R$)", "Total (R$)", "Pago", "Forma", "Pago em", "Entregue", "Entregue em", "Observação"],
      ...pedidos.map((p) => [p.aluno.nome, p.aluno.apelido ?? "", p.aluno.turma ?? "", p.item_nome, p.tamanho ?? "", p.cor ?? "", p.quantidade,
        (p.valor_unit_centavos / 100).toFixed(2).replace(".", ","), (p.total_centavos / 100).toFixed(2).replace(".", ","), p.pago ? "sim" : "não",
        p.forma_pagamento ? ROTULO_FORMA[p.forma_pagamento] ?? p.forma_pagamento : "", p.pago_em ? fmtData(p.pago_em) : "", p.entregue ? "sim" : "não", p.entregue_em ? fmtData(p.entregue_em) : "", p.observacao ?? ""])]);
  }

  return (
    <>
      <div className="topo">
        <h1>Uniformes</h1>
        {aba === "pedidos" && !form && <button className="primario" onClick={() => setForm({})}>+ Novo pedido</button>}
      </div>
      <p className="mudo">Controle de camisas e uniformes: para quem vendeu, o tamanho, a cor, se já pagou e se já entregou.</p>
      {erro && <p className="erro">{erro}</p>}

      <div className="filtros">
        {([["pedidos", "Pedidos"], ["producao", "Lista de produção"], ["catalogo", "Catálogo"]] as const).map(([k, r]) => (
          <button key={k} className={aba === k ? "primario" : ""} onClick={() => setAba(k)}>{r}</button>
        ))}
      </div>

      {aba === "producao" && <ProducaoUniformes academia={me!.academia.nome} />}
      {aba === "catalogo" && <CatalogoUniformes itens={todosItens} atualizar={() => { carregarItens(); carregar(); }} />}

      {aba === "pedidos" && (
        <>
          {resumo && (
            <div className="grade">
              <div className="cartao numero"><span>{brl(resumo.vendido_centavos)}</span><small>Vendido · {resumo.pedidos} pedido(s), {resumo.unidades} peça(s)</small></div>
              <div className="cartao numero"><span>{brl(resumo.recebido_centavos)}</span><small>Recebido</small></div>
              <div className="cartao numero" style={resumo.a_receber_centavos ? { borderColor: "var(--cor)" } : undefined}><span>{brl(resumo.a_receber_centavos)}</span><small>A receber · {resumo.a_pagar} pedido(s)</small></div>
              <div className="cartao numero"><span>{resumo.a_entregar}</span><small>A entregar</small></div>
            </div>
          )}

          {form && (
            <PedidoForm itens={form.pedido ? todosItens : itens} pedido={form.pedido} alunoInicial={form.aluno}
              onCancelar={() => setForm(null)} onSalvo={() => { setForm(null); carregar(); }} />
          )}

          <div className="filtros">
            <input placeholder="Buscar aluno por nome ou apelido…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
              <option value="todos">Todos</option><option value="a_pagar">A pagar</option><option value="pago">Pagos</option>
              <option value="a_entregar">A entregar</option><option value="entregue">Entregues</option>
            </select>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Todos os itens</option>{todosItens.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </select>
            <button onClick={exportar} disabled={!pedidos?.length}>Exportar CSV</button>
          </div>
          <label style={{ marginTop: "-.25rem" }}>
            Chave Pix para as mensagens de cobrança (fica salva neste navegador)
            <input value={pix} onChange={(e) => guardarPix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
          </label>

          {!pedidos ? <p className="mudo">Carregando…</p> : pedidos.length === 0 ? (
            <div className="cartao"><p className="mudo">Nenhum pedido {situacao !== "todos" || q || itemId ? "neste filtro" : "ainda"}. {itens.length === 0 ? "Comece cadastrando um item na aba Catálogo." : "Clique em + Novo pedido."}</p></div>
          ) : pedidos.map((p) => {
            const texto = mensagemCobranca(p, me!.academia.nome, pix);
            const assunto = `Pagamento do uniforme de ${p.aluno.nome}`;
            return (
              <div className="cartao" key={p.id}>
                <div className="acad-topo">
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0 }}>{p.aluno.nome} {p.aluno.apelido && <span className="apelido">“{p.aluno.apelido}”</span>}</h2>
                    <p className="mudo" style={{ margin: ".15rem 0 0" }}>{[p.aluno.turma, p.aluno.status !== "ativo" ? p.aluno.status : null].filter(Boolean).join(" · ") || "sem turma"}</p>
                  </div>
                  <div className="acad-situacao">
                    {p.pago ? <span className="selo ok">Pago{p.pago_em ? ` ${fmtData(p.pago_em)}` : ""}{p.forma_pagamento ? ` · ${ROTULO_FORMA[p.forma_pagamento] ?? p.forma_pagamento}` : ""}</span> : <span className="selo aviso">A pagar</span>}
                    {p.entregue ? <span className="selo ok">Entregue{p.entregue_em ? ` ${fmtData(p.entregue_em)}` : ""}</span> : <span className="selo">A entregar</span>}
                  </div>
                </div>
                <p style={{ margin: ".6rem 0 .2rem" }}>
                  <b>{descricaoPedido(p)}</b> · {p.quantidade}x {brl(p.valor_unit_centavos)} = <b>{brl(p.total_centavos)}</b>
                </p>
                {p.observacao && <p className="mudo" style={{ margin: 0 }}>Obs.: {p.observacao}</p>}

                <div className="acoes">
                  {!p.pago && (
                    <select defaultValue="" onChange={(e) => e.target.value && situacaoPedido(p, { pago: true, forma_pagamento: e.target.value })} style={{ width: "auto" }} aria-label="Marcar como pago">
                      <option value="">Marcar como pago…</option>{FORMAS_PGTO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  )}
                  {p.pago && <button className="link" onClick={() => situacaoPedido(p, { pago: false })}>Desfazer pagamento</button>}
                  {!p.entregue ? <button onClick={() => situacaoPedido(p, { entregue: true })}>Marcar entregue</button> : <button className="link" onClick={() => situacaoPedido(p, { entregue: false })}>Desfazer entrega</button>}
                  <button onClick={() => setForm({ pedido: p })}>Editar</button>
                  <button className="link" style={{ color: "var(--falta)" }} onClick={() => excluir(p)}>Excluir</button>
                </div>

                {!p.pago && p.contatos.length > 0 && (
                  <div className="acoes" style={{ marginTop: ".25rem" }}>
                    <small className="mudo">Cobrar:</small>
                    {p.contatos.map((c, i) => {
                      const msg = trocarResponsavel(texto, c);
                      const zap = linkWhats(c.telefone, msg), mail = linkEmail(c.email, assunto, msg);
                      return (
                        <span key={i} className="alternar">
                          {zap ? <a className="botao" href={zap} target="_blank" rel="noreferrer">WhatsApp {c.nome.split(" ")[0]}</a> : null}
                          {mail ? <a className="botao" href={mail}>E-mail {c.nome.split(" ")[0]}</a> : null}
                          {!zap && !mail && <small className="mudo">{c.nome}: sem telefone nem e-mail</small>}
                        </span>
                      );
                    })}
                  </div>
                )}
                {!p.pago && p.contatos.length === 0 && <p className="mudo" style={{ margin: ".4rem 0 0" }}>Sem responsável cadastrado para cobrar. Adicione na ficha do aluno.</p>}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
