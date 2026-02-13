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
  status: string;
  uploadedAt: string;
}
