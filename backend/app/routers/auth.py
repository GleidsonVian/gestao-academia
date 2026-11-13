import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Academia, Usuario
from datetime import date, timedelta

from ..assinatura import TESTE_DIAS
from ..schemas import LoginIn, RegistrarIn, TokenOut
from fastapi.security import HTTPAuthorizationCredentials

from ..security import bearer, confere_senha, criar_token, duracao_horas, hash_senha, ler_token, usuario_atual
from ..servicos import CRITERIOS_PADRAO, GRADUACOES_GENERICAS, GRADUACOES_PADRAO

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/registrar", response_model=TokenOut, status_code=201)
def registrar(body: RegistrarIn, db: Session = Depends(get_db)):
    # Em produção, depois de criar a sua conta, defina REGISTRO_ABERTO=false para ninguém mais criar academias.
    if os.getenv("REGISTRO_ABERTO", "true").lower() == "false":
        raise HTTPException(403, "Cadastro de novas academias está fechado")
    email = body.email.lower()
    if db.scalar(select(Usuario).where(Usuario.email == email)):
        raise HTTPException(409, "E-mail já cadastrado")
    academia = Academia(
        nome=body.academia.strip(),
        modalidade=body.modalidade.strip(),
        graduacoes=GRADUACOES_PADRAO.get(body.modalidade.strip().lower(), GRADUACOES_GENERICAS),
        criterios=CRITERIOS_PADRAO,
        status_assinatura="teste",
        acesso_ate=date.today() + timedelta(days=TESTE_DIAS),
    )
    usuario = Usuario(academia=academia, nome=body.nome.strip(), email=email, senha_hash=hash_senha(body.senha))
    db.add_all([academia, usuario])
    db.commit()
    return TokenOut(access_token=criar_token(usuario, horas=duracao_horas(usuario, body.lembrar), lembrar=body.lembrar))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    usuario = db.scalar(select(Usuario).where(Usuario.email == body.email.lower()))
    if not usuario or not confere_senha(body.senha, usuario.senha_hash):
        raise HTTPException(401, "E-mail ou senha incorretos")
    return TokenOut(access_token=criar_token(usuario, horas=duracao_horas(usuario, body.lembrar), lembrar=body.lembrar))


@router.post("/renovar", response_model=TokenOut)
def renovar(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    """Renova um login 'manter conectado' ainda válido por mais 30 dias (quem usa o app não precisa entrar de novo).
    Sessões normais (sem 'manter conectado') não renovam: expiram em 12 h."""
    dados = ler_token(cred)
    if not dados.get("lem"):
        raise HTTPException(400, "Esta sessão não foi aberta com 'manter conectado'")
    usuario = db.get(Usuario, int(dados["sub"]))
    if not usuario:
        raise HTTPException(401, "Usuário não existe mais")
    return TokenOut(access_token=criar_token(usuario, horas=duracao_horas(usuario, True), lembrar=True))


@router.post("/token-automacao", response_model=TokenOut)
def token_automacao(usuario: Usuario = Depends(usuario_atual)):
    """Token de longa duração (1 ano) para scripts Python / n8n chamarem a API."""
    if usuario.is_superadmin:  # um token de 1 ano da conta do dono controlaria todas as academias
        raise HTTPException(403, "A conta de superadmin não gera token de automação")
    return TokenOut(access_token=criar_token(usuario, horas=24 * 365))
