import { useState } from "react";
import { baixarArquivo } from "../api";
import { useAuth } from "../auth";

const TITULO = { vencida: "Sua assinatura venceu", suspensa: "Acesso suspenso", cancelada: "Assinatura cancelada" } as const;

/** Substitui o painel quando a assinatura está vencida (além da tolerância), suspensa ou cancelada. */
export default function Bloqueado() {
  const { me, recarregar } = useAuth();
  const a = me!.assinatura;
  const [msg, setMsg] = useState("");
  const titulo = TITULO[a.estado as keyof typeof TITULO] ?? "Acesso indisponível";

  async function exportar() {
    setMsg("");
    try {
      await baixarArquivo("/api/minha-academia/exportar", "academia-dados.json");
    } catch {
      setMsg("Não foi possível baixar agora. Tente novamente.");
    }
  }

  return (
    <div className="cartao bloqueio">
      <h1>{titulo}</h1>
      <p>
        O painel de <b>{me!.academia.nome}</b> está bloqueado no momento.
        {a.estado === "vencida" && " Regularize o pagamento para voltar a usar."}
        {a.estado !== "vencida" && " Fale com o responsável pelo sistema para reativar."}
      </p>
      <p className="mudo">Seus dados continuam guardados. Os links de inscrição e de acompanhamento dos pais ficam indisponíveis até a regularização.</p>
      {a.contato && <p><b>Contato:</b> {a.contato}</p>}
      <div className="acoes">
        <button className="primario" onClick={recarregar}>Já paguei, verificar de novo</button>
        <button onClick={exportar}>Baixar todos os meus dados (JSON)</button>
      </div>
      {msg && <p className="erro">{msg}</p>}
    </div>
  );
}
