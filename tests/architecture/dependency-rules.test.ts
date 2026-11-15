import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURES = resolve(import.meta.dirname, "fixtures");
const API = "apps/api/src";

const EXPECTED_VIOLATIONS = [
  `adapter-stays-in-folder: ${API}/adapters/db/reach-http.ts`,
  `application-module-public-api: ${API}/application/renders/reach-internal.ts`,
  `application-no-outer-layers: ${API}/application/renders/reach-adapter.ts`,
  `application-no-outer-layers: ${API}/application/renders/reach-contract.ts`,
  `domain-deps-voices: ${API}/domain/voices/reach-renders.ts`,
  `domain-is-pure: ${API}/domain/voices/impure.ts`,
  `module-deps-unlisted: ${API}/application/billing/reach-voices.ts`,
  `module-deps-voices: ${API}/application/voices/reach-renders-port.ts`,
  `module-deps-voices: ${API}/application/voices/reach-renders.ts`,
  `driven-adapter-no-contracts: ${API}/adapters/db/reach-contract.ts`,
  `driven-adapter-only-ports: ${API}/adapters/db/reach-module.ts`,
  `driven-adapter-only-ports: ${API}/adapters/payment/reach-module.ts`,
  `driving-adapter-public-api: ${API}/adapters/queue/reach-internal.ts`,
  `no-circular: ${API}/domain/voices/cycle-a.ts`,
  `no-unresolvable: ${API}/domain/voices/missing.ts`,
  `only-roots-import-composition: ${API}/adapters/http/reach-config.ts`,
  `only-roots-import-composition: ${API}/adapters/http/reach-root.ts`,
  `only-roots-import-composition: ${API}/adapters/http/reach-wiring.ts`,
  "shared-no-apps: packages/shared/src/reach-app.ts",
  "shared-only-zod: packages/shared/src/extra-dep.ts",
  "web-no-api: apps/web/src/reach-api.ts",
  "web-features-isolated: apps/web/src/features/auth/reach-feature.ts",
  "web-lower-layers-stay-low: apps/web/src/shared/ui/reach-feature.ts",
  "web-lower-layers-stay-low: apps/web/src/lib/recorder/reach-app.ts",
  "web-lib-no-api: apps/web/src/lib/recorder/reach-api-client.ts",
  "web-lib-no-api: apps/web/src/lib/recorder/reach-contract.ts",
];

const cruiseFixtures = (): string =>
  spawnSync(
    resolve(ROOT, "node_modules/.bin/depcruise"),
    ["apps", "packages", "--config", resolve(ROOT, ".dependency-cruiser.cjs"), "--output-type", "err"],
    { cwd: FIXTURES, encoding: "utf8" },
  ).stdout;

const parseViolations = (report: string): string[] =>
  [...report.matchAll(/^\s*error ([\w-]+): (\S+) →/gm)].map(([, rule, from]) => `${rule}: ${from}`);

describe("dependency rules", () => {
  it("reports each forbidden import and leaves allowed imports alone", () => {
    const violations = parseViolations(cruiseFixtures());
    expect(violations.toSorted()).toEqual(EXPECTED_VIOLATIONS.toSorted());
  });
});
