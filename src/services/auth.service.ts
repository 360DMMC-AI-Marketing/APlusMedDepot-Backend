import { decode } from "jsonwebtoken";
import type { User } from "@supabase/supabase-js";

import { supabaseAdmin } from "../config/supabase";
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

const getPasswordHash = (user: User): string => {
  const candidate = (user as unknown as { password_hash?: unknown }).password_hash;
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }
  throw new AuthServiceError(
    "PASSWORD_HASH_MISSING",
    "Password hash missing from auth provider",
    500,
  );
};

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
      const passwordHash = getPasswordHash(authUser);

      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .insert({
          id: authUser.id,
          email,
          password_hash: passwordHash,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          phone,
          role,
          status: "pending",
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
        const { error: supplierError } = await supabaseAdmin
          .from("suppliers")
          .insert({
            user_id: authUser.id,
            business_name: businessName,
            phone,
            status: "pending",
          })
          .select("id")
          .single();

        raiseIfError(
          supplierError,
          new AuthServiceError("DATABASE_ERROR", "Supplier insert failed", 500),
        );
      }

      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw mapSignInError(signInError.message);
      }
      if (!signInData.session) {
        throw new AuthServiceError("SIGN_UP_FAILED", "Session not created", 500);
      }

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
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
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
      if (userRow.status !== "approved") {
        throw new AuthServiceError("ACCOUNT_PENDING", "Account pending approval", 403);
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
    try {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);
      raiseIfError(
        error,
        new AuthServiceError("RESET_PASSWORD_FAILED", "Password reset failed", 400),
      );
    } catch (error) {
      if (error instanceof AuthServiceError) {
        throw error;
      }
      throw new AuthServiceError("RESET_PASSWORD_FAILED", "Password reset failed", 500);
    }
  }

  static async refreshSession(refreshToken: string): Promise<AuthSession> {
    try {
      const { data, error } = await supabaseAdmin.auth.refreshSession({
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
