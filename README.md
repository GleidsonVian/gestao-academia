# Gestão de Academias

App web genérico para qualquer modalidade (capoeira, kickboxing, muay thai, jiu-jitsu…).

- `backend/` — API em **FastAPI** (Python) + SQLite (SQLAlchemy), autenticação **JWT**
- `frontend/` — **React** + TypeScript (Vite)

## Funcionalidades

- Cadastro/login da academia (professor) com JWT. **Manter conectado neste aparelho**: login de 30 dias que se renova sozinho enquanto a pessoa usa o app (sem marcar, a sessão dura 12 h e termina ao fechar o navegador; a conta de superadmin é limitada a 24 h). A senha nunca é guardada pelo app: quem salva é o gerenciador de senhas do navegador
- **Inscrição digital**: link público com ficha, documentos, declaração de saúde/responsabilidade e autorização de imagem (opcional); o professor aprova ou recusa
- **Calendário de aulas** (com **aulas recorrentes**: “toda segunda e quarta às 18h”) e **chamada** com Presente / Falta / Falta justificada (justificadas não entram no % de frequência)
- Status do aluno: ativo, **afastado** (continua na chamada) e inativo; apelido e histórico de graduação
- **Uniformes e camisas**: catálogo (preço, cores e tamanhos), pedidos por aluno (tamanho, cor, quantidade, valor combinado), controle de **pago** e **entregue**, resumo (vendido, recebido, a receber), **cobrança pelo WhatsApp/e-mail** com a chave Pix, e **lista de produção** somada por item, cor e tamanho para encomendar na confecção (copiar, WhatsApp ou CSV)
- **Aviso de aula cancelada**: ao cancelar, o app monta a mensagem pronta (editável) e oferece três caminhos: copiar/abrir o WhatsApp para o **grupo da turma**, avisar os responsáveis **um por um** (wa.me, com marcação de quem já foi avisado; quem tem dois filhos na turma recebe uma mensagem só) ou **e-mail para todos** em cópia oculta
- Alunos: cadastro, turma, graduação, ativo/inativo e **vários responsáveis** (cada um com parentesco, telefone e e-mail), com botões que abrem o **WhatsApp (wa.me)** e o **e-mail** (destinatário, assunto com o nome do aluno e mensagem já preenchidos)
- Turmas, chamada (presença por data/turma), avaliações de desempenho por critério (0–10)
- **Link para os pais**: o professor gera um link único (`/acompanhar/<token>`); os pais veem
  graduação, frequência e avaliações sem login. Dá para renovar (invalida o anterior) ou desativar.
  A página pública não expõe telefone, e-mail nem observações internas.
- **LGPD**: política de privacidade pública, contato do encarregado configurável, histórico de autorização/**revogação** de uso de imagem, exportação dos dados do aluno (JSON) e **eliminação definitiva** (ficha, documentos no disco, frequência e avaliações), com trilha de auditoria sem dados pessoais
- **Assinaturas:** teste de 14 dias, tolerância de 5 dias e bloqueio automático; painel **Admin** (superadmin) para marcar pagamento, bloquear e liberar — veja [DEPLOY.md](DEPLOY.md)
- **Financeiro (superadmin):** histórico de pagamentos com comprovante anexado, estorno, mensalidade por academia, receita do mês, receita prevista (MRR), a vencer, em atraso e gráfico dos últimos 6 meses
- **Personalização:** cada academia escolhe a cor do app e envia o logo do grupo, que aparece de fundo no painel, na página dos pais e na ficha de inscrição
- Graduações e critérios configuráveis por academia (padrões prontos para algumas modalidades)

## Rodar (um clique)

Requisitos: **Python 3.11+** e **Node.js 20+**.

| Executável | Para quê |
|---|---|
| `iniciar-local.bat` (Windows) / `./iniciar-local.sh` | Sobe back-end + front-end só no seu computador (localhost) |
| `iniciar-ngrok.bat` (Windows) | Faz o mesmo **e** abre um túnel ngrok com link público para testar no celular de outra pessoa |

Na primeira vez os scripts criam o ambiente virtual, instalam as dependências e geram o `backend/.env`
com um `JWT_SECRET` aleatório. Depois sobem os servidores:

- Front-end: http://localhost:5173
- API: http://localhost:3333 (documentação interativa em `/docs`)

O front-end encaminha `/backend/*` para a API, então o app inteiro responde numa única porta (5173) — por isso um único túnel basta.

**ngrok:** instale em ngrok.com/download e rode uma vez `ngrok config add-authtoken SEU_TOKEN`. O `iniciar-ngrok.bat` mostra o link
público, copia para a área de transferência e abre no navegador. Qualquer pessoa com o link acessa o app: use só para teste e com dados fictícios.

Dados de exemplo (opcional, só para desenvolvimento):

```bash
cd backend
.venv\Scripts\python seed.py        # conta de teste simples; mostra o login ao final
.venv\Scripts\python seed_demo.py   # academia de capoeira COMPLETA e fictícia (30 alunos, chamada, avaliações,
                                    # inscrições, financeiro e clientes de exemplo); logins em backend/demo_login.txt
.venv\Scripts\python seed_demo.py --refazer   # apaga os dados demo e cria de novo
```

O `seed_demo.py` só roda em banco local (SQLite) e se recusa a gravar em banco remoto (Neon).
(Linux/macOS: use `.venv/bin/python`.)

### Rodar manualmente

```bash
# back-end
cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 3333

# front-end (outro terminal)
cd frontend && npm install && npm run dev
```

## Publicar na internet

Render (API + site) + Neon (PostgreSQL), tudo no plano gratuito: veja **[DEPLOY.md](DEPLOY.md)** e o `render.yaml`.

## Automações (Python / n8n)

Logado, chame `POST /auth/token-automacao` para obter um JWT de 1 ano e use
`Authorization: Bearer <token>` nas rotas `/api/*` (ex.: `GET /api/alunos`, `POST /api/aulas/{id}/chamada`).
Em produção, defina `JWT_SECRET` forte e `FRONTEND_URL` com o domínio real.

## Aviso

Os textos de termos (`frontend/src/termos.ts`) são um modelo inicial: peça revisão jurídica antes de usar com alunos reais.
Os textos de termos e a política de privacidade (`frontend/src/pages/Privacidade.tsx`) também são modelos.
Nunca versione `backend/.env`, o banco (`*.db`) nem `backend/uploads/` — já estão no `.gitignore`.
