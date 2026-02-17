const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { CheckoutService } from "../../src/services/checkout.service";

// Helper to build a chained Supabase query that resolves on .single()
function mockQuery(result: { data?: unknown; error?: unknown }) {
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
  // Make chain thenable for non-.single() endings (e.g. .eq("cart_id", ...))
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const USER_ID = "user-customer-1";
const CART_ID = "cart-uuid-1";
const SUPPLIER_1 = "sup-1";
const SUPPLIER_2 = "sup-2";

const validAddress = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  country: "US",
};

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Surgical Gloves",
    price: "15.00",
    stock_quantity: 100,
    status: "active",
    is_deleted: false,
    supplier_id: SUPPLIER_1,
    suppliers: { company_name: "MedSupply Co" },
    ...overrides,
  };
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    product_id: "prod-1",
    quantity: 2,
    unit_price: "10.00",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TAX_RATE;
});

describe("CheckoutService.validateCheckout", () => {
  it("returns valid:true with correct order_preview totals (happy path)", async () => {
    const product = makeProduct({ price: "15.00" });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 2 });

    // 1st call: carts table → get cart
    const cartChain = mockQuery({ data: { id: CART_ID } });
    // 2nd call: cart_items table → get items
    const itemsChain = mockQuery({ data: [cartItem] });
    // 3rd call: products table → get product data
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.subtotal).toBe(30.0);
      expect(result.order_preview.tax_rate).toBe(0.0825);
      expect(result.order_preview.tax_amount).toBe(2.48);
      expect(result.order_preview.total).toBe(32.48);
      expect(result.order_preview.items).toHaveLength(1);
      expect(result.order_preview.items[0].current_price).toBe(15.0);
      expect(result.order_preview.items[0].subtotal).toBe(30.0);
      expect(result.order_preview.shipping_address).toEqual(validAddress);
    }
  });

  it("returns valid:false with empty_cart when no cart exists", async () => {
    const cartChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(cartChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("empty_cart");
    }
  });

  it("returns valid:false with empty_cart when cart has zero items", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(cartChain).mockReturnValueOnce(itemsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("empty_cart");
    }
  });

  it("returns out_of_stock error with product_id, available, and requested", async () => {
    const product = makeProduct({ id: "prod-1", stock_quantity: 3 });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 5 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("out_of_stock");
      expect(result.errors[0].product_id).toBe("prod-1");
      expect(result.errors[0].available).toBe(3);
      expect(result.errors[0].requested).toBe(5);
    }
  });

  it("returns product_unavailable error when product is inactive", async () => {
    const product = makeProduct({ id: "prod-1", status: "inactive" });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("product_unavailable");
      expect(result.errors[0].product_id).toBe("prod-1");
    }
  });

  it("returns product_unavailable error when product is deleted", async () => {
    const product = makeProduct({ id: "prod-1", is_deleted: true });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("product_unavailable");
    }
  });

  it("returns product_unavailable when product is not found in DB", async () => {
    const cartItem = makeCartItem({ product_id: "prod-missing", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [] }); // product not in results

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("product_unavailable");
      expect(result.errors[0].product_id).toBe("prod-missing");
    }
  });

  it("groups multiple items from same supplier into single supplier_group", async () => {
    const product1 = makeProduct({
      id: "prod-1",
      name: "Gloves",
      price: "10.00",
      supplier_id: SUPPLIER_1,
      suppliers: { company_name: "MedSupply Co" },
    });
    const product2 = makeProduct({
      id: "prod-2",
      name: "Masks",
      price: "5.00",
      supplier_id: SUPPLIER_1,
      suppliers: { company_name: "MedSupply Co" },
    });

    const item1 = makeCartItem({ id: "item-1", product_id: "prod-1", quantity: 2 });
    const item2 = makeCartItem({ id: "item-2", product_id: "prod-2", quantity: 4 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [item1, item2] });
    const productsChain = mockQuery({ data: [product1, product2] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.supplier_groups).toHaveLength(1);
      expect(result.order_preview.supplier_groups[0].supplier_id).toBe(SUPPLIER_1);
      expect(result.order_preview.supplier_groups[0].items).toHaveLength(2);
      // 10*2 + 5*4 = 20 + 20 = 40
      expect(result.order_preview.supplier_groups[0].subtotal).toBe(40.0);
      expect(result.order_preview.subtotal).toBe(40.0);
    }
  });

  it("creates separate supplier_groups for different suppliers", async () => {
    const product1 = makeProduct({
      id: "prod-1",
      name: "Gloves",
      price: "10.00",
      supplier_id: SUPPLIER_1,
      suppliers: { company_name: "MedSupply Co" },
    });
    const product2 = makeProduct({
      id: "prod-2",
      name: "Bandages",
      price: "20.00",
      supplier_id: SUPPLIER_2,
      suppliers: { company_name: "BandagePro" },
    });

    const item1 = makeCartItem({ id: "item-1", product_id: "prod-1", quantity: 3 });
    const item2 = makeCartItem({ id: "item-2", product_id: "prod-2", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [item1, item2] });
    const productsChain = mockQuery({ data: [product1, product2] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.supplier_groups).toHaveLength(2);

      const group1 = result.order_preview.supplier_groups.find(
        (g) => g.supplier_id === SUPPLIER_1,
      )!;
      const group2 = result.order_preview.supplier_groups.find(
        (g) => g.supplier_id === SUPPLIER_2,
      )!;

      expect(group1.subtotal).toBe(30.0); // 10 * 3
      expect(group2.subtotal).toBe(20.0); // 20 * 1
      expect(result.order_preview.subtotal).toBe(50.0);
    }
  });

  it("uses CURRENT product price, not stale cart price", async () => {
    // Cart had price $10, but product now costs $15
    const product = makeProduct({ id: "prod-1", price: "15.00" });
    const cartItem = makeCartItem({
      product_id: "prod-1",
      quantity: 2,
      unit_price: "10.00",
    });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      // Should use $15 (current), not $10 (cart)
      expect(result.order_preview.items[0].current_price).toBe(15.0);
      expect(result.order_preview.items[0].subtotal).toBe(30.0); // 15 * 2
      expect(result.order_preview.subtotal).toBe(30.0);
    }
  });

  it("calculates tax on current-price subtotal", async () => {
    process.env.TAX_RATE = "0.10"; // 10% for easy math

    const product = makeProduct({ id: "prod-1", price: "100.00" });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.subtotal).toBe(100.0);
      expect(result.order_preview.tax_rate).toBe(0.1);
      expect(result.order_preview.tax_amount).toBe(10.0);
      expect(result.order_preview.total).toBe(110.0);
    }
  });

  it("throws AppError when cart_items query fails", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: null, error: { message: "DB failure" } });

    mockFrom.mockReturnValueOnce(cartChain).mockReturnValueOnce(itemsChain);

    await expect(CheckoutService.validateCheckout(USER_ID, validAddress)).rejects.toThrow(
      "DB failure",
    );
  });

  it("throws AppError when products query fails", async () => {
    const cartItem = makeCartItem();

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: null, error: { message: "Products DB error" } });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(CheckoutService.validateCheckout(USER_ID, validAddress)).rejects.toThrow(
      "Products DB error",
    );
  });

  it("includes product_name in out_of_stock error", async () => {
    const product = makeProduct({
      id: "prod-1",
      name: "Special Mask",
      stock_quantity: 0,
    });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].product_name).toBe("Special Mask");
    }
  });

  it("uses default TAX_RATE when env var is not set", async () => {
    delete process.env.TAX_RATE;

    const product = makeProduct({ id: "prod-1", price: "100.00" });
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.tax_rate).toBe(0.0825);
      expect(result.order_preview.tax_amount).toBe(8.25);
    }
  });

  it("returns shipping_address in order_preview", async () => {
    const product = makeProduct();
    const cartItem = makeCartItem({ product_id: "prod-1", quantity: 1 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    const result = await CheckoutService.validateCheckout(USER_ID, validAddress);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.order_preview.shipping_address).toEqual(validAddress);
    }
  });
});
