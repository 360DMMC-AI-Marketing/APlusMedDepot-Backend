import { Router } from "express";
import { CategoryController } from "../controllers/category.controller";

const router = Router();

/**
 * @openapi
 * /categories:
 *   get:
 *     tags: [Categories]
 *     summary: Get all product categories
 *     description: Returns the list of approved product categories for the platform. Public endpoint — no authentication required.
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                 total:
 *                   type: integer
 */
router.get("/", CategoryController.getCategories);

export default router;
