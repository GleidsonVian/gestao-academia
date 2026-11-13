// Ajudantes da sessão ("manter conectado"). Nunca guardamos a SENHA: só o token de acesso.
// A senha quem salva é o gerenciador de senhas do próprio navegador (por isso os campos têm autocomplete).

export type DadosJwt = { exp?: number; iat?: number; lem?: boolean };

/** Lê os dados do token (sem validar a assinatura: quem valida é o servidor). */
export function lerJwt(t: string): DadosJwt | null {
  try {
    const parte = t.split(".")[1];
    if (!parte) return null;
    const b64 = parte.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(bin) as DadosJwt;
  } catch {
    return null;
  }
}

const UM_DIA = 24 * 3600;

/** Só renova login "manter conectado" com mais de 1 dia de vida e que ainda não expirou. */
export function precisaRenovar(t: string, agora = Date.now() / 1000): boolean {
  const d = lerJwt(t);
  return !!d && d.lem === true && typeof d.iat === "number" && typeof d.exp === "number" && agora - d.iat > UM_DIA && d.exp > agora;
}

const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem lembrar */ } };
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const apagar = (k: string) => { try { localStorage.removeItem(k); } catch { /* ok */ } };

/** Preferência da tela de login: lembrar o e-mail e a escolha de "manter conectado". */
export const preferenciaLogin = {
  lembrar: () => ler("login_lembrar") === "1",
  email: () => (ler("login_lembrar") === "1" ? ler("login_email") ?? "" : ""),
  salvar(lembrar: boolean, email: string) {
    if (lembrar) { guardar("login_lembrar", "1"); guardar("login_email", email); }
    else { apagar("login_lembrar"); apagar("login_email"); }
  },
};
