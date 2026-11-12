import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Alunos from "./pages/Alunos";
import AlunoDetalhe from "./pages/AlunoDetalhe";
import Chamada from "./pages/Chamada";
import Calendario from "./pages/Calendario";
import Relatorios from "./pages/Relatorios";
import Turmas from "./pages/Turmas";
import Configuracoes from "./pages/Configuracoes";
import Pais from "./pages/Pais";
import Inscricao from "./pages/Inscricao";
import Inscricoes from "./pages/Inscricoes";
import Privacidade from "./pages/Privacidade";
import Admin from "./pages/Admin";
import Uniformes from "./pages/Uniformes";
import "./styles.css";

function Protegido() {
  const { me, carregando } = useAuth();
  if (carregando) return <p className="centro">Carregando…</p>;
  return me ? <Layout /> : <Navigate to="/entrar" replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route path="/acompanhar/:token" element={<Pais />} />
          <Route path="/inscricao/:token" element={<Inscricao />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route element={<Protegido />}>
            <Route index element={<Dashboard />} />
            <Route path="inscricoes" element={<Inscricoes />} />
            <Route path="alunos" element={<Alunos />} />
            <Route path="alunos/:id" element={<AlunoDetalhe />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="chamada" element={<Chamada />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="uniformes" element={<Uniformes />} />
            <Route path="turmas" element={<Turmas />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
