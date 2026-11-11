import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Usuario

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-troque-em-producao")
JWT_ALG = "HS256"
EXPIRA_HORAS = 12

bearer = HTTPBearer(auto_error=False)


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode()[:72], bcrypt.gensalt()).decode()


def confere_senha(senha: str, hash_: str) -> bool:
    try:
        return bcrypt.checkpw(senha.encode()[:72], hash_.encode())
    except ValueError:
        return False


def criar_token(usuario: Usuario, horas: int = EXPIRA_HORAS) -> str:
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario.id),
        "aca": usuario.academia_id,
        "iat": agora,
        "exp": agora + timedelta(hours=horas),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def usuario_logado(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if not cred:
        raise HTTPException(401, "Não autenticado")
    try:
        dados = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão inválida ou expirada")
    usuario = db.get(Usuario, int(dados["sub"]))
    if not usuario:
        raise HTTPException(401, "Usuário não existe mais")
    return usuario


def usuario_atual(u: Usuario = Depends(usuario_logado)) -> Usuario:
    """Usuário autenticado E com assinatura em dia (teste, ativa ou tolerância). O superadmin nunca é bloqueado."""
    if not u.is_superadmin:
        from .assinatura import situacao

        if situacao(u.academia)["bloqueada"]:
            raise HTTPException(402, "Assinatura vencida ou suspensa")
    return u


def exigir_superadmin(u: Usuario = Depends(usuario_logado)) -> Usuario:
    if not u.is_superadmin:
        raise HTTPException(404, "Não encontrado")  # nem confirma que a rota existe
    return u
