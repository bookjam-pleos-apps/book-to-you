import pg from "pg";

const INT_SUFFIX = "_int_test";

const databaseNameOf = (url: URL): string => url.pathname.slice(1);

export const intDatabaseUrl = (developmentUrl: string): string => {
  const url = new URL(developmentUrl);
  url.pathname = `/${databaseNameOf(url)}${INT_SUFFIX}`;
  return url.toString();
};

// 통합 테스트가 개발 DB의 데이터와 대기 작업을 건드리지 않게 전용 DB를 쓴다.
export const setup = async (): Promise<void> => {
  const developmentUrl = process.env.DATABASE_URL ?? "";
  const name = databaseNameOf(new URL(intDatabaseUrl(developmentUrl)));
  const admin = new pg.Client({ connectionString: developmentUrl });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (existing.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
};
