import { errorResponse } from "./response";

export class ValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) {
    throw new ValidationError(message, status);
  }
}

export async function parseJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

export function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), "Invalid email address");
  return normalized;
}

export function validateMobile(mobile: string): string {
  const normalized = mobile.trim();
  assert(/^\+?[1-9]\d{7,14}$/.test(normalized), "Invalid mobile number");
  return normalized;
}

export function validatePassword(password: string): string {
  assert(typeof password === "string" && password.length >= 8, "Password must be at least 8 characters");
  assert(/[A-Z]/.test(password), "Password must include an uppercase letter");
  assert(/[a-z]/.test(password), "Password must include a lowercase letter");
  assert(/\d/.test(password), "Password must include a number");
  return password;
}

export function validateFolderPassword(password: string): string {
  assert(typeof password === "string" && password.trim().length >= 1, "Folder password cannot be empty");
  return password;
}

export function validateOtp(code: string): string {
  const normalized = code.trim();
  assert(/^\d{6}$/.test(normalized), "OTP must be a 6 digit code");
  return normalized;
}

export function validateFolderName(name: string): string {
  const normalized = name.trim();
  assert(normalized.length >= 1 && normalized.length <= 100, "Folder name must be between 1 and 100 characters");
  return normalized;
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof ValidationError) {
    return errorResponse(error.message, error.status);
  }

  console.error("Unhandled route error:", error instanceof Error ? error.stack : error);
  return errorResponse("Internal server error", 500);
}
