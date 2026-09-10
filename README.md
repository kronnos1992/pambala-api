# Pambala API

Backend REST API para o marketplace Pambala — a maior plataforma de compra e venda de Angola.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Hono
- **ORM:** Prisma 7 (via `@prisma/adapter-libsql`)
- **Base de dados:** SQLite (desenvolvimento) / PostgreSQL (produção)
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Autorização (RBAC):** roles + responsabilidades dinâmicas (M:N por utilizador)
- **Validação:** Zod
- **Imagens:** Cloudinary (com fallback para armazenamento local)
- **OCR/IA:** tesseract.js (recibos) + OpenRouter/OpenAI (traduções e leitura de recibos)

## Estrutura

```
src/
├── index.ts              # Entrypoint do servidor (monta módulos + middleware)
├── seed.ts               # Seed com 150 produtos, 12 categorias, 3 lojas
├── seed-rbac.ts          # Seed de roles/responsabilidades + migração M:N de utilizadores
├── modules/              # Cada módulo expõe as suas rotas (Hono)
│   ├── auth/             # Registo, login, perfil (inclui social auth)
│   ├── products/         # CRUD + busca + filtros + categorySlug
│   ├── categories/       # Árvore de categorias
│   ├── stores/           # Lojas + mapa + produtos
│   ├── cart/             # Carrinho de compras
│   ├── orders/           # Pedidos + estados + seller orders
│   ├── reviews/          # Avaliações
│   ├── uploads/          # Upload de imagens (Cloudinary → local)
│   ├── roles/            # Consulta e gestão de roles/responsabilidades
│   ├── admin/            # Dashboard admin (stats, CRUD completo)
│   ├── security/         # Handshake E2E (tweetnacl)
│   ├── translations/     # Tradução de conteúdo (OpenRouter)
│   └── fiscal/           # Faturação AGT (perfil fiscal, séries, facturas)
├── handlers/             # Lógica de negócio desacoplada das rotas
│   ├── roles.handlers.ts     # CRUD de roles + responsabilidades
│   ├── uploads.handlers.ts   # Upload Cloudinary com fallback local
│   ├── translations.handlers.ts
│   └── ...               # Demais handlers por domínio
├── security/
│   └── e2e-manager.ts    # Gere sessões E2E + cifra/decifra de payloads
├── lib/
│   ├── prisma.ts         # Cliente Prisma (singleton)
│   ├── auth.ts           # JWT + middleware de auth
│   ├── permissions.ts    # Catálogo PERMISSIONS + primitivas de RBAC (cache, hasPermission, assertPermission)
│   ├── cloudinary.ts     # Cliente Cloudinary (Basic Auth)
│   ├── receiptValidation.ts
│   ├── social-auth.ts    # Login social (Google/Facebook)
│   ├── types.ts
│   └── validators.ts     # Schemas Zod
└── shared/               # mediator, filters (auth, admin, permission), erros e middleware
```

## Setup

```bash
# Instalar dependências
npm install

# Gerar cliente Prisma
npx prisma generate

# Criar base de dados
npx prisma db push

# Popular com dados de exemplo
npx tsx src/seed.ts

# Popular roles/responsabilidades de sistema + migrar utilizadores legados (BUYER → CLIENT)
npx tsx src/seed-rbac.ts   # (ou npm run db:seed:rbac)

# Iniciar servidor
npx tsx src/index.ts
```

A API fica disponível em `http://localhost:3001`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL da base de dados (PostgreSQL em produção) |
| `JWT_SECRET` | Sim | Segredo para assinar tokens JWT |
| `PORT` | Não | Porta do servidor (default `3001`) |
| `UPLOAD_DIR` | Não | Diretório de fallback local dos uploads (default `./uploads`) |
| `CLOUDINARY_CLOUD_NAME` | Não* | Cloudinary (Dashboard → Product Environments) |
| `CLOUDINARY_API_KEY` | Não* | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | Não* | Cloudinary API Secret |
| `OPENAI_API_KEY` | Não | OpenRouter key (agente de tradução) |
| `OPENAI_BASE_URL` | Não | Default `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | Não | Modelo para o agente de tradução |

\* Cloudinary é opcional: sem as variáveis, os uploads caem automaticamente no armazenamento local (`UPLOAD_DIR`).

### Upload de imagens (Cloudinary ↔ local)

O fluxo de upload `POST /api/uploads` tenta primeiro o Cloudinary (Basic Auth com `cloud_name` + `api_key` + `api_secret`). Se o upload falhar ou as credenciais não estiverem definidas, cai para o diretório local. A resposta é sempre:

```json
{ "url": "<secure_url ou /uploads/...>", "publicId": "<id cloudinary ou nome do ficheiro>", "filename": "<nome original>" }
```

- `url` começa com `http(s)` quando servida pelo Cloudinary, senão é o caminho relativo (`/uploads/...`).
- `.env` e `.env.example` — copie o exemplo e preencha os valores reais; **nunca commite `.env`**.

## Credenciais de teste

| Utilizador | Email | Password | Role |
|-----------|-------|----------|------|
| Admin | admin@pambala.ao | admin123 | ADMIN |
| Vendedor | vendedor@pambala.ao | seller123 | SELLER |
| Comprador | comprador1@pambala.ao | buyer123 | CLIENT |

> **Nota:** a role legada `BUYER` foi migrada para `CLIENT` (ver [Roles e Permissões](#roles-e-permissões-rbac)).

## Roles e Permissões (RBAC)

O sistema usa **roles dinâmicas** com responsabilidades M:N por utilizador (`UserRole`); a role `User.role` é apenas a denominação primária (default `CLIENT`). As permissões são carregadas da BD a cada pedido no `auth.filter.ts`, pelo que mudanças de roles têm efeito imediato (sem necessidade de novo login).

### Modelo

- `Responsibility` — acção (ex.: `products.manage`). `id` = `key`. `isSystem` impede eliminação.
- `Role` — conjunto de responsabilidades (`RoleResponsibility`). `isSystem` impede eliminação; roles com utilizadores atribuídos não podem ser eliminadas.
- `UserRole` — M:N entre `User` e `Role`.

### Catálogo de permissões (`src/lib/permissions.ts`)

| Permissão | Descrição |
|-----------|-----------|
| `admin.access` | Aceder à área administrativa |
| `admin.roles.manage` | Gerir roles e responsabilidades |
| `admin.users.manage` | Gerir utilizadores |
| `admin.orders.manage` | Gerir todos os pedidos |
| `admin.stores.manage` | Gerir lojas (verificação/eliminação) |
| `admin.products.manage` | Gestão global de produtos |
| `admin.categories.manage` | Gerir categorias |
| `admin.reviews.manage` | Gerir avaliações |
| `stores.create` | Criar uma loja |
| `stores.manage` | Gerir a própria loja (produtos, pedidos) |
| `products.manage` | Criar/editar produtos da própria loja |
| `orders.view` | Ver pedidos da própria loja |
| `orders.respond-payment` | Responder/validar pagamentos de pedidos |
| `orders.confirm-payment` | Confirmar pagamento final |
| `translations.translate` | Utilizar o agente de tradução |
| `fiscal.settings.manage` | Gerir configuração fiscal da plataforma |
| `fiscal.profile.manage` | Gerir perfil fiscal da própria loja |
| `fiscal.series.manage` | Gerir séries de faturação da própria loja |
| `fiscal.invoices.view` | Ver facturas da própria loja |
| `fiscal.invoices.manage` | Emitir/forçar comunicação AGT de facturas |

### Roles de sistema (seed)

| Role | Responsabilidades |
|------|-------------------|
| `ADMIN` | Todas |
| `MANAGER` | `stores.create`, `stores.manage`, `products.manage`, `orders.view`, `orders.respond-payment`, `translations.translate`, `fiscal.profile.manage`, `fiscal.series.manage`, `fiscal.invoices.view`, `fiscal.invoices.manage` |
| `SELLER` | `stores.manage`, `products.manage`, `orders.view`, `orders.respond-payment`, `translations.translate`, `fiscal.profile.manage`, `fiscal.series.manage`, `fiscal.invoices.view`, `fiscal.invoices.manage` |
| `CLIENT` | Nenhuma (compra) |

### Regras

- Registo, login e social auth criam sempre utilizadores `CLIENT`.
- Um `MANAGER` (ou quem tiver `stores.create`) que cria uma loja passa automaticamente a `SELLER` dessa loja (`assignRole`).
- `POST /api/stores` exige `stores.create`; gerir produtos/pedidos exige as permissões correspondentes (`requirePermission`).
- A criação pode ser validada com testes: `POST /api/auth/register` → role `CLIENT`; sem `stores.create`, `POST /api/stores` devolve `403`.

## Endpoints

### Auth
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/register` | Não | Registar utilizador |
| POST | `/api/auth/login` | Não | Iniciar sessão |
| GET | `/api/auth/me` | Sim | Obter perfil |
| PUT | `/api/auth/me` | Sim | Actualizar perfil |

### Products
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/products` | Não | Listar (busca `q`, `categorySlug`, `categoryId`, `storeId`, `minPrice`, `maxPrice`, `condition`, `sort`) |
| GET | `/api/products/featured` | Não | Produtos em destaque (por views) |
| GET | `/api/products/category/:categoryId` | Não | Produtos por categoria |
| GET | `/api/products/:id` | Não | Detalhe do produto |
| POST | `/api/products` | Vendedor | Criar produto (requer `products.manage` e loja própria) |
| PUT | `/api/products/:id` | Owner | Actualizar produto |
| DELETE | `/api/products/:id` | Owner | Eliminar produto |

### Categories
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/categories` | Não | Lista de categorias (árvore com contagem) |
| GET | `/api/categories/:id` | Não | Detalhe da categoria |

### Stores
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/stores` | Não | Listar lojas |
| GET | `/api/stores/map` | Não | Lojas com coordenadas GPS |
| GET | `/api/stores/:slug` | Não | Detalhe da loja |
| GET | `/api/stores/:slug/products` | Não | Produtos da loja |
| POST | `/api/stores` | Manager/Vendedor | Criar loja (requer `stores.create`; atribui role `SELLER` automaticamente; aceita `logo`/`banner` opcionais e `categoryIds: string[]` — categorias que a loja vende) |
| PUT | `/api/stores` | Owner | Actualizar loja (inclui `logo`/`banner`; enviar `""` para remover; `categoryIds` substitui as categorias da loja) |
| GET | `/api/stores/:slug` | Não | Detalhe da loja (inclui `categories`) |

### Cart
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/cart` | Sim | Ver carrinho |
| POST | `/api/cart/items` | Sim | Adicionar item |
| PUT | `/api/cart/items/:id` | Sim | Actualizar quantidade |
| DELETE | `/api/cart/items/:id` | Sim | Remover item |
| DELETE | `/api/cart` | Sim | Limpar carrinho |

### Orders
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/orders` | Sim | Criar pedido a partir do carrinho |
| GET | `/api/orders` | Sim | Listar pedidos do utilizador |
| GET | `/api/orders/:id` | Sim | Detalhe do pedido (admin vê todos) |
| GET | `/api/orders/seller/orders` | Seller | Pedidos da loja do vendedor |
| GET | `/api/orders/seller/orders/:id` | Seller | Detalhe de pedido da loja do vendedor |
| POST | `/api/orders/:id/receipt` | Sim | Enviar comprovativo de pagamento (máx 3 tentativas; enfileira para `receipt_agent`) |
| PUT | `/api/orders/:id/status` | Sim/Seller/Admin | Actualizar estado do pedido (bloqueia `PAYMENT_RECEIVED` se comprovativo rejeitado por antifraude) |
| GET | `/api/orders/:id/dispute` | Sim/Seller/Admin | Obter/iniciar disputa e histórico de mensagens tripartidas (Cliente, Vendedor, Admin) |
| POST | `/api/orders/:id/dispute/messages` | Sim/Seller/Admin | Enviar mensagem no chat tripartido com suporte a anexos |
| PUT | `/api/orders/:id/dispute/status` | Sim/Seller/Admin | Actualizar estado da disputa (`OPEN`, `UNDER_REVIEW`, `RESOLVED`, `CLOSED`) |
| GET | `/api/orders/disputes/unread` | Sim | Mensagens não lidas do utilizador (badge/notificações): `total` + top 20 disputas com `unreadCount`, `orderNumber`, última mensagem (`lastMessage`) |
| PUT | `/api/orders/:id/dispute/read` | Sim/Seller/Admin | Marcar todas as mensagens da disputa como lidas para o utilizador (`OrderDisputeRead`) |
| GET | `/api/orders/:id/dispute/events` | Sim/Seller/Admin | **SSE** — stream de eventos em tempo real (substitui o polling do cliente). Fornece um snapshot inicial e empurra o estado completo da disputa (`text/event-stream`) sempre que há nova mensagem, mudança de estado ou ação de moderação no pedido. Caber `Authorization: Bearer`; eventos `update` + heartbeat `: keep-alive` a cada 30s |
| POST | `/api/orders/:id/dispute/moderation` | Admin | Ação de moderação manual (autoridade): `MANUAL_OVERRIDE_ACCEPT` (aprovar comprovativo apesar do falso positivo da IA e liberar o pedido para o vendedor confirmar recebimento) ou `DEFINITIVE_REJECT` (encerrar tentativas, rejeitar pagamento e cancelar o pedido). Opcionalmente com `note`. Regista a ação no histórico e mensagem de sistema na mediação (`SYSTEM`) |
| GET | `/api/orders/:id/timeline` | Sim/Seller/Admin | Linha do tempo do ciclo de vida do pedido (rastreamento): eventos normalizados (criado, pagamento, comprovativo/verificação, moderação, envio, entrega, receção), dados de envio (`carrierName`, `trackingCode`, `estimatedDelivery`, `shippedAt`, `deliveredAt`, `receivedAt`) e `capabilities` de ação conforme o papel (confirmar receção/recebimento, marcar enviado, marcar entregue) |
| POST | `/api/orders/:id/ship` | Seller/Admin | Marcar pedido como **enviado** (avança para `SHIPPED`): exige `carrierName` + `trackingCode` (e `estimatedDelivery` opcional); requer pagamento confirmado (`PAYMENT_RECEIVED`/`PAID`) exceto `CASH_ON_DELIVERY`; regista o evento no histórico |
| PUT | `/api/orders/:id/delivered` | Seller/Admin | Marcar pedido como **entregue** (avança para `DELIVERED`, exige `SHIPPED`); opcionalmente com `note`. Em `CASH_ON_DELIVERY` o pagamento é marcado automaticamente como `PAID` |
| PUT | `/api/orders/:id/received` | Comprador/Admin | **Confirmar recepção** (avança para `RECEIVED`): o comprador confirma que recebeu a encomenda e fecha o ciclo de vida do pedido; exige `DELIVERED` |

### Reviews
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/reviews` | Sim | Criar avaliação |
| GET | `/api/reviews/product/:id` | Não | Avaliações de um produto |
| GET | `/api/reviews/store/:id` | Não | Avaliações de uma loja |

### Uploads
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/uploads` | Sim | Upload `multipart/form-data` (campo `file`) → Cloudinary ou local |

### Security (E2E)
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/security/handshake` | Não | Inicia sessão E2E (envia `clientPublicKey`, recebe `sessionId` + `serverPublicKey`) |
| GET | `/api/security/public-key` | Não | Public key do servidor (trocas cifradas) |
| GET | `/api/security/status` | Não | Debug: estado da E2E encryption |

### Translations
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/translations/translate` | Não | Traduz texto no idioma desejado via OpenRouter |
| POST | `/api/translations/translate-batch` | Não | Traduz um lote de textos |

### Roles (RBAC)
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/roles` | Não | Listar roles (com contagem de utilizadores e responsabilidades) |
| GET | `/api/roles/responsibilities` | Não | Listar responsabilidades (catálogo de permissões) |
| POST | `/api/roles` | Admin | Criar role (`{ key, name, description }` + `responsibilityKeys[]`) |
| PUT | `/api/roles/:key` | Admin | Actualizar role (nome, descrição, responsabilidades) |
| DELETE | `/api/roles/:key` | Admin | Eliminar role (sistema/in-use são protegidas) |
| POST | `/api/roles/responsibilities` | Admin | Criar responsabilidade |
| PUT | `/api/roles/responsibilities/:key` | Admin | Actualizar responsabilidade |
| DELETE | `/api/roles/responsibilities/:key` | Admin | Eliminar responsabilidade (sistema é protegida) |

### Fiscal (Faturação Electrónica AGT — Executivo 683/25)
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/fiscal/settings` | Admin | Configuração fiscal da plataforma (software certificado, nº de validação, chaves JWS, credenciais da AGT) |
| PUT | `/api/fiscal/settings` | Admin | Actualizar configuração fiscal da plataforma |
| GET | `/api/fiscal/stores/:storeId/fiscal-profile` | Propr. loja/Admin | Perfil fiscal da loja (NIF, denominação, endereço, regime de IVA, estabelecimento) |
| PUT | `/api/fiscal/stores/:storeId/fiscal-profile` | Propr. loja/Admin | Criar/actualizar perfil fiscal da loja |
| GET | `/api/fiscal/stores/:storeId/series` | Propr. loja/Admin | Listar séries de faturação da loja |
| POST | `/api/fiscal/stores/:storeId/series` | Propr. loja/Admin | Abrir série junto da AGT (`{ documentType, establishmentNumber?, year? }`; máx. 5 séries/estabelecimento/ano) |
| GET | `/api/fiscal/orders/:orderId/invoice` | Buyer/Propr. loja/Admin | Facturas do pedido |
| POST | `/api/fiscal/orders/:orderId/invoice` | Propr. loja/Admin | Emitir/recuperar factura do pedido (idempotente) |
| POST | `/api/fiscal/invoices/:id/refresh-status` | Propr. loja/Admin | Consultar estado na AGT (`obterEstado`) e actualizar `agtStatus` |
| GET | `/api/fiscal/invoices/:id` | Propr. loja/Admin | Detalhe da factura (linhas + série) |
| GET | `/api/fiscal/invoices/:id/pdf` | Buyer/Propr. loja/Admin | Factura em **PDF (A4)** — o comprador do pedido, a loja emitente e o Admin têm direito de consulta |

### Admin
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/admin/stats` | Admin | Estatísticas do dashboard |
| GET | `/api/admin/users` | Admin | Listar utilizadores (filtro role, busca) |
| PUT | `/api/admin/users/:id/role` | Admin | Atribuir roles (`{ "role": "SELLER" }` ou `{ "roles": ["MANAGER","SELLER"] }`) |
| DELETE | `/api/admin/users/:id` | Admin | Eliminar utilizador |
| GET | `/api/admin/orders` | Admin | Listar todos os pedidos (inclui `stores` que recebem o pagamento) |
| PUT | `/api/admin/orders/:id/status` | Admin | Actualizar estado do pedido |
| GET | `/api/admin/stats/store-revenue` | Admin | Receita por loja + KPI por produto (orders PAID/PAYMENT_RECEIVED) |
| GET | `/api/admin/stores` | Admin | Listar todas as lojas |
| PUT | `/api/admin/stores/:id/verify` | Admin | Toggle verificação da loja |
| DELETE | `/api/admin/stores/:id` | Admin | Eliminar loja |
| GET | `/api/admin/products` | Admin | Listar todos os produtos |
| PUT | `/api/admin/products/:id/toggle-active` | Admin | Toggle ativo/inativo |
| DELETE | `/api/admin/products/:id` | Admin | Eliminar produto |
| POST | `/api/admin/categories` | Admin | Criar categoria |
| PUT | `/api/admin/categories/:id` | Admin | Actualizar categoria |
| DELETE | `/api/admin/categories/:id` | Admin | Eliminar categoria |
| GET | `/api/admin/reviews` | Admin | Listar todas as avaliações |
| DELETE | `/api/admin/reviews/:id` | Admin | Eliminar avaliação |
| GET | `/api/admin/disputes` | Admin | Fila central de disputas (paginação, filtro por estado, busca por pedido/cliente; inclui `messagesCount`, `unreadMessages`, `lastMessage`, risco do comprovativo, cliente e vendedor) |
| GET | `/api/admin/disputes/stats` | Admin | Contagens de disputas (`total`, `open`, `resolved`, `closed`) |

## Módulo de Faturação (Faturação Electrónica AGT)

Implementa a emissão de facturas de acordo com o **Regime Jurídico das Faturas** (Decreto Presidencial n.º 71/25) e a **API de Faturação Electrónica da AGT** (Executivo n.º 683/25). O Pambala funciona como **sistema de faturação multi-tenant**: cada loja é um *emitente fiscal* com o seu próprio NIF, séries e regime de IVA, e o software usa o **nº de validação/certificação AGT** do Pambala.

### Modelos

| Modelo | Papel |
|--------|-------|
| `FiscalSettings` | Configuração da plataforma (linha única): identificação do software (`productId`, `productVersion`, `softwareValidationNumber`), versão de assinatura, chave privada JWS do produtor, credenciais da API da AGT (`agtBaseUrl`, `agtUsername`, `agtPassword`), fuso horário |
| `StoreFiscalProfile` | Perfil fiscal da loja (1:1): NIF, denominação social, endereço, regime de IVA (`GERAL`/`SIMPLIFICADO`/`EXCLUIDO`/`ISENTO`), código de isenção (`vatExemptionCode`), estabelecimento (`SEDE`/filiais) e chave privada JWS do contribuinte |
| `InvoiceSeries` | Série autorizada pela AGT via `solicitarSerie` por loja/documento/ano: código atribuído pela AGT (`agtSeriesCode`), `authorizedQuantity`, numeração sequencial cronológica (recomeça por ano civil) |
| `Invoice` | Documento fiscal imutável: `documentNo` (`FT <códigoSérieAGT>/<seq>`), snapshot do emitente e do cliente, montantes em **cêntimos de AOA**, **assinatura JWS RS256**, **URL do QR Code de consulta pública**, `agtRequestId` e `agtStatus`, referência à factura original (NC/ND) |
| `InvoiceLine` | Linha da factura com snapshot (designação, quantidade, preço, imposto); `operationType` e `taxCode`/`taxExemptionCode` são mantidos na base de dados para auditoria mas **não** são enviados à AGT (o payload `registarFactura` do DS-120 usa `lineNumber`/`productCode`/`debitAmount`/`taxes`/`settlementAmount`) |
| `InvoiceCommunicationLog` | Trilho de auditoria/retry da comunicação com a AGT (payload enviado, resposta, estado, HTTP) |

> **PDF da factura:** o `GET /api/fiscal/invoices/:id/pdf` gera o documento em formato PDF (A4) com `pdf-lib` (sem dependências nativas) a partir do registo imutável — emitente, cliente, linha(s), totais, resumo de impostos, URL do QR de consulta e referência da assinatura JWS. O acesso é autorizado a **admin**, **loja emitente** e ao **comprador do pedido** (dono do pedido), e o sumário de facturas de um pedido (`GET /api/fiscal/orders/:orderId/invoice`) também já está disponível ao comprador.

### Fluxo de emissão

1. **Gatilho automático** — a factura `FT` é emitida na confirmação do pagamento (`PAID`, incluindo COD na entrega) e pode ser forçada/recuperada via `POST /api/fiscal/orders/:orderId/invoice` (idempotente).
2. **Série** — se não existir série aberta, é chamado `solicitarSerie` à AGT (fora da transação); sem `agtBaseUrl` (dev), é sintetizada uma série local com código `FT<ano>S001N`.
3. **Alocação atómica** — o número é retirado da série (`InvoiceSeries.nextNumber`) na mesma transação que cria a factura, garantindo numeração sequencial sem duplicados.
4. **Imutabilidade** — emitente e cliente são gravados como *snapshots* (JSON) no momento da emissão; montantes em cêntimos de AOA e IVA arredondado **por excesso** ao cêntimo.
5. **Assinaturas JWS (RS256)** — `jwsSoftwareSignature` (productId/productVersion/softwareValidationNumber, chave do produtor; `softwareInfoDetail` não inclui versão de assinatura por ser alheia ao DS-120), assinatura do documento `jwsSignature` (identificação + totais, chave privada da loja) e `jwsSignature` por requisição; chaves RSA-2048 geradas e guardadas nas definições/perfil quando ausentes.
6. **QR Code** — `https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=<NIF>&document=<documentNo>` (espaços → `%20`).
7. **Comunicação AGT (assíncrona)** — `POST registarFactura` devolve `requestID`; o estado é obtido por `obterEstado` (manual via `refresh-status` ou job). Sem `agtBaseUrl`, a factura fica `VALID` em modo dev. `agtStatus`: `PENDING | SUBMITTED | VALID | INVALID | REJECTED | FAILED`.
8. **IVA** — taxa derivada do regime da loja: `GERAL` → 14% (`NOR`), `SIMPLIFICADO` → 7% (`INT`), `EXCLUIDO`/`ISENTO` → 0% (com `taxExemptionCode` obrigatório); `NA` e `NS` aplicam isenção/outsiderscope.

> **Nota:** as credenciais de API (Basic Auth) são emitidas pela AGT para o produtor do software; só ficam ativas os *environment/certificações* `HOMOLOG`/`PRODUCAO` (planos de faturação). Sem credenciais, o módulo opera em modo dev (séries sintéticas, `agtStatus=VALID` sem registo real).

> **Alinhamento DS-120 (v1.0):** o payload de `registarFactura` usa `submissionGUID` (e não `submissionUUID`) e o campo do documento é `jwsSignature`; atualizado em conformidade. Os endpoints de série (`solicitarSerie`) existem apenas para compatibilidade — no DS-120 a abertura de séries é feita no **Portal do Parceiro AGT**; o `schemaVersion` enviado é definido em `FiscalSettings.schemaVersion` (a validar em homologação vs exemplos do manual).

## Agente de Comprovativos Anti-Fraude (`receipt_agent/`)

Assistente Python que implementa o modelo **Payment Proof + Transaction Fingerprint + Triagem de Risco**:

| Componente | Função |
|------------|--------|
| `ocr.py` | Leitura do texto do comprovativo via Tesseract (pytesseract/CLI) ou pdftotext |
| `forensics.py` | Análise forense de imagem (ELA, EXIF/XMP, software de edição, screenshots) |
| `verifier.py` | Extração de entidades bancárias, `transactionFingerprint` e cálculo do `PaymentRiskScore` (0-100) |
| `llm.py` | Análise semântica por visão multimodal (OpenRouter/GPT-4o-mini com consentimento) |
| `db.py` | Persistência dos resultados, histórico de auditoria e pesquisa de duplicados (físicos e lógicos) |
| `agent.py` | Orquestração do pipeline, fila (`ReceiptQueue`) e CLI (`check`, `process`, `report`) |
| `tests/test_verifier.py` | Testes unitários automatizados do motor de scoring e fingerprint |
| `config.py` | Configuração central (limiares de risco, chaves, diretórios) |
| `cron_process.sh` | Execução agendada contínua em segundo plano |

Consulte `receipt_agent/README.md` para a especificação completa da matriz de pontuação e flags de segurança.

## Licença

MIT