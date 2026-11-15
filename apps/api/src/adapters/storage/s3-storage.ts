import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ObjectMissing, type ByteRange, type ObjectStorage, type StoredObjectInfo } from "../../application/ports/object-storage";

export type S3StorageOptions = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

const createClient = ({ endpoint, accessKeyId, secretAccessKey }: S3StorageOptions): S3Client =>
  new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

const toRangeHeader = (range: ByteRange | undefined): string | undefined =>
  range === undefined ? undefined : `bytes=${range.start}-${range.end}`;

const listAll = async (
  client: S3Client,
  bucket: string,
  prefix: string,
  continuationToken?: string,
): Promise<readonly StoredObjectInfo[]> => {
  const page = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
    }),
  );
  const objects = (page.Contents ?? []).flatMap(({ Key, LastModified }) =>
    Key === undefined ? [] : [{ key: Key, lastModified: LastModified ?? new Date(0) }],
  );
  if (page.NextContinuationToken === undefined) return objects;
  return [...objects, ...(await listAll(client, bucket, prefix, page.NextContinuationToken))];
};

const DELETE_BATCH_SIZE = 1000;

const deleteKeys = async (client: S3Client, bucket: string, keys: readonly string[]): Promise<void> => {
  if (keys.length === 0) return;
  const batch = keys.slice(0, DELETE_BATCH_SIZE).map((Key) => ({ Key }));
  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
  await deleteKeys(client, bucket, keys.slice(DELETE_BATCH_SIZE));
};

const readObject = async (client: S3Client, bucket: string, key: string, range: ByteRange | undefined) => {
  const header = toRangeHeader(range);
  const { Body } = await client
    .send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(header === undefined ? {} : { Range: header }) }))
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "NoSuchKey") throw new ObjectMissing(`no such object: ${key}`);
      throw error;
    });
  if (Body === undefined) throw new Error(`empty object body: ${key}`);
  return Body.transformToWebStream();
};

export const ensureBucket = async (options: S3StorageOptions): Promise<void> => {
  const client = createClient(options);
  const exists = await client.send(new HeadBucketCommand({ Bucket: options.bucket })).then(
    () => true,
    () => false,
  );
  if (!exists) await client.send(new CreateBucketCommand({ Bucket: options.bucket }));
};

export const createS3Storage = (options: S3StorageOptions): ObjectStorage => {
  const client = createClient(options);
  const { bucket } = options;
  return {
    put: async (key, bytes, contentType) => {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    read: (key, range) => readObject(client, bucket, key, range),
    list: (prefix) => listAll(client, bucket, prefix),
    deletePrefix: async (prefix) => {
      const objects = await listAll(client, bucket, prefix);
      await deleteKeys(client, bucket, objects.map((object) => object.key));
    },
    deleteKeys: (keys) => deleteKeys(client, bucket, keys),
  };
};
