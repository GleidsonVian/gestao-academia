import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

def _normaliza(url: str) -> str:
    """Neon/Render entregam 'postgres://' ou 'postgresql://'; o SQLAlchemy precisa do driver (psycopg 3)."""
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo):]
    return url


DATABASE_URL = _normaliza(os.getenv("DATABASE_URL", "sqlite:///./academia.db"))
EH_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # psycopg 3 + endpoint "pooled" do Neon (PgBouncer): sem prepared statements para não quebrar entre conexões
    connect_args={"check_same_thread": False} if EH_SQLITE else {"prepare_threshold": None},
    pool_pre_ping=True,  # Neon suspende o banco quando ocioso: testa a conexão antes de usar
    pool_recycle=300,
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
        "academias": [("token_inscricao", "VARCHAR(64)"), ("contato_privacidade", "VARCHAR(200)"),
                      ("status_assinatura", "VARCHAR(12)"), ("acesso_ate", "DATE"),
                      ("valor_mensal_centavos", "INTEGER"),
                      ("cor_primaria", "VARCHAR(7)"), ("logo_tipo", "VARCHAR(80)"), ("logo_tamanho", "INTEGER"),
                      ("logo_versao", "INTEGER DEFAULT 0"), ("logo_opacidade", "INTEGER DEFAULT 8"),
                      ("logo_conteudo", "BLOB" if EH_SQLITE else "BYTEA")],
        "usuarios": [("is_superadmin", "BOOLEAN DEFAULT FALSE")],
        "pagamentos": [("comprovante_nome", "VARCHAR(200)"), ("comprovante_tipo", "VARCHAR(80)"),
                       ("comprovante_tamanho", "INTEGER"), ("comprovante_conteudo", "BLOB" if EH_SQLITE else "BYTEA")],
        "inscricoes": [("termos_versao", "VARCHAR(30)"), ("aceite_em", "TIMESTAMP")],
        "documentos": [("conteudo", "BLOB" if EH_SQLITE else "BYTEA")],
    }
    with engine.begin() as con:
        for tabela, colunas in novas.items():
            existentes = {c["name"] for c in insp.get_columns(tabela)}
            for nome, tipo in colunas:
                if nome not in existentes:
                    con.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {nome} {tipo}"))
        con.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_academias_token_inscricao ON academias (token_inscricao)"))

        # academias criadas antes do controle de assinatura ganham o período de teste a partir de hoje
        from datetime import date, timedelta
        from .assinatura import TESTE_DIAS
        con.execute(text("UPDATE academias SET status_assinatura = 'teste', acesso_ate = :d WHERE status_assinatura IS NULL"),
                    {"d": date.today() + timedelta(days=TESTE_DIAS)})

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
