export interface SupplierRegistrationRequest {
  businessName: string;
  businessType?: string;
  taxId: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  bankAccountInfo: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
  };
  productCategories: string[];
}

export interface SupplierResponse {
  id: string;
  userId: string;
  businessName: string;
  businessType: string | null;
  status: string;
  commissionRate: number;
  createdAt: string;
}

export interface SupplierDocument {
  id: string;
  supplierId: string;
  documentType: string;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  status: string;
  rejectionReason: string | null;
  reviewNotes: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  signedUrl?: string;
}

export interface SupplierProfile {
  id: string;
  userId: string;
  businessName: string;
  commissionRate: number;
  status: string;
}

export interface SupplierDetailResponse {
  id: string;
  userId: string;
  businessName: string;
  businessType: string | null;
  taxId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: Record<string, string> | null;
  bankAccountInfo: Record<string, string> | null;
  productCategories: string[] | null;
  commissionRate: number;
  status: string;
  rejectionReason: string | null;
  currentBalance: number;
  yearsInBusiness: number | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  documents: SupplierDocument[];
}

export interface SupplierUpdateRequest {
  businessName?: string;
  businessType?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  bankAccountInfo?: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
  };
  productCategories?: string[];
}
