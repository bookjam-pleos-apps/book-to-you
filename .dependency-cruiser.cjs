const path = require("node:path");

const API = "^apps/api/src";
// 구동 어댑터는 바깥(HTTP 요청, 작업 큐, 운영자 명령, 타이머)에서 유스케이스를 부른다. 나머지는 포트를 구현하는 피구동 어댑터다.
const DRIVING_ADAPTERS = `${API}/adapters/(http|queue|cli|polling)/`;
const DRIVEN_ADAPTERS = `${API}/adapters/(?!http/|queue/|cli/|polling/)[^/]+/`;
const ROOTS = `${API}/((composition|composition-workers|composition-demo|config)\\.ts$|entrypoints/|wiring/)`;
const CONTRACTS = "^packages/shared/src/contracts/";
const WEB = "^apps/web/src";
const NPM_DEPENDENCY_TYPES = ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-no-pkg", "npm-unknown"];

const forbid = (name, comment, from, to) => ({ name, comment, severity: "error", from, to });

// application 모듈이 기댈 수 있는 다른 모듈이다. 여기 없는 방향은 금지한다. 모듈을 새로 만들면 이 표에 먼저 더한다.
// 아래로만 흐른다: demo·render-worker → renders → recording-scripts·stories·library, reports → library, voices·verification → recording-scripts, devices → identity.
const MODULE_DEPENDENCIES = {
  identity: [],
  stories: [],
  "recording-scripts": [],
  retention: [],
  voices: ["recording-scripts"],
  verification: ["recording-scripts"],
  library: ["stories"],
  devices: ["identity"],
  renders: ["recording-scripts", "stories", "library"],
  "render-worker": ["renders"],
  chapterize: ["renders", "stories"],
  demo: ["voices", "renders", "recording-scripts"],
  reports: ["library"],
};

const moduleDependencyRules = Object.entries(MODULE_DEPENDENCIES).map(([name, allowed]) =>
  forbid(
    `module-deps-${name}`,
    `${name} 모듈은 ${allowed.length > 0 ? allowed.join(", ") : "다른 모듈 없이 ports"}만 안다`,
    { path: `${API}/application/${name}/` },
    { path: `${API}/application/`, pathNot: `${API}/application/(${["ports", name, ...allowed].join("|")})/` },
  ),
);

// domain도 같은 방향을 따른다. domain 바로 아래의 공용 파일(sha256, storage-keys 등)은 어느 모듈이나 쓴다.
const domainDependencyRules = Object.entries(MODULE_DEPENDENCIES).map(([name, allowed]) =>
  forbid(
    `domain-deps-${name}`,
    `domain/${name}은 ${allowed.length > 0 ? allowed.join(", ") : "다른 모듈 없이 공용 파일"}만 안다`,
    { path: `${API}/domain/${name}/` },
    { path: `${API}/domain/[^/]+/`, pathNot: `${API}/domain/(${[name, ...allowed].join("|")})/` },
  ),
);

const unlistedModuleRule = forbid(
  "module-deps-unlisted",
  "MODULE_DEPENDENCIES에 없는 모듈은 다른 모듈을 import할 수 없다",
  { path: `${API}/application/([^/]+)/`, pathNot: `${API}/application/(${["ports", ...Object.keys(MODULE_DEPENDENCIES)].join("|")})/` },
  { path: `${API}/application/`, pathNot: `${API}/application/(ports|$1)/` },
);

module.exports = {
  forbidden: [
    forbid("no-circular", "순환 의존 금지", {}, { circular: true }),
    forbid("no-unresolvable", "해석되지 않는 import는 경로 규칙을 빠져나간다", {}, { couldNotResolve: true }),
    forbid(
      "domain-is-pure",
      "domain은 vocab과 domain만 안다",
      { path: `${API}/domain/` },
      {
        pathNot: [`${API}/domain/`, "^packages/shared/src/vocab\\.ts$"],
        dependencyTypesNot: ["core", "unknown"],
      },
    ),
    forbid(
      "application-no-outer-layers",
      "application은 adapters, 조립 루트, contracts를 모른다",
      { path: `${API}/application/` },
      { path: [`${API}/adapters/`, ROOTS, CONTRACTS] },
    ),
    forbid(
      "application-module-public-api",
      "다른 모듈은 index.ts(유스케이스)와 ports.ts(타입)로만 접근한다",
      { path: `${API}/application/([^/]+)/` },
      { path: `${API}/application/(?!ports/)[^/]+/(?!(index|ports)\\.ts$)`, pathNot: `${API}/application/$1/` },
    ),
    ...moduleDependencyRules,
    ...domainDependencyRules,
    unlistedModuleRule,
    forbid(
      "driven-adapter-only-ports",
      "피구동 어댑터는 application 중 ports와 모듈별 ports.ts(Repo 인터페이스)만 안다",
      { path: DRIVEN_ADAPTERS },
      { path: `${API}/application/(?!ports/|[^/]+/ports\\.ts$)` },
    ),
    forbid(
      "driven-adapter-no-contracts",
      "피구동 어댑터는 contracts를 모른다",
      { path: DRIVEN_ADAPTERS },
      { path: CONTRACTS },
    ),
    forbid(
      "driving-adapter-public-api",
      "구동 어댑터는 index.ts와 ports로만 application에 접근한다",
      { path: DRIVING_ADAPTERS },
      { path: `${API}/application/(?!ports/)[^/]+/(?!index\\.ts$)` },
    ),
    forbid(
      "adapter-stays-in-folder",
      "어댑터는 자기 폴더만 import한다",
      { path: `${API}/adapters/([^/]+)/` },
      { path: `${API}/adapters/`, pathNot: `${API}/adapters/$1/` },
    ),
    forbid(
      "only-roots-import-composition",
      "조립 루트는 다른 코드가 import하지 않는다",
      { pathNot: ROOTS },
      { path: ROOTS },
    ),
    forbid(
      "web-no-api",
      "웹은 apps/api를 import하지 않고 shared의 계약만 쓴다",
      { path: "^apps/web/" },
      { path: "^apps/api/" },
    ),
    forbid(
      "web-features-isolated",
      "웹 features끼리는 import하지 않고 조합은 app/에서 한다",
      { path: `${WEB}/features/([^/]+)/` },
      { path: `${WEB}/features/`, pathNot: `${WEB}/features/$1/` },
    ),
    forbid(
      "web-lower-layers-stay-low",
      "웹 shared와 lib는 features와 app을 모른다",
      { path: `${WEB}/(shared|lib)/` },
      { path: `${WEB}/(features|app)/` },
    ),
    forbid(
      "web-lib-no-api",
      "레코더 등 lib는 API를 모르고 이벤트만 올린다",
      { path: `${WEB}/lib/` },
      { path: [`${WEB}/shared/api-client/`, CONTRACTS] },
    ),
    forbid(
      "shared-no-apps",
      "shared는 apps를 모른다",
      { path: "^packages/shared/src/" },
      { path: "^apps/" },
    ),
    forbid(
      "shared-only-zod",
      "shared는 zod에만 의존한다",
      { path: "^packages/shared/src/" },
      { dependencyTypes: NPM_DEPENDENCY_TYPES, pathNot: "node_modules/zod/" },
    ),
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: path.join(__dirname, "tsconfig.base.json") },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default"],
      extensions: [".ts", ".tsx", ".js"],
    },
    exclude: { path: ["\\.test\\.tsx?$", "\\.int\\.ts$", "/testing/"] },
  },
};
