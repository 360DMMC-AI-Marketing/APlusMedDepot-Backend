import { z } from "zod";

export const supplierRegistrationSchema = z.object({
  businessName: z
    .string()
    .min(1, "Business name is required")
    .max(255, "Business name must be 255 characters or less"),
  businessType: z.string().max(100, "Business type must be 100 characters or less").optional(),
  taxId: z.string().min(1, "Tax ID is required").max(50, "Tax ID must be 50 characters or less"),
  contactName: z
    .string()
    .min(1, "Contact name is required")
    .max(255, "Contact name must be 255 characters or less"),
  contactEmail: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone is required").max(20, "Phone must be 20 characters or less"),
  address: z.object({
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zip: z.string().min(1, "ZIP code is required"),
    country: z.string().default("US"),
  }),
  bankAccountInfo: z.object({
    bankName: z.string().min(1, "Bank name is required"),
    accountNumber: z.string().min(1, "Account number is required"),
    routingNumber: z.string().min(1, "Routing number is required"),
  }),
  productCategories: z
    .array(z.string())
    .min(1, "At least one product category is required")
    .max(10, "Maximum 10 product categories allowed"),
});

export type SupplierRegistrationInput = z.infer<typeof supplierRegistrationSchema>;
