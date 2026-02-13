import { Request, Response, NextFunction } from "express";

import { supabaseAdmin } from "../config/supabase";
import { forbidden } from "../utils/errors";

type SupplierRow = {
  id: string;
  user_id: string;
  business_name: string;
  commission_rate: number;
  status: string;
};

export async function requireApprovedSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    throw forbidden("Authentication required");
  }

  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .select("id, user_id, business_name, commission_rate, status")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    throw forbidden("Error checking supplier profile");
  }

  if (!data) {
    throw forbidden("No supplier profile found. Please register first.");
  }

  const supplier = data as SupplierRow;

  if (supplier.status !== "approved") {
    throw forbidden(`Supplier account not approved. Current status: ${supplier.status}`);
  }

  req.supplier = {
    id: supplier.id,
    userId: supplier.user_id,
    businessName: supplier.business_name,
    commissionRate: supplier.commission_rate,
    status: supplier.status,
  };

  next();
}

export async function requireAnySupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    throw forbidden("Authentication required");
  }

  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .select("id, user_id, business_name, commission_rate, status")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    throw forbidden("Error checking supplier profile");
  }

  if (!data) {
    throw forbidden("No supplier profile found. Please register first.");
  }

  const supplier = data as SupplierRow;

  req.supplier = {
    id: supplier.id,
    userId: supplier.user_id,
    businessName: supplier.business_name,
    commissionRate: supplier.commission_rate,
    status: supplier.status,
  };

  next();
}
