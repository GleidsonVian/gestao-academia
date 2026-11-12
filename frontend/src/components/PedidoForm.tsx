import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, brl, type Aluno } from "../api";
import { FORMAS_PGTO, emReais, paraReais, type ItemLoja, type Pedido } from "../uniformes";

type Props = { itens: ItemLoja[]; pedido?: Pedido; alunoInicial?: number; onSalvo: () => void; onCancelar: () => void };

/** Novo pedido de uniforme (ou edição): aluno, item, tamanho, cor, quantidade, valor, pago e entregue. */
export default function PedidoForm({ itens, pedido, alunoInicial, onSalvo, onCancelar }: Props) {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [f, setF] = useState({
    aluno_id: String(pedido?.aluno.id ?? alunoInicial ?? ""),
    item_id: String(pedido?.item_id ?? itens[0]?.id ?? ""),
    tamanho: pedido?.tamanho ?? "",
    cor: pedido?.cor ?? "",
    quantidade: String(pedido?.quantidade ?? 1),
    valor: pedido ? emReais(pedido.valor_unit_centavos) : "",
    pago: pedido?.pago ?? false,
    forma: pedido?.forma_pagamento ?? "pix",
    entregue: pedido?.entregue ?? false,
    observacao: pedido?.observacao ?? "",
  });

  useEffect(() => {
    Promise.all([api.get<Aluno[]>("/api/alunos?status=ativo"), api.get<Aluno[]>("/api/alunos?status=afastado")])
      .then(([a, b]) => setAlunos([...a, ...b].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))))
      .catch((e) => setErro(e.message));
  }, []);

  const item = itens.find((i) => String(i.id) === f.item_id);
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? alunos.filter((a) => `${a.nome} ${a.apelido ?? ""}`.toLowerCase().includes(t)) : alunos;
    const atual = alunos.find((a) => String(a.id) === f.aluno_id);
    return atual && !lista.includes(atual) ? [atual, ...lista] : lista; // o escolhido nunca some da lista
  }, [alunos, busca, f.aluno_id]);
  const total = (paraReais(f.valor || String(item ? emReais(item.preco_centavos) : "0")) || 0) * (Number(f.quantidade) || 0);

  function trocarItem(id: string) {
    const novo = itens.find((i) => String(i.id) === id);
    setF({ ...f, item_id: id, tamanho: "", cor: novo?.cores.length === 1 ? novo.cores[0] : "", valor: "" });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!f.aluno_id) return setErro("Escolha o aluno.");
    if (!item) return setErro("Escolha o item.");
    const valor = f.valor.trim() ? paraReais(f.valor) : null;
    if (valor !== null && (Number.isNaN(valor) || valor < 0)) return setErro("Valor inválido.");
    setEnviando(true);
    const body = {
      aluno_id: Number(f.aluno_id), item_id: item.id, tamanho: f.tamanho || null, cor: f.cor || null, quantidade: Number(f.quantidade) || 1,
      valor_unit: valor, pago: f.pago, forma_pagamento: f.pago ? f.forma : null, entregue: f.entregue, observacao: f.observacao || null,
    };
    try {
      if (pedido) await api.put(`/api/pedidos/${pedido.id}`, body);
      else await api.post("/api/pedidos", body);
      onSalvo();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!itens.length) return <div className="cartao"><p className="mudo">Cadastre primeiro um item na aba <b>Catálogo</b> (ex.: Camisa do Grupo).</p><button onClick={onCancelar}>Fechar</button></div>;

  return (
    <form className="cartao form" onSubmit={salvar}>
      <h2>{pedido ? "Editar pedido" : "Novo pedido"}</h2>
      <label>
        Aluno
        <input placeholder="Buscar por nome ou apelido…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ marginBottom: ".35rem" }} />
        <select required value={f.aluno_id} onChange={(e) => setF({ ...f, aluno_id: e.target.value })}>
          <option value="">Escolha o aluno…</option>
          {visiveis.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.apelido ? ` “${a.apelido}”` : ""}</option>)}
        </select>
      </label>
      <div className="duas">
        <label>
          Item
          <select value={f.item_id} onChange={(e) => trocarItem(e.target.value)}>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.nome} — {brl(i.preco_centavos)}</option>)}
          </select>
        </label>
        {item && item.tamanhos.length > 0 && (
          <label>Tamanho
            <select required value={f.tamanho} onChange={(e) => setF({ ...f, tamanho: e.target.value })}>
              <option value="">—</option>
              {item.tamanhos.map((t) => <option key={t}>{t}</option>)}
              {f.tamanho && !item.tamanhos.includes(f.tamanho) && <option>{f.tamanho}</option>}
            </select>
          </label>
        )}
        {item && item.cores.length > 0 && (
          <label>Cor
            <select required value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })}>
              <option value="">—</option>
              {item.cores.map((c) => <option key={c}>{c}</option>)}
              {f.cor && !item.cores.includes(f.cor) && <option>{f.cor}</option>}
            </select>
          </label>
        )}
        <label>Quantidade<input type="number" min={1} max={99} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} /></label>
        <label>Valor de cada (R$)<input inputMode="decimal" placeholder={item ? `${emReais(item.preco_centavos)} (do catálogo)` : ""} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></label>
      </div>
      <p style={{ margin: ".25rem 0 .75rem" }}><b>Total: {brl(Math.round(total * 100))}</b> <span className="mudo">{f.valor.trim() ? "(valor combinado)" : "(preço do catálogo)"}</span></p>

      <div className="duas">
        <label className="check"><input type="checkbox" checked={f.pago} onChange={(e) => setF({ ...f, pago: e.target.checked })} /> Já está pago</label>
        {f.pago && (
          <label>Forma de pagamento
            <select value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value })}>{FORMAS_PGTO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
          </label>
        )}
        <label className="check"><input type="checkbox" checked={f.entregue} onChange={(e) => setF({ ...f, entregue: e.target.checked })} /> Já foi entregue</label>
      </div>
      <label>Observação (opcional)<input value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} placeholder="ex.: pagou metade, resto na próxima aula" /></label>
      {erro && <p className="erro">{erro}</p>}
      <div className="acoes">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button className="primario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar pedido"}</button>
      </div>
    </form>
  );
}
