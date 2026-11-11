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


class TurmaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    horario: str | None = None


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
    autoriza_imagem: bool | None = None
    status: Literal["ativo", "afastado", "inativo"] = "ativo"


class AulaIn(BaseModel):
    data: date
    hora: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    titulo: str = Field(default="Aula", min_length=1, max_length=120)
    turma_id: int | None = None
    status: Literal["programada", "realizada", "cancelada"] = "programada"


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
