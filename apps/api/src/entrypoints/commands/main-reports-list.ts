import { desc } from "drizzle-orm";

import { connectDatabase } from "../../adapters/db/client";
import { storyReports } from "../../adapters/db/schema";

const RECENT_LIMIT = 50;

// 운영자가 최근 신고를 확인한다. 부모 웹에는 아직 신고 목록 화면이 없다.
const url = process.env["DATABASE_URL"];
if (url === undefined) throw new Error("DATABASE_URL이 없다");
const connection = connectDatabase(url);
const rows = await connection.database
  .select()
  .from(storyReports)
  .orderBy(desc(storyReports.createdAt))
  .limit(RECENT_LIMIT)
  .finally(connection.close);
rows.forEach((row) => console.info(JSON.stringify(row)));
console.info(`최근 신고 ${rows.length}건`);
