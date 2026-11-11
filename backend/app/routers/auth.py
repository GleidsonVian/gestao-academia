from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Academia, Usuario
from ..schemas import LoginIn, RegistrarIn, TokenOut
from ..security import confere_senha, criar_token, hash_senha, usuario_atual
from ..servicos import CRITERIOS_PADRAO, GRADUACOES_GENERICAS, GRADUACOES_PADRAO

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/registrar", response_model=TokenOut, status_code=201)
def registrar(body: RegistrarIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(Usuario).where(Usuario.email == email)):
        raise HTTPException(409, "E-mail já cadastrado")
    academia = Academia(
        nome=body.academia.strip(),
        modalidade=body.modalidade.strip(),
        graduacoes=GRADUACOES_PADRAO.get(body.modalidade.strip().lower(), GRADUACOES_GENERICAS),
        criterios=CRITERIOS_PADRAO,
    )
    usuario = Usuario(academia=academia, nome=body.nome.strip(), email=email, senha_hash=hash_senha(body.senha))
    db.add_all([academia, usuario])
    db.commit()
    return TokenOut(access_token=criar_token(usuario))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    usuario = db.scalar(select(Usuario).where(Usuario.email == body.email.lower()))
    if not usuario or not confere_senha(body.senha, usuario.senha_hash):
        raise HTTPException(401, "E-mail ou senha incorretos")
    return TokenOut(access_token=criar_token(usuario))


@router.post("/token-automacao", response_model=TokenOut)
def token_automacao(usuario: Usuario = Depends(usuario_atual)):
    """Token de longa duração (1 ano) para scripts Python / n8n chamarem a API."""
    return TokenOut(access_token=criar_token(usuario, horas=24 * 365))
