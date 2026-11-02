# IPCN Conecta

[![Qualidade](https://github.com/jaosiman000-jpg/ipcnconecta/actions/workflows/ci.yml/badge.svg)](https://github.com/jaosiman000-jpg/ipcnconecta/actions/workflows/ci.yml)

Sistema interno de gestão da Igreja Presbiteriana Cidade Nobre, construído para funcionar bem em computadores simples e celulares.

Produção: [ipcnconecta.vercel.app](https://ipcnconecta.vercel.app)

> Este repositório é público, mas a aplicação é privada. Nenhuma credencial, exportação do banco ou informação de membros deve ser adicionada ao Git.

## Capturas de tela

| Computador | Celular |
| --- | --- |
| ![Login do IPCN Conecta no computador](docs/screenshots/login-desktop.png) | ![Login do IPCN Conecta no celular](docs/screenshots/login-mobile.png) |

As capturas usam somente a tela pública de login e não exibem dados pessoais.

## Funcionalidades

- Login real com Firebase Authentication, verificação de e-mail e recuperação de senha.
- Cadastro somente por convite: o Conselho ou a Administração convida o e-mail, a pessoa cria a conta e a aprovação final continua manual.
- Limite de tentativas no cadastro e nas operações da API.
- Papéis cumulativos no mesmo login.
- Cadastro unificado de pessoas com vínculos independentes de membro, EBD e dízimos.
- Vinculação única entre a conta de login e o cadastro da pessoa, exigida durante a aprovação.
- Matrícula da EBD e número de membro gerados separadamente pelo servidor.
- Área pastoral restrita ao Conselho e Administração.
- Visitantes, consentimento e contato manual pelo WhatsApp.
- Classes, professores, alunos, chamadas aos domingos e relatórios da EBD.
- Sociedades internas UCP, UPA, UMP, UPH e SAF.
- Financeiro da Junta Diaconal com lotes de dízimos, ofertas e missões em dinheiro ou PIX.
- Relatórios e exportação de planilhas.
- Auditoria das alterações.
- Sincronização em tempo real entre computadores e celulares.
- PWA instalável com ícone da IPCN.
- Escritas administrativas validadas por uma Vercel Function em `POST /api/mutations`.
- Cadastro por convite em `POST /api/signup` e diagnóstico em `GET /api/health`.

Uploads de documentos e comprovantes já possuem código e regras preparados, mas permanecem desabilitados até a ativação segura do Firebase Storage.

## Papéis de acesso

| Papel | Acesso |
| --- | --- |
| Conselho | Acesso completo: ver e editar tudo, convidar e aprovar usuários, definir papéis |
| Secretaria | Mesmo acesso do Conselho; a diferença é só o nome, para organização |
| Diácono | Lança dízimos, ofertas e missões e consulta o financeiro. Não cancela lançamentos e não acessa Relatórios |
| Professor | Apenas a própria sala da Escola Dominical: chamada e acompanhamento dos alunos |
| Acolhimento | Apenas a aba Visitantes: cadastro, consulta e mensagem de contato |
| Líder de sociedade | Em espera: o módulo Sociedades está oculto e o papel não é oferecido nos convites |

O papel antigo **Administrador** foi substituído pelo Conselho. Contas que ainda o têm mantêm acesso total até serem convertidas em Configurações > "Converter para Conselho".

Itens sem permissão não aparecem na interface. As regras do Firestore repetem a autorização no banco; esconder um botão não é tratado como controle de segurança.

## Stack

- React 18 e TypeScript.
- Vite 6.
- React Router.
- Firebase Authentication.
- Cloud Firestore em tempo real.
- Firebase Storage preparado, aguardando ativação.
- Vercel Functions no runtime Node.js.
- PWA com Web App Manifest e Service Worker próprio.
- ExcelJS para exportações.
- Vitest para testes.
- GitHub Actions para integração contínua.
- Vercel para previews e produção.

## Arquitetura

Firebase é responsável pela autenticação, pelas leituras em tempo real e pelo armazenamento. As escritas administrativas passam por uma Vercel Function, que repete autenticação, autorização e validação no servidor. A Function acessa o Google Cloud por identidade federada OIDC, sem chave privada permanente. Não existe um servidor tradicional para manter ou dimensionar.

O Service Worker armazena somente HTML e arquivos estáticos. Ele ignora `/api` e todos os serviços externos do Firebase para não persistir dados pessoais ou pastorais no cache PWA.

Leia [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para o mapa completo de serviços, coleções, permissões e CI/CD.

## Executar localmente

Requisitos:

- Node.js 22, 23 ou 24.
- npm.
- Java 21 ou superior, necessário para o Firebase Emulator Suite (testes e desenvolvimento local).

Instalação:

```bash
git clone https://github.com/jaosiman000-jpg/ipcnconecta.git
cd ipcnconecta
npm install
```

**Desenvolvimento local isolado (recomendado).** Usa o Firebase Emulator Suite, sem tocar nos dados reais:

```bash
npm run emulators        # terminal 1: Auth e Firestore locais
npm run seed:emulator    # terminal 2: cria conselho@example.com / senha-de-teste-123
npm run dev:emulator     # terminal 2: app em http://localhost:5173
```

O frontend usa as regras reais de `firestore.rules`. Para testar também a API (`/api/*`) no emulador, rode `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run dev:vercel`; o modo emulador é ignorado em qualquer deployment da Vercel.

**Contra um projeto Firebase real.** Use um projeto de desenvolvimento, nunca o de produção:

```bash
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com a configuração pública do projeto Firebase de desenvolvimento:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_ENABLED=false
```

As variáveis `VITE_*` fazem parte da configuração pública do aplicativo web Firebase, mas ainda devem permanecer fora do Git para evitar mistura entre ambientes. As variáveis `GCP_*` são usadas somente pela Function e identificam a federação configurada em produção; elas não substituem nem contêm uma chave privada.

### Testar Vercel Functions localmente

```bash
npm install -g vercel@latest
vercel link
npm run dev:vercel
```

O frontend isolado funciona com `npm run dev`. O fluxo privilegiado de `POST /api/mutations` depende da identidade OIDC emitida em um deployment da Vercel. Não conecte um preview ou ambiente local ao banco de produção; para testes integrados, use um projeto Firebase separado e uma identidade própria para esse ambiente.

O provisionamento seguro da Function está documentado em [docs/SECURE_FUNCTIONS.md](docs/SECURE_FUNCTIONS.md).

## Validação

```bash
npm run check
```

Esse comando executa os testes unitários, os testes de regras e da API no Firestore Emulator (`npm run test:emulator`, exige Java), o build de produção e as validações do PWA.

## CI/CD

- A branch `main` é protegida: só recebe código por pull request com o check `Qualidade` aprovado.
- Pushes e pull requests executam o workflow de qualidade no GitHub Actions.
- Branches e pull requests recebem um preview da Vercel quando a integração Git está ativa.
- `main` é a branch de produção.
- As regras (`firestore.rules`) e os índices (`firestore.indexes.json`) são publicados manualmente com a CLI do Firebase **depois** do deploy do código que depende deles.
- Variáveis de ambiente são configuradas na Vercel; nenhum token de deploy fica no repositório.

## Estrutura principal

```text
api/                    Vercel Functions
docs/                   Arquitetura e capturas públicas
public/                 Logo, ícones, manifesto e Service Worker
scripts/                Validações auxiliares
src/app/                Firebase, estado, permissões e tipos
src/components/         Componentes compartilhados
src/pages/              Módulos do sistema
src/styles/             Estilos globais
firestore.rules         Autorização do banco
storage.rules           Autorização de arquivos
```

## Segurança e LGPD

Antes de alterar autenticação, permissões, dados pastorais, visitantes ou financeiro, leia [SECURITY_AND_LGPD.md](SECURITY_AND_LGPD.md).

Regras obrigatórias para contribuições:

- não usar dados reais em testes ou screenshots;
- não enviar `.env`, tokens, chaves privadas ou arquivos exportados;
- validar permissões na interface e no serviço de dados;
- executar `npm run check` antes de abrir um pull request.

Veja também [CONTRIBUTING.md](CONTRIBUTING.md).

## Estado atual e próximos passos

- Firestore e sincronização em tempo real: implementados.
- PWA e Service Worker seguro: implementados.
- CI no GitHub e deploy contínuo na Vercel: implementados.
- Firebase Storage: código e regras prontos, aguardando plano e bucket.
- Backup: recuperação pontual de 7 dias, backup diário (retenção de 7 dias) e semanal aos domingos (retenção de 14 semanas) no Firestore.
- Operações administrativas em Vercel Functions: publicadas em produção com identidade OIDC e sem chave privada permanente. Falta validar uma operação autenticada real antes de publicar as regras restritivas do Firestore.

Este projeto ainda é um MVP e deve passar por revisão técnica e jurídica antes de armazenar grandes volumes de dados reais.
