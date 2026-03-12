export interface CreditInfo {
  eligible: boolean;
  limit: number;
  used: number;
  available: number;
}

export interface Net30OrderResult {
  orderId: string;
  invoiceId: string | null;
  invoiceDueDate: string;
  amount: number;
  status: string;
}
