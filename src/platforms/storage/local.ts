/**
 * Local filesystem storage driver — development fallback used when no R2
 * credentials are configured. Files are written to `.data/files/` and
 * served through the `/local-file` route handler.
 */
import { StorageListResponse, generateStorageId } from '.';
import { BASE_URL } from '@/app/config';

export const LOCAL_FILE_BASE_URL_PUBLIC = `${BASE_URL}/local-file`;

const LOCAL_FILES_DIR = '.data/files';

const fsModule = () =>
  // Resolved at runtime so that bundler builds never include `node:fs`
  // eslint-disable-next-line max-len
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:fs/promises')
    .then(fs => fs as unknown as typeof import('node:fs/promises'));

const pathForFileName = (fileName: string) =>
  `${LOCAL_FILES_DIR}/${fileName}`;

export const isUrlFromLocalStorage = (url?: string) =>
  url?.startsWith(LOCAL_FILE_BASE_URL_PUBLIC) ?? false;

export const localPut = async (
  file: Buffer | Uint8Array,
  fileName: string,
): Promise<string> => {
  const fs = await fsModule();
  await fs.mkdir(LOCAL_FILES_DIR, { recursive: true });
  await fs.writeFile(
    pathForFileName(fileName),
    new Uint8Array(
      file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      ) as ArrayBuffer,
    ),
  );
  return `${LOCAL_FILE_BASE_URL_PUBLIC}/${fileName}`;
};

export const localCopy = async (
  fileNameSource: string,
  fileNameDestination: string,
  addRandomSuffix?: boolean,
) => {
  const fs = await fsModule();
  const name = fileNameSource.split('.')[0];
  const extension = fileNameSource.split('.')[1];
  const destination = addRandomSuffix
    ? `${name}-${generateStorageId()}.${extension}`
    : fileNameDestination;
  await fs.copyFile(
    pathForFileName(fileNameSource),
    pathForFileName(destination),
  );
  return `${LOCAL_FILE_BASE_URL_PUBLIC}/${fileNameDestination}`;
};

export const localList = async (prefix: string): Promise<StorageListResponse> => {
  const fs = await fsModule();
  try {
    const fileNames = await fs.readdir(LOCAL_FILES_DIR);
    return fileNames
      .filter(fileName => fileName.startsWith(prefix))
      .map(fileName => `${LOCAL_FILE_BASE_URL_PUBLIC}/${fileName}`)
      .map(url => ({ url, fileName: url.split('/').pop() ?? '' }));
  } catch {
    return [];
  }
};

export const localDelete = async (fileName: string) => {
  const fs = await fsModule();
  await fs.rm(pathForFileName(fileName), { force: true });
};

export const localGetSignedUrl = (
  Key: string,
  _method: 'GET' | 'PUT',
  _expiresIn: number,
) => `${LOCAL_FILE_BASE_URL_PUBLIC}/${Key}`;
