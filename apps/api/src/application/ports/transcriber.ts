export interface Transcriber {
  transcribe(wav: Uint8Array): Promise<string>;
}

export class TranscriberUnavailable extends Error {
  override readonly name = "TranscriberUnavailable";
}
