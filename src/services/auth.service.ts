import crypto from "crypto";

import { decode } from "jsonwebtoken";

import { getEnv } from "../config/env";
import { supabaseAdmin, supabaseAuth } from "../config/supabase";
import { sendEmail } from "../services/email.service";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import type { AuthSession, AuthUser } from "../types/auth.types";

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  phone: string | null;
  role: "customer" | "supplier" | "admin";
  status: "pending" | "approved" | "suspended";
  last_login: string | null;
};

type SupabaseError = {
  message: string;
  status?: number;
};

const USER_SELECT_FIELDS =
  "id, email, first_name, last_name, company_name, phone, role, status, last_login";

class AuthServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "AuthServiceError";
  }
}

const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  companyName: row.company_name,
  phone: row.phone,
  role: row.role,
  status: row.status,
  lastLogin: row.last_login,
});

const toAuthSession = (session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
}): AuthSession => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresAt: session.expires_at ?? 0,
});

const getJwtExpiry = (token: string): number => {
  const decoded = decode(token, { json: true });
  if (!decoded || typeof decoded !== "object") {
    throw new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
  }
  const exp = (decoded as { exp?: unknown }).exp;
  if (typeof exp !== "number") {
    throw new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
  }
  return exp;
};

const mapCreateUserError = (message: string): AuthServiceError => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("duplicate")
  ) {
    return new AuthServiceError("DUPLICATE_EMAIL", "Email already in use", 409);
  }
  return new AuthServiceError("SIGN_UP_FAILED", message, 400);
};

const mapSignInError = (message: string): AuthServiceError => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return new AuthServiceError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  return new AuthServiceError("SIGN_IN_FAILED", message, 401);
};

const mapTokenError = (message: string): AuthServiceError => {
  const normalized = message.toLowerCase();
  if (normalized.includes("expired")) {
    return new AuthServiceError("TOKEN_EXPIRED", "Token expired", 401);
  }
  if (normalized.includes("invalid")) {
    return new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
  }
  return new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
};

const raiseIfError = (error: SupabaseError | null, fallback: AuthServiceError): void => {
  if (error) {
    throw new AuthServiceError(fallback.code, error.message, fallback.statusCode);
  }
};

export class AuthService {
  static async signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    companyName: string | null,
    phone: string | null,
    role: "customer" | "supplier",
    supplierDetails?: {
      taxId?: string;
      businessAddress?: string;
      yearsInBusiness?: number;
      businessLicense?: string;
      categories?: string[];
    },
  ): Promise<{ user: AuthUser; session: AuthSession }> {
    try {
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) {
        throw mapCreateUserError(createError.message);
      }
      if (!createData?.user) {
        throw new AuthServiceError("SIGN_UP_FAILED", "Auth user not created", 500);
      }

      const authUser = createData.user;

      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .insert({
          id: authUser.id,
          email,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          phone,
          role,
          status: role === "customer" ? "approved" : "pending",
        })
        .select(USER_SELECT_FIELDS)
        .single();

      raiseIfError(userError, new AuthServiceError("DATABASE_ERROR", "User insert failed", 500));
      if (!userRow) {
        throw new AuthServiceError("DATABASE_ERROR", "User insert failed", 500);
      }

      if (role === "supplier") {
        const baseName = companyName?.trim() || `${firstName} ${lastName}`.trim();
        const businessName = baseName.length > 0 ? baseName : "Pending Supplier";
        const supplierRow: Record<string, unknown> = {
          user_id: authUser.id,
          business_name: businessName,
          contact_name: `${firstName} ${lastName}`.trim(),
          contact_email: email,
          phone,
          status: "pending",
        };
        if (supplierDetails?.taxId) supplierRow.tax_id = supplierDetails.taxId;
        if (supplierDetails?.businessAddress) {
          supplierRow.address = {
            street: supplierDetails.businessAddress,
            city: "",
            state: "",
            zip: "",
            country: "US",
          };
        }
        if (supplierDetails?.yearsInBusiness !== undefined)
          supplierRow.years_in_business = supplierDetails.yearsInBusiness;
        if (supplierDetails?.categories?.length)
          supplierRow.product_categories = supplierDetails.categories;
        const { error: supplierError } = await supabaseAdmin
          .from("suppliers")
          .insert(supplierRow)
          .select("id")
          .single();

        raiseIfError(
          supplierError,
          new AuthServiceError("DATABASE_ERROR", "Supplier insert failed", 500),
        );
      }

      const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw mapSignInError(signInError.message);
      }
      if (!signInData.session) {
        throw new AuthServiceError("SIGN_UP_FAILED", "Session not created", 500);
      }

      // Fire-and-forget verification email
      this.sendVerificationEmail(authUser.id).catch((err: unknown) => {
        console.error("Failed to send verification email:", err);
      });

      return { user: toAuthUser(userRow), session: toAuthSession(signInData.session) };
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("SIGN_UP_FAILED", "Unable to sign up", 500);
    }
  }

  static async signIn(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser; session: AuthSession }> {
    try {
      const { data: signInData, error: signInError } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw mapSignInError(signInError.message);
      }
      if (!signInData.user || !signInData.session) {
        throw new AuthServiceError("SIGN_IN_FAILED", "Session not created", 500);
      }

      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .select(USER_SELECT_FIELDS)
        .eq("id", signInData.user.id)
        .single();

      raiseIfError(userError, new AuthServiceError("DATABASE_ERROR", "User lookup failed", 500));
      if (!userRow) {
        throw new AuthServiceError("DATABASE_ERROR", "User not found", 404);
      }
      if (userRow.status === "pending") {
        throw new AuthServiceError("ACCOUNT_PENDING", "Account pending approval", 403);
      }
      if (userRow.status === "suspended") {
        throw new AuthServiceError("ACCOUNT_SUSPENDED", "Account suspended", 403);
      }

      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from("users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", signInData.user.id)
        .select(USER_SELECT_FIELDS)
        .single();

      raiseIfError(updateError, new AuthServiceError("DATABASE_ERROR", "User update failed", 500));
      if (!updatedRow) {
        throw new AuthServiceError("DATABASE_ERROR", "User update failed", 500);
      }

      return { user: toAuthUser(updatedRow), session: toAuthSession(signInData.session) };
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("SIGN_IN_FAILED", "Unable to sign in", 500);
    }
  }

  static async signOut(jwt: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin.auth.admin.signOut(jwt);
      raiseIfError(error, new AuthServiceError("SIGN_OUT_FAILED", "Sign out failed", 400));
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("SIGN_OUT_FAILED", "Sign out failed", 500);
    }
  }

  static async getSession(jwt: string): Promise<{ user: AuthUser; session: AuthSession }> {
    try {
      const { data: authData, error } = await supabaseAdmin.auth.getUser(jwt);
      if (error) {
        throw mapTokenError(error.message);
      }
      if (!authData?.user) {
        throw new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
      }

      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .select(USER_SELECT_FIELDS)
        .eq("id", authData.user.id)
        .single();

      raiseIfError(userError, new AuthServiceError("DATABASE_ERROR", "User lookup failed", 500));
      if (!userRow) {
        throw new AuthServiceError("DATABASE_ERROR", "User not found", 404);
      }

      const expiresAt = getJwtExpiry(jwt);
      return {
        user: toAuthUser(userRow),
        session: {
          accessToken: jwt,
          refreshToken: "",
          expiresAt,
        },
      };
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("SESSION_FAILED", "Unable to fetch session", 500);
    }
  }

  static async verifyToken(jwt: string): Promise<AuthUser> {
    try {
      const { data: authData, error } = await supabaseAdmin.auth.getUser(jwt);
      if (error) {
        throw mapTokenError(error.message);
      }
      if (!authData?.user) {
        throw new AuthServiceError("INVALID_TOKEN", "Invalid token", 401);
      }

      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .select(USER_SELECT_FIELDS)
        .eq("id", authData.user.id)
        .single();

      raiseIfError(userError, new AuthServiceError("DATABASE_ERROR", "User lookup failed", 500));
      if (!userRow) {
        throw new AuthServiceError("DATABASE_ERROR", "User not found", 404);
      }

      return toAuthUser(userRow);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("VERIFY_TOKEN_FAILED", "Unable to verify token", 500);
    }
  }

  static async resetPassword(email: string): Promise<void> {
    // Always return success to prevent email enumeration attacks.
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, status")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (!user || user.status !== "approved") {
      return;
    }

    // Invalidate any existing unused tokens for this user
    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("user_id", user.id)
      .eq("used", false);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("password_reset_tokens")
      .insert({ user_id: user.id, token, expires_at: expiresAt });

    if (insertError) {
      console.error("Failed to create reset token:", insertError.message);
      return;
    }

    const frontendUrl = getEnv().FRONTEND_URL;
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const firstName = escapeHtml(user.first_name || "there");
    sendEmail(
      user.email,
      "Reset Your APlusMedDepot Password",
      baseLayout({
        title: "Password Reset Request",
        preheader: "Reset your password",
        body: `
            <p>Hi ${firstName},</p>
            <p>We received a request to reset your password.</p>
            <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:white;text-decoration:none;border-radius:6px;">Reset Password</a></p>
            <p>Or copy this link: ${escapeHtml(resetUrl)}</p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `,
      }),
    ).catch((emailErr: unknown) => {
      console.error("Failed to send reset email:", emailErr);
    });
  }

  static async updatePasswordWithToken(token: string, newPassword: string): Promise<void> {
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at")
      .eq("token", token)
      .eq("used", false)
      .single();

    if (tokenError || !tokenRecord) {
      throw new AuthServiceError("INVALID_TOKEN", "Invalid or expired reset token", 400);
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      await supabaseAdmin
        .from("password_reset_tokens")
        .update({ used: true })
        .eq("id", tokenRecord.id);

      throw new AuthServiceError(
        "TOKEN_EXPIRED",
        "Reset token has expired. Please request a new one.",
        400,
      );
    }

    // Validate password strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      throw new AuthServiceError(
        "WEAK_PASSWORD",
        "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        400,
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      tokenRecord.user_id,
      { password: newPassword },
    );

    if (updateError) {
      throw new AuthServiceError("RESET_PASSWORD_FAILED", "Failed to update password", 500);
    }

    // Mark token as used
    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("id", tokenRecord.id);

    // Invalidate all other unused tokens for this user
    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("user_id", tokenRecord.user_id)
      .eq("used", false);

    // Send confirmation email (fire-and-forget)
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, first_name")
      .eq("id", tokenRecord.user_id)
      .single();

    if (user) {
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

  static async sendVerificationEmail(userId: string): Promise<void> {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, email_verified")
      .eq("id", userId)
      .single();

    if (!user || user.email_verified) {
      return;
    }

    // Invalidate any existing unused verification tokens
    await supabaseAdmin
      .from("email_verification_tokens")
      .update({ used: true })
      .eq("user_id", userId)
      .eq("used", false);

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("email_verification_tokens")
      .insert({ user_id: userId, token: code, expires_at: expiresAt });

    if (insertError) {
      console.error("Failed to create verification code:", insertError.message);
      return;
    }

    const firstName = escapeHtml(user.first_name || "there");
    sendEmail(
      user.email,
      "Your APlusMedDepot Verification Code",
      baseLayout({
        title: "Email Verification",
        preheader: "Your verification code",
        body: `
            <p>Hi ${firstName},</p>
            <p>Thanks for registering with APlusMedDepot.</p>
            <p>Your verification code is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background-color:#f3f4f6;border-radius:8px;margin:20px 0;">
              ${code}
            </div>
            <p>Enter this code on the verification page to confirm your email address.</p>
            <p>This code expires in 24 hours.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          `,
      }),
    ).catch((emailErr: unknown) => {
      console.error("Failed to send verification email:", emailErr);
    });
  }

  static async verifyEmail(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      throw new AuthServiceError("INVALID_CODE", "Verification code must be 6 digits", 400);
    }

    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from("email_verification_tokens")
      .select("id, user_id, expires_at")
      .eq("token", code)
      .eq("used", false)
      .single();

    if (tokenError || !tokenRecord) {
      throw new AuthServiceError("INVALID_CODE", "Invalid or expired verification code", 400);
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      await supabaseAdmin
        .from("email_verification_tokens")
        .update({ used: true })
        .eq("id", tokenRecord.id);

      throw new AuthServiceError(
        "TOKEN_EXPIRED",
        "Verification token has expired. Please request a new one.",
        400,
      );
    }

    // Mark email as verified
    await supabaseAdmin
      .from("users")
      .update({ email_verified: true, updated_at: new Date().toISOString() })
      .eq("id", tokenRecord.user_id);

    // Mark token as used
    await supabaseAdmin
      .from("email_verification_tokens")
      .update({ used: true })
      .eq("id", tokenRecord.id);

    // Invalidate all other unused tokens for this user
    await supabaseAdmin
      .from("email_verification_tokens")
      .update({ used: true })
      .eq("user_id", tokenRecord.user_id)
      .eq("used", false);
  }

  static async resendVerification(email: string): Promise<void> {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email, email_verified, status")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (!user) {
      return;
    }

    if (user.status !== "approved") {
      return;
    }

    if (user.email_verified) {
      throw new AuthServiceError("ALREADY_VERIFIED", "Email is already verified", 409);
    }

    await this.sendVerificationEmail(user.id);
  }

  static async refreshSession(refreshToken: string): Promise<AuthSession> {
    try {
      const { data, error } = await supabaseAuth.auth.refreshSession({
        refresh_token: refreshToken,
      });
      raiseIfError(
        error,
        new AuthServiceError("REFRESH_SESSION_FAILED", "Session refresh failed", 401),
      );
      if (!data?.session) {
        throw new AuthServiceError("REFRESH_SESSION_FAILED", "Session refresh failed", 500);
      }
      return toAuthSession(data.session);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("REFRESH_SESSION_FAILED", "Session refresh failed", 500);
    }
  }
}
