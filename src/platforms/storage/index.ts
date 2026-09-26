import {
  CLOUDFLARE_R2_BASE_URL_PUBLIC,
  cloudflareR2Copy,
  cloudflareR2Delete,
  cloudflareR2GetSignedUrl,
  cloudflareR2List,
  cloudflareR2Put,
  isUrlFromCloudflareR2,
} from './r2';
import {
  LOCAL_FILE_BASE_URL_PUBLIC,
  isUrlFromLocalStorage,
  localCopy,
  localDelete,
  localGetSignedUrl,
  localList,
  localPut,
} from './local';
import {
  CURRENT_STORAGE,
  HAS_CLOUDFLARE_R2_STORAGE,
  HAS_LOCAL_STORAGE,
} from '@/app/config';
import { generateNanoid } from '@/utility/nanoid';
import { PATH_API_PRESIGNED_URL } from '@/app/path';

export type StorageListItem = {
  url: string
  fileName: string
  uploadedAt?: Date
  size?: string
};

export type StorageListResponse = StorageListItem[];

export type StorageType = 'cloudflare-r2' | 'local';

export type ClientUploadOptions = {
  onProgress?: (loaded: number, total: number) => void
  abortSignal?: AbortSignal
};

export const generateStorageId = () => generateNanoid(16);

export const generateFileNameWithId = (prefix: string) =>
  `${prefix}-${generateStorageId()}`;

export const getFileNamePartsFromStorageUrl = (url: string) => {
  const [
    _,
    urlBase = '',
    fileName = '',
    fileNameBase = '',
    fileId = '',
    fileModifier = '',
    fileExtension = '',
  ] = url.match(
    /^(.+)\/((-*[a-z0-9]+-*([a-z0-9]+)-*([a-z0-9]+)*)\.([a-z]{1,4}))$/i,
  ) ?? [];
  return {
    urlBase,
    fileName,
    fileNameBase,
    fileId,
    fileModifier,
    fileExtension,
  };
};

export const labelForStorage = (type: StorageType): string => {
  switch (type) {
    case 'cloudflare-r2': return 'Cloudflare R2';
    case 'local': return 'Local (dev)';
  }
};

export const baseUrlForStorage = (type: StorageType) => {
  switch (type) {
    case 'cloudflare-r2': return CLOUDFLARE_R2_BASE_URL_PUBLIC;
    case 'local': return LOCAL_FILE_BASE_URL_PUBLIC;
  }
};

export const storageTypeFromUrl = (url: string): StorageType => {
  if (isUrlFromCloudflareR2(url)) {
    return 'cloudflare-r2';
  } else {
    return 'local';
  }
};

const putBlobWithProgress = (
  url: string,
  file: File | Blob,
  {
    onProgress,
    abortSignal,
  }: ClientUploadOptions = {},
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'));

    if (abortSignal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const onAbort = () => xhr.abort();
    abortSignal?.addEventListener('abort', onAbort);
    xhr.onloadend = () => abortSignal?.removeEventListener('abort', onAbort);
    xhr.send(file);
  });

export const uploadFromClientViaPresignedUrl = async (
  file: File | Blob,
  fileName: string,
  options?: ClientUploadOptions,
) => {
  const url = await fetch(
    `${PATH_API_PRESIGNED_URL}/${fileName}`,
    { signal: options?.abortSignal },
  )
    .then((response) => response.text());

  await putBlobWithProgress(url, file, options);

  return `${baseUrlForStorage(CURRENT_STORAGE)}/${fileName}`;
};

export const uploadFileFromClient = async (
  file: File | Blob,
  _fileName: string,
  extension: string,
  addRandomSuffix = true,
  options?: ClientUploadOptions,
) => {
  const fileName = addRandomSuffix
    ? `${_fileName}-${generateStorageId()}.${extension}`
    : `${_fileName}.${extension}`;

  return uploadFromClientViaPresignedUrl(file, fileName, options);
};

export const putFile = (
  file: Buffer | Uint8Array,
  fileName: string,
) => {
  switch (CURRENT_STORAGE) {
    case 'cloudflare-r2':
      return cloudflareR2Put(file, fileName);
    case 'local':
      return localPut(file, fileName);
  }
};

export const copyFile = (
  originUrl: string,
  destinationFileName: string,
): Promise<string> => {
  const { fileName } = getFileNamePartsFromStorageUrl(originUrl);
  switch (storageTypeFromUrl(originUrl)) {
    case 'cloudflare-r2':
      return cloudflareR2Copy(
        fileName,
        destinationFileName,
        false,
      );
    case 'local':
      return localCopy(
        fileName,
        destinationFileName,
        false,
      );
  }
};

export const deleteFile = (url: string) => {
  const { fileName } = getFileNamePartsFromStorageUrl(url);
  switch (storageTypeFromUrl(url)) {
    case 'cloudflare-r2':
      return cloudflareR2Delete(fileName);
    case 'local':
      return localDelete(fileName);
  }
};

export const deleteFilesWithPrefix = async (prefix: string) => {
  const urls = await getStorageUrlsForPrefix(prefix);
  return Promise.all(urls.map(({ url }) => deleteFile(url)));
};

export const moveFile = async (
  originUrl: string,
  destinationFileName: string,
) => {
  const url = await copyFile(originUrl, destinationFileName);
  // If successful, delete original file
  if (url) { await deleteFile(originUrl); }
  return url;
};

export const getStorageUrlsForPrefix = async (prefix = '') => {
  const urls: StorageListResponse = [];

  if (HAS_CLOUDFLARE_R2_STORAGE) {
    urls.push(...await cloudflareR2List(prefix)
      .catch(() => []));
  }
  if (HAS_LOCAL_STORAGE) {
    urls.push(...await localList(prefix)
      .catch(() => []));
  }

  return urls
    .sort((a, b) => {
      if (!a.uploadedAt) { return 1; }
      if (!b.uploadedAt) { return -1; }
      return b.uploadedAt.getTime() - a.uploadedAt.getTime();
    });
};

// Used primarily for uploading files
export const getSignedUrlForKey = async (
  key: string,
  method: 'GET' | 'PUT',
  expiresIn = 3600,
) => {
  switch (CURRENT_STORAGE) {
    case 'cloudflare-r2':
      return cloudflareR2GetSignedUrl(key, method, expiresIn);
    case 'local':
      return localGetSignedUrl(key, method, expiresIn);
  }
};

// Used for safely fetching files via presigned URLs
export const getSignedUrlForUrl = (
  url: string,
  method: 'GET' | 'PUT',
  expiresIn = 3600,
) => {
  const { fileName } = getFileNamePartsFromStorageUrl(url);
  switch (storageTypeFromUrl(url)) {
    case 'cloudflare-r2':
      return cloudflareR2GetSignedUrl(fileName, method, expiresIn);
    case 'local':
      return localGetSignedUrl(fileName, method, expiresIn);
  }
};

export const testStorageConnection = () =>
  getStorageUrlsForPrefix();
