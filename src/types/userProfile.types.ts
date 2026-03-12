export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: "customer" | "supplier" | "admin";
  status: string;
  phone: string | null;
  company: string | null;
  emailVerified: boolean;
  vendorId: string | null;
  commissionRate: number | null;
  vendorStatus: string | null;
  currentBalance: number | null;
  createdAt: string;
  lastLogin: string | null;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  companyName?: string | null;
}
