import {
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
} from "../shared/cqrs";
import { CartRepository } from "../shared/repositories/cart.repository";
import { ProductRepository } from "../shared/repositories/product.repository";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { parseImages } from "../shared/mappers";

function parseCartProduct(product: any) {
  if (!product) return product;
  return { ...product, images: parseImages(product.images) };
}

export class GetCartQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

export class AddCartItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly productId: string,
    public readonly quantity: number
  ) {}
}

export class UpdateCartItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly quantity: number
  ) {}
}

export class RemoveCartItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string
  ) {}
}

export class ClearCartCommand implements ICommand {
  constructor(public readonly userId: string) {}
}

function cartPayload(cart: any) {
  const total = cart.items.reduce(
    (sum: number, item: any) => sum + item.product.price * item.quantity,
    0
  );

  return {
    cart: {
      ...cart,
      total,
      items: cart.items.map((item: any) => ({
        ...item,
        product: parseCartProduct(item.product),
      })),
    },
  };
}

export class GetCartQueryHandler implements IQueryHandler<GetCartQuery, any> {
  constructor(private readonly carts: CartRepository) {}

  async handle(query: GetCartQuery) {
    let cartRecord = await this.carts.findWithItems(query.userId);

    if (!cartRecord) {
      cartRecord = await this.carts.createWithItems(query.userId);
    }

    return cartPayload(cartRecord);
  }
}

export class AddCartItemCommandHandler
  implements ICommandHandler<AddCartItemCommand, any>
{
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository
  ) {}

  async handle(command: AddCartItemCommand) {
    const { userId, productId, quantity } = command;

    if (!productId) {
      throw new BadRequestError("productId é obrigatório");
    }

    const product = await this.products.findById(productId);

    if (!product || !product.isActive) {
      throw new NotFoundError("Produto não encontrado");
    }

    if (product.stock < quantity) {
      throw new BadRequestError("Estoque insuficiente");
    }

    let cartRecord = await this.carts.findRaw(userId);

    if (!cartRecord) {
      cartRecord = await this.carts.create(userId);
    }

    const existingItem = await this.carts.findItemByProduct(
      cartRecord.id,
      productId
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.stock) {
        throw new BadRequestError("Estoque insuficiente");
      }
      await this.carts.updateItemQuantity(existingItem.id, newQuantity);
    } else {
      await this.carts.createItem(cartRecord.id, productId, quantity);
    }

    const updatedCart = await this.carts.findWithItems(userId);

    return cartPayload(updatedCart!);
  }
}

export class UpdateCartItemCommandHandler
  implements ICommandHandler<UpdateCartItemCommand, any>
{
  constructor(private readonly carts: CartRepository) {}

  async handle(command: UpdateCartItemCommand) {
    const { userId, itemId, quantity } = command;

    if (!quantity || quantity < 1) {
      throw new BadRequestError("Quantidade inválida");
    }

    const cartRecord = await this.carts.findRaw(userId);

    if (!cartRecord) {
      throw new NotFoundError("Carrinho não encontrado");
    }

    const cartItem = await this.carts.findItemWithProduct(itemId, cartRecord.id);

    if (!cartItem) {
      throw new NotFoundError("Item não encontrado");
    }

    if (quantity > cartItem.product.stock) {
      throw new BadRequestError("Estoque insuficiente");
    }

    await this.carts.updateItemQuantity(itemId, quantity);

    return { message: "Item atualizado" };
  }
}

export class RemoveCartItemCommandHandler
  implements ICommandHandler<RemoveCartItemCommand, any>
{
  constructor(private readonly carts: CartRepository) {}

  async handle(command: RemoveCartItemCommand) {
    const { userId, itemId } = command;

    const cartRecord = await this.carts.findRaw(userId);

    if (!cartRecord) {
      throw new NotFoundError("Carrinho não encontrado");
    }

    const cartItem = await this.carts.findItem(itemId, cartRecord.id);

    if (!cartItem) {
      throw new NotFoundError("Item não encontrado");
    }

    await this.carts.deleteItem(itemId);

    return { message: "Item removido" };
  }
}

export class ClearCartCommandHandler
  implements ICommandHandler<ClearCartCommand, any>
{
  constructor(private readonly carts: CartRepository) {}

  async handle(command: ClearCartCommand) {
    const cartRecord = await this.carts.findRaw(command.userId);

    if (!cartRecord) {
      throw new NotFoundError("Carrinho não encontrado");
    }

    await this.carts.deleteItemsByCart(cartRecord.id);

    return { message: "Carrinho limpo" };
  }
}