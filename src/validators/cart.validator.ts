import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be greater than 0"),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be greater than 0"),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const cartItemIdSchema = z.string().uuid("Invalid cart item ID");
