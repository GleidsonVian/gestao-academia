const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
const KEY = "academia_token";

export const token = {
  get: () => localStorage.getItem(KEY),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token.get()) headers.Authorization = `Bearer ${token.get()}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402 && auth) window.dispatchEvent(new Event("assinatura:bloqueada"));
    if (res.status === 401 && auth) {
      token.clear();
      window.dispatchEvent(new Event("auth:logout"));
    }
    const d = data.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : "Erro inesperado";
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export async function enviarInscricao(tk: string, dados: FormData): Promise<void> {
  const res = await fetch(`${BASE}/inscricao/${tk}`, { method: "POST", body: dados });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))).detail;
    throw new ApiError(res.status, typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : "Erro ao enviar");
  }
}

/** Busca uma imagem protegida (precisa do JWT) e devolve uma URL local para usar em img ou CSS. */
export async function urlDeImagemProtegida(path: string): Promise<string | null> {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token.get()}` } });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
/** URL publica (sem login) de uma imagem servida pela API. */
export const urlPublica = (path: string) => `${BASE}${path}`;

/** Envia um arquivo (multipart) para uma rota protegida. */
export async function enviarArquivo(path: string, arquivo: File, campo = "arquivo") {
  const fd = new FormData();
  fd.append(campo, arquivo);
  const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${token.get()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof data.detail === "string" ? data.detail : "Não foi possível enviar o arquivo");
  return data;
}

/** Baixa um arquivo protegido (precisa do JWT) e salva com o nome indicado. */
export async function baixarArquivo(path: string, nome: string) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token.get()}` } });
  if (!res.ok) throw new ApiError(res.status, "Não foi possível baixar");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

/** Baixa um arquivo protegido (precisa do JWT) e abre numa nova aba. */
export async function abrirDocumento(path: string) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token.get()}` } });
  if (!res.ok) throw new ApiError(res.status, "Não foi possível abrir o documento");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b ?? {}),
  put: <T>(p: string, b: unknown) => req<T>("PUT", p, b),
  del: <T>(p: string) => req<T>("DELETE", p),
  publico: <T>(p: string) => req<T>("GET", p, undefined, false),
  login: (email: string, senha: string) => req<{ access_token: string }>("POST", "/auth/login", { email, senha }, false),
  registrar: (b: Record<string, string>) => req<{ access_token: string }>("POST", "/auth/registrar", b, false),
};

// ---------- tipos ----------
export type Academia = { id: number; nome: string; modalidade: string; graduacoes: string[]; criterios: string[]; contato_privacidade: string | null };
export type ConsentimentoImagem = { autorizado: boolean; origem: "inscricao" | "painel"; observacao: string | null; termos_versao: string | null; em: string };
export type Assinatura = {
  status: "teste" | "ativa" | "suspensa" | "cancelada"; estado: "teste" | "ativa" | "tolerancia" | "vencida" | "suspensa" | "cancelada";
  acesso_ate: string | null; dias_restantes: number | null; bloqueada: boolean; tolerancia_dias: number; contato: string;
};
export type Aparencia = { cor_primaria: string | null; tem_logo: boolean; logo_versao: number; logo_opacidade: number };
export type Me = { usuario: { id: number; nome: string; email: string; is_superadmin: boolean }; assinatura: Assinatura; academia: Academia; aparencia: Aparencia };
export type AcademiaAdmin = {
  id: number; nome: string; modalidade: string; criada_em: string; email_dono: string | null; alunos: number; usuarios: number;
  status: Assinatura["status"]; acesso_ate: string | null; estado: Assinatura["estado"]; bloqueada: boolean; dias_restantes: number | null;
  valor_mensal_centavos: number | null; total_pago_centavos: number; ultimo_pagamento: string | null;
};
export type PagamentoAdmin = {
  id: number; academia_id: number; academia: string | null; valor_centavos: number; forma: string; data_pagamento: string;
  dias_concedidos: number; observacao: string | null; estornado: boolean; comprovante: { nome: string; tamanho: number } | null;
};
export type Receita = {
  mes_atual: number; mes_anterior: number; total_geral: number; serie: { mes: string; total_centavos: number }[];
  mrr_centavos: number; pagantes: number; sem_valor_definido: number; ticket_medio_centavos: number;
  a_vencer_7d: { academias: number; valor_centavos: number }; em_atraso: { academias: number; valor_centavos: number };
  em_teste: number; testes_expirados: number;
};
export const brl = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export type Turma = { id: number; nome: string; horario: string | null; alunos: number };
export type Aluno = {
  id: number; nome: string; apelido: string | null; nascimento: string | null; turma_id: number | null; turma: string | null;
  responsavel_nome: string | null; responsavel_telefone: string | null; email: string | null;
  graduacao: string | null; observacoes: string | null; status: "ativo" | "afastado" | "inativo";
  link_ativo: boolean; token_pais: string | null; autoriza_imagem: boolean | null;
};
export type Inscricao = {
  id: number; status: "pendente" | "aprovada" | "recusada"; nome: string; nascimento: string;
  responsavel_nome: string; responsavel_telefone: string; email: string | null; observacoes: string | null;
  autoriza_imagem: boolean; aluno_id: number | null; criado_em: string;
  termos_versao: string | null; aceite_em: string | null;
  documentos: { id: number; nome: string; tipo: string; tamanho: number }[];
};
export const linkInscricao = (tk: string) => `${window.location.origin}/inscricao/${tk}`;
export type Avaliacao = { id: number; data: string; notas: Record<string, number>; comentario: string | null; visivel_pais: boolean };
export type Frequencia = { presentes: number; faltas: number; justificadas: number; total: number; percentual: number | null };
export type StatusChamada = "presente" | "falta" | "justificada";
export type Presenca = { data: string; status: StatusChamada };
export type Aula = {
  id: number; data: string; hora: string | null; titulo: string; status: "programada" | "realizada" | "cancelada";
  turma_id: number | null; turma: string | null; presentes: number; faltas: number; justificadas: number;
};
export type Historico = { graduacao: string; data: string };
/** Frequência = presenças ÷ (presenças + faltas). Justificadas não entram. */
export const pct = (p: number | null | undefined) => (p === null || p === undefined ? "Sem registros" : `${p}%`);

export const fmtData = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const linkPais = (tk: string) => `${window.location.origin}/acompanhar/${tk}`;
