import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const itens = [
  ["/", "Início"],
  ["/inscricoes", "Inscrições"],
  ["/alunos", "Alunos"],
  ["/calendario", "Calendário"],
  ["/chamada", "Chamada"],
  ["/relatorios", "Relatórios"],
  ["/turmas", "Turmas"],
  ["/configuracoes", "Configurações"],
] as const;

export default function Layout() {
  const { me, sair } = useAuth();
  return (
    <div className="app">
      <aside className="menu">
        <div className="marca">
          <strong>{me!.academia.nome}</strong>
          <small>{me!.academia.modalidade}</small>
        </div>
        <nav>
          {itens.map(([to, nome]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {nome}
            </NavLink>
          ))}
        </nav>
        <div className="usuario">
          <small>{me!.usuario.nome}</small>
          <button className="link" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
