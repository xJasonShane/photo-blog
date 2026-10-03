'use client';

/* eslint-disable jsx-a11y/alt-text */
import { BLUR_ENABLED } from '@/app/config';
import { useAppState } from '@/app/AppState';
import { clsx}  from 'clsx/lite';
import type { ImageProps } from 'next/image';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

export default function ImageWithFallback({
  ref: refProp,
  src,
  className,
  classNameImage = 'object-cover h-full',
  blurDataURL,
  blurCompatibilityLevel = 'low',
  priority,
  quality: _quality,
  srcSet,
  sizes,
  loading,
  ...props
}: ImageProps & {
  ref?: RefObject<HTMLImageElement | null>
  blurCompatibilityLevel?: 'none' | 'low' | 'high'
  classNameImage?: string
  priority?: boolean
  // `srcSet` and `loading` are omitted from next/image's prop type but
  // are supported natively on the underlying <img> element
  srcSet?: string
  loading?: 'eager' | 'lazy'
}) {
  const ref = useRef<HTMLImageElement>(null);

  const { hasLoadedWithAnimations, shouldDebugImageFallbacks } = useAppState();

  const [isLoading, setIsLoading] = useState(true);
  const [didError, setDidError] = useState(false);
  const [fadeFallbackTransition, setFadeFallbackTransition] =
    useState(!hasLoadedWithAnimations);

  const onLoad = useCallback(() => setIsLoading(false), []);
  const onError = useCallback(() => setDidError(true), []);

  useEffect(() => {
    if (
      !ref.current?.complete ||
      (ref.current?.naturalWidth ?? 0) === 0
    ) {
      setFadeFallbackTransition(true);
    }
  }, []);

  const getBlurClass = () => {
    switch (blurCompatibilityLevel) {
      case 'high':
      // Fix poorly blurred placeholder data generated on client
        return 'blur-[4px] @xs:blue-md scale-[1.05]';
      case 'low':
        return 'blur-[2px] @xs:blue-md scale-[1.01]';
    }
  };

  return (
    <div
      className={clsx(
        'flex relative',
        className,
      )}
    >
      {/* Images are pre-optimized at upload time (`images.unoptimized`),
        - so a native <img> is used directly — it also allows a manually
        - supplied `srcSet`, which next/image strips from its props. */}
      <img
        ref={refProp ?? ref}
        {...props}
        src={src as string}
        {...{ srcSet, sizes }}
        loading={loading ?? (priority ? 'eager' : 'lazy')}
        {...priority && { fetchPriority: 'high' as const }}
        decoding="async"
        className={classNameImage}
        onLoad={onLoad}
        onError={onError}
      />
      <div
        className={clsx(
          '@container',
          'absolute inset-0 pointer-events-none',
          'overflow-hidden',
          fadeFallbackTransition &&
            'transition-opacity duration-300 ease-in',
          !(BLUR_ENABLED && blurDataURL) && 'bg-main',
          (isLoading || didError || shouldDebugImageFallbacks)
            ? 'opacity-100'
            : 'opacity-0',
        )}
      >
        {(BLUR_ENABLED && blurDataURL)
          ? <img {...{
            ...props,
            src: blurDataURL,
            className: clsx(
              getBlurClass(),
              classNameImage,
            ),
          }} />
          :  <div className={clsx(
            'w-full h-full',
            'bg-gray-100/50 dark:bg-gray-900/50',
          )} />}
      </div>
    </div>
  );
}
