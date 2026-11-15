export type OtpLimits = {
  readonly requestsPerHour: number;
  readonly failuresPerDay: number;
};

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export const allowsOtpRequest = (requestsInLastHour: number, limits: OtpLimits): boolean =>
  requestsInLastHour < limits.requestsPerHour;

export const allowsOtpAttempts = (failuresInLastDay: number, limits: OtpLimits): boolean =>
  failuresInLastDay < limits.failuresPerDay;
