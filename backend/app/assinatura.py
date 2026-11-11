"""Regra de acesso por assinatura (teste, ativa, suspensa, cancelada) com período de tolerância.

`acesso_ate` é o ÚLTIMO dia de acesso (inclusive). Passou dessa data, a academia entra em
tolerância por TOLERANCIA_DIAS (tudo continua funcionando, com aviso) e só depois é bloqueada.
Suspensa/cancelada bloqueiam na hora (bloqueio manual pelo superadmin).
"""
import os
from datetime import date

TESTE_DIAS = int(os.getenv("TESTE_DIAS", "14"))
TOLERANCIA_DIAS = int(os.getenv("TOLERANCIA_DIAS", "5"))
CONTATO_COBRANCA = os.getenv("CONTATO_COBRANCA", "")  # ex.: "WhatsApp (27) 99999-9999" ou um link de pagamento

STATUS_VALIDOS = ("teste", "ativa", "suspensa", "cancelada")


def situacao(academia, hoje: date | None = None) -> dict:
    """estado: teste | ativa | tolerancia | vencida | suspensa | cancelada"""
    hoje = hoje or date.today()
    st = academia.status_assinatura or "ativa"
    ate = academia.acesso_ate
    base = {"status": st, "acesso_ate": ate, "tolerancia_dias": TOLERANCIA_DIAS, "contato": CONTATO_COBRANCA}

    if st in ("suspensa", "cancelada"):
        return {**base, "estado": st, "bloqueada": True, "dias_restantes": None}
    if ate is None:  # sem vencimento (ex.: cliente com acesso livre)
        return {**base, "estado": "ativa", "bloqueada": False, "dias_restantes": None}

    restantes = (ate - hoje).days
    if restantes >= 0:
        return {**base, "estado": "teste" if st == "teste" else "ativa", "bloqueada": False, "dias_restantes": restantes}

    atraso = -restantes
    if atraso <= TOLERANCIA_DIAS:
        # dias_restantes = quantos dias faltam até o bloqueio
        return {**base, "estado": "tolerancia", "bloqueada": False, "dias_restantes": TOLERANCIA_DIAS - atraso}
    return {**base, "estado": "vencida", "bloqueada": True, "dias_restantes": None}
