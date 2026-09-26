import {
  copyFile,
  deleteFile,
  getFileNamePartsFromStorageUrl,
  moveFile,
  putFile,
} from '@/platforms/storage';
import { removeGpsData } from '../server';
import { generateRandomFileNameForPhoto } from '.';

const DERIVATIVE_SUFFIXES = ['sm', 'md', 'lg'];

/**
 * Best-effort transfer of the derivative files (`-sm`, `-md`, `-lg`)
 * generated in the browser at upload time. Missing derivatives are
 * skipped silently so legacy uploads still convert.
 */
export const moveOptimizedPhotosForUpload = async (
  uploadUrl: string,
  photoFileNameBase: string,
) => {
  const { fileNameBase: uploadFileNameBase } =
    getFileNamePartsFromStorageUrl(uploadUrl);
  const urlBase = uploadUrl.split('/').slice(0, -1).join('/');
  await Promise.all(DERIVATIVE_SUFFIXES.map(async suffix => {
    const source = `${uploadFileNameBase}-${suffix}.jpg`;
    const sourceUrl = `${urlBase}/${source}`;
    try {
      const url = await copyFile(sourceUrl, `${photoFileNameBase}-${suffix}.jpg`);
      if (url) { await deleteFile(sourceUrl); }
    } catch {
      // Missing derivative — nothing to transfer
    }
  }));
};

export const convertUploadToPhoto = async ({
  uploadUrl,
  fileBytes: _fileBytes,
  shouldStripGpsData,
  shouldDeleteOrigin = true,
} : {
  uploadUrl: string
  fileBytes?: ArrayBuffer
  shouldStripGpsData?: boolean
  shouldDeleteOrigin?: boolean
}) => {
  const fileNameBase = generateRandomFileNameForPhoto();
  const { fileExtension } = getFileNamePartsFromStorageUrl(uploadUrl);
  const fileName = `${fileNameBase}.${fileExtension}`;
  const fileBytes = _fileBytes
    ? _fileBytes
    : await fetch(uploadUrl).then(res => res.arrayBuffer());
  let promise: Promise<string>;
  if (shouldStripGpsData) {
    const fileWithoutGps = await removeGpsData(fileBytes, fileExtension);
    promise = putFile(fileWithoutGps, fileName)
      .then(async url => {
        if (url && shouldDeleteOrigin) { await deleteFile(uploadUrl); }
        return url;
      });
  } else {
    promise = shouldDeleteOrigin
      ? moveFile(uploadUrl, fileName)
      : copyFile(uploadUrl, fileName);
  }
  // Move optimized derivatives after the original photo is copied/moved
  const updatedUrl = await promise
    .then(async url => {
      if (url) {
        await moveOptimizedPhotosForUpload(uploadUrl, fileNameBase);
      }
      return url;
    });

  return updatedUrl;
};
