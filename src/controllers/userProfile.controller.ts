import { Request, Response } from "express";
import { z } from "zod";

import { UserProfileService } from "../services/userProfile.service";

const updateProfileSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(20).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
  })
  .refine(
    (data) =>
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.phone !== undefined ||
      data.companyName !== undefined,
    { message: "At least one field must be provided" },
  );

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export class UserProfileController {
  static async getProfile(req: Request, res: Response): Promise<void> {
    const profile = await UserProfileService.getProfile(req.user!.id);
    res.status(200).json(profile);
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    const validated = updateProfileSchema.parse(req.body);
    const profile = await UserProfileService.updateProfile(req.user!.id, validated);
    res.status(200).json(profile);
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    const validated = changePasswordSchema.parse(req.body);
    await UserProfileService.changePassword(
      req.user!.id,
      validated.currentPassword,
      validated.newPassword,
    );
    res.status(200).json({ message: "Password changed successfully." });
  }
}
