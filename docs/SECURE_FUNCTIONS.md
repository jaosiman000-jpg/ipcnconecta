# Vercel Functions com identidade federada

Este projeto não usa arquivo JSON de conta de serviço. A Vercel emite um token OIDC de curta duração e o Google Cloud o troca por uma credencial temporária de uma conta de serviço dedicada.

## Recursos necessários

- Uma conta de serviço exclusiva para o IPCN Conecta.
- Um Workload Identity Pool e um provider OIDC no mesmo projeto Google Cloud do Firebase.
- Emissor OIDC da equipe Vercel, não o emissor global.
- Vínculo limitado ao projeto `ipcnconecta` e ao ambiente `production`.

## Produção provisionada

Recursos confirmados em 27 de outubro de 2026:

```text
Projeto Google Cloud: ipcnconecta (476524663325)
Workload Identity Pool: vercel-production
Provider OIDC: vercel-team
Conta de serviço: ipcn-vercel-functions@ipcnconecta.iam.gserviceaccount.com
Subject autorizado: owner:jaosiman000-jpgs-projects:project:ipcnconecta:environment:production
```

As APIs Security Token Service e IAM Service Account Credentials estão habilitadas. A conta de serviço não possui chaves permanentes. As cinco variáveis `GCP_*` estão configuradas somente no ambiente Production do projeto `ipcnconecta` na Vercel.

## Menor privilégio

A conta de serviço da Function recebe somente:

- `roles/datastore.user`, para ler e gravar o Firestore;
- `roles/firebaseauth.viewer`, para consultar a situação e a verificação do usuário no Firebase Authentication.

Não crie chaves para essa conta de serviço. O único principal autorizado a representá-la deve ser o subject OIDC da produção:

```text
owner:<equipe-vercel>:project:ipcnconecta:environment:production
```

O provider usa:

```text
Issuer: https://oidc.vercel.com/<equipe-vercel>
Audience: https://vercel.com/<equipe-vercel>
Attribute mapping: google.subject=assertion.sub
```

## Variáveis da Vercel

Configure estas variáveis apenas em Production:

```dotenv
GCP_PROJECT_ID=
GCP_PROJECT_NUMBER=
GCP_WORKLOAD_IDENTITY_POOL_ID=
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=
GCP_SERVICE_ACCOUNT_EMAIL=
```

`VERCEL_OIDC_TOKEN` é fornecida automaticamente pela plataforma e não deve ser criada manualmente. Não configure `GOOGLE_APPLICATION_CREDENTIALS`, chave privada ou conteúdo de JSON na Vercel.

Previews não devem receber acesso ao Firebase de produção. Quando houver um ambiente de homologação, ele deve usar outro projeto Firebase, outra conta de serviço e outro vínculo OIDC.

## Ordem segura de publicação

1. Criar a conta de serviço e a federação OIDC. **Concluído.**
2. Configurar as cinco variáveis `GCP_*` somente em Production. **Concluído.**
3. Publicar o frontend e a Function mantendo temporariamente as regras atuais do Firestore. **Concluído em 27 de outubro de 2026.**
4. Validar em produção uma operação controlada em cada perfil necessário.
5. Publicar `firestore.rules`, bloqueando as escritas administrativas diretas do navegador.
6. Repetir os testes de autorização e confirmar os eventos na coleção `audit`.

Essa ordem evita interromper o sistema caso a identidade federada ainda não esteja funcional. O deploy do código e a publicação das regras devem ser tratados como duas etapas distintas.
