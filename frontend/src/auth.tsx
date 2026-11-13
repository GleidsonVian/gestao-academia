import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, token, type Me } from "./api";
import { precisaRenovar } from "./sessao";

type Ctx = {
  me: Me | null;
  carregando: boolean;
  entrar: (jwt: string, persistir?: boolean) => Promise<void>;
  sair: () => void;
  recarregar: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [carregando, setCarregando] = useState(!!token.get());

  const recarregar = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/api/me"));
    } catch {
      setMe(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const atual = token.get();
    if (atual) {
      recarregar();
      // "manter conectado": quem usa o app não precisa entrar de novo; renova o login de 30 dias a cada dia de uso
      if (precisaRenovar(atual)) {
        api.post<{ access_token: string }>("/auth/renovar").then((r) => token.set(r.access_token, true)).catch(() => { /* segue com o atual */ });
      }
    }
    const onLogout = () => setMe(null);
    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("assinatura:bloqueada", recarregar);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("assinatura:bloqueada", recarregar);
    };
  }, [recarregar]);

  const entrar = async (jwt: string, persistir = false) => {
    token.set(jwt, persistir);
    await recarregar();
  };
  const sair = () => {
    token.clear();
    setMe(null);
  };

  return <AuthCtx.Provider value={{ me, carregando, entrar, sair, recarregar }}>{children}</AuthCtx.Provider>;
}
