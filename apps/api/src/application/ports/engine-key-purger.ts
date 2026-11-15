export interface EngineKeyPurger {
  purge(keys: readonly string[]): Promise<void>;
}

export class EngineUnavailable extends Error {
  override readonly name = "EngineUnavailable";
}
