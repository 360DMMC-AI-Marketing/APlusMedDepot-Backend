export function logWebhookVerificationFailure(ip: string, error: string): void {
  console.error(
    JSON.stringify({
      level: "error",
      category: "webhook_security",
      event: "signature_verification_failed",
      ip,
      error,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function logWebhookProcessed(eventId: string, eventType: string): void {
  console.log(
    JSON.stringify({
      level: "info",
      category: "webhook",
      event: "processed",
      eventId,
      eventType,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function logSuspiciousActivity(type: string, details: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      category: "security",
      event: type,
      ...details,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function logAdminAction(log: {
  action: string;
  adminId: string;
  targetUserId: string;
  reason?: string;
  timestamp: string;
}): void {
  console.log(
    JSON.stringify({
      level: "info",
      category: "admin_action",
      ...log,
    }),
  );
}
