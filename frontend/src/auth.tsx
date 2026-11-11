import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, token, type Me } from "./api";

type Ctx = {
  me: Me | null;
  carregando: boolean;
  entrar: (jwt: string) => Promise<void>;
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
    if (token.get()) recarregar();
    const onLogout = () => setMe(null);
    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("assinatura:bloqueada", recarregar);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("assinatura:bloqueada", recarregar);
    };
  }, [recarregar]);

  const entrar = async (jwt: string) => {
    token.set(jwt);
    await recarregar();
  };
  const sair = () => {
    token.clear();
    setMe(null);
  };

  return <AuthCtx.Provider value={{ me, carregando, entrar, sair, recarregar }}>{children}</AuthCtx.Provider>;
}
