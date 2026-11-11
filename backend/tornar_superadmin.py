"""Marca (ou desmarca) uma conta como superadmin, o dono do sistema.

Uso:   python tornar_superadmin.py seu@email.com
       python tornar_superadmin.py seu@email.com --remover

Roda no banco definido em DATABASE_URL (.env). Para o banco de produção (Neon), defina
DATABASE_URL só para este comando; não existe tela para promover contas, de propósito.
"""
import sys

from sqlalchemy import select

from app.db import SessionLocal, engine, migrar
from app.models import Usuario

if len(sys.argv) < 2:
    raise SystemExit(__doc__)

email = sys.argv[1].strip().lower()
remover = "--remover" in sys.argv

migrar()  # garante as colunas novas no banco alvo
with SessionLocal() as db:
    u = db.scalar(select(Usuario).where(Usuario.email == email))
    if not u:
        raise SystemExit(f"Nenhuma conta com o e-mail {email} neste banco ({engine.dialect.name}).")
    u.is_superadmin = not remover
    db.commit()
    print(f"{email}: superadmin = {u.is_superadmin} (banco: {engine.dialect.name})")
