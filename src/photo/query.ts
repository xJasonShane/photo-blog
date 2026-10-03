import {
  PhotoDb,
  PhotoDbInsert,
  translatePhotoId,
  parsePhotoFromDb,
  Photo,
  PhotoDateRangePostgres,
} from '@/photo';
import { Cameras, createCameraKey } from '@/camera';
import { Tags } from '@/tag';
import { Films } from '@/film';
import {
  AI_TEXT_AUTO_GENERATED_FIELDS,
  AI_CONTENT_GENERATION_ENABLED,
  COLOR_SORT_ENABLED,
} from '@/app/config';
import { PhotoQueryOptions } from '@/db';
import { filterPhotos, sortPhotos } from '@/db/filter';
import { FocalLengths } from '@/focal';
import { Lenses, createLensKey } from '@/lens';
import {
  UPDATE_QUERY_LIMIT,
  OUTDATED_UPDATE_AT_THRESHOLD,
} from '@/photo/update';
import { Recipes } from '@/recipe';
import { Years } from '@/year';
import { PhotoColorData } from '@/photo/color/client';
import {
  getStoredPhotos,
  getStoredPhotosWithEtag,
  saveStoredPhotos,
  getStoredAlbumData,
  mutateStoredDocument,
  StoredPhoto,
} from '@/platforms/store';

// Kept for API compatibility with the original Postgres implementation
export const createPhotosTable = () => Promise.resolve();

const getPhotosFromStore = async () => {
  const stored = await getStoredPhotos();
  return stored as unknown as PhotoDb[];
};

const savePhotosToStore = async (photos: PhotoDb[], etag?: string | null) =>
  saveStoredPhotos(photos as unknown as StoredPhoto[], etag);

/**
 * Read-modify-write for the photos document with optimistic concurrency:
 * the mutation must modify the photos array in place, and the write
 * carries the ETag observed at read time — on conflict the cycle re-reads
 * and replays instead of overwriting a concurrent change.
 */
const mutatePhotosInStore = async <T>(
  mutate: (photos: PhotoDb[]) => T,
): Promise<T> =>
  mutateStoredDocument<PhotoDb[], T>({
    read: async () => {
      const { data, etag } = await getStoredPhotosWithEtag();
      return { data: data as unknown as PhotoDb[], etag };
    },
    write: savePhotosToStore,
    mutate,
  });

const hydratePhotos = (photos: PhotoDb[]) => photos.map(parsePhotoFromDb);

const getAlbumPhotoIdsForAlbum = async (albumId: string) => {
  const { albumPhoto } = await getStoredAlbumData();
  return new Set(
    albumPhoto
      .filter(link => link.albumId === albumId)
      .map(link => link.photoId),
  );
};

const prepareOptions = async (options: PhotoQueryOptions) => ({
  options,
  albumPhotoIds: options.album
    ? await getAlbumPhotoIdsForAlbum(options.album.id)
    : undefined,
});

const queryPhotos = async (options: PhotoQueryOptions = {}) => {
  const photos = await getPhotosFromStore();
  const {
    albumPhotoIds,
  } = await prepareOptions(options);
  return sortPhotos(
    filterPhotos(photos, options, { albumPhotoIds }) as any,
    options,
  ) as unknown as PhotoDb[];
};

const queryPhotosAll = async (options: PhotoQueryOptions = {}) => {
  const photos = await getPhotosFromStore();
  const {
    albumPhotoIds,
  } = await prepareOptions(options);
  return filterPhotos(photos, options, { albumPhotoIds }) as unknown as PhotoDb[];
};

const takeLimitOffset = <T,>(
  items: T[],
  options: PhotoQueryOptions = {},
) => {
  const {
    limit = 100,
    offset = 0,
  } = options;
  return items.slice(offset, offset + limit);
};

// Must provide id as 8-character nanoid
export const insertPhoto = async (photo: PhotoDbInsert) => {
  const now = new Date();
  await mutatePhotosInStore(photos => {
    photos.push({
      ...photo,
      updatedAt: now,
      createdAt: now,
    } as unknown as PhotoDb);
  });
};

export const updatePhoto = async (photo: PhotoDbInsert) => {
  await mutatePhotosInStore(photos => {
    const index = photos.findIndex(({ id }) => id === photo.id);
    if (index !== -1) {
      photos[index] = {
        ...photos[index],
        ...photo,
        updatedAt: new Date(),
      } as unknown as PhotoDb;
    }
  });
};

export const updatePhotoTitleCaption = async (
  photoIds: string[],
  titles: (string | null)[],
  captions: (string | null)[],
) => {
  if (photoIds.length === 0) {
    return;
  }
  const now = new Date();
  await mutatePhotosInStore(photos => {
    photoIds.forEach((id, index) => {
      const photo = photos.find(({ id: photoId }) => photoId === id);
      if (photo) {
        photo.title = titles[index] ?? undefined;
        photo.caption = captions[index] ?? undefined;
        photo.updatedAt = now;
      }
    });
  });
};

export const deletePhotoTagGlobally = async (tag: string) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photo.tags?.includes(tag)) {
        photo.tags = photo.tags.filter(t => t !== tag);
      }
    });
  });
};

export const renamePhotoTagGlobally = async (
  tag: string,
  updatedTag: string,
) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photo.tags?.includes(tag)) {
        photo.tags = photo.tags.map(t => t === tag ? updatedTag : t);
      }
    });
  });
};

export const setPhotoVisibilityForIds = async (
  photoIds: string[],
  hidden: boolean,
  excludeFromFeeds: boolean,
) => {
  const now = new Date();
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photoIds.includes(photo.id)) {
        photo.hidden = hidden;
        photo.excludeFromFeeds = excludeFromFeeds;
        photo.updatedAt = now;
      }
    });
  });
};

export const addTagsToPhotos = async (tags: string[], photoIds: string[]) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photoIds.includes(photo.id)) {
        photo.tags = Array.from(new Set([...(photo.tags ?? []), ...tags]));
      }
    });
  });
};

export const deletePhotoRecipeGlobally = async (recipe: string) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photo.recipeTitle === recipe) {
        photo.recipeTitle = undefined;
      }
    });
  });
};

export const renamePhotoRecipeGlobally = async (
  recipe: string,
  updatedRecipe: string,
) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (photo.recipeTitle === recipe) {
        photo.recipeTitle = updatedRecipe;
      }
    });
  });
};

export const deletePhoto = async (id: string) => {
  await mutatePhotosInStore(photos => {
    const index = photos.findIndex(photo => photo.id === id);
    if (index !== -1) {
      photos.splice(index, 1);
    }
  });
};

export const getPhotosMostRecentUpdate = async () => {
  const photos = await getPhotosFromStore();
  const mostRecent = photos.reduce((max, photo) =>
    photo.updatedAt > max ? photo.updatedAt : max, new Date(0));
  return mostRecent.getTime() > 0 ? mostRecent : undefined;
};

export const getUniqueCameras = async (): Promise<Cameras> => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo =>
      (photo.make ?? '').trim() !== '' &&
      (photo.model ?? '').trim() !== '');
  const grouped = new Map<string, { make: string, model: string, photos: PhotoDb[] }>();
  photos.forEach(photo => {
    const key = `${photo.make ?? ''}|${photo.model ?? ''}`;
    const entry = grouped.get(key) ?? {
      make: photo.make ?? '',
      model: photo.model ?? '',
      photos: [],
    };
    entry.photos.push(photo);
    grouped.set(key, entry);
  });
  return Array.from(grouped.values())
    .map(({ make, model, photos: groupedPhotos }) => ({
      cameraKey: createCameraKey({ make, model }),
      camera: { make, model },
      count: groupedPhotos.length,
      lastModified: groupedPhotos.reduce((max, photo) =>
        photo.updatedAt > max ? photo.updatedAt : max, new Date(0)),
    }))
    .sort((a, b) =>
      `${a.camera.make} ${a.camera.model}`
        .localeCompare(`${b.camera.make} ${b.camera.model}`));
};

export const getUniqueLenses = async (): Promise<Lenses> => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo => (photo.lensModel ?? '').trim() !== '');
  const grouped = new Map<string, {
    make: string,
    model: string,
    photos: PhotoDb[],
  }>();
  photos.forEach(photo => {
    const make = photo.lensMake ?? '';
    const model = photo.lensModel ?? '';
    const key = `${make}|${model}`;
    const entry = grouped.get(key) ?? { make, model, photos: [] };
    entry.photos.push(photo);
    grouped.set(key, entry);
  });
  return Array.from(grouped.values())
    .map(({ make, model, photos: groupedPhotos }) => ({
      lensKey: createLensKey({ make, model }),
      lens: { make, model },
      count: groupedPhotos.length,
      lastModified: groupedPhotos.reduce((max, photo) =>
        photo.updatedAt > max ? photo.updatedAt : max, new Date(0)),
    }))
    .sort((a, b) =>
      `${a.lens.make} ${a.lens.model}`
        .localeCompare(`${b.lens.make} ${b.lens.model}`));
};

export const getUniqueTags = async (includeHidden?: boolean): Promise<Tags> => {
  const photos = await queryPhotosAll(
    includeHidden ? { hidden: 'include' } : { hidden: 'exclude' });
  const grouped = new Map<string, { count: number, lastModified: Date }>();
  photos.forEach(photo => {
    (photo.tags ?? []).forEach(tag => {
      const entry = grouped.get(tag) ?? { count: 0, lastModified: new Date(0) };
      entry.count += 1;
      if (photo.updatedAt > entry.lastModified) {
        entry.lastModified = photo.updatedAt;
      }
      grouped.set(tag, entry);
    });
  });
  return Array.from(grouped.entries())
    .map(([tag, { count, lastModified }]) => ({
      tag, count, lastModified,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
};

export const getUniqueRecipes = async (): Promise<Recipes> => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo => photo.recipeTitle);
  const grouped = new Map<string, { count: number, lastModified: Date }>();
  photos.forEach(photo => {
    const recipe = photo.recipeTitle!;
    const entry = grouped.get(recipe) ?? {
      count: 0,
      lastModified: new Date(0),
    };
    entry.count += 1;
    if (photo.updatedAt > entry.lastModified) {
      entry.lastModified = photo.updatedAt;
    }
    grouped.set(recipe, entry);
  });
  return Array.from(grouped.entries())
    .map(([recipe, { count, lastModified }]) => ({
      recipe, count, lastModified,
    }))
    .sort((a, b) => a.recipe.localeCompare(b.recipe));
};

export const getUniqueYears = async (): Promise<Years> => {
  const photos = await queryPhotosAll({ hidden: 'exclude' });
  const grouped = new Map<number, { count: number, lastModified: Date }>();
  photos.forEach(photo => {
    const year = photo.takenAt.getUTCFullYear();
    const entry = grouped.get(year) ?? { count: 0, lastModified: new Date(0) };
    entry.count += 1;
    if (photo.updatedAt > entry.lastModified) {
      entry.lastModified = photo.updatedAt;
    }
    grouped.set(year, entry);
  });
  return Array.from(grouped.entries())
    .map(([year, { count, lastModified }]) => ({
      year: String(year), count, lastModified,
    }))
    .sort((a, b) => parseInt(b.year) - parseInt(a.year));
};

export const getRecipeTitleForData = async (
  data: string | object,
  film: string,
) => {
  // Includes legacy check on pre-stringified JSON
  const dataString =
    typeof data === 'string' ? data : JSON.stringify(data);
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo =>
      recipeDataToString(photo.recipeData) === dataString &&
      photo.film === film);
  return photos[0]?.recipeTitle as string | undefined;
};

const recipeDataToString = (recipeData: unknown) => {
  if (recipeData === undefined || recipeData === null) { return undefined; }
  return typeof recipeData === 'string'
    ? recipeData
    : JSON.stringify(recipeData);
};

export const getRecipeDataForTitle = async (title: string) => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo =>
      photo.recipeTitle === title &&
      photo.recipeData &&
      recipeDataToString(photo.recipeData) !== 'null')
    .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
  const recipeData = photos[0]?.recipeData;
  return recipeData
    ? typeof recipeData === 'string'
      ? recipeData
      : JSON.stringify(recipeData)
    : undefined;
};

export const getPhotosNeedingRecipeTitleCount = async (
  data: string,
  film: string,
  photoIdToExclude?: string,
) => {
  const photos = await queryPhotosAll({ hidden: 'include' });
  return photos.filter(photo =>
    photo.recipeTitle === undefined &&
    recipeDataToString(photo.recipeData) === data &&
    photo.film === film &&
    photo.id !== photoIdToExclude).length;
};

export const updateAllMatchingRecipeTitles = async (
  title: string,
  data: string,
  film: string,
) => {
  await mutatePhotosInStore(photos => {
    photos.forEach(photo => {
      if (
        photo.recipeTitle === undefined &&
        recipeDataToString(photo.recipeData) === data &&
        photo.film === film
      ) {
        photo.recipeTitle = title;
      }
    });
  });
};

export const getUniqueFilms = async (): Promise<Films> => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo => photo.film);
  const grouped = new Map<string, { count: number, lastModified: Date }>();
  photos.forEach(photo => {
    const film = photo.film!;
    const entry = grouped.get(film) ?? { count: 0, lastModified: new Date(0) };
    entry.count += 1;
    if (photo.updatedAt > entry.lastModified) {
      entry.lastModified = photo.updatedAt;
    }
    grouped.set(film, entry);
  });
  return Array.from(grouped.entries())
    .map(([film, { count, lastModified }]) => ({
      film, count, lastModified,
    }))
    .sort((a, b) => a.film.localeCompare(b.film));
};

export const getUniqueFocalLengths = async (): Promise<FocalLengths> => {
  const photos = (await queryPhotosAll({ hidden: 'exclude' }))
    .filter(photo => photo.focalLength !== undefined);
  const grouped = new Map<number, { count: number, lastModified: Date }>();
  photos.forEach(photo => {
    const focal = photo.focalLength!;
    const entry = grouped.get(focal) ?? { count: 0, lastModified: new Date(0) };
    entry.count += 1;
    if (photo.updatedAt > entry.lastModified) {
      entry.lastModified = photo.updatedAt;
    }
    grouped.set(focal, entry);
  });
  return Array.from(grouped.entries())
    .map(([focal, { count, lastModified }]) => ({
      focal, count, lastModified,
    }))
    .sort((a, b) => a.focal - b.focal);
};

export const getPhotos = async (options: PhotoQueryOptions = {}) => {
  const photos = await queryPhotos(options);
  return hydratePhotos(takeLimitOffset(photos, options));
};

export const getPhotoIds = async (options: PhotoQueryOptions = {}) => {
  const photos = await queryPhotos(options);
  return takeLimitOffset(photos, options).map(photo => photo.id);
};

export const getPhotoUrls = async (options: PhotoQueryOptions = {}) => {
  const photos = await queryPhotos(options);
  return takeLimitOffset(photos, options)
    .map(photo => ({
      id: photo.id,
      title: photo.title,
      url: photo.url,
      hidden: photo.hidden,
    }));
};

export const getPhotoCount = async (options: PhotoQueryOptions = {}) => {
  const photos = await queryPhotosAll(options);
  return photos.length;
};

export const getPhotosNearId = async (
  photoId: string,
  options: PhotoQueryOptions,
) => {
  const { limit } = options;
  const photos = await queryPhotos(options);
  const index = photos.findIndex(({ id }) => id === photoId);
  const indexNumber = index !== -1 ? index + 1 : undefined;
  const startIndex = Math.max(0, index - 1);
  return {
    photos: hydratePhotos(
      photos.slice(startIndex, startIndex + (limit ?? 100)),
    ),
    indexNumber,
  };
};

export const getPhotosMeta = async (options: PhotoQueryOptions = {}) => {
  const photos = await queryPhotosAll(options);
  if (photos.length === 0) {
    return { count: 0 };
  }
  const takenAtNaiveSorted = photos
    .map(photo => photo.takenAtNaive)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const createdAtSorted = [...photos].sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime());
  return {
    count: photos.length,
    dateRange: {
      start: takenAtNaiveSorted[0],
      end: takenAtNaiveSorted[takenAtNaiveSorted.length - 1],
    } as PhotoDateRangePostgres,
    dateRangeCreatedAt: {
      start: createdAtSorted[0].createdAt.toISOString(),
      end: createdAtSorted[createdAtSorted.length - 1].createdAt
        .toISOString(),
    } as PhotoDateRangePostgres,
  };
};

export const getAllPublicPhotoIds = async ({ limit }: { limit?: number }) => {
  const photos = await queryPhotosAll({ hidden: 'exclude' });
  return photos
    .slice(0, limit)
    .map(photo => photo.id);
};

export const getAllPhotoIdsWithUpdatedAt = async () => {
  const photos = await queryPhotosAll({ hidden: 'exclude' });
  return photos.map(photo => ({
    id: photo.id,
    updatedAt: photo.updatedAt,
  }));
};

export const getPhoto = async (
  id: string,
  includeHidden?: boolean,
): Promise<Photo | undefined> => {
  // Check for photo id forwarding and convert short ids to uuids
  const photoId = translatePhotoId(id);
  const photos = await getPhotosFromStore();
  const photo = photos.find(photo => photo.id === photoId);
  if (!photo || (photo.hidden && !includeHidden)) { return undefined; }
  return parsePhotoFromDb(photo);
};

// Update queries

const isOutdated = (photo: PhotoDb) =>
  photo.updatedAt < OUTDATED_UPDATE_AT_THRESHOLD;

const isMissingAiTextField = (photo: PhotoDb) => {
  if (!AI_CONTENT_GENERATION_ENABLED) { return false; }
  return AI_TEXT_AUTO_GENERATED_FIELDS.some(field => {
    switch (field) {
      case 'title': return !(photo.title);
      case 'caption': return !(photo.caption);
      case 'tags': return !photo.tags || photo.tags.length === 0;
      case 'semantic': return !(photo.semanticDescription);
    }
  });
};

const isMissingColorData = (photo: PhotoDb) =>
  (AI_CONTENT_GENERATION_ENABLED || COLOR_SORT_ENABLED)
    ? !photo.colorData || photo.colorSort === undefined ||
      photo.colorSort === null
    : false;

const photoNeedsUpdate = (photo: PhotoDb) =>
  isOutdated(photo) ||
  isMissingAiTextField(photo) ||
  isMissingColorData(photo);

export const getPhotosInNeedOfUpdate = async () => {
  const photos = await queryPhotosAll({ hidden: 'include' });
  return hydratePhotos(
    photos
      .filter(photoNeedsUpdate)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, UPDATE_QUERY_LIMIT),
  );
};

export const getPhotosInNeedOfUpdateCount = async () => {
  const photos = await queryPhotosAll({ hidden: 'include' });
  return photos.filter(photoNeedsUpdate).length;
};

// Backfills and experimentation

export const getColorDataForPhotos = async () => {
  const photos = await getPhotosFromStore();
  return photos.slice(0, UPDATE_QUERY_LIMIT)
    .map(photo => ({
      id: photo.id,
      url: photo.url,
      colorData: photo.colorData as unknown as PhotoColorData | undefined,
    }));
};

export const updateColorDataForPhoto = async (
  photoId: string,
  colorData: string,
  colorSort: number,
) => {
  await mutatePhotosInStore(photos => {
    const photo = photos.find(photo => photo.id === photoId);
    if (photo) {
      (photo as unknown as Record<string, unknown>).colorData = colorData;
      (photo as unknown as Record<string, unknown>).colorSort = colorSort;
      photo.updatedAt = new Date();
    }
  });
};
