# Gestão de Academias

App web genérico para qualquer modalidade (capoeira, kickboxing, muay thai, jiu-jitsu…).

- `backend/` — API em **FastAPI** (Python) + SQLite (SQLAlchemy), autenticação **JWT**
- `frontend/` — **React** + TypeScript (Vite)

## Funcionalidades

- Cadastro/login da academia (professor) com JWT
- **Inscrição digital**: link público com ficha, documentos, declaração de saúde/responsabilidade e autorização de imagem (opcional); o professor aprova ou recusa
- **Calendário de aulas** e **chamada** com Presente / Falta / Falta justificada (justificadas não entram no % de frequência)
- Status do aluno: ativo, **afastado** (continua na chamada) e inativo; apelido e histórico de graduação
- Alunos: cadastro, turma, graduação, responsável, ativo/inativo
- Turmas, chamada (presença por data/turma), avaliações de desempenho por critério (0–10)
- **Link para os pais**: o professor gera um link único (`/acompanhar/<token>`); os pais veem
  graduação, frequência e avaliações sem login. Dá para renovar (invalida o anterior) ou desativar.
  A página pública não expõe telefone, e-mail nem observações internas.
- Graduações e critérios configuráveis por academia (padrões prontos para algumas modalidades)

## Rodar (um clique)

Requisitos: **Python 3.11+** e **Node.js 20+**.

- **Windows:** dê dois cliques em `iniciar.bat`
- **Linux / macOS / Git Bash:** `./iniciar.sh`

Na primeira vez o script cria o ambiente virtual, instala as dependências e gera o `backend/.env`
com um `JWT_SECRET` aleatório. Depois sobe os dois servidores e abre o navegador:

- Front-end: http://localhost:5173
- API: http://localhost:3333 (documentação interativa em `/docs`)

O front-end encaminha `/backend/*` para a API, então o app inteiro responde numa única porta (5173).

Dados de exemplo (opcional, só para desenvolvimento) — mostra o login ao final:

```bash
cd backend
.venv\Scripts\python seed.py      # Windows   (Linux/macOS: .venv/bin/python seed.py)
```

### Rodar manualmente

```bash
# back-end
cd backend && python -m venv .venv && .venv\Scriptsctivate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 3333

# front-end (outro terminal)
cd frontend && npm install && npm run dev
```

## Automações (Python / n8n)

Logado, chame `POST /auth/token-automacao` para obter um JWT de 1 ano e use
`Authorization: Bearer <token>` nas rotas `/api/*` (ex.: `GET /api/alunos`, `POST /api/aulas/{id}/chamada`).
Em produção, defina `JWT_SECRET` forte e `FRONTEND_URL` com o domínio real.

## Aviso

Os textos de termos (`frontend/src/termos.ts`) são um modelo inicial: peça revisão jurídica antes de usar com alunos reais.
Nunca versione `backend/.env`, o banco (`*.db`) nem `backend/uploads/` — já estão no `.gitignore`.
