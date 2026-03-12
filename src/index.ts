import "express-async-errors";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { errorHandler } from "./middleware/errorHandler";
import {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  webhookLimiter,
  searchLimiter,
} from "./middleware/rateLimiter";

import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/order.routes";
import paymentRoutes from "./routes/payments";
import supplierRoutes from "./routes/suppliers";
import adminRoutes from "./routes/admin";
import adminSupplierRoutes from "./routes/adminSuppliers";
import adminProductRoutes from "./routes/adminProduct.routes";
import checkoutRoutes from "./routes/checkout.routes";
import supplierProductRoutes from "./routes/supplierProduct.routes";
import supplierInventoryRoutes from "./routes/supplierInventory.routes";
import supplierAnalyticsRoutes from "./routes/supplierAnalytics.routes";
import commissionRoutes from "./routes/commission.routes";
import { supplierPayoutRouter, adminPayoutRouter } from "./routes/payout.routes";
import supplierOrderRoutes from "./routes/supplierOrder.routes";
import adminUserRoutes from "./routes/adminUser.routes";
import adminOrderRoutes from "./routes/adminOrder.routes";
import platformAnalyticsRoutes from "./routes/platformAnalytics.routes";
import adminDashboardRoutes from "./routes/adminDashboard.routes";
import commissionReportRoutes from "./routes/commissionReport.routes";
import { notificationUserRouter, notificationAdminRouter } from "./routes/notification.routes";
import auditLogRoutes from "./routes/auditLog.routes";
import userProfileRoutes from "./routes/userProfile.routes";

const app = express();

// Global middleware
app.use(helmet());
app.use(cors());
// Raw body for Stripe webhook signature verification (must precede express.json)
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Rate limiting — global first, then route-specific
app.use(globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/payments/webhook", webhookLimiter);
app.use("/api/payments", paymentLimiter);
app.use("/api/products/search", searchLimiter);

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "APlusMedDepot API",
      version: "0.1.0",
      description: "Multi-vendor medical supplies marketplace API",
    },
    servers: [{ url: "/api" }],
  },
  apis: ["./src/routes/*.ts"],
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use("/api/users", userProfileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/suppliers/analytics", supplierAnalyticsRoutes);
app.use("/api/suppliers/inventory", supplierInventoryRoutes);
app.use("/api/suppliers/products", supplierProductRoutes);
app.use("/api/suppliers/me/orders", supplierOrderRoutes);
app.use("/api/suppliers/me/payouts", supplierPayoutRouter);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/admin/suppliers", adminSupplierRoutes);
app.use("/api/admin/payouts", adminPayoutRouter);
app.use("/api/admin/analytics", platformAnalyticsRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/commissions", commissionReportRoutes);
app.use("/api/admin/notifications", notificationAdminRouter);
app.use("/api/admin/audit-logs", auditLogRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationUserRouter);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/commissions", commissionRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
