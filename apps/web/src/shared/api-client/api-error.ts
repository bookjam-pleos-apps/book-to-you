import { apiErrorSchema, signalRejectedResponseSchema } from "@voice-storybook/shared/contracts/v1";
import type { z } from "zod";

export type SignalReason = z.infer<typeof signalRejectedResponseSchema>["reasons"][number];

export type ApiFailure =
  | { readonly kind: "network" }
  | { readonly kind: "http"; readonly status: number; readonly code: string; readonly reasons: readonly SignalReason[] };

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(failure.kind === "network" ? "network" : `${failure.status} ${failure.code}`);
    this.failure = failure;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

const UNKNOWN_CODE = "unknown";

export const toHttpFailure = (status: number, body: unknown): ApiFailure => {
  const rejected = signalRejectedResponseSchema.safeParse(body);
  if (rejected.success) return { kind: "http", status, code: rejected.data.error, reasons: rejected.data.reasons };
  const error = apiErrorSchema.safeParse(body);
  return { kind: "http", status, code: error.success ? error.data.error : UNKNOWN_CODE, reasons: [] };
};

export const failureCode = (error: unknown): string | null =>
  isApiError(error) && error.failure.kind === "http" ? error.failure.code : null;

export const failureStatus = (error: unknown): number | null =>
  isApiError(error) && error.failure.kind === "http" ? error.failure.status : null;
