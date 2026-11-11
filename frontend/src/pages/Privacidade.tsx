import { Link } from "react-router-dom";

// Modelo de partida: peça revisão jurídica antes de usar com alunos reais.
export default function Privacidade() {
  return (
    <div className="pais">
      <header>
        <h1>Política de privacidade</h1>
        <p className="mudo">Como a academia trata os dados pessoais dos alunos e dos responsáveis (Lei Geral de Proteção de Dados – LGPD, Lei 13.709/2018).</p>
      </header>

      <div className="cartao politica">
        <h2>1. Quem é o responsável pelos dados</h2>
        <p>A academia que você escolheu para a inscrição é a <b>controladora</b> dos dados. O contato para assuntos de privacidade aparece na ficha de inscrição e na página de acompanhamento. Este sistema atua como ferramenta de gestão a serviço da academia.</p>

        <h2>2. Quais dados são coletados</h2>
        <ul>
          <li><b>Do aluno:</b> nome, apelido, data de nascimento, graduação, turma, frequência às aulas e avaliações de desempenho.</li>
          <li><b>Do responsável:</b> nome, telefone e e-mail.</li>
          <li><b>De saúde (dado sensível):</b> condições, alergias, restrições e medicamentos informados na ficha, e documentos enviados (ex.: atestado).</li>
          <li><b>Imagem e voz:</b> somente se houver autorização, que é opcional.</li>
        </ul>

        <h2>3. Para que usamos e em que base legal</h2>
        <ul>
          <li>Matrícula, controle de frequência, acompanhamento da evolução e contato com o responsável: execução do serviço contratado e consentimento do responsável.</li>
          <li>Dados de saúde: usados apenas para a segurança do aluno nas atividades e em emergências, com o consentimento específico do responsável (LGPD, art. 11 e art. 14 para menores).</li>
          <li>Uso de imagem e voz: apenas com autorização expressa, que pode ser revogada a qualquer momento sem prejuízo à matrícula.</li>
        </ul>

        <h2>4. Com quem compartilhamos</h2>
        <p>Não vendemos dados. O acesso é restrito ao professor responsável. Os pais acessam apenas os dados do próprio aluno por um link exclusivo, que pode ser desativado ou renovado pela academia. A página dos pais <b>não</b> mostra telefone, e-mail nem observações internas. Prestadores de infraestrutura (hospedagem e banco de dados) tratam os dados apenas para manter o sistema funcionando.</p>

        <h2>5. Por quanto tempo guardamos</h2>
        <p>Enquanto o aluno estiver matriculado e pelo período necessário para obrigações legais. Inscrições recusadas devem ser apagadas pela academia. Ao final, os dados podem ser eliminados a pedido do titular.</p>

        <h2>6. Seus direitos</h2>
        <p>Você pode solicitar à academia, a qualquer momento: confirmação de que tratamos seus dados, acesso e cópia, correção, <b>eliminação</b> dos dados, portabilidade, informação sobre compartilhamento e <b>revogação</b> de consentimentos (inclusive o de imagem e voz). A academia consegue exportar uma cópia dos dados do aluno e eliminá-los definitivamente pelo sistema.</p>

        <h2>7. Segurança</h2>
        <p>O acesso ao painel exige login, os documentos enviados só podem ser abertos pelo professor autenticado e os dados trafegam por conexão segura quando o sistema é publicado com HTTPS. Em caso de incidente relevante, a academia comunicará os afetados e a ANPD conforme a lei.</p>

        <h2>8. Dúvidas ou pedidos</h2>
        <p>Fale com a academia pelo contato de privacidade informado na ficha ou na página de acompanhamento.</p>
      </div>

      <p><Link to="/entrar">← Voltar</Link></p>
    </div>
  );
}
