import type { AuthUser } from "./auth.types";
import type { SupplierProfile } from "./supplier.types";
import type { AuditContext } from "../middleware/auditMiddleware";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      supplier?: SupplierProfile;
      auditContext?: AuditContext;
    }
  }
}
