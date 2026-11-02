# Segurança e LGPD — IPCN Conecta

Este documento registra as decisões técnicas do sistema. Ele não substitui a revisão jurídica e pastoral das regras de tratamento de dados da igreja.

## Fluxo de acesso

1. Administrador ou Conselho convida o e-mail da pessoa, com os papéis previstos. O convite vale por 14 dias e só pode ser usado uma vez.
2. A pessoa convidada cria a conta (nome, foto e senha individual) em `POST /api/signup`; o servidor cria o login e o perfil pendente. O navegador não escreve mais em `users`. O Firebase envia a verificação do e-mail.
3. A conta permanece pendente e só consegue ler o próprio perfil.
4. Administrador ou Conselho revisa a identidade, os papéis, as classes e as sociedades.
5. A aprovação ativa o perfil e gera um evento de auditoria.
6. Papéis e escopos são cumulativos no mesmo login.
7. Ninguém pode aprovar a própria conta, alterar os próprios papéis ou desativar a si mesmo.

## Controles já aplicados

- Cadastro fechado: sem convite válido para o e-mail não existe conta. Tentativas inválidas também contam no limite.
- Limite de tentativas por janela, gravado em `rateLimits` com IP e e-mail em hash (expiram por TTL): cadastro (por IP, por e-mail e global), operações da API (por IP e por usuário).
- O diretório de membros lido por professores e líderes contém somente membros ativos, com nome e nascimento; situação, número e tipo ficam apenas no cadastro completo.
- Backup do Firestore: recuperação pontual de 7 dias, backup diário (7 dias) e semanal (14 semanas).
- Testes automatizados das regras do Firestore (por perfil e coleção) e das operações da API em um emulador local, executados no CI.

- Firebase Authentication com senha individual e verificação de e-mail.
- Sessão limitada à aba/sessão do navegador, adequada ao computador compartilhado.
- Recuperação de senha pelo Firebase; o sistema nunca armazena a senha.
- Firestore regional em São Paulo, com proteção contra exclusão do banco.
- Regras do Firestore negam tudo por padrão.
- Dados administrativos separados em coleções com autorização por papel.
- Cadastro completo de pessoas restrito a Administrador, Conselho e Secretaria; professores recebem apenas o diretório das próprias classes e a Junta Diaconal recebe apenas o diretório mínimo de dizimistas.
- Matrículas da EBD e números de membro são gerados em transações no servidor; valores enviados pelo navegador não definem nem alteram a sequência.
- Dados pastorais e documentos de membros separados dos dados gerais e acessíveis somente por Administrador e Conselho.
- Professores recebem somente as classes atribuídas; líderes recebem somente as sociedades atribuídas.
- Financeiro acessível somente por Administrador, Conselho e Junta Diaconal.
- Contribuições são finalizadas em lotes imutáveis; cancelamentos exigem justificativa, preservam o histórico e deixam de compor os totais.
- Nove cenários de permissão validados pelo simulador oficial de regras do Firebase.
- Conta pendente não lista usuários, não lê auditoria e não promove o próprio acesso.
- Miniatura de perfil reduzida antes do envio, limitando a coleta e o tamanho do dado.
- Aceite versionado do aviso de privacidade no pedido de acesso.
- Cabeçalhos de segurança na Vercel e auditoria de dependências sem vulnerabilidades conhecidas.
- Service Worker limitado ao shell estático; APIs e respostas externas do Firebase não entram no cache PWA.
- CI público sem segredos: arquivos `.env`, configurações locais da Vercel e logs são ignorados pelo Git.
- Escritas administrativas centralizadas em Vercel Function com token Firebase obrigatório, e-mail verificado, conta ativa e autorização por papel e escopo.
- Contratos de entrada estritos, limite de 512 KB por mutação e rejeição de campos inesperados.
- Importação inicial limitada ao arquivo previamente conferido, com 210 registros, IDs e matrículas esperados, exclusão explícita e trava contra repetição.
- Auditoria gerada no servidor, sem aceitar identidade do autor enviada pelo navegador.
- Federação OIDC entre Vercel e Google Cloud: tokens curtos substituem arquivos JSON com chaves privadas permanentes.
- Conta de serviço dedicada com somente os papéis necessários para Firestore e consulta ao Firebase Authentication.
- Logs da Function registram identificadores técnicos e o tipo da operação, sem nomes, e-mails, telefones ou conteúdo pastoral.

## Pendências operacionais

- Ativar o plano Blaze, criar o bucket do Firebase Storage e publicar as regras de arquivos já preparadas.
- Aprovar com o Conselho as bases legais, os prazos de retenção e o canal para direitos dos titulares.
- Publicar o aviso de privacidade completo com identificação do controlador e contato responsável.
- Definir processo de correção, exportação, anonimização e eliminação quando legalmente aplicável.
- Definir resposta a incidentes e revisão periódica dos acessos.
- Ativar, no Identity Platform, a opção que desabilita o cadastro direto pelo cliente do Firebase Auth (o cadastro já é impedido de gerar perfil, mas contas sem perfil ainda podem ser criadas na API pública).
- Adicionar uma regra de rate limit no Vercel Firewall como camada extra antes da Function.
- Definir e testar o procedimento de restauração a partir dos backups.

Os módulos administrativos usam o Firestore em tempo real. Enquanto o Firebase Storage não for ativado, documentos e comprovantes não poderão ser enviados.
