"""Regras de negócio compartilhadas entre rotas internas e a página pública dos pais."""
import shutil
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (Aluno, AuditoriaLGPD, Aula, Avaliacao, ConsentimentoImagem, HistoricoGraduacao, Inscricao,
                     Registro)

GRADUACOES_PADRAO = {
    "capoeira": ["Cru", "Verde", "Verde e Amarela", "Amarela", "Azul", "Verde e Azul", "Marrom", "Vermelha"],
    "muay thai": ["Branca", "Amarela", "Verde", "Azul", "Vermelha", "Marrom", "Preta"],
    "kickboxing": ["Branca", "Amarela", "Laranja", "Verde", "Azul", "Marrom", "Preta"],
    "jiu-jitsu": ["Branca", "Azul", "Roxa", "Marrom", "Preta"],
    "judô": ["Branca", "Cinza", "Azul", "Amarela", "Laranja", "Verde", "Roxa", "Marrom", "Preta"],
    "karatê": ["Branca", "Amarela", "Vermelha", "Laranja", "Verde", "Roxa", "Marrom", "Preta"],
}
GRADUACOES_GENERICAS = ["Iniciante", "Intermediário", "Avançado"]
CRITERIOS_PADRAO = ["Técnica", "Disciplina", "Condicionamento", "Respeito", "Evolução"]


def percentual(presentes: int, faltas: int) -> int | None:
    """Frequência = presenças / (presenças + faltas injustificadas). Justificadas ficam de fora.
    Sem registros computáveis -> None (mostrar "Sem registros", nunca 0%)."""
    total = presentes + faltas
    return round(presentes / total * 100) if total else None


def contagens_por_aluno(db: Session, aluno_ids: list[int]) -> dict[int, dict]:
    """presentes/faltas/justificadas por aluno, considerando só aulas REALIZADAS."""
    r = {i: {"presentes": 0, "faltas": 0, "justificadas": 0} for i in aluno_ids}
    if not aluno_ids:
        return r
    q = (
        select(Registro.aluno_id, Registro.status, func.count(Registro.id))
        .join(Aula, Aula.id == Registro.aula_id)
        .where(Aula.status == "realizada", Registro.aluno_id.in_(aluno_ids))
        .group_by(Registro.aluno_id, Registro.status)
    )
    chave = {"presente": "presentes", "falta": "faltas", "justificada": "justificadas"}
    for aluno_id, status, n in db.execute(q):
        r[aluno_id][chave[status]] = n
    for c in r.values():
        c["percentual"] = percentual(c["presentes"], c["faltas"])
    return r


def frequencia(db: Session, aluno_id: int) -> dict:
    c = contagens_por_aluno(db, [aluno_id])[aluno_id]
    return {**c, "total": c["presentes"] + c["faltas"]}  # "total" = aulas computáveis


def avaliacoes_do_aluno(db: Session, aluno_id: int, so_visiveis: bool = False) -> list[dict]:
    q = select(Avaliacao).where(Avaliacao.aluno_id == aluno_id)
    if so_visiveis:
        q = q.where(Avaliacao.visivel_pais.is_(True))
    q = q.order_by(Avaliacao.data.desc(), Avaliacao.id.desc())
    return [
        {"id": a.id, "data": a.data, "notas": a.notas, "comentario": a.comentario, "visivel_pais": a.visivel_pais}
        for a in db.scalars(q)
    ]


def media_por_criterio(avaliacoes: list[dict]) -> dict[str, float]:
    soma: dict[str, list[float]] = {}
    for a in avaliacoes:
        for criterio, nota in a["notas"].items():
            soma.setdefault(criterio, []).append(nota)
    return {c: round(sum(v) / len(v), 1) for c, v in soma.items()}


def ultimas_presencas(db: Session, aluno_id: int, limite: int = 20) -> list[dict]:
    q = (
        select(Aula.data, Registro.status)
        .join(Registro, Registro.aula_id == Aula.id)
        .where(Registro.aluno_id == aluno_id, Aula.status == "realizada")
        .order_by(Aula.data.desc(), Aula.id.desc())
        .limit(limite)
    )
    return [{"data": d, "status": st} for d, st in db.execute(q)]


def historico_graduacao(db: Session, aluno_id: int) -> list[dict]:
    q = select(HistoricoGraduacao).where(HistoricoGraduacao.aluno_id == aluno_id).order_by(
        HistoricoGraduacao.data.desc(), HistoricoGraduacao.id.desc())
    return [{"graduacao": h.graduacao, "data": h.data} for h in db.scalars(q)]


def registrar_graduacao(db: Session, aluno: Aluno, nova: str | None):
    if nova and nova != aluno.graduacao:
        db.add(HistoricoGraduacao(aluno_id=aluno.id, graduacao=nova, data=date.today()))


def aluno_dict(a: Aluno) -> dict:
    return {
        "id": a.id,
        "nome": a.nome,
        "apelido": a.apelido,
        "nascimento": a.nascimento,
        "turma_id": a.turma_id,
        "turma": a.turma.nome if a.turma else None,
        "responsavel_nome": a.responsavel_nome,
        "responsavel_telefone": a.responsavel_telefone,
        "email": a.email,
        "graduacao": a.graduacao,
        "observacoes": a.observacoes,
        "status": a.status,
        "autoriza_imagem": a.autoriza_imagem,
        "link_ativo": bool(a.token_pais),
        "token_pais": a.token_pais,
    }


# ---------------- LGPD ----------------
UPLOAD_DIR = Path("uploads")


def apagar_inscricao(db: Session, insc: Inscricao):
    """Remove a ficha, os registros de documentos e os ARQUIVOS no disco."""
    shutil.rmtree(UPLOAD_DIR / str(insc.id), ignore_errors=True)
    db.delete(insc)


def apagar_aluno(db: Session, aluno: Aluno, usuario_id: int):
    """Eliminação definitiva (art. 18, VI): aluno, chamada, avaliações, histórico, consentimentos,
    fichas de inscrição e documentos. Fica só uma linha de auditoria sem dados pessoais."""
    for insc in db.scalars(select(Inscricao).where(Inscricao.aluno_id == aluno.id)).all():
        apagar_inscricao(db, insc)
    db.add(AuditoriaLGPD(academia_id=aluno.academia_id, usuario_id=usuario_id,
                         acao="eliminacao_aluno", referencia=f"aluno#{aluno.id}"))
    db.delete(aluno)


def consentimentos_imagem(db: Session, aluno_id: int) -> list[dict]:
    q = select(ConsentimentoImagem).where(ConsentimentoImagem.aluno_id == aluno_id).order_by(
        ConsentimentoImagem.criado_em.desc(), ConsentimentoImagem.id.desc())
    return [{"autorizado": c.autorizado, "origem": c.origem, "observacao": c.observacao,
             "termos_versao": c.termos_versao, "em": c.criado_em} for c in db.scalars(q)]
