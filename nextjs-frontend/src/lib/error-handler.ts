import type { ErrorResponse } from "@/api/openapi-client";
import type { AxiosError } from "axios";

/**
 * Centrally handle API errors and extract the message provided by the backend.
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred";

  // Handle Axios errors (most SDK calls)
  const axiosError = error as AxiosError<ErrorResponse>;

  if (axiosError.response?.data) {
    const data = axiosError.response.data;

    // Check for our standard ErrorResponse structure
    if (data.message) {
      // If it's a validation error with field-specific messages,
      // we might want to just say "Validation failed" or join them.
      // For general toast, the main "message" is usually best.
      return data.message;
    }
  }

  // Handle cases where the server is down or returns non-JSON
  if (axiosError.isAxiosError) {
    if (axiosError.response?.status === 413) {
      return `File too large. The maximum upload size is ${Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB) || 100}MB.`;
    }
    if (axiosError.code === "ERR_NETWORK") {
      return "Unable to connect to the server. Please check your internet connection.";
    }
    if (axiosError.response?.status === 500) {
      return "A server error occurred. Our team has been notified.";
    }
  }

  // Fallback to standard Error object
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Handle validation errors specifically (422)
 */
export function getValidationErrors(
  error: unknown
): Record<string, string[]> | null {
  const axiosError = error as AxiosError<ErrorResponse>;
  if (axiosError.response?.status === 422 && axiosError.response.data?.errors) {
    return axiosError.response.data.errors as Record<string, string[]>;
  }
  return null;
}
