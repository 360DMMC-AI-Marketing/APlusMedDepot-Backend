import type { AuthUser } from "./auth.types";
import type { SupplierProfile } from "./supplier.types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      supplier?: SupplierProfile;
    }
  }
}
