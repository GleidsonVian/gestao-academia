"""Alunos, link dos pais, chamada (presença) e avaliações de desempenho."""
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Aluno, Avaliacao, HistoricoGraduacao, Turma, Usuario
from ..schemas import AlunoIn, AvaliacaoIn
from ..security import usuario_atual
from ..servicos import (aluno_dict, avaliacoes_do_aluno, frequencia, historico_graduacao, media_por_criterio,
                        registrar_graduacao, ultimas_presencas)

router = APIRouter(prefix="/api", tags=["alunos"], dependencies=[Depends(usuario_atual)])


def _aluno(db: Session, u: Usuario, aluno_id: int) -> Aluno:
    a = db.get(Aluno, aluno_id)
    if not a or a.academia_id != u.academia_id:
        raise HTTPException(404, "Aluno não encontrado")
    return a


def _valida_turma(db: Session, u: Usuario, turma_id: int | None):
    if turma_id is not None:
        t = db.get(Turma, turma_id)
        if not t or t.academia_id != u.academia_id:
            raise HTTPException(400, "Turma inválida")


def _preenche(a: Aluno, body: AlunoIn):
    for campo, valor in body.model_dump().items():
        if isinstance(valor, str):
            valor = valor.strip() or None
        setattr(a, campo, valor)


@router.get("/alunos")
def listar(
    q: str = "",
    status: str = Query("ativo", pattern="^(ativo|afastado|inativo)$"),
    u: Usuario = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    stmt = select(Aluno).where(Aluno.academia_id == u.academia_id, Aluno.status == status)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(Aluno.nome.ilike(like) | Aluno.apelido.ilike(like))
    return [aluno_dict(a) for a in db.scalars(stmt.order_by(Aluno.nome))]


@router.post("/alunos", status_code=201)
def criar(body: AlunoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _valida_turma(db, u, body.turma_id)
    a = Aluno(academia_id=u.academia_id)
    _preenche(a, body)
    db.add(a)
    db.flush()
    if a.graduacao:
        db.add(HistoricoGraduacao(aluno_id=a.id, graduacao=a.graduacao, data=date.today()))
    db.commit()
    return {"id": a.id}


@router.get("/alunos/{aluno_id}")
def detalhe(aluno_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aluno(db, u, aluno_id)
    avals = avaliacoes_do_aluno(db, a.id)
    return {
        "aluno": aluno_dict(a),
        "frequencia": frequencia(db, a.id),
        "presencas": ultimas_presencas(db, a.id, 30),
        "historico_graduacao": historico_graduacao(db, a.id),
        "avaliacoes": avals,
        "media": media_por_criterio(avals),
    }


@router.put("/alunos/{aluno_id}")
def editar(aluno_id: int, body: AlunoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aluno(db, u, aluno_id)
    _valida_turma(db, u, body.turma_id)
    nova = (body.graduacao or "").strip() or None
    registrar_graduacao(db, a, nova)
    _preenche(a, body)
    db.commit()
    return {"ok": True}


@router.delete("/alunos/{aluno_id}")
def excluir(aluno_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    db.delete(_aluno(db, u, aluno_id))
    db.commit()
    return {"ok": True}


# ---- link de acompanhamento dos pais ----
@router.post("/alunos/{aluno_id}/link")
def gerar_link(aluno_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Gera (ou renova, invalidando o anterior) o link que os pais usam para ver o desempenho."""
    a = _aluno(db, u, aluno_id)
    a.token_pais = secrets.token_urlsafe(24)
    db.commit()
    return {"token": a.token_pais}


@router.delete("/alunos/{aluno_id}/link")
def revogar_link(aluno_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aluno(db, u, aluno_id)
    a.token_pais = None
    db.commit()
    return {"ok": True}


# ---- avaliações ----
@router.post("/alunos/{aluno_id}/avaliacoes", status_code=201)
def criar_avaliacao(aluno_id: int, body: AvaliacaoIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aluno(db, u, aluno_id)
    if any(not 0 <= n <= 10 for n in body.notas.values()):
        raise HTTPException(422, "As notas devem estar entre 0 e 10")
    av = Avaliacao(
        aluno_id=a.id, data=body.data or date.today(), notas=body.notas,
        comentario=(body.comentario or "").strip() or None, visivel_pais=body.visivel_pais,
    )
    db.add(av)
    db.commit()
    return {"id": av.id}


@router.delete("/avaliacoes/{avaliacao_id}")
def excluir_avaliacao(avaliacao_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    av = db.get(Avaliacao, avaliacao_id)
    if not av or db.get(Aluno, av.aluno_id).academia_id != u.academia_id:
        raise HTTPException(404, "Avaliação não encontrada")
    db.delete(av)
    db.commit()
    return {"ok": True}
