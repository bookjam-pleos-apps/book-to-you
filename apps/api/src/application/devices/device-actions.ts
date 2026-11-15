import { LAST_SEEN_RESOLUTION_MS } from "../../domain/devices/device-scope";
import { hashSecretToken } from "../../domain/secret-token";
import type { Clock } from "../ports/clock";
import type { DeviceIdentity, DeviceRepo, DeviceSummary } from "./ports";

export type DeviceDeps = {
  readonly devices: DeviceRepo;
  readonly clock: Clock;
};

// 요청마다 불리므로 폐기 여부는 매번 DB에서 확인하고, last_seen은 분 단위로만 갱신한다.
export const authenticateDevice =
  ({ devices, clock }: DeviceDeps) =>
  async (token: string): Promise<DeviceIdentity | null> => {
    const device = await devices.findLiveByTokenHash(hashSecretToken(token));
    if (device === null) return null;
    const now = clock();
    await devices.recordSeen(device.deviceId, now, new Date(now.getTime() - LAST_SEEN_RESOLUTION_MS));
    return device;
  };

export const listDevices =
  ({ devices }: DeviceDeps) =>
  (userId: string): Promise<readonly DeviceSummary[]> =>
    devices.listLive(userId);

export const revokeDevice =
  ({ devices, clock }: DeviceDeps) =>
  (deviceId: string, userId: string): Promise<boolean> =>
    devices.revoke(deviceId, userId, clock());
