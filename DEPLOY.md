# Publicar na internet (Render + Neon, planos gratuitos)

- **Banco:** [Neon](https://neon.tech) (PostgreSQL)
- **API e site:** [Render](https://render.com), lendo o `render.yaml` deste repositório

Você faz os cadastros e cola os dados; o código já está preparado.

## 1. Criar o banco no Neon

1. Entre em neon.tech e crie um projeto (região mais próxima, ex.: São Paulo).
2. Na tela do projeto, clique em **Connect** e copie a **connection string**. Ela é parecida com:
   `postgresql://usuario:senha@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require`
3. Guarde essa string. Ela é uma senha: **não coloque no GitHub nem em prints**.

As tabelas são criadas sozinhas na primeira vez que a API sobe.

## 2. Criar os serviços no Render

1. No Render: **New → Blueprint** e conecte o repositório `GleidsonVian/gestao-academia`.
2. O Render lê o `render.yaml` e pede os valores marcados como secretos:
   - `DATABASE_URL`: a connection string do Neon.
   - `FRONTEND_URL` e `VITE_API_URL`: deixe em branco por enquanto (próximo passo).
3. Clique em **Apply**. Serão criados `gestao-academia-api` e `gestao-academia-web`.

## 3. Ligar um no outro (URLs)

Quando os dois terminarem o primeiro deploy, copie as URLs que o Render mostrar:

| Serviço | Variável | Valor |
|---|---|---|
| `gestao-academia-api` | `FRONTEND_URL` | URL do **site** (ex.: `https://gestao-academia-web.onrender.com`), sem barra no final |
| `gestao-academia-web` | `VITE_API_URL` | URL da **API** (ex.: `https://gestao-academia-api.onrender.com`), sem barra no final |

Salve cada uma e faça **Manual Deploy → Deploy latest commit** nos dois (o `VITE_API_URL` só vale no build do site).
Se o Render acrescentar sufixo ao nome por já existir, use a URL real que ele mostrar.

## 4. Primeiro acesso

1. Abra a URL do site → **Ainda não tenho conta** → cadastre a sua academia.
2. **Depois de criar a sua conta**, no serviço da API mude `REGISTRO_ABERTO` para `false` e salve.
   Assim ninguém mais consegue criar academias no seu sistema (o login continua normal).
3. Em **Configurações**, preencha o contato de privacidade (LGPD).
4. Teste o link de inscrição e o link dos pais pelo celular.

## Assinaturas, bloqueio e painel do dono (superadmin)

Cada academia tem um **status** (`teste`, `ativa`, `suspensa`, `cancelada`) e uma data **`acesso_ate`** (último dia de acesso).

- **Conta nova:** nasce em teste por **14 dias** (`TESTE_DIAS`).
- **Venceu:** entra em **tolerância de 5 dias** (`TOLERANCIA_DIAS`): tudo funciona e aparece um aviso.
- **Passou da tolerância, suspensa ou cancelada:** o painel fica bloqueado, e os links de inscrição e dos pais ficam indisponíveis. O login continua funcionando (para ver o aviso) e a exportação dos dados continua liberada (LGPD). Nada é apagado.
- O bloqueio é feito **na API** (rota por rota), não só na tela.

### Virar superadmin (só você)

Não existe tela para promover contas, de propósito. Crie a sua conta pelo site e depois, no **Neon → SQL Editor** (branch `production`), rode:

```sql
update usuarios set is_superadmin = true where email = 'SEU_EMAIL_AQUI';
```

Ao entrar, aparece o menu **Admin** (`/admin`): lista das academias com situação e vencimento, e botões **Pago +30d**, **Bloquear/Liberar** e **Editar** (status e data). O superadmin nunca é bloqueado e não vê dados de alunos. Toda mudança fica registrada na tabela `auditoria_admin`.

Use uma senha forte e única na conta de superadmin: ela controla todas as academias.

### Pagamentos e receita

No **Admin**, o botão **Registrar pagamento** grava valor, forma (Pix, boleto, cartão...), data, dias concedidos e observação, e pode anexar o **comprovante** (PDF, JPG ou PNG de até 5 MB, guardado no banco). Ele estende o acesso a partir do vencimento atual; desmarque *Estender o acesso* para só registrar um pagamento antigo. A aba **Pagamentos** lista o histórico (filtro por academia e mês, exportar CSV, estornar, trocar comprovante). Defina a **mensalidade** de cada academia em *Editar* para a receita prevista (MRR) ficar correta. Os registros ficam na tabela `pagamentos` do Neon.

### Aparência (cada academia)

Em **Configurações → Aparência**, a academia escolhe a cor do app e envia o logo (PNG, JPG ou WEBP de até 1 MB; imagens maiores são reduzidas no navegador). O logo aparece de fundo no painel, na página dos pais e na ficha de inscrição. SVG não é aceito, por segurança.

### Variáveis opcionais (API, em Environment)

| Variável | Padrão | Para quê |
|---|---|---|
| `TESTE_DIAS` | 14 | Dias de teste de contas novas |
| `TOLERANCIA_DIAS` | 5 | Dias de tolerância após vencer |
| `CONTATO_COBRANCA` | vazio | Texto exibido nos avisos (ex.: WhatsApp ou link de pagamento) |

## O que muda no plano gratuito

- **A API "dorme" após ~15 min sem uso.** O primeiro acesso depois disso demora cerca de 1 minuto. Os próximos são rápidos.
- **O Neon também suspende quando ocioso** (volta sozinho, com um pequeno atraso na primeira consulta).
- **Documentos enviados na inscrição ficam dentro do banco** (não em disco), porque o disco do Render gratuito é apagado a cada deploy/reinício. O Neon gratuito tem 0,5 GB: dá para milhares de fichas com atestados, mas fique de olho.
- **Backup:** o plano gratuito do Neon guarda só um histórico curto. Para dados reais, exporte o banco de tempos em tempos (`pg_dump`) ou use um plano pago.
- Se for usar com alunos reais, considere os planos pagos (a API não dorme e o banco tem mais recursos), um domínio próprio e revisão jurídica dos textos de LGPD.

## Variáveis de ambiente (resumo)

| Variável | Onde | Para quê |
|---|---|---|
| `DATABASE_URL` | API | Banco (Neon). Sem ela, usa SQLite local |
| `JWT_SECRET` | API | Segredo do login (o Render gera) |
| `FRONTEND_URL` | API | Origem(ns) permitidas (CORS). Pode ter várias, separadas por vírgula |
| `REGISTRO_ABERTO` | API | `false` fecha o cadastro de novas academias |
| `VITE_API_URL` | Site | Endereço da API (valor embutido no build) |
