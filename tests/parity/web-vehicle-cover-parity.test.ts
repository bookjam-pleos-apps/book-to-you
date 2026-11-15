import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// 표지는 서버가 주지 않아 웹과 차량 앱이 같은 그림과 색을 따로 들고 있다. 한쪽만 바뀌면 이 테스트가 잡는다.
const ROOT = join(import.meta.dirname, "..", "..");
const WEB_COVERS = join(ROOT, "apps/web/src/assets/covers");
const VEHICLE_COVERS = join(ROOT, "apps/vehicle/app/src/main/res/drawable-nodpi");
const COVER_NAMES = ["redhood-landscape", "redhood-portrait", "fisherman-landscape", "masteraway-landscape"] as const;
const TONES = [["red", "coverRed"], ["sea", "coverSea"], ["mint", "coverMint"]] as const;

const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

const vehicleFileOf = (webName: string): string => `cover_${webName.replace("-", "_")}.webp`;

const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8");

const vehicleColor = (xml: string, name: string): string | undefined =>
  new RegExp(`<color name="${name}">#([0-9A-Fa-f]{6})</color>`).exec(xml)?.[1]?.toLowerCase();

const webColor = (css: string, tone: string): string | undefined =>
  new RegExp(`--color-cover-${tone}: #([0-9a-f]{6});`).exec(css)?.[1];

describe("web and vehicle covers", () => {
  it.each(COVER_NAMES)("%s is the same image in both apps", (name) => {
    expect(sha256(join(WEB_COVERS, `${name}.webp`))).toBe(sha256(join(VEHICLE_COVERS, vehicleFileOf(name))));
  });

  it("uses the same color blocks for stories without art", () => {
    const xml = read("apps/vehicle/app/src/main/res/values/colors.xml");
    const css = read("apps/web/src/shared/ui/styles/theme.css");
    expect(TONES.map(([tone]) => webColor(css, tone))).toEqual(TONES.map(([, name]) => vehicleColor(xml, name)));
  });
});

// 재생 화면의 세로 자리(3:4)는 세로 그림을 그대로 쓴다. 가로 그림만 있으면 초점으로 잘라 쓰게 되어 시안과 달라진다.
const VEHICLE_STORIES = ["redhood", "fisherman", "masteraway"] as const;
const SHAPES = ["portrait", "landscape"] as const;
const coverBinder = read("apps/vehicle/app/src/main/java/com/voicestorybook/vehicle/ui/CoverBinder.kt");

describe("vehicle cover art", () => {
  it.each(VEHICLE_STORIES)("%s ships and uses both a portrait and a landscape image", (story) => {
    const names = SHAPES.map((shape) => `cover_${story}_${shape}`);
    expect(names.every((name) => existsSync(join(VEHICLE_COVERS, `${name}.webp`)))).toBe(true);
    expect(names.every((name) => coverBinder.includes(`R.drawable.${name}`))).toBe(true);
  });
});
