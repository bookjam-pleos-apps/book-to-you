import { Client } from "pg";

import { POOL_APPLICATION_NAME } from "./client";

// lost는 잠금 연결이 끊기면(Postgres 재시작 등) 이루어진다. 그 뒤로는 다른 인스턴스가 잠금을 잡을 수 있으니 멈춰야 한다.
export type SingleInstanceLock = { readonly release: () => Promise<void>; readonly lost: Promise<Error> };

// 세션 advisory lock은 그 연결이 살아 있는 동안만 잡힌다. 풀에서 빌린 연결은 반납되면 다른 쿼리가 쓰므로 전용 연결을 둔다.
// 프로세스가 죽으면 연결이 끊겨 Postgres가 잠금을 푼다. 남은 잠금을 사람이 지울 일이 없다.
// 처리기가 없으면 끊긴 연결의 error 이벤트가 프로세스를 바로 죽인다(client.ts의 풀과 같은 이유).
export const acquireSingleInstanceLock = async (connectionString: string, key: number): Promise<SingleInstanceLock | null> => {
  const client = new Client({ connectionString, application_name: `${POOL_APPLICATION_NAME}-lock` });
  const lost = new Promise<Error>((resolve) => client.on("error", resolve));
  await client.connect();
  const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [key]);
  if (rows[0]?.locked === true) return { release: () => client.end(), lost };
  await client.end();
  return null;
};
