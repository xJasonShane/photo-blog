/**
 * JSON document store backed by Cloudflare R2 (S3-compatible API).
 *
 * All photo/album/library metadata lives as JSON documents inside the same
 * R2 bucket used for image files, so the app requires no database service.
 * The S3 API driver works uniformly on Cloudflare Workers, EdgeOne Pages,
 * and local Node.js development; a local filesystem driver is used as a
 * zero-config fallback during development.
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

interface TextStoreDriver {
  /**
   * Resolves `null` only when the document does not exist. Transient
   * read failures (network errors, 5xx) must throw — callers rely on a
   * failed read surfacing as an error rather than masquerading as empty
   * data, which would let the next full-document write wipe it.
   */
  getText(key: string): Promise<string | null>
  putText(key: string, value: string): Promise<void>
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
    return response.text();
  },
  async putText(key, value) {
    const response = await getAwsClient().fetch(`${R2_BASE_URL}/${key}`, {
      method: 'PUT',
      body: value,
      headers: { 'Content-Type': 'application/json' },
    });
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

const isNodeFileNotFoundError = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e &&
  ['ENOENT', 'ENOTDIR'].includes((e as { code?: string }).code ?? '');

const localDriver: TextStoreDriver = {
  async getText(key) {
    const fs = await localDriverModule();
    try {
      return await fs.readFile(`${LOCAL_STORE_DIR}/${key}`, 'utf8');
    } catch (e) {
      if (isNodeFileNotFoundError(e)) { return null; }
      throw e;
    }
  },
  async putText(key, value) {
    const fs = await localDriverModule();
    await fs.mkdir(`${LOCAL_STORE_DIR}/${key.split('/').slice(0, -1).join('/')}`, {
      recursive: true,
    });
    await fs.writeFile(`${LOCAL_STORE_DIR}/${key}`, value, 'utf8');
  },
};

const getDriver = (): TextStoreDriver =>
  HAS_R2_DATA_STORE ? s3Driver : localDriver;

// ---------------------------------------------------------------------------
// Read/write helpers
// ---------------------------------------------------------------------------

const readJson = async <T>(key: string): Promise<T | undefined> => {
  const text = await getDriver().getText(key);
  if (text === null) { return undefined; }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // Fail closed on corrupted documents — treating them as missing
    // would let the next full-document write replace all metadata.
    console.error(`Corrupted JSON in store document "${key}":`, e);
    throw e;
  }
};

const writeJson = async <T>(key: string, value: T) => {
  await getDriver().putText(key, JSON.stringify(value));
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

export const getStoredPhotos = async (): Promise<StoredPhoto[]> => {
  const data = await readJson<{ photos: StoredPhoto[] }>(KEY_PHOTOS);
  if (data && !Array.isArray(data.photos)) {
    throw new Error(
      `Stored photos document "${KEY_PHOTOS}" has an unexpected shape`);
  }
  return (data?.photos ?? [])
    .map(photo => hydratePhotoDates(photo) as StoredPhoto);
};

export const saveStoredPhotos = async (photos: StoredPhoto[]) =>
  writeJson(KEY_PHOTOS, { photos });

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

export type StoredAlbum = Record<string, unknown> & { id: string };

export type StoredAlbumPhoto = {
  albumId: string
  photoId: string
  sortOrder: number
};

type StoredAlbumData = {
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

export const getStoredAlbumData = async (): Promise<StoredAlbumData> => {
  const data = await readJson<StoredAlbumData>(KEY_ALBUMS);
  if (data &&
    (!Array.isArray(data.albums) || !Array.isArray(data.albumPhoto))) {
    throw new Error(
      `Stored albums document "${KEY_ALBUMS}" has an unexpected shape`);
  }
  return {
    albums: (data?.albums ?? []).map(
      album => hydrateAlbumDates(album) as StoredAlbum,
    ),
    albumPhoto: data?.albumPhoto ?? [],
  };
};

export const saveStoredAlbumData = async (data: StoredAlbumData) =>
  writeJson(KEY_ALBUMS, data);

// ---------------------------------------------------------------------------
// Library ("about" page content)
// ---------------------------------------------------------------------------

export type StoredLibrary = Record<string, unknown>;

export const getStoredLibrary = async (): Promise<StoredLibrary | undefined> =>
  readJson<StoredLibrary>(KEY_LIBRARY);

export const saveStoredLibrary = async (library: StoredLibrary) =>
  writeJson(KEY_LIBRARY, library);
