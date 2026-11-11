"""Cria uma academia de teste com dados de exemplo (somente desenvolvimento). Uso:  python seed.py

Login: admin@teste.com (ou SEED_EMAIL). A senha vem de SEED_SENHA; se não for definida,
uma senha aleatória é gerada e mostrada no final.
"""
import os
import random
import secrets
from datetime import date, timedelta

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Academia, Aluno, Aula, Avaliacao, HistoricoGraduacao, Registro, Turma, Usuario
from app.security import hash_senha
from app.servicos import CRITERIOS_PADRAO, GRADUACOES_PADRAO

EMAIL = os.getenv("SEED_EMAIL", "admin@teste.com")
SENHA = os.getenv("SEED_SENHA") or secrets.token_urlsafe(9)

Base.metadata.create_all(engine)
random.seed(7)

with SessionLocal() as db:
    if db.scalar(select(Usuario).where(Usuario.email == EMAIL)):
        print("Conta de teste já existe — nada a fazer.")
        raise SystemExit

    ac = Academia(nome="Academia Teste", modalidade="Capoeira",
                  graduacoes=GRADUACOES_PADRAO["capoeira"], criterios=CRITERIOS_PADRAO)
    db.add_all([ac, Usuario(academia=ac, nome="Professor Teste", email=EMAIL, senha_hash=hash_senha(SENHA))])
    db.flush()

    infantil = Turma(academia_id=ac.id, nome="Infantil", horario="Seg/Qua 18h")
    adulto = Turma(academia_id=ac.id, nome="Adulto", horario="Ter/Qui 19h30")
    db.add_all([infantil, adulto])
    db.flush()

    hoje = date.today()
    alunos = []
    for nome, apelido, turma, grad, idade, resp in [
        ("Pedro Henrique", "Sabiá", infantil, "Verde", 9, "Maria Souza"),
        ("Ana Clara", "Beija-flor", infantil, "Cru", 7, "João Lima"),
        ("Lucas Gabriel", "Pião", infantil, "Amarela", 11, "Carla Dias"),
        ("Beatriz Santos", "Lua", infantil, "Verde e Amarela", 10, "Paulo Santos"),
        ("Rafael Costa", "Perninha", adulto, "Azul", 28, None),
        ("Juliana Rocha", "Onça", adulto, "Verde", 34, None),
        ("Marcos Vinícius", "Gavião", adulto, "Marrom", 41, None),
        ("Fernanda Alves", "Duda", adulto, "Cru", 25, None),
    ]:
        a = Aluno(
            academia_id=ac.id, turma_id=turma.id, nome=nome, apelido=apelido, graduacao=grad,
            nascimento=hoje.replace(year=hoje.year - idade) - timedelta(days=random.randint(0, 300)),
            responsavel_nome=resp, responsavel_telefone="(11) 99999-0000" if resp else None,
        )
        db.add(a)
        alunos.append(a)
    db.flush()

    # aulas dos últimos 45 dias (realizadas) + 2 futuras (programadas) por turma
    aulas = []
    for turma in (infantil, adulto):
        for dias in range(45, -1, -1):
            dia = hoje - timedelta(days=dias)
            if dia.weekday() == (0 if turma is infantil else 1):
                aulas.append(Aula(academia_id=ac.id, turma_id=turma.id, data=dia, hora="18:00", titulo="Aula", status="realizada"))
        for extra in (7, 14):
            aulas.append(Aula(academia_id=ac.id, turma_id=turma.id, data=hoje + timedelta(days=extra), hora="18:00", titulo="Aula", status="programada"))
    db.add_all(aulas)
    db.flush()
    for a in alunos:
        db.add(HistoricoGraduacao(aluno_id=a.id, graduacao=a.graduacao, data=hoje - timedelta(days=200)))
        for aula in aulas:
            if aula.status == "realizada" and aula.turma_id == a.turma_id:
                r = random.random()
                db.add(Registro(aula_id=aula.id, aluno_id=a.id, status="presente" if r < .7 else "justificada" if r < .85 else "falta"))
        for meses_atras in (2, 1, 0):
            db.add(Avaliacao(
                aluno_id=a.id, data=hoje - timedelta(days=30 * meses_atras),
                notas={c: round(random.uniform(5 + (2 - meses_atras), 8 + (2 - meses_atras) * 0.5) * 2) / 2 for c in ac.criterios},
                comentario=["Bom empenho nas aulas.", "Evoluindo bem no ritmo e nos movimentos.", "Ótima postura e respeito com os colegas."][2 - meses_atras],
            ))
    for a in alunos[:2]:
        a.token_pais = secrets.token_urlsafe(24)

    db.commit()
    print(f"Criado! Login: {EMAIL} / {SENHA}")
    for a in alunos[:2]:
        print(f"Link dos pais de {a.nome}: http://localhost:5173/acompanhar/{a.token_pais}")
