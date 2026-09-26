/**
 * Cloudflare R2 file storage via the S3-compatible REST API, signed with
 * `aws4fetch`. Works on any runtime with standard `fetch` (Cloudflare
 * Workers, EdgeOne Pages, Node.js) — no provider-specific SDK required.
 */
import { AwsClient } from 'aws4fetch';
import { StorageListResponse, generateStorageId } from '.';
import { removeUrlProtocol } from '@/utility/url';
import { formatBytes } from '@/utility/number';

const CLOUDFLARE_R2_BUCKET =
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET ?? '';
const CLOUDFLARE_R2_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID ?? '';
const CLOUDFLARE_R2_PUBLIC_DOMAIN =
  removeUrlProtocol(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN) ?? '';
const CLOUDFLARE_R2_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_ACCESS_KEY ?? '';
const CLOUDFLARE_R2_SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '';
const CLOUDFLARE_R2_ENDPOINT = CLOUDFLARE_R2_ACCOUNT_ID
  ? `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;

export const CLOUDFLARE_R2_BASE_URL_PUBLIC = CLOUDFLARE_R2_PUBLIC_DOMAIN
  ? `https://${CLOUDFLARE_R2_PUBLIC_DOMAIN}`
  : undefined;
export const CLOUDFLARE_R2_BASE_URL_PRIVATE =
  CLOUDFLARE_R2_ENDPOINT && CLOUDFLARE_R2_BUCKET
    ? `${CLOUDFLARE_R2_ENDPOINT}/${CLOUDFLARE_R2_BUCKET}`
    : undefined;

let awsClient: AwsClient | undefined;

const r2Client = () => {
  if (!awsClient) {
    awsClient = new AwsClient({
      accessKeyId: CLOUDFLARE_R2_ACCESS_KEY,
      secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
  }
  return awsClient;
};

const urlForKey = (key?: string, isPublic = true) => isPublic
  ? `${CLOUDFLARE_R2_BASE_URL_PUBLIC}/${key}`
  : `${CLOUDFLARE_R2_BASE_URL_PRIVATE}/${key}`;

export const isUrlFromCloudflareR2 = (url?: string) => (
  CLOUDFLARE_R2_BASE_URL_PRIVATE &&
  url?.startsWith(CLOUDFLARE_R2_BASE_URL_PRIVATE)
) || (
  CLOUDFLARE_R2_BASE_URL_PUBLIC &&
  url?.startsWith(CLOUDFLARE_R2_BASE_URL_PUBLIC)
);

export const cloudflareR2Put = async (
  file: Buffer | Uint8Array,
  fileName: string,
): Promise<string> => {
  const response = await r2Client().fetch(urlForKey(fileName, false), {
    method: 'PUT',
    body: new Uint8Array(
      file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      ) as ArrayBuffer,
    ),
  });
  if (!response.ok) {
    throw new Error(
      `R2 upload failed for "${fileName}" (${response.status})`,
    );
  }
  return urlForKey(fileName);
};

export const cloudflareR2Copy = async (
  fileNameSource: string,
  fileNameDestination: string,
  addRandomSuffix?: boolean,
) => {
  const name = fileNameSource.split('.')[0];
  const extension = fileNameSource.split('.')[1];
  const Key = addRandomSuffix
    ? `${name}-${generateStorageId()}.${extension}`
    : fileNameDestination;
  const response = await r2Client().fetch(urlForKey(Key, false), {
    method: 'PUT',
    headers: {
      // eslint-disable-next-line max-len
      'x-amz-copy-source': `/${CLOUDFLARE_R2_BUCKET}/${encodeURIComponent(fileNameSource)}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      // eslint-disable-next-line max-len
      `R2 copy failed for "${fileNameSource}" -> "${Key}" (${response.status})`,
    );
  }
  return urlForKey(fileNameDestination);
};

export const cloudflareR2List = async (
  Prefix: string,
): Promise<StorageListResponse> => {
  const url =
    `${urlForKey('', false)}?list-type=2&prefix=${encodeURIComponent(Prefix)}`;
  const response = await r2Client().fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`R2 list failed (${response.status})`);
  }
  const text = await response.text();
  return Array.from(text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
    .map(([, contents]) => ({
      key: contents.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '',
      lastModified:
        contents.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1],
      size: contents.match(/<Size>([\s\S]*?)<\/Size>/)?.[1],
    }))
    .filter(({ key }) => key && key !== Prefix)
    .map(({ key, lastModified, size }) => ({
      url: urlForKey(key),
      fileName: key,
      uploadedAt: lastModified ? new Date(lastModified) : undefined,
      size: size ? formatBytes(parseInt(size, 10)) : undefined,
    }));
};

export const cloudflareR2Delete = async (Key: string) => {
  await r2Client().fetch(urlForKey(Key, false), { method: 'DELETE' });
};

export const cloudflareR2GetSignedUrl = async (
  Key: string,
  method: 'GET' | 'PUT',
  expiresIn: number,
) => {
  const request = await r2Client().sign(
    new Request(urlForKey(Key, false), {
      method,
      headers: { 'X-Amz-Expires': String(expiresIn) },
    }),
    { aws: { signQuery: true } },
  );
  return request.url;
};
