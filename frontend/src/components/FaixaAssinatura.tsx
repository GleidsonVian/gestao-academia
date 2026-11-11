import { useAuth } from "../auth";

/** Aviso no topo do painel: período de teste e tolerância após o vencimento. */
export default function FaixaAssinatura() {
  const { me } = useAuth();
  const a = me!.assinatura;
  const contato = a.contato ? ` Contato: ${a.contato}.` : "";
  if (a.estado === "teste" && a.dias_restantes !== null)
    return <div className="faixa">Período de teste: {a.dias_restantes === 0 ? "termina hoje" : `${a.dias_restantes} dia(s) restante(s)`}.{contato}</div>;
  if (a.estado === "tolerancia")
    return (
      <div className="faixa aviso">
        <b>Assinatura vencida.</b> Regularize em até {a.dias_restantes} dia(s) para não perder o acesso ao painel.{contato}
      </div>
    );
  return null;
}
