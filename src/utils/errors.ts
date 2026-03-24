export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}

export const notFound = (resource: string): AppError =>
  new AppError(`${resource} not found`, 404, "NOT_FOUND");

export const unauthorized = (message?: string): AppError =>
  new AppError(message ?? "Unauthorized", 401, "UNAUTHORIZED");

export const forbidden = (message?: string): AppError =>
  new AppError(message ?? "Forbidden", 403, "FORBIDDEN");

export const badRequest = (message: string): AppError => new AppError(message, 400, "BAD_REQUEST");

export const conflict = (message: string): AppError => new AppError(message, 409, "CONFLICT");

export const serviceUnavailable = (message: string): AppError =>
  new AppError(message, 503, "SERVICE_UNAVAILABLE");
