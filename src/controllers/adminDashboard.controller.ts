import { Request, Response } from "express";

import { AdminDashboardService } from "../services/adminDashboard.service";

export class AdminDashboardController {
  static async getSummary(_req: Request, res: Response): Promise<void> {
    const result = await AdminDashboardService.getDashboardSummary();
    res.status(200).json(result);
  }
}
