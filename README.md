# Pambala API

Backend REST API para o marketplace Pambala — a maior plataforma de compra e venda de Angola.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Hono
- **ORM:** Prisma 7 (via `@prisma/adapter-libsql`)
- **Base de dados:** SQLite (desenvolvimento) / PostgreSQL (produção)
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Validação:** Zod
- **Imagens:** Cloudinary (com fallback para armazenamento local)
- **OCR/IA:** tesseract.js (recibos) + OpenRouter/OpenAI (traduções e leitura de recibos)

## Estrutura

```
src/
├── index.ts              # Entrypoint do servidor (monta módulos + middleware)
├── seed.ts               # Seed com 150 produtos, 12 categorias, 3 lojas
├── modules/              # Cada módulo expõe as suas rotas (Hono)
│   ├── auth.ts           # Registo, login, perfil (inclui social auth)
│   ├── products.ts       # CRUD + busca + filtros + categorySlug
│   ├── categories.ts     # Árvore de categorias
│   ├── stores.ts         # Lojas + mapa + produtos
│   ├── cart.ts           # Carrinho de compras
│   ├── orders.ts         # Pedidos + estados + seller orders
│   ├── reviews.ts        # Avaliações
│   ├── uploads/          # Upload de imagens (Cloudinary → local)
│   ├── admin.ts          # Dashboard admin (stats, CRUD completo)
│   ├── security/         # Handshake E2E (tweetnacl)
│   └── translations/     # Tradução de conteúdo (OpenRouter)
├── handlers/             # Lógica de negócio desacoplada das rotas
│   ├── uploads.handlers.ts   # Upload Cloudinary com fallback local
│   ├── translations.handlers.ts
│   └── ...               # Demais handlers por domínio
├── security/
│   └── e2e-manager.ts    # Gere sessões E2E + cifra/decifra de payloads
├── lib/
│   ├── prisma.ts         # Cliente Prisma (singleton)
│   ├── auth.ts           # JWT + middleware de auth
│   ├── cloudinary.ts     # Cliente Cloudinary (Basic Auth)
│   ├── receiptValidation.ts
│   ├── social-auth.ts    # Login social (Google/Facebook)
│   ├── types.ts
│   └── validators.ts     # Schemas Zod
└── shared/               # mediator, filters (auth), erros e middleware
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
| Comprador | comprador1@pambala.ao | buyer123 | BUYER |

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
| POST | `/api/products` | Seller/Admin | Criar produto |
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
| POST | `/api/stores` | Seller/Admin | Criar loja |
| PUT | `/api/stores` | Owner | Actualizar loja |

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

### Admin
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/admin/stats` | Admin | Estatísticas do dashboard |
| GET | `/api/admin/users` | Admin | Listar utilizadores (filtro role, busca) |
| PUT | `/api/admin/users/:id/role` | Admin | Mudar role do utilizador |
| DELETE | `/api/admin/users/:id` | Admin | Eliminar utilizador |
| GET | `/api/admin/orders` | Admin | Listar todos os pedidos |
| PUT | `/api/admin/orders/:id/status` | Admin | Actualizar estado do pedido |
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

## Agente de recibo (`receipt_agent/`)

Assistente Python que lê recibos (OCR) e valida pagamentos de pedidos:

| Componente | Função |
|------------|--------|
| `ocr.py` | Leitura do texto do recibo via tesseract.js |
| `llm.py` | Extracção estruturada dos dados (OpenRouter) |
| `verifier.py` | Validação dos dados extraídos contra o pedido |
| `forensics.py` | Análise/validação extra de metadados |
| `db.py` | Persistência dos resultados (SQLite) |
| `agent.py` | Orquestração do pipeline |
| `config.py` | Configuração (keys, modelos, paths) |
| `cron_process.sh` | Execução agendada (cron) do agente |

Veja `receipt_agent/README.md` para detalhes de configuração e execução.

## Licença

MIT