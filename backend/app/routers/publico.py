"""Página dos pais: acesso somente leitura por link com token (sem login)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Academia, Aluno
from ..servicos import avaliacoes_do_aluno, frequencia, media_por_criterio, ultimas_presencas

router = APIRouter(prefix="/publico", tags=["pais"])


@router.get("/{token}")
def acompanhamento(token: str, db: Session = Depends(get_db)):
    a = db.scalar(select(Aluno).where(Aluno.token_pais == token, Aluno.status.in_(["ativo", "afastado"])))
    if not a:
        raise HTTPException(404, "Link inválido ou desativado")
    ac = db.get(Academia, a.academia_id)
    avals = avaliacoes_do_aluno(db, a.id, so_visiveis=True)
    # nada de telefone, e-mail ou observações internas aqui
    return {
        "aluno": {
            "nome": a.nome, "apelido": a.apelido, "graduacao": a.graduacao,
            "turma": a.turma.nome if a.turma else None, "desde": a.criado_em,
        },
        "academia": {"nome": ac.nome, "modalidade": ac.modalidade, "graduacoes": ac.graduacoes},
        "frequencia": frequencia(db, a.id),
        "presencasRecentes": ultimas_presencas(db, a.id),
        "desempenho": {"media": media_por_criterio(avals), "avaliacoes": avals},
    }

