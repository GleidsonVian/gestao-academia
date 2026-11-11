"""Calendário de aulas, chamada (presente / falta / justificada) e relatório de frequência."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Aluno, Aula, Registro, Turma, Usuario
from ..schemas import AulaIn, ChamadaIn
from ..security import usuario_atual
from ..servicos import contagens_por_aluno, percentual

router = APIRouter(prefix="/api", tags=["aulas e frequência"], dependencies=[Depends(usuario_atual)])


def _aula(db: Session, u: Usuario, aula_id: int) -> Aula:
    a = db.get(Aula, aula_id)
    if not a or a.academia_id != u.academia_id:
        raise HTTPException(404, "Aula não encontrada")
    return a


def _valida_turma(db: Session, u: Usuario, turma_id: int | None):
    if turma_id is not None:
        t = db.get(Turma, turma_id)
        if not t or t.academia_id != u.academia_id:
            raise HTTPException(400, "Turma inválida")


def _dict(a: Aula, contagem: dict[str, int] | None = None) -> dict:
    c = contagem or {}
    return {
        "id": a.id, "data": a.data, "hora": a.hora, "titulo": a.titulo, "status": a.status,
        "turma_id": a.turma_id, "turma": a.turma.nome if a.turma else None,
        "presentes": c.get("presente", 0), "faltas": c.get("falta", 0), "justificadas": c.get("justificada", 0),
    }


@router.get("/aulas")
def listar(status: str | None = None, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    q = select(Aula).where(Aula.academia_id == u.academia_id)
    if status:
        q = q.where(Aula.status == status)
    aulas = db.scalars(q.order_by(Aula.data.desc(), Aula.hora.desc())).all()
    cont: dict[int, dict[str, int]] = {}
    for aula_id, st, n in db.execute(
        select(Registro.aula_id, Registro.status, func.count(Registro.id))
        .where(Registro.aula_id.in_([a.id for a in aulas])).group_by(Registro.aula_id, Registro.status)
    ):
        cont.setdefault(aula_id, {})[st] = n
    return [_dict(a, cont.get(a.id)) for a in aulas]


@router.post("/aulas", status_code=201)
def criar(body: AulaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _valida_turma(db, u, body.turma_id)
    a = Aula(academia_id=u.academia_id, data=body.data, hora=body.hora, titulo=body.titulo.strip(),
             turma_id=body.turma_id, status=body.status)
    db.add(a)
    db.commit()
    return {"id": a.id}


@router.put("/aulas/{aula_id}")
def editar(aula_id: int, body: AulaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aula(db, u, aula_id)
    _valida_turma(db, u, body.turma_id)
    a.data, a.hora, a.titulo, a.turma_id, a.status = body.data, body.hora, body.titulo.strip(), body.turma_id, body.status
    db.commit()
    return {"ok": True}


@router.delete("/aulas/{aula_id}")
def excluir(aula_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    db.delete(_aula(db, u, aula_id))
    db.commit()
    return {"ok": True}


@router.get("/aulas/{aula_id}/chamada")
def ver_chamada(aula_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aula(db, u, aula_id)
    q = select(Aluno).where(Aluno.academia_id == u.academia_id, Aluno.status.in_(["ativo", "afastado"]))  # afastado continua na chamada (faltas justificadas)
    if a.turma_id:
        q = q.where(Aluno.turma_id == a.turma_id)
    alunos = db.scalars(q.order_by(Aluno.nome)).all()
    marcados = dict(db.execute(select(Registro.aluno_id, Registro.status).where(Registro.aula_id == a.id)).all())
    freq = contagens_por_aluno(db, [x.id for x in alunos])  # frequência acumulada (aulas realizadas)
    return {
        "aula": _dict(a),
        "alunos": [{"id": x.id, "nome": x.nome, "apelido": x.apelido, "graduacao": x.graduacao,
                    "situacao": x.status, "status": marcados.get(x.id), "frequencia": freq[x.id]} for x in alunos],
    }


@router.post("/aulas/{aula_id}/chamada")
def salvar_chamada(aula_id: int, body: ChamadaIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    a = _aula(db, u, aula_id)
    if a.status != "realizada":
        raise HTTPException(409, "A chamada só pode ser feita em aulas marcadas como realizadas")
    ids = {m.aluno_id for m in body.marcacoes}
    validos = set(db.scalars(select(Aluno.id).where(Aluno.academia_id == u.academia_id, Aluno.id.in_(ids))))
    existentes = {r.aluno_id: r for r in db.scalars(select(Registro).where(Registro.aula_id == a.id))}
    for m in body.marcacoes:
        if m.aluno_id not in validos:
            continue
        if m.aluno_id in existentes:
            existentes[m.aluno_id].status = m.status
        else:
            db.add(Registro(aula_id=a.id, aluno_id=m.aluno_id, status=m.status))
    db.commit()
    return {"ok": True}


@router.get("/relatorios/frequencia")
def relatorio(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    alunos = db.scalars(
        select(Aluno).where(Aluno.academia_id == u.academia_id, Aluno.status.in_(["ativo", "afastado"])).order_by(Aluno.nome)).all()
    cont = contagens_por_aluno(db, [a.id for a in alunos])
    linhas = [{"id": a.id, "nome": a.nome, "apelido": a.apelido, "graduacao": a.graduacao, "situacao": a.status, **cont[a.id]} for a in alunos]
    return {
        "aulasRealizadas": db.scalar(select(func.count(Aula.id)).where(Aula.academia_id == u.academia_id, Aula.status == "realizada")),
        "geral": percentual(sum(l["presentes"] for l in linhas), sum(l["faltas"] for l in linhas)),
        "alunos": linhas,
    }
