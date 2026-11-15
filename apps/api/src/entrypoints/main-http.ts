import { serve } from "@hono/node-server";

import { composeHttp } from "../composition";

const { app, port, stop } = await composeHttp(process.env);
const server = serve({ fetch: app.fetch, port });

const shutdown = (): void => {
  server.close(() => void stop());
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
