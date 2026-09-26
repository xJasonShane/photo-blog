'use client';

import { ReactNode, useState, useEffect } from 'react';
import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import { GRID_GAP_CLASSNAME } from '@/components';
import { DATA_KEY_PHOTO_GRID } from '@/admin/select/SelectPhotosProvider';
import { Photo } from '.';

function useMasonryColumns(small?: boolean, isGridHighDensity?: boolean) {
  const [columns, setColumns] = useState(
    small ? 3 : isGridHighDensity ? 2 : 2, // default mobile
  );

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (small) {
        setColumns(width >= 480 ? 6 : 3);
      } else if (isGridHighDensity) {
        if (width >= 1024) setColumns(6);
        else if (width >= 480) setColumns(4);
        else setColumns(2);
      } else {
        if (width >= 1024) setColumns(4);
        else if (width >= 768) setColumns(3);
        else if (width >= 640) setColumns(4);
        else setColumns(2);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [small, isGridHighDensity]);

  return columns;
}

export default function PhotoGridMasonry({
  photos,
  photoNodes,
  additionalTile,
  small,
  isGridHighDensity,
  selectable,
  className,
  animate,
  canStart,
  animateOnFirstLoadOnly,
  staggerOnFirstLoadOnly,
  onAnimationCompleteAction,
}: {
  photos: Photo[];
  photoNodes: ReactNode[];
  additionalTile?: ReactNode;
  small?: boolean;
  isGridHighDensity?: boolean;
  selectable?: boolean;
  className?: string;
  animate?: boolean;
  canStart?: boolean;
  animateOnFirstLoadOnly?: boolean;
  staggerOnFirstLoadOnly?: boolean;
  onAnimationCompleteAction?: () => void;
}) {
  const masonryColsCount = useMasonryColumns(small, isGridHighDensity);
  const partitionedColumns = Array.from(
    { length: masonryColsCount },
    () => [] as ReactNode[],
  );
  const colHeights = new Array(masonryColsCount).fill(0);

  photos.forEach((photo, index) => {
    let shortestColIndex = 0;
    let minHeight = colHeights[0];
    for (let i = 1; i < masonryColsCount; i++) {
      // Subtract tiny fraction to create tie breaker
      // If columns equal in height, ensure photo's placed in left-most column
      // (helps maintain left-to-right photo order)
      if (colHeights[i] < minHeight - 0.0001) {
        minHeight = colHeights[i];
        shortestColIndex = i;
      }
    }
    partitionedColumns[shortestColIndex].push(photoNodes[index]);
    colHeights[shortestColIndex] += 1 / (photo.aspectRatio || 1);
  });

  if (additionalTile) {
    let shortestColIndex = 0;
    let minHeight = colHeights[0];
    for (let i = 1; i < masonryColsCount; i++) {
      if (colHeights[i] < minHeight - 0.0001) {
        minHeight = colHeights[i];
        shortestColIndex = i;
      }
    }
    partitionedColumns[shortestColIndex].push(
      <div key="more">{additionalTile}</div>,
    );
    colHeights[shortestColIndex] += 1;
  }

  return (
    <div {...{ [DATA_KEY_PHOTO_GRID]: selectable, className }}>
      <div className={clsx('flex flex-row', GRID_GAP_CLASSNAME, 'items-start')}>
        {partitionedColumns.map((colItems, i) => (
          <AnimateItems
            key={`col-${i}`}
            className={clsx('flex flex-col flex-1', GRID_GAP_CLASSNAME)}
            type={animate === false ? 'none' : undefined}
            canStart={canStart}
            duration={0.7}
            staggerDelay={0.04}
            distanceOffset={40}
            animateOnFirstLoadOnly={animateOnFirstLoadOnly}
            staggerOnFirstLoadOnly={staggerOnFirstLoadOnly}
            onAnimationComplete={
              i === partitionedColumns.length - 1
                ? onAnimationCompleteAction
                : undefined
            }
            items={colItems}
            itemKeys={colItems.map((_, index) => `col-${i}-item-${index}`)}
          />
        ))}
      </div>
    </div>
  );
}
