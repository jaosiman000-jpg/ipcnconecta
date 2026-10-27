# Como contribuir

O IPCN Conecta trata dados pessoais e informações pastorais. Toda alteração deve preservar o princípio de menor acesso possível.

## Fluxo recomendado

1. Crie uma branch a partir de `main`.
2. Faça uma alteração pequena e bem delimitada.
3. Execute `npm run check`.
4. Abra um pull request explicando o comportamento alterado e como ele foi testado.
5. Aguarde a validação automática e o preview da Vercel antes da aprovação.

## Regras de segurança

- Nunca envie `.env`, chaves de serviço, tokens, senhas ou exportações do Firebase.
- Nunca use dados reais de membros, visitantes ou usuários em testes e screenshots.
- Alterações de permissões devem atualizar e testar as regras do Firestore.
- Dados pastorais restritos não podem ser movidos para coleções públicas ou caches locais.
- O Service Worker só pode armazenar arquivos estáticos; respostas de `/api` e do Firebase ficam fora do cache.
- Não altere produção diretamente pelo console sem registrar a mudança no repositório.

## Convenções

- React e TypeScript, com componentes simples e separados por domínio.
- Evite abstrações sem uso concreto.
- Textos visíveis ao usuário ficam em português do Brasil.
- Preserve o padrão visual documentado em `DESIGN.md`.
- Commits devem descrever a mudança com clareza.

## Desenvolvimento local

Use `npm run dev` para trabalhar somente no frontend. Use `npm run dev:vercel` quando precisar testar as rotas de `api/`.
