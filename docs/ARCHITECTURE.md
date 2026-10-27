# Arquitetura

## Visão geral

```mermaid
flowchart LR
  PWA[React PWA] --> AUTH[Firebase Authentication]
  PWA -->|leituras em tempo real| DB[Cloud Firestore]
  PWA -->|token Firebase + mutação| API[Vercel Functions]
  API -->|OIDC federado| GCP[Conta de serviço Google Cloud]
  GCP -->|escritas validadas| DB
  GCP -->|verificação de conta| AUTH
  PWA -. após ativação .-> FILES[Firebase Storage]
  GH[GitHub] --> CI[GitHub Actions]
  GH --> VERCEL[Vercel Deployments]
  VERCEL --> PWA
  VERCEL --> API
```

## Responsabilidades

- React/Vite: interface, navegação e controles visuais por permissão.
- Firebase Authentication: criação de conta, login, verificação de e-mail e recuperação de senha.
- Cloud Firestore: persistência e sincronização em tempo real.
- Firestore Rules: autorização de leitura por papel e escopo e bloqueio das escritas administrativas do navegador.
- Vercel Functions: `GET /api/health` para diagnóstico e `POST /api/mutations` para escritas autenticadas, autorizadas, validadas e auditadas.
- Workload Identity Federation: entrega à Function acesso temporário de menor privilégio, sem chave privada armazenada na Vercel ou no Git.
- Firebase Storage: documentos e comprovantes, ainda desativado até existir um bucket com regras publicadas.
- Service Worker: cache exclusivo do shell estático; não intercepta `/api` nem serviços externos do Firebase.

## Coleções principais

- `users`: perfis, papéis e escopos.
- `members`: dados gerais dos membros.
- `memberDirectory`: diretório mínimo para professores e líderes.
- `memberPrivate`: observações e documentos pastorais restritos.
- `visitors`: cadastro e acompanhamento de visitantes.
- `ebdClasses` e `attendance`: classes e chamadas da EBD.
- `societies` e `societyRequests`: sociedades e pedidos de inclusão.
- `financeEntries`: lançamentos financeiros.
- `audit`: histórico imutável de ações.
- `appSettings/general`: configurações gerais.

## Autorização

Administrador e Conselho são superusuários. Secretaria, Tesouraria, Professor, Líder e Acolhimento recebem apenas os módulos necessários. Papéis são cumulativos. Classes e sociedades também possuem escopos próprios.

## CI/CD

- Pull requests e pushes em `main` executam instalação limpa, testes, build e validação do PWA no GitHub Actions.
- A integração Git da Vercel cria previews para branches e pull requests.
- A branch `main` publica em produção após as validações configuradas na Vercel.
- Variáveis de ambiente permanecem na Vercel e no ambiente local; nunca entram no Git.

## Decisão de backend

Não há um servidor tradicional separado. Vercel Functions é o backend HTTP e escala sob demanda. Firebase continua como backend de autenticação, leituras em tempo real e arquivos.

O navegador pode criar o próprio perfil pendente e sincronizar a confirmação do próprio e-mail. Todas as outras escritas passam por `POST /api/mutations`. A Function valida o token Firebase, recarrega o perfil no Firestore, confere papel e escopo, valida o contrato da operação e grava o evento de auditoria no mesmo lote ou transação.

O procedimento de provisionamento e a ordem segura de publicação estão em [SECURE_FUNCTIONS.md](SECURE_FUNCTIONS.md).
