# IPCN Conecta

## O que estamos construindo

Sistema interno de gestão da Igreja Presbiteriana Cidade Nobre. Contas, aprovação, permissões e módulos administrativos usam Firebase Authentication e Firestore em tempo real.

## Usuários e objetivos

- Administrador e Conselho: acesso total, inclusive usuários, permissões, documentos pastorais e financeiro.
- Secretaria: membros, visitantes, EBD, sociedades e relatórios, sem detalhes pastorais restritos.
- Junta Diaconal: registro e cancelamento justificado de contribuições, além dos relatórios financeiros.
- Professor: chamada e relatório apenas das próprias classes.
- Líder de sociedade: visualização das próprias sociedades e solicitação de inclusão de membro.
- Acolhimento: cadastro, consulta e contato manual de visitantes.

Os papéis são cumulativos. Uma pessoa usa um único login e vê a soma das funcionalidades autorizadas. Itens sem permissão não aparecem na navegação nem nas ações da tela.

## Escopo da primeira versão

- Login real, verificação de e-mail e solicitação de acesso.
- Painel com indicadores calculados a partir dos dados cadastrados.
- Cadastro unificado de pessoas, com vínculos independentes de membro, aluno da EBD e dizimista.
- Matrícula da EBD e número de membro gerados separadamente e em sequência pelo servidor.
- Visitantes com consentimento, link manual de WhatsApp e histórico de contato.
- Classes de EBD, alunos, professores, chamada e relatório.
- Sociedades internas, faixas etárias, diretoria e pedidos de inclusão.
- Financeiro da Junta Diaconal: lotes de dízimos, ofertas e missões, recebidos em dinheiro ou PIX, sem controle de saídas ou conta bancária.
- Usuários, aprovações, papéis cumulativos e escopos.
- Relatórios e exportação em planilha.
- Registro de auditoria das alterações.
- Sincronização dos módulos autorizados entre computadores e celulares.
- Upload protegido de documentos pastorais e comprovantes financeiros, condicionado à ativação do Firebase Storage.
- Aplicativo instalável como PWA com identidade da IPCN.
- CI no GitHub e deploy contínuo pela integração Git da Vercel.
- Vercel Functions como backend HTTP para operações que exigirem execução no servidor.

## Regras críticas

- Administrador e Conselho têm o mesmo acesso total.
- Ninguém aprova o próprio pedido, muda os próprios papéis ou desativa a si mesmo.
- O sistema não permite ficar sem nenhum Administrador ou membro do Conselho ativo.
- Observações e documentos de análise, disciplina ou exclusão são exclusivos de Administrador e Conselho.
- Somente Administrador e Conselho podem criar ou alterar o vínculo oficial de membro.
- Professores acessam somente as classes atribuídas.
- Líderes não incluem membros diretamente; enviam pedidos para aprovação.
- Lançamentos financeiros finalizados não são editados nem apagados; podem ser cancelados com justificativa e permanecem na auditoria.
- No computador compartilhado, cada pessoa encerra a sessão ao terminar.
- Contas, permissões e módulos permanecem sincronizados pelo Firebase.

## Fora do escopo desta etapa

- Sincronização offline entre dispositivos.
- Pagamentos, conciliação bancária e contabilidade completa.
- Envio automático de WhatsApp ou e-mail.

## Critério de qualidade

Interface leve, responsiva e compreensível em computadores simples e celulares. Código separado por domínio, sem abstrações desnecessárias, com permissões verificadas na interface e prontas para serem repetidas no backend.
