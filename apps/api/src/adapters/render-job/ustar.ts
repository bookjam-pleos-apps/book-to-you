import type { JobFile } from "./job-files";

// 렌더 서비스와 주고받는 묶음은 일반 파일 몇 개라 ustar만 다룬다. 디스크에 풀지 않으므로 경로 탈출이 생기지 않는다.
// GPU 쪽(spike.render.job.render_bundle)은 맨 위 일반 파일만 풀고, 결과는 USTAR 형식으로 쓴다.
const BLOCK = 512;
const NAME_LENGTH = 100;
const REGULAR_TYPES = new Set([0x30, 0x00]);

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

const octal = (value: number, width: number): string => `${value.toString(8).padStart(width - 1, "0")}\0`;

const paddedLength = (size: number): number => Math.ceil(size / BLOCK) * BLOCK;

const checksumOf = (header: Uint8Array): number => header.reduce((sum, byte) => sum + byte, 0);

const headerOf = (name: string, size: number): Uint8Array => {
  if (ascii(name).length > NAME_LENGTH) throw new Error(`tar 항목 이름이 길다: ${name}`);
  const header = new Uint8Array(BLOCK);
  const fields: ReadonlyArray<readonly [number, string]> = [
    [0, name], [100, octal(0o600, 8)], [108, octal(0, 8)], [116, octal(0, 8)],
    [124, octal(size, 12)], [136, octal(0, 12)], [148, " ".repeat(8)], [156, "0"], [257, "ustar\0"], [263, "00"],
  ];
  fields.forEach(([offset, text]) => header.set(ascii(text), offset));
  header.set(ascii(`${octal(checksumOf(header), 7)} `), 148);
  return header;
};

export const packUstar = (files: readonly JobFile[]): Uint8Array => {
  const total = files.reduce((sum, file) => sum + BLOCK + paddedLength(file.bytes.length), 2 * BLOCK);
  const packed = new Uint8Array(total);
  files.reduce((offset, { name, bytes }) => {
    packed.set(headerOf(name, bytes.length), offset);
    packed.set(bytes, offset + BLOCK);
    return offset + BLOCK + paddedLength(bytes.length);
  }, 0);
  return packed;
};

const textField = (header: Uint8Array, offset: number, length: number): string => {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end));
};

const isEndBlock = (header: Uint8Array): boolean => header.every((byte) => byte === 0);

const entryAt = (packed: Uint8Array, offset: number): { readonly file: JobFile; readonly next: number } | null => {
  const header = packed.subarray(offset, offset + BLOCK);
  if (header.length < BLOCK || isEndBlock(header)) return null;
  const name = textField(header, 0, NAME_LENGTH);
  if (!REGULAR_TYPES.has(header[156] ?? -1)) throw new Error(`tar에 일반 파일이 아닌 항목이 있다: ${name}`);
  const size = Number.parseInt(textField(header, 124, 12).trim() || "0", 8);
  const start = offset + BLOCK;
  if (!Number.isSafeInteger(size) || start + size > packed.length) throw new Error(`tar 항목이 잘렸다: ${name}`);
  return { file: { name, bytes: packed.slice(start, start + size) }, next: start + paddedLength(size) };
};

// 묶음은 작업 파일과 참조 녹음, 또는 결과 두 개라 항목이 몇 개뿐이다. 상한을 두어 재귀 깊이를 묶는다.
const MAX_ENTRIES = 64;

const entriesFrom = (packed: Uint8Array, offset: number, found: readonly JobFile[]): readonly JobFile[] => {
  const entry = entryAt(packed, offset);
  if (entry === null) return found;
  if (found.length >= MAX_ENTRIES) throw new Error(`tar 항목이 ${MAX_ENTRIES}개를 넘는다`);
  return entriesFrom(packed, entry.next, [...found, entry.file]);
};

export const unpackUstar = (packed: Uint8Array): ReadonlyMap<string, Uint8Array> =>
  new Map(entriesFrom(packed, 0, []).map(({ name, bytes }) => [name, bytes] as const));
