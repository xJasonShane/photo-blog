import {
  deleteFilesWithPrefix,
  getFileNamePartsFromStorageUrl,
} from '@/platforms/storage';
import { convertFormDataToPhotoDbInsert } from '@/photo/form';
import {
  FujifilmSimulation,
  getFujifilmSimulationFromMakerNote,
} from '@/platforms/fujifilm/simulation';
import { ExifData, ExifParserFactory } from 'ts-exif-parser';
import { PhotoFormData } from './form';
import {
  AUTO_GENERATE_LOCATIONS,
  GEO_PRIVACY_ENABLED,
  HAS_LOCATION_SERVICES,
  PRESERVE_ORIGINAL_UPLOADS,
} from '@/app/config';
import { isExifForFujifilm } from '@/platforms/fujifilm/server';
import {
  FujifilmRecipe,
  getFujifilmRecipeFromMakerNote,
} from '@/platforms/fujifilm/recipe';
import {
  getNikonPictureControlFromMakerNote,
  NikonPictureControl,
} from '@/platforms/nikon/simulation';
import { isExifForNikon } from '@/platforms/nikon/server';
import {
  deletePhoto,
  getRecipeTitleForData,
  updateAllMatchingRecipeTitles,
} from '@/photo/query';
import { PhotoDbInsert } from '.';
import { convertExifToFormData } from './form/server';
import { getColorFieldsForPhotoForm } from './color/server';
import exifr from 'exifr';
import { getCompatibleExifValue } from '@/utility/exif';
import { getPlaceFromCoordinates } from '@/platforms/google-places';
import { getOptimizedPhotoUrlForSuffix } from './storage';
import { applySaturationAndBlurToRgba } from './image-manipulation';
import jpeg from 'jpeg-js';
import piexif from 'piexifjs';

export const extractImageDataFromBlobPath = async (
  blobPath: string, {
    includeInitialPhotoFields,
    generateBlurData,
    generateResizedImage,
    updateColorFields = true,
    lookupLocation,
  }: {
    includeInitialPhotoFields?: boolean
    generateBlurData?: boolean
    generateResizedImage?: boolean
    updateColorFields?: boolean
    lookupLocation?: boolean
  } = {},
): Promise<{
  blobId?: string
  formDataFromExif?: Partial<PhotoFormData>
  imageResizedBase64?: string
  shouldStripGpsData?: boolean
  fileBytes?: ArrayBuffer
  error?: string
}> => {
  const url = decodeURIComponent(blobPath);

  const {
    fileExtension: extension,
    fileId: blobId,
  } = getFileNamePartsFromStorageUrl(url);

  let dataExif: ExifData | undefined;
  let dataExifr: any | undefined;
  let film: FujifilmSimulation | NikonPictureControl | undefined;
  let recipe: FujifilmRecipe | undefined;
  let blurData: string | undefined;
  let imageResizedBase64: string | undefined;
  let shouldStripGpsData = false;
  let error: string | undefined;

  const fileBytes = blobPath
    ? await fetch(url, { cache: 'no-store' }).then(res => res.arrayBuffer())
      .catch(e => {
        error = `Error fetching image from ${url}: "${e.message}"`;
        return undefined;
      })
    : undefined;

  try {
    if (fileBytes) {
      const parser = ExifParserFactory.create(Buffer.from(fileBytes));

      // Data for form
      parser.enableBinaryFields(false);
      dataExif = parser.parse();
      dataExifr = await exifr.parse(fileBytes, { xmp: true });

      // Capture film simulation for Fujifilm or Picture Control for Nikon
      if (isExifForFujifilm(dataExif) || isExifForNikon(dataExif)) {
        // Parse exif data again with binary fields
        // in order to access MakerNote tag
        parser.enableBinaryFields(true);
        const exifDataBinary = parser.parse();
        const makerNote = exifDataBinary.tags?.MakerNote;
        if (Buffer.isBuffer(makerNote)) {
          if (isExifForFujifilm(dataExif)) {
            film = getFujifilmSimulationFromMakerNote(makerNote);
            recipe = getFujifilmRecipeFromMakerNote(makerNote);
          } else if (isExifForNikon(dataExif)) {
            film = getNikonPictureControlFromMakerNote(makerNote);
          }
        }
      }

      if (generateBlurData) {
        // Blur placeholders are generated from the pre-optimized small
        // derivative to avoid decoding the full-size original
        blurData = await blurImageFromUrl(url) || undefined;
      }

      if (generateResizedImage) {
        imageResizedBase64 = await getImageBase64FromUrl(
          getOptimizedPhotoUrlForSuffix(url, 'sm'),
        ) || undefined;
      }

      shouldStripGpsData = GEO_PRIVACY_ENABLED && (
        Boolean(getCompatibleExifValue('GPSLatitude', dataExif, dataExifr)) ||
        Boolean(getCompatibleExifValue('GPSLongitude', dataExif, dataExifr))
      );
    }
  } catch (e) {
    error = `Error extracting image data from ${url}: "${e}"`;
  }

  if (error) { console.log(error); }

  const colorFields = updateColorFields
    ? await getColorFieldsForPhotoForm(url)
    : undefined;

  const formDataFromExif = dataExif
    ? {
      ...includeInitialPhotoFields && {
        hidden: 'false',
        favorite: 'false',
        extension,
        url,
      },
      ...generateBlurData && { blurData },
      ...convertExifToFormData(dataExif, dataExifr, film, recipe),
      ...colorFields,
    } satisfies Partial<PhotoFormData>
    : undefined;

  return {
    blobId,
    ...formDataFromExif && {
      formDataFromExif: {
        ...formDataFromExif,
        ...await getLocationFormFieldsFromExif(
          formDataFromExif,
          lookupLocation,
        ),
      },
    },
    imageResizedBase64,
    shouldStripGpsData,
    fileBytes,
    error,
  };
};

const getLocationFormFieldsFromExif = async (
  formData: Partial<PhotoFormData>,
  lookupLocation?: boolean,
): Promise<Partial<PhotoFormData> | undefined> => {
  if (
    !lookupLocation ||
    !AUTO_GENERATE_LOCATIONS ||
    GEO_PRIVACY_ENABLED ||
    !HAS_LOCATION_SERVICES ||
    !formData.latitude ||
    !formData.longitude
  ) {
    return;
  }

  const latitude = parseFloat(formData.latitude);
  const longitude = parseFloat(formData.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  try {
    const place = await getPlaceFromCoordinates(latitude, longitude);
    if (!place) { return; }
    return {
      location: JSON.stringify(place),
      locationDisplayName: place.nameFormatted ?? place.name,
    };
  } catch (e) {
    console.log('Error looking up place from coordinates', e);
  }
};

export const getImageBase64FromUrl = async (url: string) =>
  fetch(decodeURIComponent(url))
    .then(res => res.arrayBuffer())
    .then(buffer => `data:image/jpeg;base64,${bufferToBase64(buffer)}`)
    .catch(e => {
      console.log(`Error getting image base64 from URL (${url})`, e);
      return '';
    });

// Compatibility wrapper: previously resized via `sharp`; the stored small
// derivative is now used directly (already 200px wide)
export const resizeImageFromUrl = async (url: string) =>
  getImageBase64FromUrl(getOptimizedPhotoUrlForSuffix(url, 'sm'));

export const blurImageFromUrl = async (url: string) => {
  // Derive blur data from the pre-optimized small derivative; if it is
  // unavailable, fall back to the original file
  const optimizedUrl = getOptimizedPhotoUrlForSuffix(
    decodeURIComponent(url), 'sm');
  const blurUrl = await fetch(optimizedUrl, { method: 'HEAD' })
    .then(res => res.ok ? optimizedUrl : decodeURIComponent(url))
    .catch(() => decodeURIComponent(url));
  return fetch(blurUrl)
    .then(res => res.arrayBuffer())
    .then(buffer => generateBlurData(buffer))
    .catch(e => {
      console.log(`Error blurring image from URL (${url})`, e);
      return '';
    });
};

export const bufferToBase64 = (buffer: ArrayBufferLike) => {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + CHUNK_SIZE),
    );
  }
  return btoa(binary);
};

export const convertFormDataToPhotoDbInsertAndLookupRecipeTitle =
  async (...args: Parameters<typeof convertFormDataToPhotoDbInsert>):
  Promise<ReturnType<typeof convertFormDataToPhotoDbInsert>> => {
    const photo = convertFormDataToPhotoDbInsert(...args);

    if (photo.recipeData && !photo.recipeTitle && photo.film) {
      const recipeTitle = await getRecipeTitleForData(
        photo.recipeData,
        photo.film,
      );
      // Only replace recipe title when a new one is found
      if (recipeTitle) {
        photo.recipeTitle = recipeTitle;
      }
    }

    return photo;
  };

export const propagateRecipeTitleIfNecessary = async (
  formData: FormData,
  photo: PhotoDbInsert,
) => {
  if (
    formData.get('applyRecipeTitleGlobally') === 'true' &&
    // Only propagate recipe title if set by user before lookup
    formData.get('recipeTitle') &&
    photo.recipeTitle &&
    photo.recipeData &&
    photo.film
  ) {
    await updateAllMatchingRecipeTitles(
      photo.recipeTitle,
      photo.recipeData,
      photo.film,
    );
  }
};

export const deletePhotoAndFiles = async (
  photoId: string,
  photoUrl: string,
) =>
  deletePhoto(photoId)
    .then(() => {
      const { fileNameBase } = getFileNamePartsFromStorageUrl(photoUrl);
      return deleteFilesWithPrefix(fileNameBase);
    });

// ---------------------------------------------------------------------------
// Server-side image manipulation (pure JS — no native dependencies)
// ---------------------------------------------------------------------------

export const generateBlurData = (buffer: ArrayBuffer) => {
  try {
    const image = jpeg.decode(new Uint8Array(buffer), {
      useTArray: true,
      maxMemoryUsageInMB: 512,
    });
    const blurred = applySaturationAndBlurToRgba(
      image.data,
      image.width,
      image.height,
    );
    const encoded = jpeg.encode({
      data: blurred,
      width: image.width,
      height: image.height,
    }, 80);
    return `data:image/jpeg;base64,${bufferToBase64(encoded.data.buffer)}`;
  } catch (error) {
    console.log('Error generating blur data', error);
    return '';
  }
};

const GPS_NULL_STRING = '-';

/**
 * Removes all GPS metadata from a JPEG using piexifjs (pure JS). For
 * non-JPEG files (e.g., PNG), the original bytes are returned unchanged.
 */
export const removeGpsData = async (
  image: ArrayBuffer,
  extension = 'jpg',
): Promise<Uint8Array> => {
  if (extension !== 'jpg' && extension !== 'jpeg') {
    return new Uint8Array(image);
  }
  try {
    const bytes = new Uint8Array(image);
    let binary = '';
    const CHUNK_SIZE = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    const dataUrl = `data:image/jpeg;base64,${btoa(binary)}`;
    const exifObj = piexif.load(dataUrl);
    delete exifObj['GPS'];
    const cleaned = piexif.insert(piexif.dump(exifObj), dataUrl);
    const base64 = cleaned.split(',')[1];
    const binaryCleaned = atob(base64);
    const cleanedBytes = new Uint8Array(binaryCleaned.length);
    for (let i = 0; i < binaryCleaned.length; i++) {
      cleanedBytes[i] = binaryCleaned.charCodeAt(i);
    }
    return cleanedBytes;
  } catch (error) {
    console.log('Error removing GPS data', error);
    return new Uint8Array(image);
  }
};

// Preserved for API compatibility: quality used when anonymizing uploads
export const ANONYMIZED_UPLOAD_QUALITY =
  PRESERVE_ORIGINAL_UPLOADS ? 95 : 80;
