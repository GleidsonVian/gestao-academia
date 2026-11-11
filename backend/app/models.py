from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Academia(Base):
    __tablename__ = "academias"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    modalidade: Mapped[str] = mapped_column(String(80))
    # listas configuráveis: funciona para qualquer modalidade
    graduacoes: Mapped[list] = mapped_column(JSON, default=list)  # faixas, cordas, níveis...
    criterios: Mapped[list] = mapped_column(JSON, default=list)  # critérios de avaliação
    contato_privacidade: Mapped[str | None] = mapped_column(String(200))  # e-mail/telefone do responsável pelos dados
    token_inscricao: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)  # link público de inscrição
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"))
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    senha_hash: Mapped[str] = mapped_column(String(200))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    academia: Mapped[Academia] = relationship()


class Turma(Base):
    __tablename__ = "turmas"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"), index=True)
    nome: Mapped[str] = mapped_column(String(120))
    horario: Mapped[str | None] = mapped_column(String(120))


class Aluno(Base):
    __tablename__ = "alunos"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"), index=True)
    turma_id: Mapped[int | None] = mapped_column(ForeignKey("turmas.id", ondelete="SET NULL"))
    nome: Mapped[str] = mapped_column(String(160))
    apelido: Mapped[str | None] = mapped_column(String(80))
    nascimento: Mapped[date | None] = mapped_column(Date)
    responsavel_nome: Mapped[str | None] = mapped_column(String(160))
    responsavel_telefone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    graduacao: Mapped[str | None] = mapped_column(String(80))
    observacoes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="ativo")
    autoriza_imagem: Mapped[bool | None] = mapped_column(Boolean)  # opcional; matrícula não depende disso
    token_pais: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    turma: Mapped[Turma | None] = relationship()


class Aula(Base):
    """Calendário interno. Só aula com status 'realizada' libera chamada e entra na frequência."""

    __tablename__ = "aulas"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"), index=True)
    turma_id: Mapped[int | None] = mapped_column(ForeignKey("turmas.id", ondelete="SET NULL"))
    data: Mapped[date] = mapped_column(Date, index=True)
    hora: Mapped[str | None] = mapped_column(String(5))
    titulo: Mapped[str] = mapped_column(String(120), default="Aula")
    status: Mapped[str] = mapped_column(String(12), default="programada")  # programada | realizada | cancelada

    turma: Mapped[Turma | None] = relationship()


class Registro(Base):
    """Chamada de um aluno em uma aula: presente | falta | justificada."""

    __tablename__ = "registros_chamada"
    __table_args__ = (UniqueConstraint("aula_id", "aluno_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    aula_id: Mapped[int] = mapped_column(ForeignKey("aulas.id", ondelete="CASCADE"), index=True)
    aluno_id: Mapped[int] = mapped_column(ForeignKey("alunos.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(12))


class HistoricoGraduacao(Base):
    __tablename__ = "historico_graduacao"

    id: Mapped[int] = mapped_column(primary_key=True)
    aluno_id: Mapped[int] = mapped_column(ForeignKey("alunos.id", ondelete="CASCADE"), index=True)
    graduacao: Mapped[str] = mapped_column(String(80))
    data: Mapped[date] = mapped_column(Date)


class Avaliacao(Base):
    __tablename__ = "avaliacoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    aluno_id: Mapped[int] = mapped_column(ForeignKey("alunos.id", ondelete="CASCADE"), index=True)
    data: Mapped[date] = mapped_column(Date)
    notas: Mapped[dict] = mapped_column(JSON)  # {"Técnica": 8, ...}
    comentario: Mapped[str | None] = mapped_column(Text)
    visivel_pais: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Inscricao(Base):
    """Ficha enviada pelo responsável pelo link público; o professor aprova ou recusa."""

    __tablename__ = "inscricoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pendente")  # pendente | aprovada | recusada
    nome: Mapped[str] = mapped_column(String(160))
    nascimento: Mapped[date] = mapped_column(Date)
    responsavel_nome: Mapped[str] = mapped_column(String(160))
    responsavel_telefone: Mapped[str] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    observacoes: Mapped[str | None] = mapped_column(Text)  # saúde, alergias etc.
    autoriza_imagem: Mapped[bool] = mapped_column(Boolean, default=False)
    aceite_termos: Mapped[bool] = mapped_column(Boolean, default=False)
    termos_versao: Mapped[str | None] = mapped_column(String(30))  # versão do texto aceito
    aceite_em: Mapped[datetime | None] = mapped_column(DateTime)
    aluno_id: Mapped[int | None] = mapped_column(ForeignKey("alunos.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    documentos: Mapped[list["Documento"]] = relationship(cascade="all, delete-orphan")


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    inscricao_id: Mapped[int] = mapped_column(ForeignKey("inscricoes.id", ondelete="CASCADE"), index=True)
    nome_original: Mapped[str] = mapped_column(String(200))
    arquivo: Mapped[str] = mapped_column(String(200))  # caminho relativo dentro de uploads/
    tipo: Mapped[str] = mapped_column(String(80))
    tamanho: Mapped[int] = mapped_column(Integer)


class ConsentimentoImagem(Base):
    """Histórico (trilha) das autorizações e revogações de uso de imagem e voz."""

    __tablename__ = "consentimentos_imagem"

    id: Mapped[int] = mapped_column(primary_key=True)
    aluno_id: Mapped[int] = mapped_column(ForeignKey("alunos.id", ondelete="CASCADE"), index=True)
    autorizado: Mapped[bool] = mapped_column(Boolean)  # True = autorizou, False = revogou/negou
    origem: Mapped[str] = mapped_column(String(20))  # inscricao | painel
    observacao: Mapped[str | None] = mapped_column(Text)
    termos_versao: Mapped[str | None] = mapped_column(String(30))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditoriaLGPD(Base):
    """Registra que uma eliminação/exportação ocorreu, SEM guardar dados pessoais do titular."""

    __tablename__ = "auditoria_lgpd"

    id: Mapped[int] = mapped_column(primary_key=True)
    academia_id: Mapped[int] = mapped_column(ForeignKey("academias.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    acao: Mapped[str] = mapped_column(String(40))  # eliminacao_aluno | eliminacao_inscricao | exportacao
    referencia: Mapped[str] = mapped_column(String(40))  # ex.: "aluno#12" (apenas o id interno)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
