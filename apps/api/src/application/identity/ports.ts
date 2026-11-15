export type LiveOtp = {
  readonly id: string;
  readonly codeHmac: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attempts: number;
};

export type NewOtp = {
  readonly email: string;
  readonly codeHmac: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
};

export interface OtpStore {
  countRequestsSince(email: string, since: Date): Promise<number>;
  sumFailuresSince(email: string, since: Date): Promise<number>;
  invalidateLive(email: string, now: Date): Promise<void>;
  insert(otp: NewOtp): Promise<void>;
  findLive(email: string): Promise<LiveOtp | null>;
  recordFailure(id: string): Promise<void>;
  markConsumed(id: string, now: Date): Promise<void>;
}

export interface OtpRepo {
  lockedByEmail<Result>(email: string, work: (store: OtpStore) => Promise<Result>): Promise<Result>;
}

export type NewAccount = {
  readonly email: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly now: Date;
};

export type Account = {
  readonly id: string;
  readonly email: string;
};

export interface AccountRepo {
  findOrRegister(account: NewAccount): Promise<string>;
  find(userId: string): Promise<Account | null>;
}

export interface SessionRepo {
  findLiveUserId(tokenHash: string, now: Date): Promise<string | null>;
  create(session: { readonly tokenHash: string; readonly userId: string; readonly expiresAt: Date }): Promise<void>;
  delete(tokenHash: string): Promise<void>;
}

export interface AccountDeletionRepo {
  deleteAccount(userId: string, now: Date): Promise<boolean>;
}
