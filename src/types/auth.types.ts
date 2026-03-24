export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string | null;
  role: "customer" | "supplier" | "admin";
  status: "pending" | "approved" | "suspended";
  lastLogin: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  phone?: string;
  role: "customer" | "supplier";
}

export interface SignInRequest {
  email: string;
  password: string;
}
