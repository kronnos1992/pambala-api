import { BaseRepository } from "./base.repository";

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          store: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  },
};

export class CartRepository extends BaseRepository {
  findWithItems(userId: string) {
    return this.client.cart.findUnique({
      where: { userId },
      include: cartInclude,
    });
  }

  findRaw(userId: string) {
    return this.client.cart.findUnique({ where: { userId } });
  }

  create(userId: string) {
    return this.client.cart.create({ data: { userId } });
  }

  createWithItems(userId: string) {
    return this.client.cart.create({
      data: { userId },
      include: cartInclude,
    });
  }

  findItemByProduct(cartId: string, productId: string) {
    return this.client.cartItem.findUnique({
      where: {
        cartId_productId: { cartId, productId },
      },
    });
  }

  createItem(cartId: string, productId: string, quantity: number) {
    return this.client.cartItem.create({
      data: { cartId, productId, quantity },
    });
  }

  updateItemQuantity(itemId: string, quantity: number) {
    return this.client.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  findItemWithProduct(itemId: string, cartId: string) {
    return this.client.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { product: true },
    });
  }

  findItem(itemId: string, cartId: string) {
    return this.client.cartItem.findFirst({
      where: { id: itemId, cartId },
    });
  }

  deleteItem(itemId: string) {
    return this.client.cartItem.delete({ where: { id: itemId } });
  }

  deleteItemsByCart(cartId: string) {
    return this.client.cartItem.deleteMany({ where: { cartId } });
  }

  deleteItems(ids: string[]) {
    return this.client.cartItem.deleteMany({ where: { id: { in: ids } } });
  }
}