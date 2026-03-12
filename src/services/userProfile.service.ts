import { supabaseAdmin } from "../config/supabase";
import { sendEmail } from "../services/email.service";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import { notFound, badRequest } from "../utils/errors";
import type { UserProfile, UpdateProfileData } from "../types/userProfile.types";

class UserProfileError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "UserProfileError";
  }
}

export class UserProfileService {
  static async getProfile(userId: string): Promise<UserProfile> {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(
        "id, email, first_name, last_name, role, status, phone, company_name, email_verified, created_at, last_login, updated_at",
      )
      .eq("id", userId)
      .single();

    if (error || !user) {
      throw notFound("User");
    }

    let vendorId: string | null = null;
    let commissionRate: number | null = null;
    let vendorStatus: string | null = null;
    let currentBalance: number | null = null;

    if (user.role === "supplier") {
      const { data: supplier } = await supabaseAdmin
        .from("suppliers")
        .select("id, business_name, commission_rate, status, current_balance")
        .eq("user_id", userId)
        .single();

      if (supplier) {
        vendorId = supplier.id;
        commissionRate = Number(supplier.commission_rate);
        vendorStatus = supplier.status;
        currentBalance = Number(supplier.current_balance);
      }
    }

    const firstName = user.first_name || null;
    const lastName = user.last_name || null;

    return {
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      name: `${firstName || ""} ${lastName || ""}`.trim(),
      role: user.role,
      status: user.status,
      phone: user.phone || null,
      company: user.company_name || null,
      emailVerified: user.email_verified,
      vendorId,
      commissionRate,
      vendorStatus,
      currentBalance,
      createdAt: user.created_at,
      lastLogin: user.last_login || null,
    };
  }

  static async updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile> {
    const updates: Record<string, unknown> = {};

    if (data.firstName !== undefined) updates.first_name = data.firstName;
    if (data.lastName !== undefined) updates.last_name = data.lastName;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.companyName !== undefined) updates.company_name = data.companyName;

    if (Object.keys(updates).length === 0) {
      throw badRequest("At least one field must be provided");
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin.from("users").update(updates).eq("id", userId);

    if (error) {
      throw new UserProfileError("UPDATE_FAILED", "Failed to update profile", 500);
    }

    return this.getProfile(userId);
  }

  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("email, first_name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      throw notFound("User");
    }

    // Verify current password
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      throw new UserProfileError("INVALID_CREDENTIALS", "Current password is incorrect", 401);
    }

    if (currentPassword === newPassword) {
      throw new UserProfileError(
        "SAME_PASSWORD",
        "New password must be different from current password",
        400,
      );
    }

    // Validate password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      throw new UserProfileError(
        "WEAK_PASSWORD",
        "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        400,
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      throw new UserProfileError("PASSWORD_CHANGE_FAILED", "Failed to change password", 500);
    }

    // Send confirmation email (fire-and-forget)
    const firstName = escapeHtml(user.first_name || "there");
    sendEmail(
      user.email,
      "Your APlusMedDepot Password Has Been Changed",
      baseLayout({
        title: "Password Changed",
        preheader: "Your password has been changed",
        body: `
            <p>Hi ${firstName},</p>
            <p>Your password has been successfully changed.</p>
            <p>If you did not make this change, please contact support immediately.</p>
          `,
      }),
    ).catch((emailErr: unknown) => {
      console.error("Failed to send password change confirmation:", emailErr);
    });
  }
}
