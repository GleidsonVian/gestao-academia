import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { preferenciaLogin } from "../sessao";

export default function Login() {
  const { me, entrar } = useAuth();
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [lembrar, setLembrar] = useState(preferenciaLogin.lembrar);
  const [f, setF] = useState({ academia: "", modalidade: "", nome: "", email: preferenciaLogin.email(), senha: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (me) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = modo === "login" ? await api.login(f.email, f.senha, lembrar) : await api.registrar({ ...f, lembrar });
      preferenciaLogin.salvar(lembrar, f.email.trim().toLowerCase());
      await entrar(r.access_token, lembrar);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="cartao" onSubmit={enviar}>
        <h1>Gestão de Academias</h1>
        <p className="mudo">{modo === "login" ? "Entre na sua conta" : "Cadastre sua academia"}</p>

        {modo === "registro" && (
          <>
            <label>Nome da academia<input name="academia" required value={f.academia} onChange={set("academia")} /></label>
            <label>
              Modalidade
              <input name="modalidade" required placeholder="Capoeira, Muay Thai, Kickboxing…" value={f.modalidade} onChange={set("modalidade")} />
            </label>
            <label>Seu nome<input name="nome" required autoComplete="name" value={f.nome} onChange={set("nome")} /></label>
          </>
        )}
        <label>E-mail<input name="email" type="email" required autoComplete="username" value={f.email} onChange={set("email")} /></label>
        <label>
          Senha
          <input
            name="password" type="password" required minLength={6}
            autoComplete={modo === "login" ? "current-password" : "new-password"} value={f.senha} onChange={set("senha")}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          Manter conectado neste aparelho (30 dias)
        </label>
        <p className="mudo" style={{ margin: "-.25rem 0 .75rem", fontSize: ".8rem" }}>
          Use só no seu celular ou computador. Sem marcar, a sessão termina ao fechar o navegador. Para salvar a senha, aceite a sugestão do seu navegador.
        </p>

        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={enviando}>{modo === "login" ? "Entrar" : "Criar conta"}</button>
        <button type="button" className="link" onClick={() => { setModo(modo === "login" ? "registro" : "login"); setErro(""); }}>
          {modo === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </div>
  );
}
