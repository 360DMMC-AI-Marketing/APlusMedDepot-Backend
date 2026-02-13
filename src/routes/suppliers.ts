import { Router, Request, Response } from "express";

import { SupplierController } from "../controllers/supplier.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { uploadDocuments, uploadDocument } from "../middleware/upload";
import { requireApprovedSupplier, requireAnySupplier } from "../middleware/requireSupplier";

const router = Router();

/**
 * @openapi
 * /suppliers/me:
 *   get:
 *     summary: Get current supplier's profile with documents
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supplier profile with documents
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier must be approved
 *       404:
 *         description: Supplier not found
 */
router.get(
  "/me",
  authenticate,
  authorize("supplier"),
  requireApprovedSupplier,
  SupplierController.getProfile,
);

/**
 * @openapi
 * /suppliers/me:
 *   put:
 *     summary: Update current supplier's profile
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *                 maxLength: 255
 *               businessType:
 *                 type: string
 *                 maxLength: 100
 *               contactName:
 *                 type: string
 *                 maxLength: 255
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *                   country:
 *                     type: string
 *               bankAccountInfo:
 *                 type: object
 *                 properties:
 *                   bankName:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   routingNumber:
 *                     type: string
 *               productCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 10
 *     responses:
 *       200:
 *         description: Supplier profile updated successfully
 *       400:
 *         description: Validation error or attempting to update blocked fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier must be approved
 */
router.put(
  "/me",
  authenticate,
  authorize("supplier"),
  requireApprovedSupplier,
  SupplierController.updateProfile,
);

/**
 * @openapi
 * /suppliers/me/documents:
 *   post:
 *     summary: Upload a single document
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - documentType
 *               - document
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [business_license, insurance, tax_document, certification, other]
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: Document file (PDF, DOC, DOCX, JPEG, PNG). Max 10MB.
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Validation error or no file uploaded
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier profile required
 */
router.post(
  "/me/documents",
  authenticate,
  authorize("supplier"),
  requireAnySupplier,
  uploadDocument,
  SupplierController.uploadDocument,
);

/**
 * @openapi
 * /suppliers/me/documents:
 *   get:
 *     summary: List all documents for current supplier
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents with signed URLs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier profile required
 */
router.get(
  "/me/documents",
  authenticate,
  authorize("supplier"),
  requireAnySupplier,
  SupplierController.listDocuments,
);

/**
 * @openapi
 * /suppliers/me/documents/{documentId}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Document deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier profile required
 *       404:
 *         description: Document not found or not owned by supplier
 */
router.delete(
  "/me/documents/:documentId",
  authenticate,
  authorize("supplier"),
  requireAnySupplier,
  SupplierController.deleteDocument,
);

/**
 * @openapi
 * /suppliers/me/resubmit:
 *   put:
 *     summary: Resubmit application (needs_revision → pending)
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Application resubmitted successfully
 *       400:
 *         description: Can only resubmit when status is needs_revision
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier profile required
 */
router.put(
  "/me/resubmit",
  authenticate,
  authorize("supplier"),
  requireAnySupplier,
  SupplierController.resubmitApplication,
);

/**
 * @openapi
 * /suppliers/register:
 *   post:
 *     summary: Submit supplier registration with business details and documents
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - taxId
 *               - contactName
 *               - contactEmail
 *               - phone
 *               - address
 *               - bankAccountInfo
 *               - productCategories
 *             properties:
 *               businessName:
 *                 type: string
 *                 maxLength: 255
 *               businessType:
 *                 type: string
 *                 maxLength: 100
 *               taxId:
 *                 type: string
 *                 maxLength: 50
 *               contactName:
 *                 type: string
 *                 maxLength: 255
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               address:
 *                 type: object
 *                 required: [street, city, state, zip]
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip:
 *                     type: string
 *                   country:
 *                     type: string
 *                     default: US
 *               bankAccountInfo:
 *                 type: object
 *                 required: [bankName, accountNumber, routingNumber]
 *                 properties:
 *                   bankName:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   routingNumber:
 *                     type: string
 *               productCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 10
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *                 description: Upload up to 5 documents (PDF, DOC, DOCX, JPEG, PNG). Max 10MB each.
 *     responses:
 *       201:
 *         description: Supplier registration submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 supplier:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                     businessName:
 *                       type: string
 *                     businessType:
 *                       type: string
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     commissionRate:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user must have supplier role
 *       409:
 *         description: Supplier application already exists
 */
router.post(
  "/register",
  authenticate,
  authorize("supplier"),
  uploadDocuments,
  SupplierController.register,
);

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all suppliers" });
});

router.get("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get supplier profile by ID" });
});

router.put("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update supplier profile" });
});

router.get("/:id/products", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List products by supplier" });
});

router.get("/:id/orders", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List orders for a supplier" });
});

router.get("/:id/analytics", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get supplier analytics/dashboard data" });
});

export default router;
