import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Seed script must NOT run in production!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const SUPPLIER_USER_ID = "00000000-0000-0000-0000-000000000002";
const SUPPLIER_ID = "00000000-0000-0000-0000-000000000012";
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000003";

const PRODUCT_IDS = [
  "00000000-0000-0000-0000-000000000101",
  "00000000-0000-0000-0000-000000000102",
  "00000000-0000-0000-0000-000000000103",
  "00000000-0000-0000-0000-000000000104",
  "00000000-0000-0000-0000-000000000105",
];

async function seed(): Promise<void> {
  console.log("Seeding database...\n");

  // 1. Admin user
  console.log("  Creating admin user...");
  await supabase.from("users").upsert(
    {
      id: ADMIN_ID,
      email: "admin@aplusmeddepot.com",
      first_name: "Admin",
      last_name: "User",
      role: "admin",
      status: "approved",
    },
    { onConflict: "id" },
  );

  // 2. Supplier user + supplier record
  console.log("  Creating test supplier...");
  await supabase.from("users").upsert(
    {
      id: SUPPLIER_USER_ID,
      email: "supplier@test.com",
      first_name: "Test",
      last_name: "Supplier",
      role: "supplier",
      status: "approved",
    },
    { onConflict: "id" },
  );

  await supabase.from("suppliers").upsert(
    {
      id: SUPPLIER_ID,
      user_id: SUPPLIER_USER_ID,
      company_name: "Test Medical Supplies Inc.",
      contact_email: "supplier@test.com",
      contact_phone: "555-0100",
      address: "123 Medical Way",
      commission_rate: 15.0,
      status: "approved",
    },
    { onConflict: "id" },
  );

  // 3. Customer user
  console.log("  Creating test customer...");
  await supabase.from("users").upsert(
    {
      id: CUSTOMER_ID,
      email: "customer@test.com",
      first_name: "Test",
      last_name: "Customer",
      role: "customer",
      status: "approved",
    },
    { onConflict: "id" },
  );

  // 4. Sample products
  console.log("  Creating sample products...");
  const products = [
    {
      id: PRODUCT_IDS[0],
      supplier_id: SUPPLIER_ID,
      name: "Disposable Nitrile Gloves (Box of 100)",
      description: "Powder-free nitrile examination gloves, medium size",
      price: 12.99,
      stock_quantity: 500,
      category: "PPE",
      status: "active",
      sku: "SEED-GLV-001",
    },
    {
      id: PRODUCT_IDS[1],
      supplier_id: SUPPLIER_ID,
      name: "Digital Thermometer",
      description: "Fast-read digital thermometer with fever alert",
      price: 24.99,
      stock_quantity: 200,
      category: "Diagnostics",
      status: "active",
      sku: "SEED-THM-001",
    },
    {
      id: PRODUCT_IDS[2],
      supplier_id: SUPPLIER_ID,
      name: "Surgical Masks (Box of 50)",
      description: "3-ply disposable surgical face masks, ASTM Level 2",
      price: 8.99,
      stock_quantity: 1000,
      category: "PPE",
      status: "active",
      sku: "SEED-MSK-001",
    },
    {
      id: PRODUCT_IDS[3],
      supplier_id: SUPPLIER_ID,
      name: "Blood Pressure Monitor",
      description: "Automatic upper arm blood pressure monitor with large cuff",
      price: 49.99,
      stock_quantity: 75,
      category: "Diagnostics",
      status: "active",
      sku: "SEED-BPM-001",
    },
    {
      id: PRODUCT_IDS[4],
      supplier_id: SUPPLIER_ID,
      name: "First Aid Kit - Professional",
      description: "299-piece professional first aid kit, OSHA compliant",
      price: 89.99,
      stock_quantity: 50,
      category: "First Aid",
      status: "active",
      sku: "SEED-FAK-001",
    },
  ];

  for (const product of products) {
    await supabase.from("products").upsert(product, { onConflict: "id" });
  }

  // 5. Credit for test customer
  console.log("  Setting up customer credit...");
  await supabase.from("user_credit").upsert(
    {
      user_id: CUSTOMER_ID,
      credit_limit: 50000.0,
      credit_used: 0.0,
      eligible: true,
    },
    { onConflict: "user_id" },
  );

  console.log("\nSeed complete! Created:");
  console.log("  - Admin: admin@aplusmeddepot.com");
  console.log("  - Supplier: supplier@test.com (commission_rate: 15%)");
  console.log("  - Customer: customer@test.com (credit: $50,000)");
  console.log("  - 5 sample products across PPE, Diagnostics, First Aid");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
