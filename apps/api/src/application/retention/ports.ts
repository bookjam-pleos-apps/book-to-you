export type PendingPurge = {
  readonly id: string;
  readonly storagePrefix: string;
  readonly engineKeys: readonly string[];
};

export interface PurgeRepo {
  listPending(): Promise<readonly PendingPurge[]>;
  markDone(id: string): Promise<void>;
}

export type CheckingRows = {
  readonly clipIds: readonly string[];
  readonly consentIds: readonly string[];
};

export interface RetentionRepo {
  listChecking(): Promise<CheckingRows>;
  findReferencedKeys(keys: readonly string[]): Promise<ReadonlySet<string>>;
  deleteExpiredAuthRows(now: Date, otpCreatedBefore: Date): Promise<void>;
}
