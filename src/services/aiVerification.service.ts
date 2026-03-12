import Anthropic from "@anthropic-ai/sdk";

import { supabaseAdmin } from "../config/supabase";
import { AppError, notFound, serviceUnavailable } from "../utils/errors";
import type { VendorVerificationResult } from "../types/aiVerification.types";

const SYSTEM_PROMPT = `You are a vendor verification analyst for APlusMedDepot, a medical supplies marketplace. Analyze the following vendor application and provide a structured risk assessment.

You MUST respond with ONLY a JSON object — no markdown, no explanation, no backticks. The JSON must have this exact structure:
{
  "score": <number 0-100, where 100 is lowest risk>,
  "recommendation": "approve" | "review" | "reject",
  "checks": {
    "businessInfo": { "passed": <boolean>, "notes": "<brief assessment>" },
    "documentation": { "passed": <boolean>, "notes": "<brief assessment>" },
    "riskAssessment": { "passed": <boolean>, "notes": "<brief assessment>" }
  },
  "missingItems": ["<array of missing documentation or info that should be provided>"],
  "riskFactors": ["<array of identified risk factors>"]
}

Scoring guide:
- 80-100: Low risk, recommend approval
- 50-79: Medium risk, recommend manual review
- 0-49: High risk, recommend rejection

Be thorough but fair. Medical supply vendors need proper documentation.`;

type VendorRow = {
  id: string;
  business_name: string | null;
  tax_id: string | null;
  business_type: string | null;
  address: unknown;
  phone: string | null;
  product_categories: string[] | string | null;
  years_in_business: number | null;
  status: string;
  created_at: string;
  users: { email: string; first_name: string | null; last_name: string | null } | null;
};

type DocumentRow = {
  document_type: string;
  status: string;
  file_name: string;
};

const DEFAULT_CHECKS = {
  businessInfo: { passed: false, notes: "Not assessed" },
  documentation: { passed: false, notes: "Not assessed" },
  riskAssessment: { passed: false, notes: "Not assessed" },
};

function sanitizeResult(raw: Record<string, unknown>): VendorVerificationResult {
  const score =
    typeof raw.score === "number" ? Math.min(100, Math.max(0, Math.round(raw.score))) : 0;

  const rec = raw.recommendation;
  const recommendation = rec === "approve" || rec === "review" || rec === "reject" ? rec : "review";

  const rawChecks = raw.checks as Record<string, unknown> | undefined;
  const checks = rawChecks
    ? {
        businessInfo: isCheckEntry(rawChecks.businessInfo)
          ? rawChecks.businessInfo
          : DEFAULT_CHECKS.businessInfo,
        documentation: isCheckEntry(rawChecks.documentation)
          ? rawChecks.documentation
          : DEFAULT_CHECKS.documentation,
        riskAssessment: isCheckEntry(rawChecks.riskAssessment)
          ? rawChecks.riskAssessment
          : DEFAULT_CHECKS.riskAssessment,
      }
    : { ...DEFAULT_CHECKS };

  const missingItems = Array.isArray(raw.missingItems) ? (raw.missingItems as string[]) : [];
  const riskFactors = Array.isArray(raw.riskFactors) ? (raw.riskFactors as string[]) : [];

  return { score, recommendation, checks, missingItems, riskFactors };
}

function isCheckEntry(val: unknown): val is { passed: boolean; notes: string } {
  if (!val || typeof val !== "object") return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.passed === "boolean" && typeof obj.notes === "string";
}

export class AIVerificationService {
  static async verifyVendor(vendorId: string): Promise<VendorVerificationResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw serviceUnavailable("AI verification is not currently available");
    }

    // Fetch vendor data
    const { data: vendorData, error } = await supabaseAdmin
      .from("suppliers")
      .select("*, users(email, first_name, last_name)")
      .eq("id", vendorId)
      .single();

    if (error || !vendorData) {
      throw notFound("Vendor");
    }

    const vendor = vendorData as unknown as VendorRow;

    // Fetch documents if table exists
    let documents: DocumentRow[] = [];
    try {
      const { data: docs } = await supabaseAdmin
        .from("supplier_documents")
        .select("document_type, status, file_name")
        .eq("supplier_id", vendorId);

      if (docs) documents = docs as unknown as DocumentRow[];
    } catch {
      // Table may not exist — continue without docs
    }

    // Build user prompt (exclude sensitive data like banking info)
    const user = vendor.users;
    const userPrompt = `Vendor Application for Review:

Business Name: ${vendor.business_name || "Not provided"}
Tax ID: ${vendor.tax_id || "Not provided"}
Business Type: ${vendor.business_type || "Not specified"}
Contact Person: ${user?.first_name || ""} ${user?.last_name || ""} (${user?.email || "No email"})
Address: ${typeof vendor.address === "object" ? JSON.stringify(vendor.address) : vendor.address || "Not provided"}
Phone: ${vendor.phone || "Not provided"}
Product Categories: ${Array.isArray(vendor.product_categories) ? vendor.product_categories.join(", ") : vendor.product_categories || "Not specified"}
Years in Business: ${vendor.years_in_business || "Not specified"}
Documents Submitted: ${documents.length > 0 ? documents.map((d) => `${d.document_type} (${d.status})`).join(", ") : "None"}
Application Date: ${vendor.created_at}
Current Status: ${vendor.status}`;

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (apiErr: unknown) {
      const errMsg = apiErr instanceof Error ? apiErr.message : "Unknown error";
      console.error("Anthropic API error:", errMsg);
      throw new AppError(
        "AI verification service temporarily unavailable",
        502,
        "AI_SERVICE_ERROR",
      );
    }

    // Parse response
    const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

    try {
      const cleanJson = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleanJson) as Record<string, unknown>;
      return sanitizeResult(parsed);
    } catch {
      console.error("Failed to parse AI response:", responseText);
      return {
        score: 0,
        recommendation: "review",
        checks: {
          businessInfo: {
            passed: false,
            notes: "AI analysis could not be completed",
          },
          documentation: {
            passed: false,
            notes: "AI analysis could not be completed",
          },
          riskAssessment: {
            passed: false,
            notes: "AI analysis could not be completed",
          },
        },
        missingItems: ["AI verification needs to be re-run"],
        riskFactors: ["Automated analysis was inconclusive"],
      };
    }
  }
}
