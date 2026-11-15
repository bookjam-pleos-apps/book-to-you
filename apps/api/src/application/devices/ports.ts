export type Pairing = {
  readonly id: string;
  readonly userId: string | null;
  readonly deviceName: string;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  readonly consumedAt: Date | null;
  readonly lastPolledAt: Date | null;
};

export type NewPairing = {
  readonly deviceCodeHash: string;
  readonly userCode: string;
  readonly deviceName: string;
  readonly expiresAt: Date;
};

export type NewPairedDevice = {
  readonly pairingId: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly name: string;
  readonly scope: string;
  readonly now: Date;
};

export interface PairingRepo {
  create(pairing: NewPairing): Promise<void>;
  confirm(userCode: string, userId: string, now: Date): Promise<boolean>;
  findByDeviceCodeHash(deviceCodeHash: string): Promise<Pairing | null>;
  recordPoll(id: string, now: Date): Promise<void>;
  consumeIntoDevice(device: NewPairedDevice): Promise<boolean>;
}

export type DeviceSummary = {
  readonly id: string;
  readonly name: string;
  readonly lastSeenAt: Date | null;
};

export type DeviceIdentity = {
  readonly deviceId: string;
  readonly userId: string;
};

export interface DeviceRepo {
  findLiveByTokenHash(tokenHash: string): Promise<DeviceIdentity | null>;
  recordSeen(deviceId: string, now: Date, seenBefore: Date): Promise<void>;
  listLive(userId: string): Promise<readonly DeviceSummary[]>;
  revoke(deviceId: string, userId: string, now: Date): Promise<boolean>;
}

export type QuickStartAccount = {
  readonly email: string;
  readonly userCode: string;
  readonly termsVersion: string;
  readonly aiNoticeVersion: string;
  readonly now: Date;
};

export interface QuickStartRepo {
  // 계정 생성, 약관 영수증, 페어링 확인을 한 트랜잭션으로 한다. 코드가 살아 있지 않으면 아무것도 남기지 않고 null이다.
  registerAndConfirm(account: QuickStartAccount): Promise<string | null>;
}
