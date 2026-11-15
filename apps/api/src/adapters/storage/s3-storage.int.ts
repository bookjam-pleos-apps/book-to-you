import { randomUUID } from "node:crypto";

import { beforeAll } from "vitest";

import { createS3Storage, ensureBucket } from "./s3-storage";
import { describeObjectStorage } from "./testing/storage-contract";

const options = {
  endpoint: process.env.S3_ENDPOINT ?? "",
  bucket: process.env.S3_BUCKET ?? "",
  accessKeyId: process.env.MINIO_ROOT_USER ?? "",
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "",
};

beforeAll(() => ensureBucket(options));

describeObjectStorage("minio", createS3Storage(options), `int-test/${randomUUID()}/`);
