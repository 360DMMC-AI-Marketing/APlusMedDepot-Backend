import { Request, Response } from "express";

import { CartService } from "../services/cart.service";
import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemIdSchema,
} from "../validators/cart.validator";

export class CartController {
  static async getCart(req: Request, res: Response): Promise<void> {
    const cart = await CartService.getCart(req.user!.id);
    res.status(200).json({ cart });
  }

  static async addItem(req: Request, res: Response): Promise<void> {
    const validated = addCartItemSchema.parse(req.body);
    const item = await CartService.addItemToCart(
      req.user!.id,
      validated.productId,
      validated.quantity,
    );
    res.status(201).json(item);
  }

  static async updateItem(req: Request, res: Response): Promise<void> {
    const itemId = cartItemIdSchema.parse(req.params.id);
    const validated = updateCartItemSchema.parse(req.body);
    const item = await CartService.updateCartItem(req.user!.id, itemId, validated.quantity);
    res.status(200).json(item);
  }

  static async removeItem(req: Request, res: Response): Promise<void> {
    const itemId = cartItemIdSchema.parse(req.params.id);
    await CartService.removeCartItem(req.user!.id, itemId);
    res.status(200).json({ success: true });
  }

  static async clearCart(req: Request, res: Response): Promise<void> {
    const cart = await CartService.clearCart(req.user!.id);
    res.status(200).json({ cart });
  }

  static async validateCart(req: Request, res: Response): Promise<void> {
    const result = await CartService.validateCartItems(req.user!.id);
    res.status(200).json(result);
  }

  static async refreshCart(req: Request, res: Response): Promise<void> {
    const result = await CartService.refreshCart(req.user!.id);
    res.status(200).json(result);
  }
}
