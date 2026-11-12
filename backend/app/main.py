import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine, migrar
from .routers import admin, alunos, aulas, auth, gestao, inscricoes, publico, uniformes

Base.metadata.create_all(engine)
migrar()

app = FastAPI(title="Gestão de Academias", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip().rstrip("/") for o in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(gestao.router)
app.include_router(gestao.livre)
app.include_router(alunos.router)
app.include_router(alunos.lgpd)
app.include_router(admin.router)
app.include_router(aulas.router)
app.include_router(uniformes.router)
app.include_router(publico.router)
app.include_router(inscricoes.router)
app.include_router(inscricoes.publico)


@app.get("/saude", tags=["infra"])
def saude():
    return {"status": "ok"}
