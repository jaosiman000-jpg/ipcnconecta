# Segurança e LGPD — IPCN Conecta

Este documento registra as decisões técnicas do sistema. Ele não substitui a revisão jurídica e pastoral das regras de tratamento de dados da igreja.

## Fluxo de acesso

1. A pessoa cria uma conta com nome, e-mail, foto, atuação e senha individual.
2. O Firebase envia a verificação do e-mail.
3. A conta permanece pendente e só consegue ler o próprio perfil.
4. Administrador ou Conselho revisa a identidade, os papéis, as classes e as sociedades.
5. A aprovação ativa o perfil e gera um evento de auditoria.
6. Papéis e escopos são cumulativos no mesmo login.
7. Ninguém pode aprovar a própria conta, alterar os próprios papéis ou desativar a si mesmo.

## Controles já aplicados

- Firebase Authentication com senha individual e verificação de e-mail.
- Sessão limitada à aba/sessão do navegador, adequada ao computador compartilhado.
- Recuperação de senha pelo Firebase; o sistema nunca armazena a senha.
- Firestore regional em São Paulo, com proteção contra exclusão do banco.
- Regras do Firestore negam tudo por padrão.
- Dados administrativos separados em coleções com autorização por papel.
- Dados pastorais e documentos de membros separados dos dados gerais e acessíveis somente por Administrador e Conselho.
- Professores recebem somente as classes atribuídas; líderes recebem somente as sociedades atribuídas.
- Financeiro acessível somente por Administrador, Conselho e Tesouraria.
- Nove cenários de permissão validados pelo simulador oficial de regras do Firebase.
- Conta pendente não lista usuários, não lê auditoria e não promove o próprio acesso.
- Miniatura de perfil reduzida antes do envio, limitando a coleta e o tamanho do dado.
- Aceite versionado do aviso de privacidade no pedido de acesso.
- Cabeçalhos de segurança na Vercel e auditoria de dependências sem vulnerabilidades conhecidas.
- Service Worker limitado ao shell estático; APIs e respostas externas do Firebase não entram no cache PWA.
- CI público sem segredos: arquivos `.env`, configurações locais da Vercel e logs são ignorados pelo Git.
- Vercel Function inicial de diagnóstico sem acesso a dados pessoais.

## Pendências operacionais

- Ativar o plano Blaze, criar o bucket do Firebase Storage e publicar as regras de arquivos já preparadas.
- Aprovar com o Conselho as bases legais, os prazos de retenção e o canal para direitos dos titulares.
- Publicar o aviso de privacidade completo com identificação do controlador e contato responsável.
- Definir processo de correção, exportação, anonimização e eliminação quando legalmente aplicável.
- Definir resposta a incidentes e revisão periódica dos acessos.
- Migrar operações administrativas sensíveis para Vercel Functions quando as credenciais de servidor forem provisionadas com menor privilégio.

Os módulos administrativos usam o Firestore em tempo real. Enquanto o Firebase Storage não for ativado, documentos e comprovantes não poderão ser enviados.
