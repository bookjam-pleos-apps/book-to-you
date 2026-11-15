import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// 스플래시 그림은 웹(SVG)과 차량 앱(벡터 그림)이 따로 들고 있고, 웹 로딩 스플래시는 앱 밖(index.html)에 있다.
// 한쪽 그림만 바뀌거나 스플래시가 #root 밖으로 나가면 이 테스트가 잡는다.
const ROOT = join(import.meta.dirname, "..", "..");
const WEB = join(ROOT, "apps/web");
const VEHICLE_DRAWABLES = join(ROOT, "apps/vehicle/app/src/main/res/drawable");
const BRAND_ART = [["mascot.svg", "brand_mascot.xml"], ["logo-wordmark.svg", "brand_wordmark.xml"]] as const;

const read = (path: string): string => readFileSync(path, "utf8");

const capturesOf = (text: string, pattern: RegExp): readonly string[] => [...text.matchAll(pattern)].flatMap((match) => match[1] ?? []);

const filledSvgPaths = (svg: string): readonly string[] => capturesOf(svg, /<path d="([^"]+)" fill="(?!none)/g);

const vectorPaths = (xml: string): readonly string[] => capturesOf(xml, /android:pathData="([^"]+)"/g);

const indexHtml = read(join(WEB, "index.html"));
const rootInner = /<div id="root">([\s\S]*?)<script /.exec(indexHtml)?.[1] ?? "";
const splashImages = capturesOf(rootInner, /<img[^>]*\ssrc="([^"]+)"/g);

describe("splash art in web and vehicle", () => {
  it.each(BRAND_ART)("%s has the same paths as vehicle %s", (webName, vehicleName) => {
    const webPaths = filledSvgPaths(read(join(WEB, "src/assets/brand", webName)));
    expect(webPaths.length).toBeGreaterThan(0);
    expect(vectorPaths(read(join(VEHICLE_DRAWABLES, vehicleName)))).toEqual(webPaths);
  });
});

describe("web loading splash", () => {
  it("sits inside #root so the first React render replaces it", () => {
    expect(rootInner).toContain('class="splash"');
    expect(indexHtml.split('class="splash"')).toHaveLength(2);
  });

  it("shows the same two brand images as the start screen", () => {
    expect(splashImages).toEqual(["/src/assets/brand/mascot.svg", "/src/assets/brand/logo-wordmark.svg"]);
    expect(splashImages.every((source) => existsSync(join(WEB, source)))).toBe(true);
  });
});
