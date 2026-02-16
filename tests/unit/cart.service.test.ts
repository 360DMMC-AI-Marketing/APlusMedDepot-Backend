const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { CartService } from "../../src/services/cart.service";
import { AppError } from "../../src/utils/errors";

// Helper to build chained Supabase query mock
function mockQuery(result: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.delete = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(result);
  // When the chain does not end in .single(), resolve the chain itself
  chain.then = undefined as unknown as jest.Mock;
  return chain;
}

function mockDeleteChain(result: { error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.delete = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockResolvedValue(result);
  return chain;
}

// Universal chain mock: thenable so `await chain.eq()`, `await chain.order()`, etc. all resolve.
// Also supports `.single()` for chains that end with it.
function mockResolvedChain(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const ret = jest.fn().mockReturnValue(chain);
  chain.select = ret;
  chain.insert = ret;
  chain.update = ret;
  chain.delete = ret;
  chain.eq = ret;
  chain.in = ret;
  chain.order = ret;
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const USER_ID = "user-customer-1";
const CART_ID = "cart-uuid-1";
const PRODUCT_ID = "prod-uuid-1";
const ITEM_ID = "item-uuid-1";

const activeProduct = {
  id: PRODUCT_ID,
  name: "Surgical Gloves",
  price: "29.99",
  stock_quantity: 100,
  status: "active",
  is_deleted: false,
  images: ["img1.jpg"],
  supplier_id: "supplier-uuid-1",
};

const sampleCartItemRow = {
  id: ITEM_ID,
  cart_id: CART_ID,
  product_id: PRODUCT_ID,
  quantity: 2,
  unit_price: "29.99",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  products: {
    name: "Surgical Gloves",
    images: ["img1.jpg"],
    supplier_id: "supplier-uuid-1",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TAX_RATE;
});

describe("CartService.addItemToCart", () => {
  it("throws notFound when product does not exist", async () => {
    // products query → not found
    const productsChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(productsChain);

    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(AppError);
    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 1)).rejects.toMatchObject({
      statusCode: 404,
    });

    mockFrom.mockReset();
  });

  it("throws badRequest when product is inactive", async () => {
    const productsChain = mockQuery({
      data: { ...activeProduct, status: "inactive" },
    });
    mockFrom.mockReturnValueOnce(productsChain);

    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 1)).rejects.toMatchObject({
      statusCode: 400,
      message: "Product is not available for purchase",
    });
  });

  it("throws badRequest when product is soft-deleted", async () => {
    const productsChain = mockQuery({
      data: { ...activeProduct, is_deleted: true },
    });
    mockFrom.mockReturnValueOnce(productsChain);

    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 1)).rejects.toMatchObject({
      statusCode: 400,
      message: "Product is not available for purchase",
    });
  });

  it("throws badRequest when quantity exceeds stock", async () => {
    const productsChain = mockQuery({
      data: { ...activeProduct, stock_quantity: 5 },
    });
    mockFrom.mockReturnValueOnce(productsChain);

    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 10)).rejects.toMatchObject({
      statusCode: 400,
      message: "Insufficient stock. Available: 5",
    });
  });

  it("increments quantity when same product already in cart", async () => {
    // 1. products query → found
    const productsChain = mockQuery({ data: activeProduct });
    // 2. carts query (getOrCreateCart) → existing cart
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    // 3. cart_items query → existing item with quantity 2
    const existingItemChain = mockQuery({
      data: { id: ITEM_ID, quantity: 2 },
    });
    // 4. cart_items update → updated row
    const updateChain = mockQuery({
      data: { ...sampleCartItemRow, quantity: 5, unit_price: "29.99" },
    });

    mockFrom
      .mockReturnValueOnce(productsChain) // products
      .mockReturnValueOnce(cartsChain) // carts (getOrCreateCart)
      .mockReturnValueOnce(existingItemChain) // cart_items (check existing)
      .mockReturnValueOnce(updateChain); // cart_items (update)

    const result = await CartService.addItemToCart(USER_ID, PRODUCT_ID, 3);
    expect(result.quantity).toBe(5);
    expect(result.unitPrice).toBe(29.99);
  });

  it("throws badRequest when increment would exceed stock", async () => {
    // 1. products query → stock = 5
    const productsChain = mockQuery({
      data: { ...activeProduct, stock_quantity: 5 },
    });
    // 2. carts query → existing cart
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    // 3. cart_items → existing with quantity 3
    const existingItemChain = mockQuery({
      data: { id: ITEM_ID, quantity: 3 },
    });

    mockFrom
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(existingItemChain);

    await expect(CartService.addItemToCart(USER_ID, PRODUCT_ID, 3)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Insufficient stock"),
    });
  });

  it("adds new item with correct unit_price snapshot", async () => {
    // 1. products query → found with price 29.99
    const productsChain = mockQuery({ data: activeProduct });
    // 2. carts query → existing cart
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    // 3. cart_items → no existing item
    const noExistingChain = mockQuery({ data: null, error: { message: "not found" } });
    // 4. cart_items insert → created
    const insertChain = mockQuery({
      data: { ...sampleCartItemRow, quantity: 3 },
    });

    mockFrom
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(noExistingChain)
      .mockReturnValueOnce(insertChain);

    const result = await CartService.addItemToCart(USER_ID, PRODUCT_ID, 3);
    expect(result.unitPrice).toBe(29.99);
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.quantity).toBe(3);
    expect(result.subtotal).toBe(89.97);
  });
});

describe("CartService.updateCartItem", () => {
  it("throws notFound when cart item does not exist", async () => {
    const itemChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(itemChain);

    await expect(CartService.updateCartItem(USER_ID, ITEM_ID, 5)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws forbidden when item belongs to different user", async () => {
    const itemChain = mockQuery({
      data: {
        id: ITEM_ID,
        cart_id: CART_ID,
        product_id: PRODUCT_ID,
        carts: { customer_id: "other-user" },
      },
    });
    mockFrom.mockReturnValueOnce(itemChain);

    await expect(CartService.updateCartItem(USER_ID, ITEM_ID, 5)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws badRequest when new quantity exceeds stock", async () => {
    // 1. cart_items → found, belongs to user
    const itemChain = mockQuery({
      data: {
        id: ITEM_ID,
        cart_id: CART_ID,
        product_id: PRODUCT_ID,
        carts: { customer_id: USER_ID },
      },
    });
    // 2. products → stock = 3
    const productChain = mockQuery({
      data: { id: PRODUCT_ID, price: "29.99", stock_quantity: 3 },
    });

    mockFrom.mockReturnValueOnce(itemChain).mockReturnValueOnce(productChain);

    await expect(CartService.updateCartItem(USER_ID, ITEM_ID, 10)).rejects.toMatchObject({
      statusCode: 400,
      message: "Insufficient stock. Available: 3",
    });
  });

  it("updates item with refreshed unit_price", async () => {
    // 1. cart_items → found
    const itemChain = mockQuery({
      data: {
        id: ITEM_ID,
        cart_id: CART_ID,
        product_id: PRODUCT_ID,
        carts: { customer_id: USER_ID },
      },
    });
    // 2. products → new price 35.00
    const productChain = mockQuery({
      data: { id: PRODUCT_ID, price: "35.00", stock_quantity: 50 },
    });
    // 3. cart_items update → updated row
    const updateChain = mockQuery({
      data: {
        ...sampleCartItemRow,
        quantity: 5,
        unit_price: "35.00",
        products: { ...sampleCartItemRow.products },
      },
    });

    mockFrom
      .mockReturnValueOnce(itemChain)
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce(updateChain);

    const result = await CartService.updateCartItem(USER_ID, ITEM_ID, 5);
    expect(result.unitPrice).toBe(35);
    expect(result.quantity).toBe(5);
    expect(result.subtotal).toBe(175);
  });
});

describe("CartService.removeCartItem", () => {
  it("throws notFound when item does not exist", async () => {
    const itemChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(itemChain);

    await expect(CartService.removeCartItem(USER_ID, ITEM_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws forbidden when item belongs to different user", async () => {
    const itemChain = mockQuery({
      data: {
        id: ITEM_ID,
        cart_id: CART_ID,
        carts: { customer_id: "other-user" },
      },
    });
    mockFrom.mockReturnValueOnce(itemChain);

    await expect(CartService.removeCartItem(USER_ID, ITEM_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("deletes item successfully", async () => {
    // 1. cart_items select → found, belongs to user
    const itemChain = mockQuery({
      data: {
        id: ITEM_ID,
        cart_id: CART_ID,
        carts: { customer_id: USER_ID },
      },
    });
    // 2. cart_items delete → success
    const deleteChain = mockDeleteChain({ error: null });

    mockFrom.mockReturnValueOnce(itemChain).mockReturnValueOnce(deleteChain);

    await expect(CartService.removeCartItem(USER_ID, ITEM_ID)).resolves.toBeUndefined();
  });
});

describe("CartService.calculateCartTotals", () => {
  it("calculates correctly for a single item", () => {
    const items = [
      {
        id: ITEM_ID,
        productId: PRODUCT_ID,
        productName: "Gloves",
        productImage: null,
        supplierId: "s1",
        quantity: 2,
        unitPrice: 10,
        subtotal: 20,
      },
    ];

    const result = CartService.calculateCartTotals(items);
    expect(result.subtotal).toBe(20);
    expect(result.taxRate).toBe(0.0825);
    expect(result.taxAmount).toBe(1.65);
    expect(result.total).toBe(21.65);
  });

  it("calculates correctly for multiple items", () => {
    const items = [
      {
        id: "i1",
        productId: "p1",
        productName: "A",
        productImage: null,
        supplierId: "s1",
        quantity: 3,
        unitPrice: 10,
        subtotal: 30,
      },
      {
        id: "i2",
        productId: "p2",
        productName: "B",
        productImage: null,
        supplierId: "s2",
        quantity: 1,
        unitPrice: 25.5,
        subtotal: 25.5,
      },
    ];

    const result = CartService.calculateCartTotals(items);
    expect(result.subtotal).toBe(55.5);
    expect(result.taxAmount).toBe(Math.round(55.5 * 0.0825 * 100) / 100);
    expect(result.total).toBe(Math.round((55.5 + result.taxAmount) * 100) / 100);
  });

  it("returns all zeros for empty cart", () => {
    const result = CartService.calculateCartTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.taxRate).toBe(0.0825);
  });

  it("respects custom TAX_RATE from env", () => {
    process.env.TAX_RATE = "0.10";

    const items = [
      {
        id: ITEM_ID,
        productId: PRODUCT_ID,
        productName: "Gloves",
        productImage: null,
        supplierId: "s1",
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
      },
    ];

    const result = CartService.calculateCartTotals(items);
    expect(result.taxRate).toBe(0.1);
    expect(result.taxAmount).toBe(10);
    expect(result.total).toBe(110);
  });

  it("ensures 2 decimal precision on tax", () => {
    const items = [
      {
        id: ITEM_ID,
        productId: PRODUCT_ID,
        productName: "Item",
        productImage: null,
        supplierId: "s1",
        quantity: 1,
        unitPrice: 33.33,
        subtotal: 33.33,
      },
    ];

    const result = CartService.calculateCartTotals(items);
    // 33.33 * 0.0825 = 2.749725 → rounded to 2.75
    expect(result.taxAmount).toBe(2.75);
    expect(result.total).toBe(36.08);
  });
});

describe("CartService.validateCartItems", () => {
  it("returns valid when all items are fine", async () => {
    // 1. carts → found
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    // 2. cart_items → one item
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    // 3. products → matching price, enough stock, active
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "29.99",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CartService.validateCartItems(USER_ID);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects price changed with old/new prices", async () => {
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "34.99",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CartService.validateCartItems(USER_ID);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].issueType).toBe("price_changed");
    expect(result.issues[0].details.oldPrice).toBe(29.99);
    expect(result.issues[0].details.newPrice).toBe(34.99);
  });

  it("detects insufficient stock with available count", async () => {
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 10, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        { id: PRODUCT_ID, price: "29.99", stock_quantity: 3, status: "active", is_deleted: false },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CartService.validateCartItems(USER_ID);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].issueType).toBe("insufficient_stock");
    expect(result.issues[0].details.availableStock).toBe(3);
  });

  it("detects product unavailable when deleted", async () => {
    const cartsChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        { id: PRODUCT_ID, price: "29.99", stock_quantity: 100, status: "active", is_deleted: true },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CartService.validateCartItems(USER_ID);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].issueType).toBe("product_unavailable");
  });

  it("reports multiple issues on different items", async () => {
    const PRODUCT_ID_2 = "prod-uuid-2";
    const ITEM_ID_2 = "item-uuid-2";

    const cartsChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [
        { id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" },
        { id: ITEM_ID_2, product_id: PRODUCT_ID_2, quantity: 5, unit_price: "10.00" },
      ],
    });
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "35.00",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
        {
          id: PRODUCT_ID_2,
          price: "10.00",
          stock_quantity: 2,
          status: "active",
          is_deleted: false,
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CartService.validateCartItems(USER_ID);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].issueType).toBe("price_changed");
    expect(result.issues[1].issueType).toBe("insufficient_stock");
  });
});

describe("CartService.refreshCart", () => {
  it("updates unit_price when price changed", async () => {
    // 1. carts select → found
    const cartsChain = mockResolvedChain({ data: { id: CART_ID } });
    // 2. cart_items select → one item with old price
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    // 3. products select with .in() → new price
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "34.99",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
      ],
    });
    // 4. cart_items update → success
    const updateChain = mockResolvedChain({ data: null });
    // 5-6. getCart calls (carts, cart_items)
    const getCartCartsChain = mockResolvedChain({ data: { id: CART_ID, customer_id: USER_ID } });
    const getCartItemsChain = mockResolvedChain({
      data: [
        {
          ...sampleCartItemRow,
          unit_price: "34.99",
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain) // refreshCart: carts select
      .mockReturnValueOnce(itemsChain) // refreshCart: cart_items select
      .mockReturnValueOnce(productsChain) // refreshCart: products in
      .mockReturnValueOnce(updateChain) // refreshCart: cart_items update
      .mockReturnValueOnce(getCartCartsChain) // getCart: carts select
      .mockReturnValueOnce(getCartItemsChain); // getCart: cart_items select

    const result = await CartService.refreshCart(USER_ID);
    expect(result.changesMade).toHaveLength(1);
    expect(result.changesMade[0].changeType).toBe("price_updated");
    expect(result.changesMade[0].before).toEqual({ unitPrice: 29.99 });
    expect(result.changesMade[0].after).toEqual({ unitPrice: 34.99 });
  });

  it("adjusts quantity when stock is too low", async () => {
    const cartsChain = mockResolvedChain({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 10, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        { id: PRODUCT_ID, price: "29.99", stock_quantity: 3, status: "active", is_deleted: false },
      ],
    });
    const updateChain = mockResolvedChain({ data: null });
    const getCartCartsChain = mockResolvedChain({ data: { id: CART_ID, customer_id: USER_ID } });
    const getCartItemsChain = mockResolvedChain({
      data: [
        {
          ...sampleCartItemRow,
          quantity: 3,
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(getCartCartsChain)
      .mockReturnValueOnce(getCartItemsChain);

    const result = await CartService.refreshCart(USER_ID);
    expect(result.changesMade).toHaveLength(1);
    expect(result.changesMade[0].changeType).toBe("quantity_adjusted");
    expect(result.changesMade[0].before).toEqual({ quantity: 10 });
    expect(result.changesMade[0].after).toEqual({ quantity: 3 });
  });

  it("removes item when product is unavailable", async () => {
    const cartsChain = mockResolvedChain({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "29.99",
          stock_quantity: 100,
          status: "inactive",
          is_deleted: false,
        },
      ],
    });
    const deleteChain = mockResolvedChain({ error: null });
    const getCartCartsChain = mockResolvedChain({ data: { id: CART_ID, customer_id: USER_ID } });
    const getCartItemsChain = mockResolvedChain({ data: [] });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(deleteChain)
      .mockReturnValueOnce(getCartCartsChain)
      .mockReturnValueOnce(getCartItemsChain);

    const result = await CartService.refreshCart(USER_ID);
    expect(result.changesMade).toHaveLength(1);
    expect(result.changesMade[0].changeType).toBe("item_removed");
  });

  it("returns no changes when cart is already valid", async () => {
    const cartsChain = mockResolvedChain({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "29.99" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "29.99",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
      ],
    });
    const getCartCartsChain = mockResolvedChain({ data: { id: CART_ID, customer_id: USER_ID } });
    const getCartItemsChain = mockResolvedChain({
      data: [sampleCartItemRow],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(getCartCartsChain)
      .mockReturnValueOnce(getCartItemsChain);

    const result = await CartService.refreshCart(USER_ID);
    expect(result.changesMade).toHaveLength(0);
    expect(result.cart.items).toHaveLength(1);
  });

  it("recalculates cart totals after refresh", async () => {
    const cartsChain = mockResolvedChain({ data: { id: CART_ID } });
    const itemsChain = mockResolvedChain({
      data: [{ id: ITEM_ID, product_id: PRODUCT_ID, quantity: 2, unit_price: "20.00" }],
    });
    const productsChain = mockResolvedChain({
      data: [
        {
          id: PRODUCT_ID,
          price: "25.00",
          stock_quantity: 100,
          status: "active",
          is_deleted: false,
        },
      ],
    });
    const updateChain = mockResolvedChain({ data: null });
    const getCartCartsChain = mockResolvedChain({ data: { id: CART_ID, customer_id: USER_ID } });
    const getCartItemsChain = mockResolvedChain({
      data: [
        {
          ...sampleCartItemRow,
          quantity: 2,
          unit_price: "25.00",
        },
      ],
    });

    mockFrom
      .mockReturnValueOnce(cartsChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(getCartCartsChain)
      .mockReturnValueOnce(getCartItemsChain);

    const result = await CartService.refreshCart(USER_ID);
    // 2 * 25.00 = 50.00 subtotal
    expect(result.cart.subtotal).toBe(50);
    expect(result.cart.taxAmount).toBe(Math.round(50 * 0.0825 * 100) / 100);
  });
});
