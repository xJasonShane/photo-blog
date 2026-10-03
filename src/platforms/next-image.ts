import { getFileNamePartsFromStorageUrl } from '@/platforms/storage';

// Explicitly defined `next.config.ts` `imageSizes`
type NextCustomSize = 100 | 200;

type NextImageDeviceSize = 640 | 750 | 828 | 1080 | 1200 | 1920 | 2048 | 3840;

export type NextImageSize = NextCustomSize | NextImageDeviceSize;

export const MAX_IMAGE_SIZE: NextImageSize = 3840;

const OPTIMIZED_SUFFIX_BY_SIZE: [number, 'sm' | 'md' | 'lg'][] = [
  [200, 'sm'],
  [640, 'md'],
  [1080, 'lg'],
];

/**
 * The original implementation proxied images through the Vercel
 * `/_next/image` optimizer. Since images are pre-optimized at upload
 * time (`-sm`/`-md`/`-lg` derivatives stored alongside originals), this
 * maps the requested width to the closest stored derivative.
 */
export const getNextImageUrlForRequest = ({
  imageUrl,
  size,
}: {
  imageUrl: string
  size: NextImageSize
  quality?: number
  baseUrl?: string
  addBypassSecret?: boolean
}) => {
  try {
    const suffix = OPTIMIZED_SUFFIX_BY_SIZE
      .find(([maxSize]) => size <= maxSize)?.[1] ?? 'lg';
    const { urlBase, fileNameBase } =
      getFileNamePartsFromStorageUrl(imageUrl);
    return `${urlBase}/${fileNameBase}-${suffix}.jpg`;
  } catch {
    return imageUrl;
  }
};

const LARGEST_OPTIMIZED_SIZE =
  OPTIMIZED_SUFFIX_BY_SIZE[OPTIMIZED_SUFFIX_BY_SIZE.length - 1][0];

/**
 * Responsive `srcSet` built from the stored derivatives (`-sm`/`-md`/
 * `-lg`, always JPEG) plus the original file when it is larger than the
 * largest derivative. Returns `undefined` for URLs that cannot be parsed
 * so callers can omit the attribute.
 */
export const getSrcSetForImageUrl = ({
  imageUrl,
  originalWidth,
}: {
  imageUrl: string
  originalWidth?: number
}): string | undefined => {
  try {
    const { urlBase, fileName, fileNameBase } =
      getFileNamePartsFromStorageUrl(imageUrl);
    const candidates = OPTIMIZED_SUFFIX_BY_SIZE.map(([maxSize, suffix]) =>
      `${urlBase}/${fileNameBase}-${suffix}.jpg ${maxSize}w`);
    if (originalWidth && originalWidth > LARGEST_OPTIMIZED_SIZE) {
      candidates.push(`${urlBase}/${fileName} ${originalWidth}w`);
    }
    return candidates.join(', ');
  } catch {
    return undefined;
  }
};

// Viewport-size hints for consumers of `getSrcSetForImageUrl`:
// - photo grid tiles render 2–6 columns of a max-1280px container
// - the photo detail hero renders in a max-956px main column
// - small thumbnails render at a fixed ~64px slot
export const SIZES_FOR_GRID_TILES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw';
export const SIZES_FOR_PHOTO_HERO = '(max-width: 1280px) 100vw, 956px';
export const SIZES_FOR_PHOTO_THUMBNAIL = '64px';
