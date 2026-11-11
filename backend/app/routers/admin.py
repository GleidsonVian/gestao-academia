"""Painel do dono do sistema (superadmin): ver academias e liberar/bloquear assinaturas.

Só enxerga dados da ACADEMIA (nome, status, vencimento, quantidade de alunos) — nunca nomes,
saúde ou documentos de alunos.
"""
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..assinatura import situacao
from ..db import get_db
from ..models import Academia, Aluno, AuditoriaAdmin, Usuario
from ..security import exigir_superadmin

router = APIRouter(prefix="/admin", tags=["superadmin"], dependencies=[Depends(exigir_superadmin)])


class AssinaturaIn(BaseModel):
    status: Literal["teste", "ativa", "suspensa", "cancelada"]
    acesso_ate: date | None = None


class PagoIn(BaseModel):
    dias: int = Field(default=30, ge=1, le=366)


def _academia(db: Session, academia_id: int) -> Academia:
    a = db.get(Academia, academia_id)
    if not a:
        raise HTTPException(404, "Academia não encontrada")
    return a


def _log(db: Session, u: Usuario, academia_id: int, acao: str, detalhe: str):
    db.add(AuditoriaAdmin(usuario_id=u.id, academia_id=academia_id, acao=acao, detalhe=detalhe))


@router.get("/academias")
def listar(db: Session = Depends(get_db)):
    academias = db.scalars(select(Academia).order_by(Academia.id)).all()
    alunos = dict(db.execute(
        select(Aluno.academia_id, func.count(Aluno.id)).where(Aluno.status != "inativo").group_by(Aluno.academia_id)).all())
    usuarios = dict(db.execute(select(Usuario.academia_id, func.count(Usuario.id)).group_by(Usuario.academia_id)).all())
    donos = dict(db.execute(select(Usuario.academia_id, func.min(Usuario.id)).group_by(Usuario.academia_id)).all())
    emails = dict(db.execute(select(Usuario.id, Usuario.email)).all())

    linhas, resumo = [], {}
    for a in academias:
        s = situacao(a)
        resumo[s["estado"]] = resumo.get(s["estado"], 0) + 1
        linhas.append({
            "id": a.id, "nome": a.nome, "modalidade": a.modalidade, "criada_em": a.criado_em,
            "email_dono": emails.get(donos.get(a.id)), "alunos": alunos.get(a.id, 0), "usuarios": usuarios.get(a.id, 0),
            "status": a.status_assinatura, "acesso_ate": a.acesso_ate,
            "estado": s["estado"], "bloqueada": s["bloqueada"], "dias_restantes": s["dias_restantes"],
        })
    return {"resumo": resumo, "total": len(linhas), "academias": linhas}


@router.post("/academias/{academia_id}/pago")
def marcar_pago(academia_id: int, body: PagoIn, u: Usuario = Depends(exigir_superadmin), db: Session = Depends(get_db)):
    """Registra um pagamento: estende o acesso a partir do vencimento atual (ou de hoje, se já venceu)."""
    a = _academia(db, academia_id)
    base = max(a.acesso_ate or date.today(), date.today())
    a.acesso_ate = base + timedelta(days=body.dias)
    a.status_assinatura = "ativa"
    _log(db, u, a.id, "pago", f"+{body.dias} dias, acesso até {a.acesso_ate.isoformat()}")
    db.commit()
    return {"status": a.status_assinatura, "acesso_ate": a.acesso_ate}


@router.put("/academias/{academia_id}/assinatura")
def definir(academia_id: int, body: AssinaturaIn, u: Usuario = Depends(exigir_superadmin), db: Session = Depends(get_db)):
    """Define status e vencimento manualmente (bloquear = suspensa, liberar = ativa/teste com data)."""
    a = _academia(db, academia_id)
    antes = f"{a.status_assinatura}/{a.acesso_ate}"
    a.status_assinatura, a.acesso_ate = body.status, body.acesso_ate
    _log(db, u, a.id, "definir", f"{antes} -> {body.status}/{body.acesso_ate}")
    db.commit()
    return {"status": a.status_assinatura, "acesso_ate": a.acesso_ate}
