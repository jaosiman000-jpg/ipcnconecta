import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LEGAL_VERSION_LABEL } from '../app/legal'

function LegalLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <div className="legal-page">
      <article className="legal-card">
        <Link to="/login" className="legal-back"><ArrowLeft size={17} /> Voltar</Link>
        <img className="legal-logo" src="/ipcn-logo.png" alt="Igreja Presbiteriana Cidade Nobre" />
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-meta">Versão de {LEGAL_VERSION_LABEL}</p>
        <p className="legal-intro">{intro}</p>
        {children}
        <nav className="legal-links" aria-label="Documentos">
          <Link to="/termos">Termos de Uso</Link>
          <Link to="/privacidade">Política de Privacidade</Link>
        </nav>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h2>{title}</h2>{children}</section>
}

export function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Documento"
      title="Termos de Uso do IPCN Conecta"
      intro="Estes termos explicam as regras para usar o IPCN Conecta, o sistema de gestão da Igreja Presbiteriana Cidade Nobre. Ao criar a conta e marcar a caixa de aceite, você declara que leu e concorda com eles."
    >
      <Section title="1. O que é o sistema">
        <p>O IPCN Conecta é uma ferramenta de uso interno, criada para apoiar o cuidado com as pessoas e a administração da igreja: cadastro de membros e visitantes, Escola Dominical, controle financeiro, relatórios e gestão de acessos. Não é um site público nem uma rede social.</p>
      </Section>
      <Section title="2. Quem pode usar">
        <p>O acesso é restrito a pessoas convidadas pelo Conselho ou pela Secretaria. Para entrar, você precisa criar a conta com o mesmo e-mail do convite, confirmar esse e-mail e aguardar a liberação do seu acesso.</p>
        <p>A igreja define quais áreas cada pessoa pode ver e editar, de acordo com a função que ela exerce. O acesso pode ser concedido, alterado ou encerrado a qualquer momento, sempre de acordo com as necessidades do trabalho.</p>
      </Section>
      <Section title="3. Sua conta">
        <ul>
          <li>A conta é pessoal e intransferível. Não compartilhe sua senha nem permita que outra pessoa use o seu acesso.</li>
          <li>Escolha uma senha forte e que você não use em outros serviços.</li>
          <li>Se suspeitar que alguém conhece a sua senha ou usou a sua conta, troque a senha e avise imediatamente a Secretaria ou o Conselho.</li>
          <li>Você é responsável pelas ações feitas com a sua conta.</li>
          <li>Mantenha seus dados de perfil (nome e foto) verdadeiros e atualizados.</li>
        </ul>
      </Section>
      <Section title="4. Como usar o sistema">
        <p>Use o sistema apenas para as atividades da igreja relacionadas à sua função. É proibido:</p>
        <ul>
          <li>acessar, consultar ou copiar informações por curiosidade ou para fins pessoais, sem relação com a sua função;</li>
          <li>divulgar, vender, repassar ou publicar dados do sistema fora do que a igreja autoriza;</li>
          <li>inserir informações falsas ou lançamentos sem base real;</li>
          <li>tentar burlar controles de segurança, acessar áreas não liberadas ou usar a conta de outra pessoa;</li>
          <li>sobrecarregar o sistema ou usar programas automáticos para acessá-lo.</li>
        </ul>
      </Section>
      <Section title="5. Sigilo e dados de outras pessoas">
        <p>O sistema reúne informações de membros, visitantes, crianças e adolescentes e da vida financeira da igreja. Essas informações são confidenciais. Ao usar o sistema, você se compromete a:</p>
        <ul>
          <li>tratar os dados com respeito, discrição e cuidado pastoral;</li>
          <li>usar planilhas e relatórios exportados somente para a finalidade que os motivou, guardá-los em local seguro e apagá-los quando não forem mais necessários;</li>
          <li>não enviar dados do sistema por canais inseguros ou para quem não tenha autorização.</li>
        </ul>
        <p>O dever de sigilo continua mesmo depois que o seu acesso for encerrado.</p>
      </Section>
      <Section title="6. Registro de atividades">
        <p>Para a segurança de todos, o sistema registra as ações importantes (por exemplo, cadastros, alterações, lançamentos financeiros e mudanças de acesso), indicando quem fez e quando. Esses registros podem ser consultados por quem a igreja autorizar e usados para apurar erros, abusos ou incidentes de segurança.</p>
      </Section>
      <Section title="7. Disponibilidade e limites">
        <p>A igreja se esforça para manter o sistema disponível e os dados protegidos, inclusive com cópias de segurança. Ainda assim, o sistema pode ficar indisponível por manutenção, falhas de internet ou de serviços de terceiros, e não há garantia de funcionamento ininterrupto. Confira sempre as informações importantes, como valores financeiros, antes de tomar decisões a partir delas.</p>
      </Section>
      <Section title="8. Suspensão e encerramento do acesso">
        <p>O acesso pode ser suspenso ou encerrado, a qualquer momento, quando a pessoa deixar a função, em caso de descumprimento destes termos, por suspeita de uso indevido ou por decisão do Conselho. Ao ser desativada, a conta perde o acesso ao sistema imediatamente.</p>
      </Section>
      <Section title="9. Propriedade das informações">
        <p>As informações cadastradas no sistema pertencem à Igreja Presbiteriana Cidade Nobre e são tratadas conforme a <Link to="/privacidade">Política de Privacidade</Link>. O sistema e os seus recursos são mantidos pela igreja e não podem ser copiados ou redistribuídos.</p>
      </Section>
      <Section title="10. Mudanças nestes termos">
        <p>Estes termos podem ser atualizados. Quando houver mudança relevante, a nova versão será publicada nesta página, com a data de atualização, e poderá ser pedido um novo aceite.</p>
      </Section>
      <Section title="11. Legislação e contato">
        <p>Estes termos seguem as leis do Brasil. Dúvidas, sugestões ou comunicação de problemas devem ser encaminhadas à Secretaria ou ao Conselho da Igreja Presbiteriana Cidade Nobre.</p>
      </Section>
    </LegalLayout>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Documento"
      title="Política de Privacidade do IPCN Conecta"
      intro="Esta política explica, em linguagem simples, quais dados pessoais o IPCN Conecta usa, para quê, com quem são compartilhados, como são protegidos e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD)."
    >
      <Section title="1. Quem é responsável pelos dados">
        <p>A responsável pelos dados tratados no sistema (a “controladora”, na LGPD) é a Igreja Presbiteriana Cidade Nobre. Para qualquer assunto sobre dados pessoais, fale com a Secretaria ou com o Conselho da igreja.</p>
      </Section>
      <Section title="2. Quais dados são tratados">
        <ul>
          <li><strong>Conta de acesso:</strong> nome, e-mail, foto de perfil, função na igreja e data do aceite destes textos. A senha é guardada de forma protegida pelo serviço de autenticação e não pode ser lida por ninguém da igreja.</li>
          <li><strong>Cadastro de pessoas e membros:</strong> nome, data de nascimento, telefones, e-mail, endereço, sexo, estado civil, naturalidade, nacionalidade, nome do pai e da mãe, e situação de membro (tipo, status e data de ingresso).</li>
          <li><strong>Escola Dominical:</strong> alunos e professores, classes, matrícula e presença, incluindo dados de crianças e adolescentes.</li>
          <li><strong>Visitantes:</strong> nome, telefone, data de nascimento (se informada), data da visita, registro de contato e se a pessoa autorizou ou não receber contato.</li>
          <li><strong>Financeiro:</strong> contribuições (dízimos, ofertas e missões) com data, valor, forma de pagamento e, quando for o caso, a pessoa que contribuiu.</li>
          <li><strong>Segurança e uso:</strong> registros de atividades (quem fez o quê e quando) e informações técnicas usadas para limitar tentativas excessivas de acesso. Esses dados técnicos são guardados de forma que não permite ler o endereço de origem e são apagados automaticamente depois de pouco tempo.</li>
        </ul>
        <p>Informações sobre a situação de membro de uma pessoa podem revelar a sua convicção religiosa, que a LGPD considera um dado sensível e que, por isso, recebe cuidado reforçado.</p>
      </Section>
      <Section title="3. Para que os dados são usados">
        <ul>
          <li>Cuidar das pessoas: manter o cadastro de membros e visitantes, acompanhar a vida da igreja e entrar em contato quando houver autorização.</li>
          <li>Organizar a Escola Dominical e os demais ministérios.</li>
          <li>Administrar as finanças da igreja e prestar contas.</li>
          <li>Controlar quem pode acessar o sistema e proteger as informações.</li>
          <li>Cumprir obrigações legais e apurar incidentes de segurança.</li>
        </ul>
        <p>Os dados não são usados para publicidade, nem vendidos ou cedidos para fins comerciais.</p>
      </Section>
      <Section title="4. Por que a igreja pode tratar esses dados">
        <p>Em linhas gerais, o tratamento se apoia no desenvolvimento das atividades da própria igreja junto aos seus membros e pessoas que mantêm contato regular com ela, no consentimento (por exemplo, o contato com visitantes e a autorização dos responsáveis por crianças), no cumprimento de obrigações legais e fiscais e na proteção das informações e do próprio sistema.</p>
      </Section>
      <Section title="5. Crianças e adolescentes">
        <p>Dados de crianças e adolescentes são tratados somente no que for necessário para a Escola Dominical e a vida da igreja, sempre no melhor interesse deles e com o conhecimento e a autorização de seus pais ou responsáveis. Esses dados ficam acessíveis apenas a quem precisa deles para a função.</p>
      </Section>
      <Section title="6. Quem pode ver os dados">
        <p>O acesso dentro da igreja depende da função de cada pessoa. De modo geral:</p>
        <ul>
          <li><strong>Conselho e Secretaria:</strong> acesso completo ao sistema.</li>
          <li><strong>Diácono:</strong> informações financeiras e de contribuintes.</li>
          <li><strong>Professor:</strong> classes da Escola Dominical e a lista de presença.</li>
          <li><strong>Acolhimento:</strong> cadastro de visitantes.</li>
        </ul>
        <p>Cada pessoa vê somente o que a sua função exige.</p>
      </Section>
      <Section title="7. Compartilhamento com terceiros">
        <p>A igreja não vende nem repassa dados pessoais para terceiros com fins comerciais. Para que o sistema funcione, são usados serviços de tecnologia contratados, que atuam como operadores e tratam os dados apenas para essa finalidade:</p>
        <ul>
          <li>Google (Firebase), para login e armazenamento do banco de dados e das cópias de segurança;</li>
          <li>Vercel, para a hospedagem do sistema;</li>
          <li>BrasilAPI, serviço público de consulta de CEP: ao digitar um CEP no cadastro, o navegador envia a ele apenas o número do CEP (sem nome ou qualquer outro dado) para trazer rua, bairro e cidade.</li>
        </ul>
        <p>O banco de dados do sistema fica em servidores no Brasil (região de São Paulo). Esses provedores podem, em situações específicas, tratar informações também fora do país, como os dados de login, sempre com as garantias de segurança que oferecem aos seus clientes. Dados também podem ser fornecidos a autoridades quando a lei exigir.</p>
      </Section>
      <Section title="8. Como protegemos os dados">
        <ul>
          <li>Acesso individual, com e-mail confirmado e liberação prévia pelo Conselho ou pela Secretaria.</li>
          <li>Permissões separadas por função, aplicadas também no próprio banco de dados.</li>
          <li>Contas desativadas perdem o acesso imediatamente.</li>
          <li>Conexão criptografada e limites contra tentativas excessivas de acesso.</li>
          <li>Registro das ações importantes para auditoria.</li>
          <li>Cópias de segurança automáticas, para recuperar dados em caso de erro ou falha.</li>
        </ul>
        <p>Nenhum sistema é totalmente imune a falhas. Caso ocorra um incidente que possa trazer risco relevante às pessoas, a igreja tomará as providências cabíveis, inclusive comunicando os envolvidos e a Autoridade Nacional de Proteção de Dados quando a lei exigir.</p>
      </Section>
      <Section title="9. Por quanto tempo guardamos os dados">
        <p>Os dados são mantidos pelo tempo necessário para as finalidades acima e para cumprir obrigações legais. Em especial:</p>
        <ul>
          <li>registros financeiros e contábeis são guardados pelo prazo exigido pela legislação aplicável;</li>
          <li>o cadastro de membros é mantido enquanto a pessoa tiver vínculo com a igreja e, depois, pelo tempo necessário para o histórico e os registros da igreja, respeitada a lei;</li>
          <li>dados de visitantes são mantidos enquanto houver autorização de contato e finalidade, e podem ser apagados quando a pessoa pedir;</li>
          <li>registros de atividades são mantidos pelo tempo necessário à segurança e à auditoria.</li>
        </ul>
        <p>Terminado o prazo, os dados são apagados ou anonimizados, salvo quando a lei permitir ou exigir que sejam guardados.</p>
      </Section>
      <Section title="10. Seus direitos">
        <p>Você pode, a qualquer momento, pedir à igreja:</p>
        <ul>
          <li>a confirmação de que seus dados são tratados e o acesso a eles;</li>
          <li>a correção de dados incompletos, errados ou desatualizados;</li>
          <li>a eliminação ou anonimização de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>a portabilidade dos dados, nos termos da lei;</li>
          <li>informações sobre com quem os dados são compartilhados;</li>
          <li>a revogação do consentimento, quando o tratamento depender dele;</li>
          <li>a revisão de decisões tomadas apenas de forma automatizada, se houver.</li>
        </ul>
        <p>Para exercer esses direitos, procure a Secretaria ou o Conselho. Em alguns casos, a lei obriga a igreja a manter certas informações, e ela explicará o motivo se não puder atender integralmente a um pedido.</p>
      </Section>
      <Section title="11. Armazenamento no seu aparelho">
        <p>O sistema usa o armazenamento do seu navegador somente para manter o login, guardar preferências e permitir o funcionamento como aplicativo instalado. Não usamos ferramentas de publicidade nem de rastreamento do seu comportamento de navegação.</p>
      </Section>
      <Section title="12. Mudanças nesta política">
        <p>Esta política pode ser atualizada para acompanhar mudanças no sistema ou na lei. A versão em vigor e a sua data ficam sempre indicadas no início desta página.</p>
      </Section>
    </LegalLayout>
  )
}
