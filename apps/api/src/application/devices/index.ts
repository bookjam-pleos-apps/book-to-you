export {
  authenticateDevice,
  listDevices,
  revokeDevice,
  type DeviceDeps,
} from "./device-actions";
export { redeemDemoCode, type DemoPairingDeps, type DemoPairingResult } from "./demo-pairing";
export {
  confirmPairing,
  pollPairing,
  startPairing,
  type PairingDeps,
  type PollResult,
  type StartedPairing,
} from "./pairing";
export type { DeviceIdentity, DeviceRepo, DeviceSummary, PairingRepo, QuickStartRepo } from "./ports";
export { quickStart, type QuickStartDeps, type QuickStartInput, type QuickStartResult } from "./quick-start";
