import {
  Photo,
  altTextForPhoto,
  doesPhotoNeedBlurCompatibility,
} from '.';
import { PhotoSetCategory } from '../category';
import ImageSmall from '@/components/image/ImageSmall';
import {
  getSrcSetForImageUrl,
  SIZES_FOR_PHOTO_THUMBNAIL,
} from '@/platforms/next-image';
import Link from 'next/link';
import { clsx } from 'clsx/lite';
import { pathForPhoto } from '@/app/path';
import { SHOULD_PREFETCH_ALL_LINKS } from '@/app/config';
import { useRef } from 'react';
import useVisibility from '@/utility/useVisibility';

export default function PhotoSmall({
  photo,
  selected,
  className,
  classNameImage,
  prefetch = SHOULD_PREFETCH_ALL_LINKS,
  onVisible,
  ...categories
}: {
  photo: Photo
  selected?: boolean
  className?: string
  classNameImage?: string
  prefetch?: boolean
  onVisible?: () => void
} & PhotoSetCategory) {
  const ref = useRef<HTMLAnchorElement>(null);

  useVisibility({ ref, onVisible });

  return (
    <Link
      ref={ref}
      href={pathForPhoto({ photo, ...categories })}
      className={clsx(
        className,
        'active:brightness-75',
        selected && 'brightness-50',
        'min-w-[50px]',
        'rounded-[3px] overflow-hidden',
        'border border-main',
      )}
      prefetch={prefetch}
    >
      <ImageSmall
        src={photo.url}
        srcSet={getSrcSetForImageUrl({
          imageUrl: photo.url,
          originalWidth: photo.width,
        })}
        sizes={SIZES_FOR_PHOTO_THUMBNAIL}
        aspectRatio={photo.aspectRatio}
        blurDataURL={photo.blurData}
        blurCompatibilityMode={doesPhotoNeedBlurCompatibility(photo)}
        alt={altTextForPhoto(photo)}
        classNameImage={classNameImage}
      />
    </Link>
  );
};
