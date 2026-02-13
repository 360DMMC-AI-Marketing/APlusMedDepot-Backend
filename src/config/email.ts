import { Resend } from "resend";
import env from "./env";

let resendClient: Resend | null = null;

// Initialize Resend client if API key is configured
if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 0) {
  resendClient = new Resend(env.RESEND_API_KEY);
}

export const resend = resendClient;
