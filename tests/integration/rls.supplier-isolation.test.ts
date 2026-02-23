/**
 * RLS (Row Level Security) Supplier Isolation Tests
 *
 * IMPORTANT: These tests require a REAL Supabase instance to run.
 * They will be skipped if running against the test placeholder (test.supabase.co).
 *
 * To run these tests:
 * 1. Set up a real Supabase project (development or staging)
 * 2. Create a .env.integration file with real SUPABASE_URL and keys
 * 3. Run: NODE_ENV=integration npm test -- rls.supplier-isolation
 *
 * These tests verify that RLS policies correctly isolate supplier data:
 * - Suppliers can only access their own data
 * - Customers can only see active products
 * - Admins can access all data
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../src/config/supabase";
import env from "../../src/config/env";

// Skip all tests if using test placeholder URL
const isTestPlaceholder =
  env.SUPABASE_URL.includes("test.supabase.co") || env.SUPABASE_URL.includes("localhost");
const describeOrSkip = isTestPlaceholder ? describe.skip : describe;

// Notify if tests are being skipped
if (isTestPlaceholder) {
  console.log(
    "\n⚠️  RLS Supplier Isolation tests skipped - requires real Supabase instance.\n" +
      "   Set up .env.integration with real Supabase URL to run these tests.\n",
  );
}

// Test user IDs (will be created in beforeAll)
let userAId: string;
let userBId: string;
let userCId: string;
let userAdminId: string;

// Test supplier IDs
let supplierAId: string;
let supplierBId: string;

// Test product IDs
let productXId: string;
let productYId: string;
let productZId: string;
let productWId: string; // Supplier B's draft product

// User-scoped Supabase clients
let clientA: SupabaseClient;
let clientC: SupabaseClient;
let clientAdmin: SupabaseClient;

// Test user credentials
const testPassword = "TestPassword123!";

// Skip setup/teardown entirely when using placeholder — the tests are skipped anyway
// and the Supabase API calls in beforeAll will time out against a fake URL.
const beforeAllOrSkip = isTestPlaceholder ? (_fn: () => Promise<void>) => {} : beforeAll;
const afterAllOrSkip = isTestPlaceholder ? (_fn: () => Promise<void>) => {} : afterAll;

beforeAllOrSkip(async () => {
  // ============================================
  // Clean up leftover data from previous test runs
  // ============================================
  const testEmails = [
    "supplier-a-rls@test.com",
    "supplier-b-rls@test.com",
    "customer-c-rls@test.com",
    "admin-rls@test.com",
  ];

  // 1. Delete products belonging to stale suppliers
  const { data: staleSuppliers } = await supabaseAdmin
    .from("suppliers")
    .select("id")
    .in("contact_email", ["supplier-a-rls@test.com", "supplier-b-rls@test.com"]);

  if (staleSuppliers && staleSuppliers.length > 0) {
    const staleIds = staleSuppliers.map((s) => s.id);
    await supabaseAdmin.from("products").delete().in("supplier_id", staleIds);
  }

  // 2. Delete stale suppliers
  await supabaseAdmin
    .from("suppliers")
    .delete()
    .in("contact_email", ["supplier-a-rls@test.com", "supplier-b-rls@test.com"]);

  // 3. Delete stale user records
  await supabaseAdmin.from("users").delete().in("email", testEmails);

  // 4. Delete stale auth users
  const { data: authList } = await supabaseAdmin.auth.admin.listUsers();
  if (authList?.users) {
    for (const user of authList.users) {
      if (user.email && testEmails.includes(user.email)) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(user.id);
        } catch {
          // Ignore — user may already be deleted
        }
      }
    }
  }

  // ============================================
  // Create test users via Supabase Auth
  // ============================================

  // User A - Supplier
  const { data: authUserA, error: authErrorA } = await supabaseAdmin.auth.admin.createUser({
    email: "supplier-a-rls@test.com",
    password: testPassword,
    email_confirm: true,
  });
  if (authErrorA || !authUserA.user) {
    throw new Error(`Failed to create auth user A: ${authErrorA?.message}`);
  }
  userAId = authUserA.user.id;

  // User B - Supplier
  const { data: authUserB, error: authErrorB } = await supabaseAdmin.auth.admin.createUser({
    email: "supplier-b-rls@test.com",
    password: testPassword,
    email_confirm: true,
  });
  if (authErrorB || !authUserB.user) {
    throw new Error(`Failed to create auth user B: ${authErrorB?.message}`);
  }
  userBId = authUserB.user.id;

  // User C - Customer
  const { data: authUserC, error: authErrorC } = await supabaseAdmin.auth.admin.createUser({
    email: "customer-c-rls@test.com",
    password: testPassword,
    email_confirm: true,
  });
  if (authErrorC || !authUserC.user) {
    throw new Error(`Failed to create auth user C: ${authErrorC?.message}`);
  }
  userCId = authUserC.user.id;

  // User Admin
  const { data: authUserAdmin, error: authErrorAdmin } = await supabaseAdmin.auth.admin.createUser({
    email: "admin-rls@test.com",
    password: testPassword,
    email_confirm: true,
  });
  if (authErrorAdmin || !authUserAdmin.user) {
    throw new Error(`Failed to create auth user Admin: ${authErrorAdmin?.message}`);
  }
  userAdminId = authUserAdmin.user.id;

  // ============================================
  // Insert user records (bypassing RLS)
  // ============================================

  const { error: usersError } = await supabaseAdmin.from("users").insert([
    {
      id: userAId,
      email: "supplier-a-rls@test.com",
      password_hash: "hashed",
      first_name: "Supplier",
      last_name: "A",
      role: "supplier",
      status: "approved",
    },
    {
      id: userBId,
      email: "supplier-b-rls@test.com",
      password_hash: "hashed",
      first_name: "Supplier",
      last_name: "B",
      role: "supplier",
      status: "approved",
    },
    {
      id: userCId,
      email: "customer-c-rls@test.com",
      password_hash: "hashed",
      first_name: "Customer",
      last_name: "C",
      role: "customer",
      status: "approved",
      company_name: "Test Company",
    },
    {
      id: userAdminId,
      email: "admin-rls@test.com",
      password_hash: "hashed",
      first_name: "Admin",
      last_name: "User",
      role: "admin",
      status: "approved",
    },
  ]);
  if (usersError) {
    throw new Error(`Failed to insert users: ${usersError.message}`);
  }

  // ============================================
  // Create supplier records
  // ============================================

  const { data: supplierAData, error: supplierAError } = await supabaseAdmin
    .from("suppliers")
    .insert({
      user_id: userAId,
      business_name: "Supplier A Business",
      tax_id: "TAX-A-123",
      contact_name: "Supplier A Contact",
      contact_email: "supplier-a-rls@test.com",
      phone: "555-0001",
      address: { street: "123 A St", city: "City A", state: "CA", zip: "90001", country: "US" },
      bank_account_info: { bank_name: "Bank A", account_number: "1234", routing_number: "5678" },
      product_categories: ["Medical Supplies"],
      status: "approved",
      commission_rate: 15.0,
    })
    .select("id")
    .single();

  if (supplierAError || !supplierAData) {
    throw new Error(`Failed to create supplier A: ${supplierAError?.message}`);
  }
  supplierAId = supplierAData.id;

  const { data: supplierBData, error: supplierBError } = await supabaseAdmin
    .from("suppliers")
    .insert({
      user_id: userBId,
      business_name: "Supplier B Business",
      tax_id: "TAX-B-456",
      contact_name: "Supplier B Contact",
      contact_email: "supplier-b-rls@test.com",
      phone: "555-0002",
      address: { street: "456 B St", city: "City B", state: "NY", zip: "10001", country: "US" },
      bank_account_info: { bank_name: "Bank B", account_number: "9876", routing_number: "5432" },
      product_categories: ["Surgical Supplies"],
      status: "approved",
      commission_rate: 12.0,
    })
    .select("id")
    .single();

  if (supplierBError || !supplierBData) {
    throw new Error(`Failed to create supplier B: ${supplierBError?.message}`);
  }
  supplierBId = supplierBData.id;

  // ============================================
  // Create product records
  // ============================================

  // Product X - belongs to Supplier A, active
  const { data: productXData, error: productXError } = await supabaseAdmin
    .from("products")
    .insert({
      supplier_id: supplierAId,
      name: "Product X",
      sku: "SKU-X-001",
      price: 100.0,
      stock_quantity: 50,
      category: "Medical Supplies",
      status: "active",
      is_deleted: false,
    })
    .select("id")
    .single();

  if (productXError || !productXData) {
    throw new Error(`Failed to create product X: ${productXError?.message}`);
  }
  productXId = productXData.id;

  // Product Y - belongs to Supplier B, active
  const { data: productYData, error: productYError } = await supabaseAdmin
    .from("products")
    .insert({
      supplier_id: supplierBId,
      name: "Product Y",
      sku: "SKU-Y-002",
      price: 200.0,
      stock_quantity: 30,
      category: "Surgical Supplies",
      status: "active",
      is_deleted: false,
    })
    .select("id")
    .single();

  if (productYError || !productYData) {
    throw new Error(`Failed to create product Y: ${productYError?.message}`);
  }
  productYId = productYData.id;

  // Product Z - belongs to Supplier A, pending (not visible to customers)
  const { data: productZData, error: productZError } = await supabaseAdmin
    .from("products")
    .insert({
      supplier_id: supplierAId,
      name: "Product Z",
      sku: "SKU-Z-003",
      price: 150.0,
      stock_quantity: 20,
      category: "Medical Supplies",
      status: "pending",
      is_deleted: false,
    })
    .select("id")
    .single();

  if (productZError || !productZData) {
    throw new Error(`Failed to create product Z: ${productZError?.message}`);
  }
  productZId = productZData.id;

  // Product W - belongs to Supplier B, pending (for testing isolation)
  const { data: productWData, error: productWError } = await supabaseAdmin
    .from("products")
    .insert({
      supplier_id: supplierBId,
      name: "Product W",
      sku: "SKU-W-004",
      price: 175.0,
      stock_quantity: 15,
      category: "Surgical Supplies",
      status: "pending",
      is_deleted: false,
    })
    .select("id")
    .single();

  if (productWError || !productWData) {
    throw new Error(`Failed to create product W: ${productWError?.message}`);
  }
  productWId = productWData.id;

  // ============================================
  // Sign in as each user to get access tokens
  // ============================================

  const { data: sessionA, error: sessionErrorA } = await supabaseAdmin.auth.signInWithPassword({
    email: "supplier-a-rls@test.com",
    password: testPassword,
  });
  if (sessionErrorA || !sessionA.session) {
    throw new Error(`Failed to sign in as User A: ${sessionErrorA?.message}`);
  }

  // Note: We don't need to create a client for Supplier B
  // We only need B's data to test that A cannot access it

  const { data: sessionC, error: sessionErrorC } = await supabaseAdmin.auth.signInWithPassword({
    email: "customer-c-rls@test.com",
    password: testPassword,
  });
  if (sessionErrorC || !sessionC.session) {
    throw new Error(`Failed to sign in as User C: ${sessionErrorC?.message}`);
  }

  const { data: sessionAdmin, error: sessionErrorAdmin } =
    await supabaseAdmin.auth.signInWithPassword({
      email: "admin-rls@test.com",
      password: testPassword,
    });
  if (sessionErrorAdmin || !sessionAdmin.session) {
    throw new Error(`Failed to sign in as Admin: ${sessionErrorAdmin?.message}`);
  }

  // ============================================
  // Create user-scoped Supabase clients
  // ============================================

  clientA = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionA.session.access_token}`,
      },
    },
  });

  clientC = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionC.session.access_token}`,
      },
    },
  });

  clientAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionAdmin.session.access_token}`,
      },
    },
  });
});

afterAllOrSkip(async () => {
  // ============================================
  // Clean up test data in reverse order
  // ============================================

  // Delete products
  await supabaseAdmin
    .from("products")
    .delete()
    .in("id", [productXId, productYId, productZId, productWId]);

  // Delete suppliers
  await supabaseAdmin.from("suppliers").delete().in("id", [supplierAId, supplierBId]);

  // Delete users (cascade will handle related records)
  await supabaseAdmin.from("users").delete().in("id", [userAId, userBId, userCId, userAdminId]);

  // Delete auth users
  await supabaseAdmin.auth.admin.deleteUser(userAId);
  await supabaseAdmin.auth.admin.deleteUser(userBId);
  await supabaseAdmin.auth.admin.deleteUser(userCId);
  await supabaseAdmin.auth.admin.deleteUser(userAdminId);
});

describeOrSkip("Supplier Data Isolation", () => {
  test("Supplier A can read own supplier profile", async () => {
    const { data, error } = await clientA.from("suppliers").select("*").eq("id", supplierAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(supplierAId);
    expect(data![0].business_name).toBe("Supplier A Business");
  });

  test("Supplier A cannot read Supplier B profile", async () => {
    const { data, error } = await clientA.from("suppliers").select("*").eq("id", supplierBId);

    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS should filter out Supplier B's data
  });

  test("Supplier A sees own products and active products from others", async () => {
    const { data, error } = await clientA.from("products").select("*");

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // RLS uses OR logic for multiple SELECT policies:
    // - products_select_active: any authenticated user sees active products
    // - products_supplier_select_own: suppliers see all their own products
    // So Supplier A should see:
    // - Product X (own, active) ✓
    // - Product Z (own, pending) ✓
    // - Product Y (Supplier B, active) ✓
    // - Product W (Supplier B, pending) ✗ - key security check
    const productIds = data!.map((p) => p.id);
    expect(productIds).toContain(productXId);
    expect(productIds).toContain(productZId);
    expect(productIds).toContain(productYId); // CAN see - Product Y is active
    expect(productIds).not.toContain(productWId); // CANNOT see - Product W is pending and owned by B
  });

  test("Supplier A cannot update Supplier B product", async () => {
    const { data, error } = await clientA
      .from("products")
      .update({ name: "Hijacked Product Y" })
      .eq("id", productYId)
      .select();

    // Either error or 0 rows affected
    if (error) {
      // RLS might throw an error
      expect(error).toBeDefined();
    } else {
      // Or RLS might just return empty result (0 rows updated)
      expect(data).toEqual([]);
    }
  });

  test("Supplier A cannot read Supplier B commissions", async () => {
    // First, create a commission for Supplier B (if needed for this test)
    // For now, just test that Supplier A gets empty results when querying with Supplier B's ID

    const { data, error } = await clientA
      .from("commissions")
      .select("*")
      .eq("supplier_id", supplierBId);

    expect(error).toBeNull();
    expect(data).toEqual([]); // Should not see any commissions for Supplier B
  });
});

describeOrSkip("Customer Access", () => {
  test("Customer sees only active products", async () => {
    const { data, error } = await clientC.from("products").select("*");

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // Customer should see Product X and Y (both active), not pending Z or W
    const productIds = data!.map((p) => p.id);
    expect(productIds).toContain(productXId);
    expect(productIds).toContain(productYId);
    expect(productIds).not.toContain(productZId); // Should NOT see Product Z (pending)
    expect(productIds).not.toContain(productWId); // Should NOT see Product W (pending)

    // All returned products should be active
    data!.forEach((product) => {
      expect(product.status).toBe("active");
      expect(product.is_deleted).toBe(false);
    });
  });

  test("Customer cannot access suppliers table", async () => {
    const { data, error } = await clientC.from("suppliers").select("*");

    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS should return no supplier records to customers
  });
});

describeOrSkip("Admin Access", () => {
  test("Admin can read all suppliers", async () => {
    const { data, error } = await clientAdmin.from("suppliers").select("*");

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThanOrEqual(2); // At least Supplier A and B

    const supplierIds = data!.map((s) => s.id);
    expect(supplierIds).toContain(supplierAId);
    expect(supplierIds).toContain(supplierBId);
  });

  test("Admin can read all products including non-active statuses", async () => {
    const { data, error } = await clientAdmin.from("products").select("*");

    expect(error).toBeNull();
    expect(data).toBeDefined();

    // Admin should see all products including pending Z and W
    const productIds = data!.map((p) => p.id);
    expect(productIds).toContain(productXId);
    expect(productIds).toContain(productYId);
    expect(productIds).toContain(productZId); // Admin CAN see pending products
    expect(productIds).toContain(productWId); // Admin CAN see all suppliers' pending products
  });
});
