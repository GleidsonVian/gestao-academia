"""Página dos pais: acesso somente leitura por link com token (sem login)."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..assinatura import situacao
from ..models import Academia, Aluno
from ..servicos import aparencia, avaliacoes_do_aluno, frequencia, media_por_criterio, ultimas_presencas

router = APIRouter(prefix="/publico", tags=["pais"])


@router.get("/{token}")
def acompanhamento(token: str, db: Session = Depends(get_db)):
    a = db.scalar(select(Aluno).where(Aluno.token_pais == token, Aluno.status.in_(["ativo", "afastado"])))
    if not a:
        raise HTTPException(404, "Link inválido ou desativado")
    ac = db.get(Academia, a.academia_id)
    if situacao(ac)["bloqueada"]:
        raise HTTPException(403, "Página indisponível no momento")
    avals = avaliacoes_do_aluno(db, a.id, so_visiveis=True)
    # nada de telefone, e-mail ou observações internas aqui
    return {
        "aluno": {
            "nome": a.nome, "apelido": a.apelido, "graduacao": a.graduacao,
            "turma": a.turma.nome if a.turma else None, "desde": a.criado_em,
        },
        "academia": {"nome": ac.nome, "modalidade": ac.modalidade, "graduacoes": ac.graduacoes,
                     "contato_privacidade": ac.contato_privacidade},
        "aparencia": aparencia(ac),
        "frequencia": frequencia(db, a.id),
        "presencasRecentes": ultimas_presencas(db, a.id),
        "desempenho": {"media": media_por_criterio(avals), "avaliacoes": avals},
    }



@router.get("/{token}/logo")
def logo(token: str, db: Session = Depends(get_db)):
    """Logo da academia para a página dos pais (o token do aluno vale como chave)."""
    a = db.scalar(select(Aluno).where(Aluno.token_pais == token, Aluno.status.in_(["ativo", "afastado"])))
    ac = db.get(Academia, a.academia_id) if a else None
    if not ac or situacao(ac)["bloqueada"] or not ac.logo_tamanho or ac.logo_conteudo is None:
        raise HTTPException(404, "Sem logo")
    return Response(bytes(ac.logo_conteudo), media_type=ac.logo_tipo,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600"})
