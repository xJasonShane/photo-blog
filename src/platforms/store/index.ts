/**
 * JSON document store backed by Cloudflare R2 (S3-compatible API).
 *
 * All photo/album/library metadata lives as JSON documents inside the same
 * R2 bucket used for image files, so the app requires no database service.
 * The S3 API driver works uniformly on Cloudflare Workers, EdgeOne Pages,
 * and local Node.js development; a local filesystem driver is used as a
 * zero-config fallback during development.
 *
 * Writes are serialized with optimistic concurrency: read-modify-write
 * cycles go through `mutateStoredDocument`, which carries the ETag
 * observed at read time as a conditional-write precondition (If-Match /
 * If-None-Match) and replays the whole cycle on conflict (HTTP 412)
 * instead of overwriting concurrent changes.
 */
import { AwsClient } from 'aws4fetch';

const R2_BUCKET =
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET ?? '';
const R2_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_ACCESS_KEY ?? '';
const R2_SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '';

export const HAS_R2_DATA_STORE = Boolean(
  R2_BUCKET && R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_ACCESS_KEY,
);

const KEY_PHOTOS = '_data/photos.json';
const KEY_ALBUMS = '_data/albums.json';
const KEY_LIBRARY = '_data/library.json';

export class StoreWriteConflictError extends Error {
  constructor(key: string) {
    super(
      `Store write conflict on "${key}" ` +
      '(document changed during read-modify-write)',
    );
    this.name = 'StoreWriteConflictError';
  }
}

export const isStoreWriteConflictError = (
  e: unknown,
): e is StoreWriteConflictError =>
  e instanceof Error && e.name === 'StoreWriteConflictError';

interface TextStoreDriver {
  /**
   * Resolves `null` only when the document does not exist. Transient
   * read failures (network errors, 5xx) must throw — callers rely on a
   * failed read surfacing as an error rather than masquerading as empty
   * data, which would let the next full-document write wipe it.
   */
  getText(key: string): Promise<{ text: string, etag: string } | null>
  /**
   * Conditional write semantics for `expectedEtag`:
   * - `undefined`: unconditional overwrite
   * - `null`: create-only (fails if the document exists)
   * - non-empty string: overwrite only if the current ETag matches
   * An empty string (ETag header unavailable) degrades to unconditional.
   */
  putText(
    key: string,
    value: string,
    expectedEtag?: string | null,
  ): Promise<void>
  deleteText?(key: string): Promise<void>
}

// ---------------------------------------------------------------------------
// S3-compatible driver (Cloudflare R2)
// ---------------------------------------------------------------------------

const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BASE_URL = `${R2_ENDPOINT}/${R2_BUCKET}`;

let awsClient: AwsClient | undefined;

const getAwsClient = () => {
  if (!awsClient) {
    awsClient = new AwsClient({
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
  }
  return awsClient;
};

const s3Driver: TextStoreDriver = {
  async getText(key) {
    const response = await getAwsClient()
      .fetch(`${R2_BASE_URL}/${key}`, { method: 'GET' });
    if (response.status === 404) { return null; }
    if (!response.ok) {
      throw new Error(`R2 store read failed for "${key}" (${response.status})`);
    }
    return {
      text: await response.text(),
      // Quoted S3-style ETag; echoed as-is in the If-Match precondition.
      etag: response.headers.get('ETag') ?? '',
    };
  },
  async putText(key, value, expectedEtag) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (expectedEtag === null) {
      headers['If-None-Match'] = '*';
    } else if (expectedEtag) {
      headers['If-Match'] = expectedEtag;
    }
    const response = await getAwsClient().fetch(`${R2_BASE_URL}/${key}`, {
      method: 'PUT',
      body: value,
      headers,
    });
    if (response.status === 412) {
      throw new StoreWriteConflictError(key);
    }
    if (!response.ok) {
      throw new Error(
        `R2 store write failed for "${key}" (${response.status})`,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Local filesystem driver (development only)
// ---------------------------------------------------------------------------

const LOCAL_STORE_DIR = '.data/store';

const localDriverModule = () =>
  // Resolved at runtime so that bundler builds never include `node:fs`
  // eslint-disable-next-line max-len
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:fs/promises')
    .then(fs => fs as unknown as typeof import('node:fs/promises'));

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const isNodeFileNotFoundError = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e &&
  ['ENOENT', 'ENOTDIR'].includes((e as { code?: string }).code ?? '');

const localDriver: TextStoreDriver = {
  async getText(key) {
    const fs = await localDriverModule();
    try {
      const text =
        await fs.readFile(`${LOCAL_STORE_DIR}/${key}`, 'utf8');
      return { text, etag: await sha256Hex(text) };
    } catch (e) {
      if (isNodeFileNotFoundError(e)) { return null; }
      throw e;
    }
  },
  async putText(key, value, expectedEtag) {
    const fs = await localDriverModule();
    await fs.mkdir(`${LOCAL_STORE_DIR}/${key.split('/').slice(0, -1).join('/')}`, {
      recursive: true,
    });
    if (expectedEtag !== undefined) {
      let currentEtag: string | null;
      try {
        const currentText =
          await fs.readFile(`${LOCAL_STORE_DIR}/${key}`, 'utf8');
        currentEtag = await sha256Hex(currentText);
      } catch (e) {
        if (!isNodeFileNotFoundError(e)) { throw e; }
        currentEtag = null;
      }
      const preconditionSatisfied = expectedEtag === null
        ? currentEtag === null
        : currentEtag !== null && currentEtag === expectedEtag;
      if (!preconditionSatisfied) {
        throw new StoreWriteConflictError(key);
      }
    }
    await fs.writeFile(`${LOCAL_STORE_DIR}/${key}`, value, 'utf8');
  },
};

const getDriver = (): TextStoreDriver =>
  HAS_R2_DATA_STORE ? s3Driver : localDriver;

// ---------------------------------------------------------------------------
// Read/write helpers
// ---------------------------------------------------------------------------

const readJsonWithEtag = async <T>(key: string): Promise<{
  data: T | undefined, etag: string | null,
}> => {
  const result = await getDriver().getText(key);
  if (result === null) { return { data: undefined, etag: null }; }
  try {
    return { data: JSON.parse(result.text) as T, etag: result.etag };
  } catch (e) {
    // Fail closed on corrupted documents — treating them as missing
    // would let the next full-document write replace all metadata.
    console.error(`Corrupted JSON in store document "${key}":`, e);
    throw e;
  }
};

const writeJson = async <T>(
  key: string,
  value: T,
  expectedEtag?: string | null,
) => {
  await getDriver().putText(
    key,
    JSON.stringify(value),
    expectedEtag === null ? null : expectedEtag || undefined,
  );
};

const MUTATE_STORE_MAX_ATTEMPTS = 5;

export { MUTATE_STORE_MAX_ATTEMPTS };

/**
 * Runs a read-modify-write cycle with optimistic concurrency: the write
 * carries the ETag observed at read time, and on conflict the cycle
 * re-reads the document and replays the mutation. The mutation must
 * modify `data` in place (or its properties) — the possibly-replaced
 * object is what gets written.
 */
export const mutateStoredDocument = async <T, R>(args: {
  read: () => Promise<{ data: T, etag: string | null }>
  write: (data: T, etag: string | null) => Promise<void>
  mutate: (data: T) => R | Promise<R>
}): Promise<R> => {
  let lastConflict: StoreWriteConflictError | undefined;
  for (let attempt = 0; attempt < MUTATE_STORE_MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await args.read();
    const result = await args.mutate(data);
    try {
      await args.write(data, etag);
      return result;
    } catch (e) {
      if (isStoreWriteConflictError(e)) {
        lastConflict = e;
      } else {
        throw e;
      }
    }
  }
  throw lastConflict ??
    new Error('Store write conflict retry budget exhausted');
};

export const testStoreConnection = async () => {
  if (HAS_R2_DATA_STORE) {
    const response = await getAwsClient()
      .fetch(`${R2_BASE_URL}?list-type=2&max-keys=1`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(
        `R2 storage connection failed (${response.status})`,
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

// Mirrors the shape of `PhotoDb` from '@/photo', with dates hydrated
// back to `Date` objects on read to match the previous Postgres behavior.
export type StoredPhoto = Record<string, unknown> & {
  id: string
  url: string
  takenAt: string | Date
  takenAtNaive: string
};

const hydratePhotoDates = (photo: Record<string, unknown>) => {
  const dateKeys = ['takenAt', 'updatedAt', 'createdAt'];
  const hydrated = { ...photo };
  for (const key of dateKeys) {
    const value = hydrated[key];
    if (typeof value === 'string') {
      hydrated[key] = new Date(value);
    }
  }
  // Color data is consumed as a parsed object (previously a JSONB column)
  if (typeof hydrated.colorData === 'string' && hydrated.colorData) {
    try {
      hydrated.colorData = JSON.parse(hydrated.colorData);
    } catch {
      hydrated.colorData = undefined;
    }
  }
  return hydrated;
};

export const getStoredPhotosWithEtag = async (): Promise<{
  data: StoredPhoto[], etag: string | null,
}> => {
  const { data, etag } =
    await readJsonWithEtag<{ photos: StoredPhoto[] }>(KEY_PHOTOS);
  if (data && !Array.isArray(data.photos)) {
    throw new Error(
      `Stored photos document "${KEY_PHOTOS}" has an unexpected shape`);
  }
  return {
    data: (data?.photos ?? [])
      .map(photo => hydratePhotoDates(photo) as StoredPhoto),
    etag,
  };
};

export const getStoredPhotos = async (): Promise<StoredPhoto[]> =>
  (await getStoredPhotosWithEtag()).data;

export const saveStoredPhotos = async (
  photos: StoredPhoto[],
  expectedEtag?: string | null,
) => writeJson(KEY_PHOTOS, { photos }, expectedEtag);

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

export type StoredAlbum = Record<string, unknown> & { id: string };

export type StoredAlbumPhoto = {
  albumId: string
  photoId: string
  sortOrder: number
};

export type StoredAlbumData = {
  albums: StoredAlbum[]
  albumPhoto: StoredAlbumPhoto[]
};

const hydrateAlbumDates = (album: Record<string, unknown>) => {
  const hydrated = { ...album };
  for (const key of ['updatedAt', 'createdAt']) {
    const value = hydrated[key];
    if (typeof value === 'string') {
      hydrated[key] = new Date(value);
    }
  }
  return hydrated;
};

export const getStoredAlbumDataWithEtag = async (): Promise<{
  data: StoredAlbumData, etag: string | null,
}> => {
  const { data, etag } =
    await readJsonWithEtag<StoredAlbumData>(KEY_ALBUMS);
  if (data &&
    (!Array.isArray(data.albums) || !Array.isArray(data.albumPhoto))) {
    throw new Error(
      `Stored albums document "${KEY_ALBUMS}" has an unexpected shape`);
  }
  return {
    data: {
      albums: (data?.albums ?? []).map(
        album => hydrateAlbumDates(album) as StoredAlbum,
      ),
      albumPhoto: data?.albumPhoto ?? [],
    },
    etag,
  };
};

export const getStoredAlbumData = async (): Promise<StoredAlbumData> =>
  (await getStoredAlbumDataWithEtag()).data;

export const saveStoredAlbumData = async (
  data: StoredAlbumData,
  expectedEtag?: string | null,
) => writeJson(KEY_ALBUMS, data, expectedEtag);

// ---------------------------------------------------------------------------
// Library ("about" page content)
// ---------------------------------------------------------------------------

export type StoredLibrary = Record<string, unknown>;

export const getStoredLibraryWithEtag = async (): Promise<{
  data: StoredLibrary | undefined, etag: string | null,
}> => readJsonWithEtag<StoredLibrary>(KEY_LIBRARY);

export const getStoredLibrary = async (): Promise<StoredLibrary | undefined> =>
  (await getStoredLibraryWithEtag()).data;

export const saveStoredLibrary = async (
  library: StoredLibrary,
  expectedEtag?: string | null,
) => writeJson(KEY_LIBRARY, library, expectedEtag);
