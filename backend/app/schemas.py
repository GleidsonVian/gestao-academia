from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegistrarIn(BaseModel):
    academia: str = Field(min_length=2, max_length=120)
    modalidade: str = Field(min_length=2, max_length=80)
    nome: str = Field(min_length=2, max_length=120)
    email: EmailStr
    senha: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    senha: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AcademiaIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    modalidade: str = Field(min_length=2, max_length=80)
    graduacoes: list[str] = Field(min_length=1)
    criterios: list[str] = Field(min_length=1)
    contato_privacidade: str | None = Field(default=None, max_length=200)


class TurmaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    horario: str | None = None


class ResponsavelIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    parentesco: str | None = Field(default=None, max_length=40)
    telefone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)


class AlunoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    apelido: str | None = None
    nascimento: date | None = None
    turma_id: int | None = None
    responsavel_nome: str | None = None
    responsavel_telefone: str | None = None
    email: str | None = None
    graduacao: str | None = None
    observacoes: str | None = None
    responsaveis: list[ResponsavelIn] | None = Field(default=None, max_length=8)  # None = não mexe; lista = substitui
    status: Literal["ativo", "afastado", "inativo"] = "ativo"


class AulaIn(BaseModel):
    data: date
    hora: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    titulo: str = Field(default="Aula", min_length=1, max_length=120)
    turma_id: int | None = None
    status: Literal["programada", "realizada", "cancelada"] = "programada"


class ImagemIn(BaseModel):
    autorizado: bool
    observacao: str | None = Field(default=None, max_length=500)


class AulasRecorrentesIn(BaseModel):
    """Ex.: toda segunda e quarta às 18h, de 01/12 a 31/03."""
    dias_semana: list[int] = Field(min_length=1, max_length=7)  # 0 = segunda ... 6 = domingo
    data_inicio: date
    data_fim: date
    hora: str | None = Field(default=None, pattern="^[0-9]{2}:[0-9]{2}$")
    titulo: str = Field(default="Aula", min_length=1, max_length=120)
    turma_id: int | None = None


class MarcacaoIn(BaseModel):
    aluno_id: int
    status: Literal["presente", "falta", "justificada"]


class ChamadaIn(BaseModel):
    marcacoes: list[MarcacaoIn]


class AvaliacaoIn(BaseModel):
    data: date | None = None
    notas: dict[str, float] = Field(min_length=1)
    comentario: str | None = None
    visivel_pais: bool = True
