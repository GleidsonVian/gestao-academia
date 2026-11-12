"""Academia (configurações), dashboard, turmas."""
from datetime import date, timedelta

import re
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Aluno, Aula, Avaliacao, Inscricao, Turma, Usuario
from ..schemas import AcademiaIn, TurmaIn
from ..assinatura import situacao
from ..security import usuario_atual, usuario_logado
from ..servicos import LOGO_MAX_BYTES, aparencia, contagens_por_aluno, percentual, tipo_de_imagem

router = APIRouter(prefix="/api", tags=["gestão"], dependencies=[Depends(usuario_atual)])
# rotas que precisam responder mesmo com a assinatura vencida (o site usa para mostrar o aviso/bloqueio)
livre = APIRouter(prefix="/api", tags=["gestão"], dependencies=[Depends(usuario_logado)])


@livre.get("/me")
def me(u: Usuario = Depends(usuario_logado)):
    a = u.academia
    return {
        "usuario": {"id": u.id, "nome": u.nome, "email": u.email, "is_superadmin": bool(u.is_superadmin)},
        "assinatura": {**situacao(a), "bloqueada": False if u.is_superadmin else situacao(a)["bloqueada"]},
        "aparencia": aparencia(a),
        "academia": {
            "id": a.id, "nome": a.nome, "modalidade": a.modalidade,
            "graduacoes": a.graduacoes, "criterios": a.criterios, "contato_privacidade": a.contato_privacidade,
        },
    }


@router.put("/academia")
def atualizar_academia(body: AcademiaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = u.academia
    a.nome, a.modalidade = body.nome.strip(), body.modalidade.strip()
    a.graduacoes = [g.strip() for g in body.graduacoes if g.strip()]
    a.criterios = [c.strip() for c in body.criterios if c.strip()]
    a.contato_privacidade = (body.contato_privacidade or "").strip() or None
    db.commit()
    return {"ok": True}


@router.get("/dashboard")
def dashboard(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    aid = u.academia_id
    hoje = date.today()
    ativos = Aluno.status == "ativo"
    matriculados = Aluno.status.in_(["ativo", "afastado"])
    aniversariantes = db.scalars(
        select(Aluno)
        .where(Aluno.academia_id == aid, matriculados, extract("month", Aluno.nascimento) == hoje.month)
        .order_by(extract("day", Aluno.nascimento))
    )
    return {
        "alunosAtivos": db.scalar(select(func.count(Aluno.id)).where(Aluno.academia_id == aid, ativos)),
        "alunosAfastados": db.scalar(select(func.count(Aluno.id)).where(Aluno.academia_id == aid, Aluno.status == "afastado")),
        "inscricoesPendentes": db.scalar(
            select(func.count(Inscricao.id)).where(Inscricao.academia_id == aid, Inscricao.status == "pendente")
        ),
        "turmas": db.scalar(select(func.count(Turma.id)).where(Turma.academia_id == aid)),
        "frequenciaGeral": _geral(db, aid),
        "aulasRealizadas": db.scalar(select(func.count(Aula.id)).where(Aula.academia_id == aid, Aula.status == "realizada")),
        "avaliacoesMes": db.scalar(
            select(func.count(Avaliacao.id)).join(Aluno).where(
                Aluno.academia_id == aid, Avaliacao.data >= hoje - timedelta(days=30))
        ),
        "aniversariantes": [{"id": a.id, "nome": a.nome, "nascimento": a.nascimento} for a in aniversariantes],
    }


# ---- turmas ----
def _turma(db: Session, u: Usuario, turma_id: int) -> Turma:
    t = db.get(Turma, turma_id)
    if not t or t.academia_id != u.academia_id:
        raise HTTPException(404, "Turma não encontrada")
    return t


@router.get("/turmas")
def listar_turmas(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    turmas = db.scalars(select(Turma).where(Turma.academia_id == u.academia_id).order_by(Turma.nome)).all()
    contagem = dict(db.execute(
        select(Aluno.turma_id, func.count(Aluno.id))
        .where(Aluno.academia_id == u.academia_id, Aluno.status.in_(["ativo", "afastado"])).group_by(Aluno.turma_id)
    ).all())
    return [{"id": t.id, "nome": t.nome, "horario": t.horario, "alunos": contagem.get(t.id, 0)} for t in turmas]


@router.post("/turmas", status_code=201)
def criar_turma(body: TurmaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    t = Turma(academia_id=u.academia_id, nome=body.nome.strip(), horario=body.horario)
    db.add(t)
    db.commit()
    return {"id": t.id}


@router.put("/turmas/{turma_id}")
def editar_turma(turma_id: int, body: TurmaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    t = _turma(db, u, turma_id)
    t.nome, t.horario = body.nome.strip(), body.horario
    db.commit()
    return {"ok": True}


@router.delete("/turmas/{turma_id}")
def excluir_turma(turma_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    db.delete(_turma(db, u, turma_id))
    db.commit()
    return {"ok": True}


def _geral(db: Session, academia_id: int) -> int | None:
    """Frequência geral agregada dos alunos ativos (presenças / presenças + faltas injustificadas)."""
    ids = list(db.scalars(select(Aluno.id).where(Aluno.academia_id == academia_id, Aluno.status.in_(["ativo", "afastado"]))))
    c = contagens_por_aluno(db, ids).values()
    return percentual(sum(x["presentes"] for x in c), sum(x["faltas"] for x in c))


# ---------------- aparência: cor do app e logo de fundo ----------------
class AparenciaIn(BaseModel):
    cor_primaria: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")  # None = cor padrão
    tema_completo: bool = True  # a cor também tinge fundo, cartões e bordas
    logo_opacidade: int = Field(default=8, ge=2, le=60)
    logo_escala: int = Field(default=70, ge=15, le=140)
    logo_posicao: Literal["centro", "topo-esq", "topo-dir", "base-esq", "base-dir", "mosaico"] = "centro"


@router.put("/academia/aparencia")
def definir_aparencia(body: AparenciaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = u.academia
    a.cor_primaria = body.cor_primaria.lower() if body.cor_primaria else None
    a.logo_opacidade, a.logo_escala, a.logo_posicao = body.logo_opacidade, body.logo_escala, body.logo_posicao
    a.tema_completo = body.tema_completo
    db.commit()
    return aparencia(a)


@router.post("/academia/logo")
async def enviar_logo(arquivo: UploadFile = File(...), u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Logo do grupo: PNG, JPG ou WEBP de até 1 MB. Aparece de fundo no painel, na página dos pais e na inscrição."""
    conteudo = await arquivo.read(LOGO_MAX_BYTES + 1)
    if len(conteudo) > LOGO_MAX_BYTES:
        raise HTTPException(422, "A imagem pode ter no máximo 1 MB")
    tipo = tipo_de_imagem(conteudo)
    if not tipo:
        raise HTTPException(422, "Use uma imagem PNG, JPG ou WEBP")
    a = u.academia
    a.logo_conteudo, a.logo_tipo, a.logo_tamanho = conteudo, tipo, len(conteudo)
    a.logo_versao = (a.logo_versao or 0) + 1
    db.commit()
    return aparencia(a)


@router.delete("/academia/logo")
def remover_logo(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = u.academia
    a.logo_conteudo, a.logo_tipo, a.logo_tamanho = None, None, None
    a.logo_versao = (a.logo_versao or 0) + 1
    db.commit()
    return aparencia(a)


@router.get("/academia/logo")
def ver_logo(u: Usuario = Depends(usuario_atual)):
    a = u.academia
    if not a.logo_tamanho or a.logo_conteudo is None:
        raise HTTPException(404, "Sem logo")
    return Response(bytes(a.logo_conteudo), media_type=a.logo_tipo,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})
