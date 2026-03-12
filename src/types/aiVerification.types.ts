export interface VendorVerificationResult {
  score: number;
  recommendation: "approve" | "review" | "reject";
  checks: {
    businessInfo: { passed: boolean; notes: string };
    documentation: { passed: boolean; notes: string };
    riskAssessment: { passed: boolean; notes: string };
  };
  missingItems: string[];
  riskFactors: string[];
}
