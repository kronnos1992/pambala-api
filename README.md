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
│   └── translations/     # Tradução de conteúdo (OpenRouter)
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

### Roles de sistema (seed)

| Role | Responsabilidades |
|------|-------------------|
| `ADMIN` | Todas |
| `MANAGER` | `stores.create`, `stores.manage`, `products.manage`, `orders.view`, `orders.respond-payment`, `translations.translate` |
| `SELLER` | `stores.manage`, `products.manage`, `orders.view`, `orders.respond-payment`, `translations.translate` |
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
| PUT | `/api/orders/:id/status` | Admin | Actualizar estado do pedido |

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