export type PreparedAudio = {
  readonly samples: Int16Array;
  readonly sampleRate: number;
  readonly wav: Uint8Array;
  readonly durationMs: number;
};

export interface AudioTool {
  prepare(upload: Uint8Array): Promise<PreparedAudio | null>;
}
