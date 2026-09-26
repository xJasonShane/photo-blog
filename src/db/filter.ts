/**
 * Pure TypeScript implementations of the photo filtering and sorting
 * semantics that were previously expressed as Postgres SQL
 * (see `getWheresFromOptions` / `getOrderByFromOptions` in the original
 * project). Operates on hydrated store records.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parameterize } from '@/utility/string';
import { APP_DEFAULT_SORT_BY } from '@/photo/sort';
import type { PhotoQueryOptions } from './index';

export interface PhotoRecord {
  [key: string]: any
  id: string
  url: string
  hidden?: boolean
  excludeFromFeeds?: boolean
  aspectRatio?: number
  title?: string
  caption?: string
  semanticDescription?: string
  tags?: string[] | null
  make?: string
  model?: string
  lensMake?: string
  lensModel?: string
  focalLength?: number
  film?: string
  recipeTitle?: string
  colorSort?: number
  priorityOrder?: number
  takenAt: Date | string
  createdAt?: Date | string
  updatedAt?: Date | string
}

const toDate = (value?: Date | string) =>
  value === undefined
    ? undefined
    : value instanceof Date
      ? value
      : new Date(value);

export const filterPhotos = (
  photos: PhotoRecord[],
  options: PhotoQueryOptions = {},
  {
    albumPhotoIds,
    newestCreatedAt,
  }: {
    albumPhotoIds?: Set<string>
    newestCreatedAt?: Date
  } = {},
) => {
  const {
    hidden = 'exclude',
    excludeFromFeeds,
    takenBefore,
    takenAfterInclusive,
    updatedBefore,
    query,
    maximumAspectRatio,
    recent,
    year,
    album,
    tag,
    camera,
    lens,
    film,
    recipe,
    focal,
    photoIds,
  } = options;

  const takenBeforeTime = toDate(takenBefore)?.getTime();
  const takenAfterTime = toDate(takenAfterInclusive)?.getTime();
  const updatedBeforeTime = toDate(updatedBefore)?.getTime();

  const queryNormalized = query?.toLocaleLowerCase();

  const maxCreatedAt = newestCreatedAt ?? photos.reduce((max, photo) => {
    const createdAt = toDate(photo.createdAt);
    return createdAt && (!max || createdAt > max) ? createdAt : max;
  }, undefined as Date | undefined);

  const recentWindowStart = maxCreatedAt
    ? new Date(maxCreatedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : undefined;

  return photos.filter(photo => {
    switch (hidden) {
      case 'exclude':
        if (photo.hidden) { return false; }
        break;
      case 'only':
        if (!photo.hidden) { return false; }
        break;
    }

    if (excludeFromFeeds && photo.excludeFromFeeds) { return false; }

    const takenAtTime = toDate(photo.takenAt)?.getTime();
    if (takenBeforeTime && (!takenAtTime || takenAtTime >= takenBeforeTime)) {
      return false;
    }
    if (
      takenAfterTime &&
      (!takenAtTime || takenAtTime < takenAfterTime)
    ) {
      return false;
    }

    const updatedAtTime = toDate(photo.updatedAt)?.getTime();
    if (updatedBeforeTime && (!updatedAtTime || updatedAtTime >= updatedBeforeTime)) {
      return false;
    }

    if (queryNormalized) {
      const searchable = [
        photo.title,
        photo.caption,
        photo.semanticDescription,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      if (!searchable.includes(queryNormalized)) { return false; }
    }

    if (
      maximumAspectRatio &&
      (photo.aspectRatio ?? 0) > maximumAspectRatio
    ) {
      return false;
    }

    if (recent) {
      // Newest upload must be within past 2 weeks
      if (!maxCreatedAt ||
        Date.now() - maxCreatedAt.getTime() > 14 * 24 * 60 * 60 * 1000) {
        return false;
      }
      // Selects must be within 1 week of newest upload
      const createdAt = toDate(photo.createdAt);
      if (!recentWindowStart ||
        !createdAt ||
        createdAt < recentWindowStart) {
        return false;
      }
    }

    if (year && String(toDate(photo.takenAt)?.getUTCFullYear()) !== String(year)) {
      return false;
    }

    if (camera?.make && parameterize(photo.make ?? '') !== parameterize(camera.make)) {
      return false;
    }
    if (camera?.model && parameterize(photo.model ?? '') !== parameterize(camera.model)) {
      return false;
    }

    if (lens?.make || lens?.model) {
      if (
        lens.make &&
        parameterize(photo.lensMake ?? '') !== parameterize(lens.make)
      ) {
        return false;
      }
      if (lens.model) {
        if (parameterize(photo.lensModel ?? '') !== parameterize(lens.model)) {
          return false;
        }
        // Ensure unique queries for lenses missing makes
        if (!lens.make && photo.lensMake) { return false; }
      }
    }

    if (album && albumPhotoIds && !albumPhotoIds.has(photo.id)) {
      return false;
    }

    if (tag && !photo.tags?.includes(tag)) { return false; }

    if (film && photo.film !== film) { return false; }

    if (recipe && photo.recipeTitle !== recipe) { return false; }

    if (focal !== undefined && photo.focalLength !== focal) { return false; }

    if (photoIds && photoIds.length > 0 && !photoIds.includes(photo.id)) {
      return false;
    }

    return true;
  });
};

export const sortPhotos = (
  photos: PhotoRecord[],
  options: PhotoQueryOptions = {},
) => {
  const {
    sortBy = APP_DEFAULT_SORT_BY,
    sortWithPriority,
    limit,
  } = options;

  const timeOf = (value?: Date | string) => toDate(value)?.getTime() ?? 0;
  // Postgres: ASC -> NULLS LAST, DESC -> NULLS FIRST
  const priorityOf = (photo: PhotoRecord) => photo.priorityOrder ?? Infinity;
  const colorOf = (photo: PhotoRecord) => photo.colorSort ?? Infinity;

  const compareStrings = (a = '', b = '') => a < b ? -1 : a > b ? 1 : 0;

  switch (sortBy) {
    case 'takenAtAsc':
      return [...photos].sort((a, b) =>
        sortWithPriority && priorityOf(a) !== priorityOf(b)
          ? priorityOf(a) - priorityOf(b)
          : timeOf(a.takenAt) - timeOf(b.takenAt));
    case 'createdAt':
      return [...photos].sort((a, b) =>
        sortWithPriority && priorityOf(a) !== priorityOf(b)
          ? priorityOf(a) - priorityOf(b)
          : timeOf(b.createdAt) - timeOf(a.createdAt));
    case 'createdAtAsc':
      return [...photos].sort((a, b) =>
        sortWithPriority && priorityOf(a) !== priorityOf(b)
          ? priorityOf(a) - priorityOf(b)
          : timeOf(a.createdAt) - timeOf(b.createdAt));
    case 'color':
      return [...photos].sort((a, b) => {
        if (sortWithPriority && priorityOf(a) !== priorityOf(b)) {
          return priorityOf(a) - priorityOf(b);
        }
        if (colorOf(a) !== colorOf(b)) { return colorOf(b) - colorOf(a); }
        return timeOf(b.takenAt) - timeOf(a.takenAt);
      });
    case 'colorAsc':
      return [...photos].sort((a, b) => {
        if (sortWithPriority && priorityOf(a) !== priorityOf(b)) {
          return priorityOf(a) - priorityOf(b);
        }
        if (colorOf(a) !== colorOf(b)) { return colorOf(a) - colorOf(b); }
        return timeOf(a.takenAt) - timeOf(b.takenAt);
      });
    case 'random': {
      // Stable newest-first stride, 2× limit so hits are spaced further apart
      const stride = Math.max(2, (Math.floor(Number(limit)) || 1) * 2);
      const newestFirst = [...photos].sort((a, b) =>
        timeOf(b.takenAt) - timeOf(a.takenAt) ||
        compareStrings(a.id, b.id));
      return newestFirst
        .map((photo, index) => ({ photo, key: index % stride }))
        .sort((a, b) =>
          a.key - b.key ||
          timeOf(b.photo.takenAt) - timeOf(a.photo.takenAt) ||
          compareStrings(a.photo.id, b.photo.id))
        .map(({ photo }) => photo);
    }
    case 'takenAt':
    default:
      return [...photos].sort((a, b) =>
        sortWithPriority && priorityOf(a) !== priorityOf(b)
          ? priorityOf(a) - priorityOf(b)
          : timeOf(b.takenAt) - timeOf(a.takenAt));
  }
};
