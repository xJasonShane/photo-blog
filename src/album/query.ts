import {
  Album,
  Albums,
  parseAlbumFromDb,
} from '.';
import {
  getStoredAlbumData,
  getStoredPhotos,
  saveStoredAlbumData,
  StoredAlbum,
} from '@/platforms/store';

// Kept for API compatibility with the original Postgres implementation
export const createAlbumsTable = () => Promise.resolve();
export const createAlbumPhotoTable = () => Promise.resolve();

const generateAlbumId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const insertAlbum = async (album: Omit<Album, 'id'>) => {
  const data = await getStoredAlbumData();
  const id = generateAlbumId();
  const now = new Date();
  data.albums.push({
    id,
    ...album,
    updatedAt: now,
    createdAt: now,
  } as unknown as StoredAlbum);
  await saveStoredAlbumData(data);
  return id;
};

export const updateAlbum = async (album: Album) => {
  const data = await getStoredAlbumData();
  const index = data.albums.findIndex(({ id }) => id === album.id);
  if (index !== -1) {
    data.albums[index] = {
      ...data.albums[index],
      ...album,
      updatedAt: new Date(),
    } as unknown as StoredAlbum;
    await saveStoredAlbumData(data);
  }
};

export const getAlbumFromSlug = async (slug: string) => {
  const data = await getStoredAlbumData();
  const album = data.albums
    .find(album => album.slug === slug) as unknown as Album | undefined;
  return album ? parseAlbumFromDb(album) : undefined;
};

export const deleteAlbum = async (id: string) => {
  const data = await getStoredAlbumData();
  await saveStoredAlbumData({
    albums: data.albums.filter(album => album.id !== id),
    albumPhoto: data.albumPhoto.filter(link => link.albumId !== id),
  });
};

export const getAlbumsWithMeta = async (): Promise<Albums> => {
  const data = await getStoredAlbumData();
  return data.albums
    .map(album => ({
      album: parseAlbumFromDb(album as unknown as Album),
      count: data.albumPhoto
        .filter(link => link.albumId === album.id).length,
      lastModified: album.updatedAt as Date,
    }))
    .sort((a, b) =>
      new Date((b.album as any).createdAt).getTime() -
      new Date((a.album as any).createdAt).getTime());
};

export const clearPhotoAlbumIds = async (photoId: string) => {
  const data = await getStoredAlbumData();
  await saveStoredAlbumData({
    ...data,
    albumPhoto: data.albumPhoto.filter(link => link.photoId !== photoId),
  });
};

export const addPhotoAlbumIds = async (
  photoIds: string[],
  albumIds: string[],
) => {
  if (photoIds.length > 0 && albumIds.length > 0) {
    const data = await getStoredAlbumData();
    albumIds.forEach(albumId => {
      photoIds.forEach((photoId, index) => {
        const exists = data.albumPhoto
          .some(link => link.albumId === albumId && link.photoId === photoId);
        if (!exists) {
          data.albumPhoto.push({ albumId, photoId, sortOrder: index });
        }
      });
    });
    await saveStoredAlbumData(data);
  }
};

export const addPhotoAlbumId = (photoId: string, albumId: string) =>
  addPhotoAlbumIds([photoId], [albumId]);

export const getAlbumTitlesForPhoto = async (photoId: string) => {
  const data = await getStoredAlbumData();
  const albumIds = new Set(
    data.albumPhoto
      .filter(link => link.photoId === photoId)
      .map(link => link.albumId),
  );
  return data.albums
    .filter(album => albumIds.has(album.id))
    .map(album => album.title as string);
};

export const getTagsForAlbum = async (albumId: string) => {
  const data = await getStoredAlbumData();
  const photoIds = new Set(
    data.albumPhoto
      .filter(link => link.albumId === albumId)
      .map(link => link.photoId),
  );
  const photos = await getStoredPhotos();
  const tags = new Set<string>();
  photos.forEach(photo => {
    if (photoIds.has(photo.id)) {
      ((photo.tags as string[] | undefined) ?? []).forEach(tag =>
        tags.add(tag));
    }
  });
  return Array.from(tags);
};
