import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./academia.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrar():
    """create_all não altera tabelas existentes: adiciona colunas novas em bancos antigos."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    novas = {
        "alunos": [("autoriza_imagem", "BOOLEAN"), ("apelido", "VARCHAR(80)")],
        "academias": [("token_inscricao", "VARCHAR(64)")],
        "inscricoes": [("termos_versao", "VARCHAR(30)"), ("aceite_em", "DATETIME")],
    }
    with engine.begin() as con:
        for tabela, colunas in novas.items():
            existentes = {c["name"] for c in insp.get_columns(tabela)}
            for nome, tipo in colunas:
                if nome not in existentes:
                    con.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {nome} {tipo}"))
        con.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_academias_token_inscricao ON academias (token_inscricao)"))

        # presencas (antigo: presente/faltou por data) -> aulas + registros_chamada (3 estados)
        if "presencas" in insp.get_table_names():
            con.execute(text(
                "INSERT INTO aulas (academia_id, data, titulo, status) "
                "SELECT DISTINCT a.academia_id, p.data, 'Aula', 'realizada' "
                "FROM presencas p JOIN alunos a ON a.id = p.aluno_id"))
            con.execute(text(
                "INSERT INTO registros_chamada (aula_id, aluno_id, status) "
                "SELECT au.id, p.aluno_id, CASE WHEN p.presente THEN 'presente' ELSE 'falta' END "
                "FROM presencas p JOIN alunos a ON a.id = p.aluno_id "
                "JOIN aulas au ON au.academia_id = a.academia_id AND au.data = p.data"))
            con.execute(text("DROP TABLE presencas"))
