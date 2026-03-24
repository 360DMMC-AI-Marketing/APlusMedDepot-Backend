export interface SupplierBalance {
  currentBalance: number;
  pendingCommissions: number;
  totalPaidOut: number;
  availableForPayout: number;
}

export interface PayoutRecord {
  id: string;
  supplierId: string;
  amount: number;
  commissionTotal: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  payoutDate: string | null;
  transactionRef: string | null;
  createdAt: string;
}

export interface PayoutSummary {
  currentMonthEarnings: number;
  lastMonthEarnings: number;
  nextPayoutDate: string;
  meetsMinimumThreshold: boolean;
  minimumThreshold: number;
}
