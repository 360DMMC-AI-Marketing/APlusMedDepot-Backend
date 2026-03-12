import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../utils/errors";
import type { CreditInfo } from "../types/credit.types";

type CreditRow = {
  id: string;
  user_id: string;
  credit_limit: string;
  credit_used: string;
  eligible: boolean;
  updated_at: string;
  created_at: string;
};

export class CreditService {
  static async getCreditInfo(userId: string): Promise<CreditInfo> {
    const { data, error } = await supabaseAdmin
      .from("user_credit")
      .select("id, user_id, credit_limit, credit_used, eligible")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return { eligible: false, limit: 0, used: 0, available: 0 };
    }

    const record = data as unknown as CreditRow;
    const limit = Number(record.credit_limit);
    const used = Number(record.credit_used);
    const available = Math.max(0, limit - used);

    return {
      eligible: record.eligible,
      limit,
      used,
      available,
    };
  }

  static async checkCreditEligibility(
    userId: string,
    amount: number,
  ): Promise<{ eligible: boolean; reason?: string }> {
    const info = await this.getCreditInfo(userId);

    if (!info.eligible) {
      return {
        eligible: false,
        reason: "Net30 terms are not enabled for your account. Contact support to apply.",
      };
    }

    if (amount > info.available) {
      return {
        eligible: false,
        reason: `Insufficient credit. Available: $${info.available.toFixed(2)}, Required: $${amount.toFixed(2)}`,
      };
    }

    return { eligible: true };
  }

  static async deductCredit(userId: string, amount: number): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc("deduct_credit", {
      p_user_id: userId,
      p_amount: amount,
    });

    if (error) {
      throw new AppError("Credit deduction failed", 500, "CREDIT_ERROR");
    }

    if (data === false) {
      throw new AppError("Insufficient credit or not eligible", 409, "INSUFFICIENT_CREDIT");
    }
  }

  static async restoreCredit(userId: string, amount: number): Promise<void> {
    const { error } = await supabaseAdmin.rpc("restore_credit", {
      p_user_id: userId,
      p_amount: amount,
    });

    if (error) {
      console.error("Credit restoration failed:", error);
    }
  }

  static async setupCredit(
    userId: string,
    options?: { creditLimit?: number; eligible?: boolean },
  ): Promise<void> {
    const { error } = await supabaseAdmin.from("user_credit").upsert(
      {
        user_id: userId,
        credit_limit: options?.creditLimit ?? 50000,
        eligible: options?.eligible ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      throw new AppError("Failed to setup credit", 500, "DATABASE_ERROR");
    }
  }
}
