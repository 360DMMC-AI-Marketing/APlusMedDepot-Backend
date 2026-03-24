import { Resend } from "resend";
import { getEnv } from "./env";

let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const env = getEnv();
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}
