"""Uniformes e camisas: catálogo, pedidos por aluno (tamanho, cor, quantidade), pagamento, entrega e lista de produção.

Valores em centavos (inteiros). O nome do item é copiado para o pedido, então renomear o item não muda o histórico.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Aluno, ItemLoja, Pedido, Usuario
from ..security import usuario_atual

router = APIRouter(prefix="/api", tags=["uniformes"], dependencies=[Depends(usuario_atual)])

FormaPgto = Literal["pix", "dinheiro", "cartao", "transferencia", "outro"]


def _centavos(reais: float) -> int:
    return int(round(reais * 100))


def _lista(valores: list[str]) -> list[str]:
    """Remove vazios e repetidos (sem diferenciar maiúsculas), mantendo a ordem."""
    vistos, saida = set(), []
    for v in valores:
        v = v.strip()
        if v and v.lower() not in vistos:
            vistos.add(v.lower())
            saida.append(v[:40])
    return saida[:30]


# ---------------------------------------------------------------- catálogo
class ItemIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    preco: float = Field(default=0, ge=0, le=100_000)
    cores: list[str] = Field(default_factory=list, max_length=30)
    tamanhos: list[str] = Field(default_factory=list, max_length=30)
    ativo: bool = True


def _item_dict(i: ItemLoja) -> dict:
    return {"id": i.id, "nome": i.nome, "preco_centavos": i.preco_centavos, "cores": i.cores or [], "tamanhos": i.tamanhos or [], "ativo": i.ativo}


def _item(db: Session, u: Usuario, item_id: int) -> ItemLoja:
    i = db.get(ItemLoja, item_id)
    if not i or i.academia_id != u.academia_id:
        raise HTTPException(404, "Item não encontrado")
    return i


@router.get("/itens")
def listar_itens(inativos: bool = False, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    q = select(ItemLoja).where(ItemLoja.academia_id == u.academia_id)
    if not inativos:
        q = q.where(ItemLoja.ativo.is_(True))
    return [_item_dict(i) for i in db.scalars(q.order_by(ItemLoja.nome))]


@router.post("/itens", status_code=201)
def criar_item(body: ItemIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = ItemLoja(academia_id=u.academia_id, nome=body.nome.strip(), preco_centavos=_centavos(body.preco),
                 cores=_lista(body.cores), tamanhos=_lista(body.tamanhos), ativo=body.ativo)
    db.add(i)
    db.commit()
    return _item_dict(i)


@router.put("/itens/{item_id}")
def editar_item(item_id: int, body: ItemIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = _item(db, u, item_id)
    i.nome, i.preco_centavos, i.ativo = body.nome.strip(), _centavos(body.preco), body.ativo
    i.cores, i.tamanhos = _lista(body.cores), _lista(body.tamanhos)
    db.commit()
    return _item_dict(i)


@router.delete("/itens/{item_id}")
def excluir_item(item_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = _item(db, u, item_id)
    if db.scalar(select(func.count(Pedido.id)).where(Pedido.item_id == i.id)):
        raise HTTPException(409, "Este item já tem pedidos. Desative-o em vez de excluir (o histórico continua).")
    db.delete(i)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- pedidos
class PedidoIn(BaseModel):
    aluno_id: int
    item_id: int
    tamanho: str | None = Field(default=None, max_length=20)
    cor: str | None = Field(default=None, max_length=40)
    quantidade: int = Field(default=1, ge=1, le=99)
    valor_unit: float | None = Field(default=None, ge=0, le=100_000)  # em reais; vazio = preço do catálogo
    pago: bool = False
    forma_pagamento: FormaPgto | None = None
    data_pagamento: date | None = None
    entregue: bool = False
    observacao: str | None = Field(default=None, max_length=300)


class SituacaoIn(BaseModel):
    pago: bool | None = None
    forma_pagamento: FormaPgto | None = None
    entregue: bool | None = None


def _pedido_dict(p: Pedido) -> dict:
    a = p.aluno
    return {
        "id": p.id, "item_id": p.item_id, "item_nome": p.item_nome, "tamanho": p.tamanho, "cor": p.cor,
        "quantidade": p.quantidade, "valor_unit_centavos": p.valor_unit_centavos, "total_centavos": p.valor_unit_centavos * p.quantidade,
        "pago": p.pago, "pago_em": p.pago_em, "forma_pagamento": p.forma_pagamento,
        "entregue": p.entregue, "entregue_em": p.entregue_em, "observacao": p.observacao, "criado_em": p.criado_em,
        "aluno": {"id": a.id, "nome": a.nome, "apelido": a.apelido, "status": a.status,
                  "turma": a.turma.nome if a.turma else None},
        # contatos do aluno, para cobrar pelo WhatsApp sem sair da tela
        "contatos": [{"nome": r.nome, "parentesco": r.parentesco, "telefone": r.telefone, "email": r.email} for r in a.responsaveis],
    }


def _pedido(db: Session, u: Usuario, pedido_id: int) -> Pedido:
    p = db.get(Pedido, pedido_id)
    if not p or p.academia_id != u.academia_id:
        raise HTTPException(404, "Pedido não encontrado")
    return p


def _valida(db: Session, u: Usuario, body: PedidoIn, atual: Pedido | None = None) -> ItemLoja:
    aluno = db.get(Aluno, body.aluno_id)
    if not aluno or aluno.academia_id != u.academia_id:
        raise HTTPException(400, "Aluno inválido")
    item = _item(db, u, body.item_id)
    # tamanho e cor precisam existir no catálogo (exceto se o pedido já tinha esse valor, para não travar edições antigas)
    for campo, valor, opcoes in (("tamanho", body.tamanho, item.tamanhos or []), ("cor", body.cor, item.cores or [])):
        if opcoes and not valor:
            raise HTTPException(422, f"Escolha o {campo}")
        antigo = getattr(atual, campo) if atual else None
        if valor and opcoes and valor not in opcoes and valor != antigo:
            raise HTTPException(422, f"{campo.capitalize()} “{valor}” não existe neste item")
    return item


def _aplica(p: Pedido, body: PedidoIn, item: ItemLoja):
    p.aluno_id, p.item_id, p.item_nome = body.aluno_id, item.id, item.nome
    p.tamanho, p.cor = (body.tamanho or "").strip() or None, (body.cor or "").strip() or None
    p.quantidade = body.quantidade
    p.valor_unit_centavos = item.preco_centavos if body.valor_unit is None else _centavos(body.valor_unit)
    p.observacao = (body.observacao or "").strip() or None
    p.pago = body.pago
    p.pago_em = (body.data_pagamento or p.pago_em or date.today()) if body.pago else None
    p.forma_pagamento = body.forma_pagamento if body.pago else None
    p.entregue = body.entregue
    p.entregue_em = (p.entregue_em or date.today()) if body.entregue else None


@router.get("/pedidos")
def listar_pedidos(
    situacao: Literal["todos", "a_pagar", "pago", "a_entregar", "entregue"] = "todos",
    item_id: int | None = None, aluno_id: int | None = None, q: str = "",
    u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db),
):
    stmt = select(Pedido).join(Aluno, Aluno.id == Pedido.aluno_id).where(Pedido.academia_id == u.academia_id)
    filtros = {"a_pagar": Pedido.pago.is_(False), "pago": Pedido.pago.is_(True),
               "a_entregar": Pedido.entregue.is_(False), "entregue": Pedido.entregue.is_(True)}
    if situacao in filtros:
        stmt = stmt.where(filtros[situacao])
    if item_id:
        stmt = stmt.where(Pedido.item_id == item_id)
    if aluno_id:
        stmt = stmt.where(Pedido.aluno_id == aluno_id)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(Aluno.nome.ilike(like) | Aluno.apelido.ilike(like))
    return [_pedido_dict(p) for p in db.scalars(stmt.order_by(Pedido.criado_em.desc(), Pedido.id.desc()).limit(500))]


@router.get("/pedidos/resumo")
def resumo(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    pedidos = db.scalars(select(Pedido).where(Pedido.academia_id == u.academia_id)).all()
    total = lambda ps: sum(p.valor_unit_centavos * p.quantidade for p in ps)  # noqa: E731
    pagos = [p for p in pedidos if p.pago]
    return {
        "pedidos": len(pedidos), "unidades": sum(p.quantidade for p in pedidos),
        "vendido_centavos": total(pedidos), "recebido_centavos": total(pagos), "a_receber_centavos": total(pedidos) - total(pagos),
        "a_pagar": len(pedidos) - len(pagos), "a_entregar": sum(1 for p in pedidos if not p.entregue),
    }


@router.get("/pedidos/producao")
def producao(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """O que ainda precisa ser entregue, somado por item, tamanho e cor: serve de lista para encomendar na confecção."""
    pendentes = db.scalars(select(Pedido).where(Pedido.academia_id == u.academia_id, Pedido.entregue.is_(False))).all()
    grupos: dict[tuple, dict] = {}
    for p in pendentes:
        g = grupos.setdefault((p.item_nome, p.cor or "", p.tamanho or ""), {
            "item": p.item_nome, "cor": p.cor, "tamanho": p.tamanho, "quantidade": 0, "pagas": 0, "a_pagar": 0})
        g["quantidade"] += p.quantidade
        g["pagas" if p.pago else "a_pagar"] += p.quantidade
    linhas = sorted(grupos.values(), key=lambda g: (g["item"].lower(), (g["cor"] or "").lower(), _ordem_tamanho(g["tamanho"])))
    return {"total_unidades": sum(g["quantidade"] for g in linhas), "linhas": linhas}


_ORDEM = ["PP", "P", "M", "G", "GG", "XG", "XGG"]


def _ordem_tamanho(t: str | None):
    """P antes de M antes de G; números em ordem numérica (infantil: 2, 4, 6...)."""
    t = (t or "").strip().upper()
    if t.isdigit():
        return (0, int(t), "")
    return (1, _ORDEM.index(t) if t in _ORDEM else 99, t)


@router.post("/pedidos", status_code=201)
def criar_pedido(body: PedidoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    item = _valida(db, u, body)
    p = Pedido(academia_id=u.academia_id)
    _aplica(p, body, item)
    db.add(p)
    db.commit()
    return _pedido_dict(p)


@router.put("/pedidos/{pedido_id}")
def editar_pedido(pedido_id: int, body: PedidoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    p = _pedido(db, u, pedido_id)
    item = _valida(db, u, body, atual=p)
    _aplica(p, body, item)
    db.commit()
    return _pedido_dict(p)


@router.put("/pedidos/{pedido_id}/situacao")
def mudar_situacao(pedido_id: int, body: SituacaoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Atalho para marcar/desmarcar 'pago' e 'entregue' sem abrir o formulário."""
    p = _pedido(db, u, pedido_id)
    if body.pago is not None:
        p.pago = body.pago
        p.pago_em = (p.pago_em or date.today()) if body.pago else None
        p.forma_pagamento = (body.forma_pagamento or p.forma_pagamento) if body.pago else None
    if body.entregue is not None:
        p.entregue = body.entregue
        p.entregue_em = (p.entregue_em or date.today()) if body.entregue else None
    db.commit()
    return _pedido_dict(p)


@router.delete("/pedidos/{pedido_id}")
def excluir_pedido(pedido_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    db.delete(_pedido(db, u, pedido_id))
    db.commit()
    return {"ok": True}
