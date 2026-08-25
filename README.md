# Pambala API

Backend REST API para o marketplace Pambala — a maior plataforma de compra e venda de Angola.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Hono
- **ORM:** Prisma 7 (via `@prisma/adapter-libsql`)
- **Base de dados:** SQLite (desenvolvimento) / PostgreSQL (produção)
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Validação:** Zod

## Estrutura

```
src/
├── index.ts              # Entrypoint do servidor
├── seed.ts               # Seed da base de dados
├── lib/
│   ├── prisma.ts         # Cliente Prisma (singleton)
│   ├── auth.ts           # JWT + middleware de auth
│   ├── validators.ts     # Schemas Zod
│   └── types.ts          # Tipos partilhados
├── routes/
│   ├── auth.ts           # Registo, login, perfil
│   ├── products.ts       # CRUD + busca + filtros
│   ├── categories.ts     # Árvore de categorias
│   ├── stores.ts         # Lojas + mapa
│   ├── cart.ts           # Carrinho de compras
│   ├── orders.ts         # Pedidos + estados
│   ├── reviews.ts        # Avaliações
│   └── uploads.ts        # Upload de imagens
└── middleware/
    └── error-handler.ts  # Handler de erros global
```

## Setup

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Gerar cliente Prisma
npm run db:generate

# Criar base de dados
npm run db:push

# Popular com dados de exemplo
npm run db:seed

# Iniciar servidor de desenvolvimento
npm run dev
```

A API fica disponível em `http://localhost:3001`.

## Credenciais de teste

| Utilizador | Email | Password | Role |
|-----------|-------|----------|------|
| Admin | admin@pambala.ao | admin123 | ADMIN |
| Vendedor | vendedor@pambala.ao | vendedor123 | SELLER |

## Endpoints

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Registar utilizador |
| POST | `/api/auth/login` | Iniciar sessão |
| GET | `/api/auth/me` | Obter perfil |
| PUT | `/api/auth/me` | Actualizar perfil |

### Products
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/products` | Listar produtos (busca, filtros, paginação) |
| GET | `/api/products/featured` | Produtos em destaque |
| GET | `/api/products/:id` | Detalhe do produto |
| POST | `/api/products` | Criar produto (vendedor) |
| PUT | `/api/products/:id` | Actualizar produto |
| DELETE | `/api/products/:id` | Eliminar produto |

### Categories
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/categories` | Lista de categorias (árvore) |

### Stores
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stores` | Listar lojas |
| GET | `/api/stores/:slug` | Detalhe da loja |
| POST | `/api/stores` | Criar loja (vendedor) |

### Cart
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/cart` | Ver carrinho |
| POST | `/api/cart/items` | Adicionar item |
| PUT | `/api/cart/items/:id` | Actualizar quantidade |
| DELETE | `/api/cart/items/:id` | Remover item |

### Orders
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/orders` | Criar pedido |
| GET | `/api/orders` | Listar pedidos do utilizador |
| GET | `/api/orders/:id` | Detalhe do pedido |

### Reviews
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/reviews` | Criar avaliação |
| GET | `/api/reviews/product/:id` | Avaliações de um produto |

## Licença

MIT
