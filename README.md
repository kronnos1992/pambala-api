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
├── seed.ts               # Seed com 150 produtos, 12 categorias, 3 lojas
├── lib/
│   ├── prisma.ts         # Cliente Prisma (singleton)
│   ├── auth.ts           # JWT + middleware de auth
│   └── validators.ts     # Schemas Zod
├── routes/
│   ├── auth.ts           # Registo, login, perfil
│   ├── products.ts       # CRUD + busca + filtros + categorySlug
│   ├── categories.ts     # Árvore de categorias
│   ├── stores.ts         # Lojas + mapa + produtos
│   ├── cart.ts           # Carrinho de compras
│   ├── orders.ts         # Pedidos + estados + seller orders
│   ├── reviews.ts        # Avaliações
│   ├── uploads.ts        # Upload de imagens
│   └── admin.ts          # Dashboard admin (stats, CRUD completo)
└── middleware/
    └── error-handler.ts  # Handler de erros global
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

## Licença

MIT
