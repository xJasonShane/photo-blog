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
