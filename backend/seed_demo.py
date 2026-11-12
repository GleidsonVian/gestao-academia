"""Cria uma academia de capoeira COMPLETA e FICTÍCIA para brincar e testar (somente desenvolvimento).

    python seed_demo.py              cria (se ainda não existir)
    python seed_demo.py --refazer    apaga os dados demo e cria de novo

Tudo é inventado: nomes, telefones (padrão 90000-00NN), e-mails (@demo.example.com). Os logins ficam em
`demo_login.txt` (ignorado pelo git). Por segurança o script RECUSA rodar em banco remoto (Neon/Postgres):
dados de teste não devem se misturar com clientes reais.
"""
import random
import secrets
import struct
import sys
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, or_, select

from app.assinatura import TOLERANCIA_DIAS
from app.db import Base, SessionLocal, engine, migrar
from app.models import (Academia, Aluno, Aula, Avaliacao, ConsentimentoImagem, Documento, HistoricoGraduacao, Inscricao, Pagamento,
                        Registro, Responsavel, Turma, Usuario)
from app.security import hash_senha
from app.servicos import CRITERIOS_PADRAO, GRADUACOES_PADRAO

if engine.dialect.name != "sqlite":
    raise SystemExit("Recusado: este script só roda no banco local (SQLite). Não grave dados de teste em banco remoto.")

Base.metadata.create_all(engine)
migrar()

DOMINIO = "@demo.example.com"  # subdominio de example.com: reservado para documentacao, nunca e pessoa real
DOMINIO_ANTIGO = "@demo.local"  # versao anterior do seed (o validador de e-mail recusa .local)
SENHA = secrets.token_urlsafe(9)
rnd = random.Random(2026)
hoje = date.today()
agora = datetime.utcnow().replace(microsecond=0)
PDF = b"%PDF-1.4 documento ficticio de demonstracao"
GRADS = GRADUACOES_PADRAO["capoeira"]


def logo_png() -> bytes:
    """Logo fictício do grupo (anel dourado com cruz verde), gerado sem bibliotecas externas."""
    w = h = 320
    linhas = bytearray()
    for y in range(h):
        linhas.append(0)
        for x in range(w):
            dx, dy = x - w / 2, y - h / 2
            d = (dx * dx + dy * dy) ** 0.5
            if 118 < d < 150: px = (234, 179, 8, 255)
            elif d <= 118 and (abs(dx) < 22 or abs(dy) < 22): px = (21, 128, 61, 255)
            elif d <= 118: px = (255, 255, 255, 40)
            else: px = (0, 0, 0, 0)
            linhas += bytes(px)

    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    return (bytes.fromhex("89504e470d0a1a0a") + bloco(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(bytes(linhas), 9)) + bloco(b"IEND", b""))


with SessionLocal() as db:
    existentes = db.scalars(select(Usuario).where(or_(Usuario.email.like(f"%{DOMINIO}"), Usuario.email.like(f"%{DOMINIO_ANTIGO}")))).all()
    if existentes and "--refazer" not in sys.argv:
        raise SystemExit("Os dados demo já existem. Use  python seed_demo.py --refazer  para recriar.")
    if existentes:
        for aid in {u.academia_id for u in existentes}:
            db.execute(delete(Academia).where(Academia.id == aid))  # cascata apaga alunos, aulas, pagamentos...
        db.commit()
        print("Dados demo antigos apagados.")

    senha_hash = hash_senha(SENHA)

    def nova_academia(nome, email, status, acesso_ate, valor, nome_prof="Professor Demo", super_admin=False, **extra):
        a = Academia(nome=nome, modalidade="Capoeira", graduacoes=GRADS, criterios=CRITERIOS_PADRAO, status_assinatura=status,
                     acesso_ate=acesso_ate, valor_mensal_centavos=valor, **extra)
        db.add(a)
        db.flush()
        db.add(Usuario(academia_id=a.id, nome=nome_prof, email=email, senha_hash=senha_hash, is_superadmin=super_admin))
        return a

    def pagar(a, meses, valor, estornar_um=False):
        """Histórico mensal de pagamentos (um por mês, nos últimos `meses`)."""
        for i in range(meses, 0, -1):
            d = hoje - timedelta(days=30 * (i - 1) + rnd.randint(1, 4))  # o mais recente cai no mês atual
            p = Pagamento(academia_id=a.id, valor_centavos=valor, forma=rnd.choice(["pix", "pix", "pix", "boleto", "cartao"]),
                          data_pagamento=d, dias_concedidos=30, observacao=f"Mensalidade {d:%m/%Y}")
            if i == 2 and meses >= 3:
                p.comprovante_nome, p.comprovante_tipo = f"comprovante-{d:%m-%Y}.pdf", "application/pdf"
                p.comprovante_tamanho, p.comprovante_conteudo = len(PDF), PDF
            if estornar_um and i == meses:
                p.estornado, p.estornado_em, p.observacao = True, agora, "Cobrança duplicada (estornada)"
            db.add(p)

    # ---------------------------------------------------------------- academia principal (completa)
    png = logo_png()
    grupo = nova_academia(
        "Grupo Raízes de Angola", "professor" + DOMINIO, "ativa", hoje + timedelta(days=25), 9990, nome_prof="Mestre Demo",
        cor_primaria="#15803d", tema_completo=True, contato_privacidade="contato@raizesdeangola.demo | (27) 90000-0001",
        token_inscricao=secrets.token_urlsafe(18), logo_conteudo=png, logo_tipo="image/png", logo_tamanho=len(png),
        logo_versao=1, logo_opacidade=10, logo_escala=80, logo_posicao="centro")
    pagar(grupo, 4, 9990)

    turmas = {}
    for nome, horario in [("Infantil (6 a 10 anos)", "Seg e Qua 17h30"), ("Juvenil (11 a 17 anos)", "Ter e Qui 18h30"),
                          ("Adulto", "Seg, Qua e Sex 19h30"), ("Roda dos Mais Graduados", "Sáb 9h")]:
        t = Turma(academia_id=grupo.id, nome=nome, horario=horario)
        db.add(t)
        turmas[nome] = t
    db.flush()
    T_INF, T_JUV, T_ADU, T_AVA = list(turmas.values())

    femininos = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa",
                 "Mariana", "Natália", "Olívia", "Paula", "Rafaela", "Sofia", "Tatiana", "Valentina", "Yasmin"]
    masculinos = ["Arthur", "Bruno", "Caio", "Davi", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Kaique", "Lucas",
                  "Mateus", "Nicolas", "Otávio", "Pedro", "Rafael", "Samuel", "Thiago", "Vinícius"]
    sobrenomes = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Costa", "Pereira", "Ferreira", "Almeida", "Ribeiro", "Carvalho",
                  "Gomes", "Martins", "Rocha", "Barbosa", "Moreira", "Nascimento", "Araújo", "Cardoso", "Teixeira"]
    apelidos = ["Sabiá", "Beija-flor", "Pião", "Gavião", "Tucano", "Jaguar", "Onça", "Lua", "Estrela", "Trovão", "Relâmpago",
                "Cobra Coral", "Bem-te-vi", "Tiziu", "Canário", "Mandinga", "Malandro", "Zumbi", "Curió", "Cigana", "Coruja", "Pardal",
                "Falcão", "Tartaruga", "Raposa", "Guará", "Gambá", "Siriema", "Arara", "Cutia"]
    rnd.shuffle(apelidos)
    usados = set()

    def nome_unico():
        while True:
            n = f"{rnd.choice(femininos + masculinos)} {rnd.choice(sobrenomes)} {rnd.choice(sobrenomes)}"
            if n not in usados and n.split()[1] != n.split()[2]:
                usados.add(n)
                return n

    # (turma, faixa de idade, graduações possíveis, quantidade)
    plano = [(T_INF, (6, 10), ["Cru", "Verde", "Verde e Amarela"], 8), (T_JUV, (11, 17), ["Verde", "Verde e Amarela", "Amarela", "Azul"], 7),
             (T_ADU, (18, 45), ["Cru", "Verde", "Amarela", "Azul"], 10), (T_AVA, (22, 50), ["Azul", "Verde e Azul", "Marrom", "Vermelha"], 5)]
    alunos = []
    for turma, (i0, i1), grads, qtd in plano:
        for k in range(qtd):
            idade = rnd.randint(i0, i1)
            nasc = hoje.replace(year=hoje.year - idade) - timedelta(days=rnd.randint(0, 350))
            menor = idade < 18
            a = Aluno(academia_id=grupo.id, turma_id=turma.id, nome=nome_unico(), apelido=apelidos.pop(), nascimento=nasc,
                      graduacao=grads[min(k * len(grads) // qtd, len(grads) - 1)], status="ativo",
                      criado_em=agora - timedelta(days=rnd.randint(60, 420)))
            n = len(alunos) + 1
            a.email = f"aluno{n}@demo.example.com" if not menor else None
            sobrenome = a.nome.split()[-1]
            if menor:  # 1 ou 2 responsáveis, cada um com telefone e e-mail próprios
                lista = [("Mãe", rnd.choice(femininos)), ("Pai", rnd.choice(masculinos))]
                if rnd.random() < 0.3:
                    lista = [("Avó", rnd.choice(femininos))]
                for ordem, (parentesco, primeiro) in enumerate(lista[: 2 if rnd.random() < 0.7 else 1]):
                    a.responsaveis.append(Responsavel(nome=f"{primeiro} {sobrenome}", parentesco=parentesco, ordem=ordem,
                                                      telefone=f"(27) 90000-{n * 2 + ordem:04d}",
                                                      email=f"{parentesco.lower()}.{n}@demo.example.com" if ordem == 0 or rnd.random() < 0.5 else None))
            elif k % 2 == 0:  # adultos: alguns têm um contato de emergência
                a.responsaveis.append(Responsavel(nome=f"{rnd.choice(femininos)} {sobrenome}", parentesco="Outro", ordem=0,
                                                  telefone=f"(27) 90000-{n * 2:04d}"))
            if a.responsaveis:  # o 1º fica também nos campos antigos
                a.responsavel_nome, a.responsavel_telefone = a.responsaveis[0].nome, a.responsaveis[0].telefone
            alunos.append(a)
            db.add(a)
    db.flush()

    # aniversariantes do mês, afastados e inativos
    for a in rnd.sample(alunos, 3):
        a.nascimento = a.nascimento.replace(month=hoje.month, day=rnd.randint(1, 28))
    alunos[7].status = alunos[19].status = "afastado"
    alunos[7].observacoes, alunos[19].observacoes = "Lesão no ombro, afastado por 3 semanas.", "Viagem de trabalho."
    alunos[11].status = alunos[26].status = "inativo"
    for a in rnd.sample([x for x in alunos if x.graduacao in ("Cru", "Verde")], 3):
        a.observacoes = rnd.choice(["Asma leve, usa bombinha.", "Alergia a amendoim.", "Usa óculos nas atividades."])

    # histórico de graduação e consentimento de imagem
    for a in alunos:
        ate = GRADS.index(a.graduacao)
        passos = GRADS[max(0, ate - 2): ate + 1]
        for n, g in enumerate(passos):
            db.add(HistoricoGraduacao(aluno_id=a.id, graduacao=g, data=hoje - timedelta(days=(len(passos) - n) * rnd.randint(90, 150))))
        a.autoriza_imagem = rnd.choice([True, True, True, False, None])
        if a.autoriza_imagem is not None:
            db.add(ConsentimentoImagem(aluno_id=a.id, autorizado=a.autoriza_imagem, origem="inscricao", termos_versao="2026-11-v1",
                                       criado_em=a.criado_em))
    for a in [x for x in alunos if x.autoriza_imagem is True][:2]:  # duas revogações para ver o histórico
        a.autoriza_imagem = False
        db.add(ConsentimentoImagem(aluno_id=a.id, autorizado=False, origem="painel", observacao="Responsável pediu para não publicar fotos",
                                   criado_em=agora - timedelta(days=20)))

    # calendário: 12 semanas de aulas por turma (+ próximas 3 semanas programadas)
    grade = {T_INF.id: ([0, 2], "17:30"), T_JUV.id: ([1, 3], "18:30"), T_ADU.id: ([0, 2, 4], "19:30"), T_AVA.id: ([5], "09:00")}
    aulas = []
    for turma in turmas.values():
        dias, hora = grade[turma.id]
        for off in range(-84, 22):
            d = hoje + timedelta(days=off)
            if d.weekday() in dias:
                st = "programada" if off >= 0 else ("cancelada" if rnd.random() < 0.04 else "realizada")
                aulas.append(Aula(academia_id=grupo.id, turma_id=turma.id, data=d, hora=hora, titulo="Aula de capoeira", status=st))
    db.add_all(aulas)
    db.flush()

    # chamada com perfis diferentes de frequência
    perfil = {a.id: rnd.choice([0.93, 0.93, 0.78, 0.78, 0.5]) for a in alunos}
    for a in alunos:
        if a.status == "inativo":
            continue
        for aula in aulas:
            if aula.status != "realizada" or aula.turma_id != a.turma_id:
                continue
            if a.status == "afastado" and (hoje - aula.data).days <= 21:
                st = "justificada"  # afastado: faltas justificadas não pesam no percentual
            elif rnd.random() < perfil[a.id]:
                st = "presente"
            else:
                st = "justificada" if rnd.random() < 0.4 else "falta"
            db.add(Registro(aula_id=aula.id, aluno_id=a.id, status=st))

    # avaliações de desempenho (evoluindo ao longo do tempo)
    comentarios = ["Bom empenho nas aulas e boa postura na roda.", "Evoluiu bastante no ritmo e nos movimentos de ginga.",
                   "Precisa treinar mais a esquiva, mas está dedicado.", "Excelente disciplina e respeito com os colegas.",
                   "Ótima evolução na musicalidade e no canto.", "Mostrou liderança ajudando os iniciantes."]
    for a in alunos:
        if a.status == "inativo":
            continue
        base = rnd.uniform(4.5, 7.0)
        for passo, dias in enumerate((75, 40, 5)):
            notas = {c: max(0, min(10, round((base + passo * 0.8 + rnd.uniform(-1, 1)) * 2) / 2)) for c in CRITERIOS_PADRAO}
            db.add(Avaliacao(aluno_id=a.id, data=hoje - timedelta(days=dias), notas=notas, comentario=rnd.choice(comentarios),
                             visivel_pais=rnd.random() > 0.15))

    # links dos pais para 10 alunos
    links = []
    for a in alunos[:10]:
        a.token_pais = secrets.token_urlsafe(24)
        links.append((a.nome, a.token_pais))

    # inscrições: 3 pendentes, 1 recusada, 1 aprovada
    for nome, resp, saude, img, dias in [("Miguel Andrade Lopes", "Carolina Lopes", "Asma leve, usa bombinha.", True, 1),
                                         ("Alice Mendonça Reis", "Renato Reis", "Nenhuma.", False, 2),
                                         ("Heitor Campos Dias", "Luana Campos", "Alergia a amendoim e picada de abelha.", True, 4)]:
        i = Inscricao(academia_id=grupo.id, status="pendente", nome=nome, nascimento=hoje.replace(year=hoje.year - rnd.randint(7, 12)),
                      responsavel_nome=resp, responsavel_telefone="(27) 90000-0099", email="contato@demo.example.com", observacoes=saude,
                      autoriza_imagem=img, aceite_termos=True, termos_versao="2026-11-v1", aceite_em=agora - timedelta(days=dias),
                      criado_em=agora - timedelta(days=dias))
        i.documentos.append(Documento(nome_original="atestado-medico.pdf", arquivo="db", conteudo=PDF, tipo="application/pdf", tamanho=len(PDF)))
        db.add(i)
    db.add(Inscricao(academia_id=grupo.id, status="recusada", nome="Teste Duplicado", nascimento=hoje.replace(year=hoje.year - 9),
                     responsavel_nome="Responsável Teste", responsavel_telefone="(27) 90000-0098", aceite_termos=True,
                     termos_versao="2026-11-v1", aceite_em=agora - timedelta(days=9), criado_em=agora - timedelta(days=9)))
    db.add(Inscricao(academia_id=grupo.id, status="aprovada", nome=alunos[3].nome, nascimento=alunos[3].nascimento,
                     responsavel_nome=alunos[3].responsavel_nome or "Próprio aluno", responsavel_telefone=alunos[3].responsavel_telefone or "",
                     aceite_termos=True, termos_versao="2026-11-v1", aceite_em=alunos[3].criado_em, aluno_id=alunos[3].id,
                     criado_em=alunos[3].criado_em))

    # ---------------------------------------------------------------- conta do dono do sistema + clientes fictícios (painel Admin)
    nova_academia("Administração (demo)", "dono" + DOMINIO, "ativa", None, None, nome_prof="Dono do Sistema (demo)", super_admin=True)

    clientes = [("Capoeira Mar Aberto (demo)", "cliente-emdia", "ativa", hoje + timedelta(days=17), 12900, 6, 5),
                ("Roda do Cais (demo)", "cliente-tolerancia", "ativa", hoje - timedelta(days=2), 14900, 5, 4),
                ("Berimbau de Ouro (demo)", "cliente-bloqueada", "ativa", hoje - timedelta(days=TOLERANCIA_DIAS + 7), 9900, 3, 3),
                ("Ginga Nova (demo)", "cliente-teste", "teste", hoje + timedelta(days=5), None, 0, 2),
                ("Quilombo Cultural (demo)", "cliente-suspenso", "suspensa", hoje + timedelta(days=10), 11900, 2, 2)]
    for nome, login, status, ate, valor, meses, qtd in clientes:
        c = nova_academia(nome, login + DOMINIO, status, ate, valor, nome_prof=f"Prof. {nome.split()[1]}")
        if meses:
            pagar(c, meses, valor, estornar_um=(login == "cliente-emdia"))
        t = Turma(academia_id=c.id, nome="Turma Geral", horario="Seg e Qua 19h")
        db.add(t)
        db.flush()
        for _ in range(qtd):
            db.add(Aluno(academia_id=c.id, turma_id=t.id, nome=nome_unico(), apelido=rnd.choice(["Pardal", "Sabiá", "Lua", "Falcão"]),
                         graduacao=rnd.choice(GRADS[:4]), status="ativo", responsavel_telefone="(27) 90000-0050"))

    db.commit()

    # ---------------------------------------------------------------- logins (arquivo local, fora do git)
    linhas = ["LOGINS DE DEMONSTRAÇÃO (dados fictícios, só neste computador)", f"Senha de todas as contas: {SENHA}", "",
              f"professor{DOMINIO}  -> Grupo Raízes de Angola (academia completa: alunos, chamada, avaliações, inscrições...)",
              f"dono{DOMINIO}  -> SUPERADMIN (menu Admin: receita, pagamentos, bloquear/liberar)",
              "", "Clientes fictícios para testar assinatura e bloqueio (entre com eles):"]
    linhas += [f"{login}{DOMINIO}  -> {nome}  [{status}]" for nome, login, status, *_ in clientes]
    linhas += ["", "Links dos pais (abra em aba anônima):"] + [f"http://localhost:5173/acompanhar/{tk}   ({n})" for n, tk in links[:3]]
    linhas += ["", f"Link de inscrição: http://localhost:5173/inscricao/{grupo.token_inscricao}"]
    Path("demo_login.txt").write_text("\n".join(linhas) + "\n", encoding="utf-8")

    por_status = {}
    for a in alunos:
        por_status[a.status] = por_status.get(a.status, 0) + 1
    print(f"Academia demo criada: {grupo.nome}")
    print(f"  {len(alunos)} alunos {por_status}, {len(turmas)} turmas, {len(aulas)} aulas, inscrições: 3 pendentes + 1 recusada + 1 aprovada")
    print(f"  + dono (superadmin) e {len(clientes)} academias-clientes fictícias para o painel Admin")
    print("Logins e senha salvos em backend/demo_login.txt")
