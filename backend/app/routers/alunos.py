"""Alunos, link dos pais, chamada (presença) e avaliações de desempenho."""
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..models import (Aluno, AuditoriaLGPD, Aula, Avaliacao, ConsentimentoImagem, HistoricoGraduacao, Inscricao, Registro,
                      Responsavel, Turma, Usuario)
from ..schemas import AlunoIn, AvaliacaoIn, ImagemIn
from ..security import usuario_atual, usuario_logado
from ..servicos import (aluno_dict, apagar_aluno, avaliacoes_do_aluno, consentimentos_imagem, frequencia,
                        historico_graduacao, media_por_criterio, registrar_graduacao, ultimas_presencas)

router = APIRouter(prefix="/api", tags=["alunos"], dependencies=[Depends(usuario_atual)])
# LGPD: o titular pode pedir cópia/eliminação dos dados MESMO com a assinatura vencida
lgpd = APIRouter(prefix="/api", tags=["LGPD"], dependencies=[Depends(usuario_logado)])


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
    for campo, valor in body.model_dump(exclude={"responsaveis"}).items():
        if isinstance(valor, str):
            valor = valor.strip() or None
        setattr(a, campo, valor)
    if body.responsaveis is not None:  # lista enviada = substitui todos os responsáveis
        a.responsaveis.clear()
        for ordem, r in enumerate(body.responsaveis):
            a.responsaveis.append(Responsavel(
                nome=r.nome.strip(), parentesco=(r.parentesco or "").strip() or None,
                telefone=(r.telefone or "").strip() or None, email=(r.email or "").strip() or None, ordem=ordem))
        # o 1º responsável também fica nos campos antigos (listas e exportações continuam funcionando)
        principal = body.responsaveis[0] if body.responsaveis else None
        a.responsavel_nome = principal.nome.strip() if principal else None
        a.responsavel_telefone = ((principal.telefone or "").strip() or None) if principal else None


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
        "consentimento_imagem": consentimentos_imagem(db, a.id),
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


@lgpd.delete("/alunos/{aluno_id}")
def excluir(aluno_id: int, u: Usuario = Depends(usuario_logado), db: Session = Depends(get_db)):
    """Eliminação definitiva e irreversível de todos os dados do aluno (LGPD, art. 18, VI)."""
    apagar_aluno(db, _aluno(db, u, aluno_id), u.id)
    db.commit()
    return {"ok": True}


def _dados_aluno(db: Session, a: Aluno) -> dict:
    return {
        "gerado_em": date.today(),
        "aluno": {k: v for k, v in aluno_dict(a).items() if k not in ("token_pais", "link_ativo")},
        "frequencia": frequencia(db, a.id),
        "presencas": [
            {"data": d, "status": st, "aula_status": ast}
            for d, st, ast in db.execute(
                select(Aula.data, Registro.status, Aula.status).join(Registro, Registro.aula_id == Aula.id)
                .where(Registro.aluno_id == a.id).order_by(Aula.data))
        ],
        "avaliacoes": avaliacoes_do_aluno(db, a.id),
        "historico_graduacao": historico_graduacao(db, a.id),
        "consentimento_imagem": consentimentos_imagem(db, a.id),
        "fichas_inscricao": [
            {"enviada_em": i.criado_em, "responsavel": i.responsavel_nome, "telefone": i.responsavel_telefone,
             "email": i.email, "saude": i.observacoes, "autoriza_imagem": i.autoriza_imagem,
             "termos_versao": i.termos_versao, "aceite_em": i.aceite_em,
             "documentos": [d.nome_original for d in i.documentos]}
            for i in db.scalars(select(Inscricao).where(Inscricao.aluno_id == a.id))
        ],
    }


@lgpd.get("/alunos/{aluno_id}/exportar")
def exportar(aluno_id: int, u: Usuario = Depends(usuario_logado), db: Session = Depends(get_db)):
    """Cópia de todos os dados do aluno em JSON (LGPD, art. 18, II e V)."""
    a = _aluno(db, u, aluno_id)
    dados = _dados_aluno(db, a)
    db.add(AuditoriaLGPD(academia_id=u.academia_id, usuario_id=u.id, acao="exportacao", referencia=f"aluno#{a.id}"))
    db.commit()
    return JSONResponse(jsonable_encoder(dados), headers={"Content-Disposition": f'attachment; filename="aluno-{a.id}-dados.json"'})


@lgpd.get("/minha-academia/exportar")
def exportar_academia(u: Usuario = Depends(usuario_logado), db: Session = Depends(get_db)):
    """Cópia de TODOS os dados da academia (todos os alunos), disponível mesmo com a assinatura bloqueada."""
    alunos = db.scalars(select(Aluno).where(Aluno.academia_id == u.academia_id).order_by(Aluno.nome)).all()
    dados = {"gerado_em": date.today(), "academia": u.academia.nome, "alunos": [_dados_aluno(db, a) for a in alunos]}
    db.add(AuditoriaLGPD(academia_id=u.academia_id, usuario_id=u.id, acao="exportacao", referencia="academia"))
    db.commit()
    return JSONResponse(jsonable_encoder(dados), headers={"Content-Disposition": 'attachment; filename="academia-dados.json"'})


@router.post("/alunos/{aluno_id}/imagem")
def registrar_imagem(aluno_id: int, body: ImagemIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Registra autorização ou REVOGAÇÃO do uso de imagem e voz, mantendo o histórico."""
    a = _aluno(db, u, aluno_id)
    a.autoriza_imagem = body.autorizado
    db.add(ConsentimentoImagem(aluno_id=a.id, autorizado=body.autorizado, origem="painel",
                               observacao=(body.observacao or "").strip() or None, usuario_id=u.id))
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
