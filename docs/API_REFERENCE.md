# API Reference

Quick reference for mounted endpoints in `src/index.ts`.

## System
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/health` | No | Public | Health check |
| GET | `/api-docs` | No | Public | Swagger UI |

## Auth
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/auth/register` | No | Public | Register customer/supplier account |
| POST | `/api/auth/login` | No | Public | Login and create session |
| GET | `/api/auth/session` | Yes | Authenticated | Get current session/user |
| POST | `/api/auth/logout` | No | Public | Logout (token/session invalidation in service) |
| POST | `/api/auth/refresh` | No | Public | Refresh access token |
| POST | `/api/auth/forgot-password` | No | Public | Request password reset token/email |
| POST | `/api/auth/reset-password` | No | Public | Reset password with token |
| POST | `/api/auth/verify-email` | No | Public | Verify email token |
| POST | `/api/auth/resend-verification` | No | Public | Resend verification email |

## User Profile and Notifications
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/users/me` | Yes | Authenticated | Get own profile |
| PUT | `/api/users/me` | Yes | Authenticated | Update own profile |
| POST | `/api/users/me/change-password` | Yes | Authenticated | Change password |
| GET | `/api/users/me/credit` | Yes | Authenticated | Get Net30 credit profile |
| GET | `/api/notifications` | Yes | Authenticated | List own notifications |
| GET | `/api/notifications/unread-count` | Yes | Authenticated | Get unread count |
| PUT | `/api/notifications/read-all` | Yes | Authenticated | Mark all notifications as read |
| PUT | `/api/notifications/:id/read` | Yes | Authenticated | Mark one notification as read |
| DELETE | `/api/notifications/:id` | Yes | Authenticated | Delete one notification |

## Product Catalog
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/products` | Yes | Authenticated | List products with filtering/pagination |
| GET | `/api/products/search` | Yes | Authenticated | Full-text product search |
| GET | `/api/products/:id/stock` | No | Public | Check stock availability |
| GET | `/api/products/:id` | Yes | Authenticated | Get product detail |
| POST | `/api/products` | Yes | Supplier, Admin | Create product |
| PUT | `/api/products/:id` | Yes | Supplier, Admin | Update product |
| DELETE | `/api/products/:id` | Yes | Supplier, Admin | Soft-delete product |
| POST | `/api/products/:id/images` | Yes | Supplier, Admin | Upload product image |
| DELETE | `/api/products/:id/images/:imageIndex` | Yes | Supplier, Admin | Delete product image |
| GET | `/api/products/:id/reviews` | No | Public | TODO placeholder |
| POST | `/api/products/:id/reviews` | No | Public | TODO placeholder |

## Cart and Checkout
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/cart` | Yes | Customer | Get active cart |
| GET | `/api/cart/validate` | Yes | Customer | Validate cart state |
| POST | `/api/cart/refresh` | Yes | Customer | Refresh stale cart items |
| POST | `/api/cart/items` | Yes | Customer | Add item to cart |
| PUT | `/api/cart/items/:id` | Yes | Customer | Update quantity |
| DELETE | `/api/cart/items/:id` | Yes | Customer | Remove cart item |
| DELETE | `/api/cart` | Yes | Customer | Clear cart |
| POST | `/api/checkout/validate` | Yes | Customer | Validate checkout prior to payment |

## Orders
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/orders` | Yes | Customer | Create order from cart |
| GET | `/api/orders` | Yes | Customer | List customer orders |
| GET | `/api/orders/:id` | Yes | Authenticated | Get order detail (service enforces ownership/access) |
| GET | `/api/orders/:id/confirmation` | Yes | Customer | Post-payment confirmation view |
| PUT | `/api/orders/:id/status` | Yes | Admin | Update order status |

## Payments (Stripe, PayPal, Net30)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/payments/intent` | Yes | Customer | Create Stripe PaymentIntent |
| POST | `/api/payments/confirm` | Yes | Customer | Confirm payment |
| GET | `/api/payments/:orderId/status` | Yes | Customer | Payment status for order |
| POST | `/api/payments/retry` | Yes | Customer | Retry failed/pending payment |
| GET | `/api/payments/:orderId/attempts` | Yes | Customer | Payment attempt list |
| GET | `/api/payments/:orderId/history` | Yes | Customer, Admin | Payment history |
| POST | `/api/payments/refund` | Yes | Customer | Refund/cancel order |
| POST | `/api/payments/webhook` | No | Stripe | Stripe webhook endpoint |
| POST | `/api/payments/paypal/create-order` | Yes | Customer | Create PayPal order |
| POST | `/api/payments/paypal/capture` | Yes | Customer | Capture PayPal order |
| POST | `/api/payments/net30` | Yes | Authenticated | Place Net30 order |

## Supplier Account
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/suppliers/me` | Yes | Supplier | Get own supplier profile |
| PUT | `/api/suppliers/me` | Yes | Supplier | Update own supplier profile |
| POST | `/api/suppliers/me/documents` | Yes | Supplier | Upload supplier document |
| GET | `/api/suppliers/me/documents` | Yes | Supplier | List supplier documents |
| DELETE | `/api/suppliers/me/documents/:documentId` | Yes | Supplier | Delete supplier document |
| PUT | `/api/suppliers/me/resubmit` | Yes | Supplier | Resubmit application |
| POST | `/api/suppliers/register` | Yes | Supplier | Submit supplier registration |
| GET | `/api/suppliers` | No | Public | TODO placeholder |
| GET | `/api/suppliers/:id` | No | Public | TODO placeholder |
| PUT | `/api/suppliers/:id` | No | Public | TODO placeholder |
| GET | `/api/suppliers/:id/products` | No | Public | TODO placeholder |
| GET | `/api/suppliers/:id/orders` | No | Public | TODO placeholder |
| GET | `/api/suppliers/:id/analytics` | No | Public | TODO placeholder |

## Supplier Products, Inventory, Analytics, Orders, Payouts
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/suppliers/products/bulk-import` | Yes | Supplier | Bulk import products |
| GET | `/api/suppliers/products/stats` | Yes | Supplier | Supplier product stats |
| GET | `/api/suppliers/products` | Yes | Supplier | List own products |
| POST | `/api/suppliers/products` | Yes | Supplier | Create supplier product |
| GET | `/api/suppliers/products/:id/analytics` | Yes | Supplier | Product analytics |
| PUT | `/api/suppliers/products/:id` | Yes | Supplier | Update supplier product |
| DELETE | `/api/suppliers/products/:id` | Yes | Supplier | Soft-delete supplier product |
| POST | `/api/suppliers/products/:id/images` | Yes | Supplier | Upload supplier product image |
| DELETE | `/api/suppliers/products/:id/images/:imageIndex` | Yes | Supplier | Delete supplier product image |
| GET | `/api/suppliers/inventory/low-stock` | Yes | Supplier | List low-stock products |
| GET | `/api/suppliers/inventory` | Yes | Supplier | Inventory list |
| PUT | `/api/suppliers/inventory/:productId` | Yes | Supplier | Update stock |
| POST | `/api/suppliers/inventory/bulk-update` | Yes | Supplier | Bulk stock update |
| GET | `/api/suppliers/analytics/products` | Yes | Supplier | Aggregate analytics |
| GET | `/api/suppliers/analytics/dashboard` | Yes | Supplier | Dashboard metrics |
| GET | `/api/suppliers/analytics/top-products` | Yes | Supplier | Top products |
| GET | `/api/suppliers/analytics/revenue-trend` | Yes | Supplier | Revenue trend |
| GET | `/api/suppliers/analytics/order-status` | Yes | Supplier | Order status breakdown |
| GET | `/api/suppliers/me/orders` | Yes | Supplier | List supplier orders |
| GET | `/api/suppliers/me/orders/stats` | Yes | Supplier | Supplier order stats |
| GET | `/api/suppliers/me/orders/:id` | Yes | Supplier | Supplier order detail |
| PUT | `/api/suppliers/me/orders/items/:itemId/fulfillment` | Yes | Supplier | Update item fulfillment |
| GET | `/api/suppliers/me/payouts/balance` | Yes | Supplier | Supplier payout balance |
| GET | `/api/suppliers/me/payouts/history` | Yes | Supplier | Supplier payout history |
| GET | `/api/suppliers/me/payouts/summary` | Yes | Supplier | Supplier payout summary |
| GET | `/api/suppliers/me/payouts/report` | Yes | Supplier | Supplier payout report |
| GET | `/api/commissions` | Yes | Supplier | Own commission rows |
| GET | `/api/commissions/summary` | Yes | Supplier | Own commission summary |
| GET | `/api/commissions/order/:orderId` | Yes | Admin | Order-level commission view |
| GET | `/api/commissions/supplier/:supplierId` | Yes | Admin | Supplier-level commission view |

## Admin: Users
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/users` | Yes | Admin | List users |
| GET | `/api/admin/users/pending-count` | Yes | Admin | Pending user count |
| GET | `/api/admin/users/:id` | Yes | Admin | User detail |
| PUT | `/api/admin/users/:id/approve` | Yes | Admin | Approve user |
| PUT | `/api/admin/users/:id/reject` | Yes | Admin | Reject user |
| PUT | `/api/admin/users/:id/suspend` | Yes | Admin | Suspend user |
| PUT | `/api/admin/users/:id/reactivate` | Yes | Admin | Reactivate user |

## Admin: Orders
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/orders` | Yes | Admin | List orders |
| GET | `/api/admin/orders/search` | Yes | Admin | Search orders |
| GET | `/api/admin/orders/status-counts` | Yes | Admin | Order counts by status |
| GET | `/api/admin/orders/:id` | Yes | Admin | Order detail |

## Admin: Products
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/products` | Yes | Admin | Product list |
| GET | `/api/admin/products/pending` | Yes | Admin | Pending product list |
| GET | `/api/admin/products/:id` | Yes | Admin | Product detail |
| GET | `/api/admin/products/:id/review` | Yes | Admin | Product review detail |
| PUT | `/api/admin/products/:id/approve` | Yes | Admin | Approve product |
| PUT | `/api/admin/products/:id/request-changes` | Yes | Admin | Request product changes |
| PUT | `/api/admin/products/:id/reject` | Yes | Admin | Reject product |
| PUT | `/api/admin/products/:id/feature` | Yes | Admin | Mark featured |
| PUT | `/api/admin/products/:id/unfeature` | Yes | Admin | Remove featured flag |

## Admin: Suppliers and Payouts
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/suppliers` | Yes | Admin | List suppliers |
| GET | `/api/admin/suppliers/commissions` | Yes | Admin | Supplier commission report |
| GET | `/api/admin/suppliers/:id` | Yes | Admin | Supplier detail |
| PUT | `/api/admin/suppliers/:id/approve` | Yes | Admin | Approve supplier |
| PUT | `/api/admin/suppliers/:id/reject` | Yes | Admin | Reject supplier |
| PUT | `/api/admin/suppliers/:id/request-revision` | Yes | Admin | Request supplier revision |
| PUT | `/api/admin/suppliers/:id/review` | Yes | Admin | Move supplier to under review |
| POST | `/api/admin/payouts` | Yes | Admin | Create payout record |

## Admin: Platform Analytics, Dashboard, Commissions
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/dashboard` | Yes | Admin | Dashboard summary |
| GET | `/api/admin/analytics/revenue` | Yes | Admin | Revenue metrics |
| GET | `/api/admin/analytics/revenue/suppliers` | Yes | Admin | Revenue by supplier |
| GET | `/api/admin/analytics/revenue/categories` | Yes | Admin | Revenue by category |
| GET | `/api/admin/analytics/revenue/trend` | Yes | Admin | Revenue trend |
| GET | `/api/admin/analytics/orders` | Yes | Admin | Order metrics |
| GET | `/api/admin/analytics/top-products` | Yes | Admin | Top products |
| GET | `/api/admin/commissions/earnings` | Yes | Admin | Platform commission earnings |
| GET | `/api/admin/commissions/by-supplier` | Yes | Admin | Commission by supplier |
| GET | `/api/admin/commissions/trend` | Yes | Admin | Commission trend |

## Admin: Notifications, Audit Logs, AI Vendor Verification
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/admin/notifications/bulk` | Yes | Admin | Send bulk notifications |
| POST | `/api/admin/notifications/role` | Yes | Admin | Send role-based notifications |
| GET | `/api/admin/audit-logs` | Yes | Admin | Audit log search/list |
| GET | `/api/admin/audit-logs/resource/:type/:id` | Yes | Admin | Audit logs for resource |
| GET | `/api/admin/audit-logs/admin/:adminId` | Yes | Admin | Audit logs by admin |
| POST | `/api/admin/vendors/:id/ai-verify` | Yes | Admin | AI risk verification for vendor |

## Legacy Placeholder Endpoints
These are currently mounted in `src/routes/admin.ts` and return TODO payloads.

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/admin/users` | No | Public | TODO placeholder |
| PUT | `/api/admin/users/:id/role` | No | Public | TODO placeholder |
| PUT | `/api/admin/users/:id/status` | No | Public | TODO placeholder |
| GET | `/api/admin/orders` | No | Public | TODO placeholder |
| GET | `/api/admin/suppliers/pending` | No | Public | TODO placeholder |
| PUT | `/api/admin/suppliers/:id/approve` | No | Public | TODO placeholder |
| GET | `/api/admin/analytics` | No | Public | TODO placeholder |
