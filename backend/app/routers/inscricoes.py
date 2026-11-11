"""Inscrição digital: link público para o responsável + fila de aprovação do professor."""
import secrets
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Academia, Aluno, AuditoriaLGPD, ConsentimentoImagem, Documento, Inscricao, Turma, Usuario
from ..security import usuario_atual
from ..servicos import UPLOAD_DIR, apagar_inscricao

MAX_ARQUIVOS = 5
MAX_BYTES = 5 * 1024 * 1024
# extensão -> (assinatura inicial do arquivo, content-type)
TIPOS = {
    ".pdf": (b"%PDF", "application/pdf"),
    ".jpg": (b"\xff\xd8\xff", "image/jpeg"),
    ".jpeg": (b"\xff\xd8\xff", "image/jpeg"),
    ".png": (b"\x89PNG", "image/png"),
}

# ---------------- público (sem login) ----------------
publico = APIRouter(prefix="/inscricao", tags=["inscrição pública"])

_tentativas: dict[str, list[float]] = defaultdict(list)


def _limite(ip: str, max_por_hora: int = 10):
    agora = time.time()
    _tentativas[ip] = [t for t in _tentativas[ip] if agora - t < 3600]
    if len(_tentativas[ip]) >= max_por_hora:
        raise HTTPException(429, "Muitas tentativas. Tente novamente mais tarde.")
    _tentativas[ip].append(agora)


def _academia_por_token(db: Session, token: str) -> Academia:
    ac = db.scalar(select(Academia).where(Academia.token_inscricao == token))
    if not ac:
        raise HTTPException(404, "Link de inscrição inválido ou desativado")
    return ac


@publico.get("/{token}")
def info(token: str, db: Session = Depends(get_db)):
    ac = _academia_por_token(db, token)
    return {"academia": ac.nome, "modalidade": ac.modalidade, "contato_privacidade": ac.contato_privacidade}


@publico.post("/{token}", status_code=201)
async def enviar(
    token: str,
    request: Request,
    nome: str = Form(..., min_length=2, max_length=160),
    nascimento: date = Form(...),
    responsavel_nome: str = Form(..., min_length=2, max_length=160),
    responsavel_telefone: str = Form(..., min_length=8, max_length=40),
    email: str | None = Form(None, max_length=200),
    observacoes: str | None = Form(None, max_length=2000),
    autoriza_imagem: bool = Form(False),
    aceite_termos: bool = Form(False),
    termos_versao: str | None = Form(None, max_length=30),
    arquivos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    _limite(request.client.host if request.client else "?")
    ac = _academia_por_token(db, token)
    if not aceite_termos:
        raise HTTPException(422, "É necessário aceitar a declaração de saúde e responsabilidade")
    if nascimento > date.today():
        raise HTTPException(422, "Data de nascimento inválida")
    arquivos = [a for a in arquivos if a.filename]
    if len(arquivos) > MAX_ARQUIVOS:
        raise HTTPException(422, f"Envie no máximo {MAX_ARQUIVOS} arquivos")

    # valida tudo antes de gravar qualquer coisa
    lidos: list[tuple[UploadFile, str, bytes]] = []
    for f in arquivos:
        ext = Path(f.filename).suffix.lower()
        if ext not in TIPOS:
            raise HTTPException(422, "Arquivos permitidos: PDF, JPG ou PNG")
        conteudo = await f.read(MAX_BYTES + 1)
        if len(conteudo) > MAX_BYTES:
            raise HTTPException(422, "Cada arquivo pode ter no máximo 5 MB")
        if not conteudo.startswith(TIPOS[ext][0]):
            raise HTTPException(422, f"O arquivo {f.filename} não parece ser um {ext[1:].upper()} válido")
        lidos.append((f, ext, conteudo))

    insc = Inscricao(
        academia_id=ac.id, nome=nome.strip(), nascimento=nascimento,
        responsavel_nome=responsavel_nome.strip(), responsavel_telefone=responsavel_telefone.strip(),
        email=(email or "").strip() or None, observacoes=(observacoes or "").strip() or None,
        autoriza_imagem=autoriza_imagem, aceite_termos=True,
        termos_versao=(termos_versao or "").strip() or None, aceite_em=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(insc)
    db.flush()
    pasta = UPLOAD_DIR / str(insc.id)
    for f, ext, conteudo in lidos:
        pasta.mkdir(parents=True, exist_ok=True)
        nome_arq = f"{uuid.uuid4().hex}{ext}"  # nunca usa o nome enviado no disco
        (pasta / nome_arq).write_bytes(conteudo)
        insc.documentos.append(Documento(
            nome_original=Path(f.filename).name[:200], arquivo=f"{insc.id}/{nome_arq}",
            tipo=TIPOS[ext][1], tamanho=len(conteudo),
        ))
    db.commit()
    return {"ok": True}


# ---------------- painel do professor ----------------
router = APIRouter(prefix="/api", tags=["inscrições"], dependencies=[Depends(usuario_atual)])


@router.get("/inscricao-link")
def ver_link(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    ac = u.academia
    if not ac.token_inscricao:
        ac.token_inscricao = secrets.token_urlsafe(18)
        db.commit()
    return {"token": ac.token_inscricao}


@router.post("/inscricao-link")
def renovar_link(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    u.academia.token_inscricao = secrets.token_urlsafe(18)
    db.commit()
    return {"token": u.academia.token_inscricao}


@router.delete("/inscricao-link")
def desativar_link(u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    u.academia.token_inscricao = None
    db.commit()
    return {"ok": True}


def _dict(i: Inscricao) -> dict:
    return {
        "id": i.id, "status": i.status, "nome": i.nome, "nascimento": i.nascimento,
        "responsavel_nome": i.responsavel_nome, "responsavel_telefone": i.responsavel_telefone,
        "email": i.email, "observacoes": i.observacoes, "autoriza_imagem": i.autoriza_imagem,
        "aluno_id": i.aluno_id, "criado_em": i.criado_em,
        "termos_versao": i.termos_versao, "aceite_em": i.aceite_em,
        "documentos": [{"id": d.id, "nome": d.nome_original, "tipo": d.tipo, "tamanho": d.tamanho} for d in i.documentos],
    }


def _insc(db: Session, u: Usuario, insc_id: int) -> Inscricao:
    i = db.get(Inscricao, insc_id)
    if not i or i.academia_id != u.academia_id:
        raise HTTPException(404, "Inscrição não encontrada")
    return i


@router.get("/inscricoes")
def listar(status: str = "pendente", u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    q = select(Inscricao).where(Inscricao.academia_id == u.academia_id, Inscricao.status == status)
    return [_dict(i) for i in db.scalars(q.order_by(Inscricao.criado_em.desc()))]


class AprovarIn(BaseModel):
    turma_id: int | None = None
    graduacao: str | None = None


@router.post("/inscricoes/{insc_id}/aprovar")
def aprovar(insc_id: int, body: AprovarIn, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = _insc(db, u, insc_id)
    if i.status != "pendente":
        raise HTTPException(409, "Esta inscrição já foi analisada")
    if body.turma_id is not None:
        t = db.get(Turma, body.turma_id)
        if not t or t.academia_id != u.academia_id:
            raise HTTPException(400, "Turma inválida")
    aluno = Aluno(
        academia_id=u.academia_id, turma_id=body.turma_id, nome=i.nome, nascimento=i.nascimento,
        responsavel_nome=i.responsavel_nome, responsavel_telefone=i.responsavel_telefone, email=i.email,
        graduacao=body.graduacao or None, observacoes=i.observacoes, autoriza_imagem=i.autoriza_imagem,
    )
    db.add(aluno)
    db.flush()
    db.add(ConsentimentoImagem(aluno_id=aluno.id, autorizado=i.autoriza_imagem, origem="inscricao",
                               termos_versao=i.termos_versao, usuario_id=u.id))
    i.status, i.aluno_id = "aprovada", aluno.id
    db.commit()
    return {"aluno_id": aluno.id}


@router.post("/inscricoes/{insc_id}/recusar")
def recusar(insc_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = _insc(db, u, insc_id)
    if i.status != "pendente":
        raise HTTPException(409, "Esta inscrição já foi analisada")
    i.status = "recusada"
    db.commit()
    return {"ok": True}


@router.get("/inscricoes/{insc_id}/documentos/{doc_id}")
def baixar(insc_id: int, doc_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    i = _insc(db, u, insc_id)
    d = next((d for d in i.documentos if d.id == doc_id), None)
    caminho = (UPLOAD_DIR / d.arquivo).resolve() if d else None
    if not d or not caminho.is_file() or UPLOAD_DIR.resolve() not in caminho.parents:
        raise HTTPException(404, "Documento não encontrado")
    return FileResponse(caminho, media_type=d.tipo, filename=d.nome_original)


@router.delete("/inscricoes/{insc_id}")
def apagar(insc_id: int, u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Elimina a ficha e os documentos enviados (ex.: inscrição recusada). Para alunos matriculados,
    use a exclusão do aluno, que apaga tudo junto."""
    insc = _insc(db, u, insc_id)
    if insc.status == "aprovada":
        raise HTTPException(409, "Inscrição aprovada: exclua os dados pelo cadastro do aluno")
    db.add(AuditoriaLGPD(academia_id=u.academia_id, usuario_id=u.id, acao="eliminacao_inscricao", referencia=f"inscricao#{insc.id}"))
    apagar_inscricao(db, insc)
    db.commit()
    return {"ok": True}
