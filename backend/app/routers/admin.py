"""Painel do dono do sistema (superadmin): academias, assinaturas, pagamentos e receita.

Só enxerga dados da ACADEMIA (nome, status, vencimento, valores) — nunca nomes, saúde ou
documentos de alunos. Valores em centavos (inteiros) para não ter erro de arredondamento.
"""
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..assinatura import situacao
from ..db import get_db
from ..models import Academia, Aluno, AuditoriaAdmin, Pagamento, Usuario
from ..security import exigir_superadmin

router = APIRouter(prefix="/admin", tags=["superadmin"], dependencies=[Depends(exigir_superadmin)])

FORMAS = ("pix", "boleto", "cartao", "transferencia", "dinheiro", "cortesia", "outro")
MAX_COMPROVANTE = 5 * 1024 * 1024
# extensão -> (assinatura inicial do arquivo, content-type)
TIPOS_COMPROVANTE = {
    ".pdf": (b"%PDF", "application/pdf"),
    ".jpg": (bytes.fromhex("ffd8ff"), "image/jpeg"),
    ".jpeg": (bytes.fromhex("ffd8ff"), "image/jpeg"),
    ".png": (bytes.fromhex("89504e47"), "image/png"),
}


class AssinaturaIn(BaseModel):
    status: Literal["teste", "ativa", "suspensa", "cancelada"]
    acesso_ate: date | None = None
    valor_mensal: float | None = Field(default=None, ge=0, le=1_000_000)  # em reais; só muda se for enviado


class PagoIn(BaseModel):
    valor: float = Field(ge=0, le=1_000_000, description="em reais; 0 = cortesia")
    forma: Literal["pix", "boleto", "cartao", "transferencia", "dinheiro", "cortesia", "outro"] = "pix"
    dias: int = Field(default=30, ge=1, le=366)
    data_pagamento: date | None = None
    observacao: str | None = Field(default=None, max_length=300)
    # False = só registra o pagamento (ex.: um pagamento antigo que já foi considerado no vencimento)
    estender: bool = True


def _centavos(reais: float) -> int:
    return int(round(reais * 100))


def _academia(db: Session, academia_id: int) -> Academia:
    a = db.get(Academia, academia_id)
    if not a:
        raise HTTPException(404, "Academia não encontrada")
    return a


def _log(db: Session, u: Usuario, academia_id: int, acao: str, detalhe: str):
    db.add(AuditoriaAdmin(usuario_id=u.id, academia_id=academia_id, acao=acao, detalhe=detalhe))


def _pag_dict(p: Pagamento, nome_academia: str | None = None) -> dict:
    return {
        "id": p.id, "academia_id": p.academia_id, "academia": nome_academia, "valor_centavos": p.valor_centavos,
        "forma": p.forma, "data_pagamento": p.data_pagamento, "dias_concedidos": p.dias_concedidos,
        "observacao": p.observacao, "estornado": p.estornado, "estornado_em": p.estornado_em, "criado_em": p.criado_em,
        "comprovante": {"nome": p.comprovante_nome, "tamanho": p.comprovante_tamanho} if p.comprovante_tamanho else None,
    }


@router.get("/academias")
def listar(db: Session = Depends(get_db)):
    academias = db.scalars(select(Academia).order_by(Academia.id)).all()
    alunos = dict(db.execute(
        select(Aluno.academia_id, func.count(Aluno.id)).where(Aluno.status != "inativo").group_by(Aluno.academia_id)).all())
    usuarios = dict(db.execute(select(Usuario.academia_id, func.count(Usuario.id)).group_by(Usuario.academia_id)).all())
    donos = dict(db.execute(select(Usuario.academia_id, func.min(Usuario.id)).group_by(Usuario.academia_id)).all())
    emails = dict(db.execute(select(Usuario.id, Usuario.email)).all())
    pagos = {  # total pago (sem estornos) e último pagamento por academia
        aid: (total, ultimo) for aid, total, ultimo in db.execute(
            select(Pagamento.academia_id, func.sum(Pagamento.valor_centavos), func.max(Pagamento.data_pagamento))
            .where(Pagamento.estornado.is_(False)).group_by(Pagamento.academia_id))
    }

    linhas, resumo = [], {}
    for a in academias:
        s = situacao(a)
        resumo[s["estado"]] = resumo.get(s["estado"], 0) + 1
        total, ultimo = pagos.get(a.id, (0, None))
        linhas.append({
            "id": a.id, "nome": a.nome, "modalidade": a.modalidade, "criada_em": a.criado_em,
            "email_dono": emails.get(donos.get(a.id)), "alunos": alunos.get(a.id, 0), "usuarios": usuarios.get(a.id, 0),
            "status": a.status_assinatura, "acesso_ate": a.acesso_ate,
            "estado": s["estado"], "bloqueada": s["bloqueada"], "dias_restantes": s["dias_restantes"],
            "valor_mensal_centavos": a.valor_mensal_centavos, "total_pago_centavos": int(total or 0), "ultimo_pagamento": ultimo,
        })
    return {"resumo": resumo, "total": len(linhas), "academias": linhas}


@router.get("/receita")
def receita(db: Session = Depends(get_db)):
    """Visão financeira: recebido por mês, receita mensal prevista (MRR), a vencer e em atraso."""
    hoje = date.today()
    inicio_mes = hoje.replace(day=1)
    meses = []  # últimos 6 meses, do mais antigo para o atual
    ano, mes = hoje.year, hoje.month
    for _ in range(6):
        meses.append(date(ano, mes, 1))
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    meses.reverse()

    recebidos = db.execute(
        select(Pagamento.data_pagamento, Pagamento.valor_centavos)
        .where(Pagamento.estornado.is_(False), Pagamento.data_pagamento >= meses[0])).all()
    por_mes = {m: 0 for m in meses}
    for d, v in recebidos:
        por_mes[d.replace(day=1)] = por_mes.get(d.replace(day=1), 0) + v
    anterior = meses[-2]
    total_geral = int(db.scalar(select(func.coalesce(func.sum(Pagamento.valor_centavos), 0)).where(Pagamento.estornado.is_(False))) or 0)

    pagantes = atraso = a_vencer = 0
    mrr = valor_atraso = valor_a_vencer = 0
    testes = testes_expirados = sem_valor = 0
    valores_pagantes = []
    for a in db.scalars(select(Academia)).all():
        s, v = situacao(a), a.valor_mensal_centavos or 0
        if a.status_assinatura == "teste":
            if s["estado"] == "teste":
                testes += 1
            elif s["bloqueada"] or s["estado"] == "tolerancia":
                testes_expirados += 1
            continue
        if a.status_assinatura != "ativa":
            continue  # suspensa/cancelada não entram na previsão
        if s["estado"] in ("tolerancia", "vencida"):
            atraso += 1
            valor_atraso += v
            continue
        pagantes += 1
        mrr += v
        valores_pagantes.append(v)
        if not a.valor_mensal_centavos:
            sem_valor += 1
        if s["dias_restantes"] is not None and s["dias_restantes"] <= 7:
            a_vencer += 1
            valor_a_vencer += v

    return {
        "mes_atual": por_mes[inicio_mes], "mes_anterior": por_mes[anterior], "total_geral": total_geral,
        "serie": [{"mes": m.strftime("%Y-%m"), "total_centavos": por_mes[m]} for m in meses],
        "mrr_centavos": mrr, "pagantes": pagantes, "sem_valor_definido": sem_valor,
        "ticket_medio_centavos": int(sum(valores_pagantes) / len(valores_pagantes)) if valores_pagantes else 0,
        "a_vencer_7d": {"academias": a_vencer, "valor_centavos": valor_a_vencer},
        "em_atraso": {"academias": atraso, "valor_centavos": valor_atraso},
        "em_teste": testes, "testes_expirados": testes_expirados,
    }


@router.get("/pagamentos")
def listar_pagamentos(
    academia_id: int | None = None,
    mes: str | None = Query(default=None, pattern="^[0-9]{4}-[0-9]{2}$"),
    db: Session = Depends(get_db),
):
    q = select(Pagamento, Academia.nome).join(Academia, Academia.id == Pagamento.academia_id)
    if academia_id:
        q = q.where(Pagamento.academia_id == academia_id)
    if mes:
        ano, m = int(mes[:4]), int(mes[5:])
        if not 1 <= m <= 12:
            raise HTTPException(422, "Mês inválido")
        ini = date(ano, m, 1)
        fim = date(ano + (m == 12), 1 if m == 12 else m + 1, 1)
        q = q.where(Pagamento.data_pagamento >= ini, Pagamento.data_pagamento < fim)
    linhas = db.execute(q.order_by(Pagamento.data_pagamento.desc(), Pagamento.id.desc()).limit(500)).all()
    itens = [_pag_dict(p, nome) for p, nome in linhas]
    return {"total_centavos": sum(i["valor_centavos"] for i in itens if not i["estornado"]), "itens": itens}


@router.post("/academias/{academia_id}/pago")
def registrar_pagamento(academia_id: int, body: PagoIn, u: Usuario = Depends(exigir_superadmin), db: Session = Depends(get_db)):
    """Registra o pagamento e estende o acesso a partir do vencimento atual (ou de hoje, se já venceu)."""
    a = _academia(db, academia_id)
    data = body.data_pagamento or date.today()
    if data > date.today():
        raise HTTPException(422, "A data do pagamento não pode ser futura")
    if body.estender:
        base = max(a.acesso_ate or date.today(), date.today())
        a.acesso_ate = base + timedelta(days=body.dias)
        a.status_assinatura = "ativa"
    pag = Pagamento(academia_id=a.id, valor_centavos=_centavos(body.valor), forma=body.forma, data_pagamento=data,
                    dias_concedidos=body.dias, observacao=(body.observacao or "").strip() or None, usuario_id=u.id)
    db.add(pag)
    _log(db, u, a.id, "pago", f"R$ {body.valor:.2f} ({body.forma}) em {data.isoformat()}, "
         + (f"+{body.dias} dias, acesso até {a.acesso_ate.isoformat()}" if body.estender else "sem estender o acesso"))
    db.commit()
    return {"status": a.status_assinatura, "acesso_ate": a.acesso_ate, "pagamento_id": pag.id}


@router.post("/pagamentos/{pagamento_id}/comprovante")
async def anexar_comprovante(pagamento_id: int, arquivo: UploadFile = File(...), u: Usuario = Depends(exigir_superadmin),
                             db: Session = Depends(get_db)):
    """Anexa (ou troca) o comprovante do pagamento: PDF, JPG ou PNG de até 5 MB, guardado no banco."""
    p = db.get(Pagamento, pagamento_id)
    if not p:
        raise HTTPException(404, "Pagamento não encontrado")
    ext = Path(arquivo.filename or "").suffix.lower()
    if ext not in TIPOS_COMPROVANTE:
        raise HTTPException(422, "Comprovante deve ser PDF, JPG ou PNG")
    conteudo = await arquivo.read(MAX_COMPROVANTE + 1)
    if len(conteudo) > MAX_COMPROVANTE:
        raise HTTPException(422, "O comprovante pode ter no máximo 5 MB")
    if not conteudo.startswith(TIPOS_COMPROVANTE[ext][0]):
        raise HTTPException(422, f"O arquivo não parece ser um {ext[1:].upper()} válido")
    p.comprovante_nome = Path(arquivo.filename).name[:200]
    p.comprovante_tipo = TIPOS_COMPROVANTE[ext][1]
    p.comprovante_tamanho = len(conteudo)
    p.comprovante_conteudo = conteudo
    _log(db, u, p.academia_id, "comprovante", f"pagamento #{p.id}: {p.comprovante_nome}")
    db.commit()
    return {"ok": True, "nome": p.comprovante_nome}


@router.get("/pagamentos/{pagamento_id}/comprovante")
def baixar_comprovante(pagamento_id: int, db: Session = Depends(get_db)):
    p = db.get(Pagamento, pagamento_id)
    if not p or not p.comprovante_tamanho or p.comprovante_conteudo is None:
        raise HTTPException(404, "Comprovante não encontrado")
    return Response(bytes(p.comprovante_conteudo), media_type=p.comprovante_tipo,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.post("/pagamentos/{pagamento_id}/estornar")
def estornar(pagamento_id: int, u: Usuario = Depends(exigir_superadmin), db: Session = Depends(get_db)):
    """Tira o pagamento da receita. Não mexe no vencimento: ajuste em 'Editar' se precisar."""
    p = db.get(Pagamento, pagamento_id)
    if not p:
        raise HTTPException(404, "Pagamento não encontrado")
    if p.estornado:
        raise HTTPException(409, "Pagamento já estornado")
    p.estornado, p.estornado_em = True, datetime.utcnow()
    _log(db, u, p.academia_id, "estorno", f"pagamento #{p.id} de R$ {p.valor_centavos / 100:.2f}")
    db.commit()
    return {"ok": True}


@router.put("/academias/{academia_id}/assinatura")
def definir(academia_id: int, body: AssinaturaIn, u: Usuario = Depends(exigir_superadmin), db: Session = Depends(get_db)):
    """Define status, vencimento e (se enviado) a mensalidade. Bloquear = suspensa; liberar = ativa/teste."""
    a = _academia(db, academia_id)
    antes = f"{a.status_assinatura}/{a.acesso_ate}/{a.valor_mensal_centavos}"
    a.status_assinatura, a.acesso_ate = body.status, body.acesso_ate
    if "valor_mensal" in body.model_fields_set:
        a.valor_mensal_centavos = None if body.valor_mensal is None else _centavos(body.valor_mensal)
    _log(db, u, a.id, "definir", f"{antes} -> {a.status_assinatura}/{a.acesso_ate}/{a.valor_mensal_centavos}")
    db.commit()
    return {"status": a.status_assinatura, "acesso_ate": a.acesso_ate, "valor_mensal_centavos": a.valor_mensal_centavos}
