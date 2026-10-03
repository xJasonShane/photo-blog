import { Library, LibraryInsert } from '.';
import {
  getStoredLibrary,
  getStoredLibraryWithEtag,
  saveStoredLibrary,
  isStoreWriteConflictError,
  MUTATE_STORE_MAX_ATTEMPTS,
} from '@/platforms/store';

const LIBRARY_ID = 1;

// Kept for API compatibility with the original Postgres implementation
export const createLibraryTable = () => Promise.resolve();

export const upsertLibrary = async (library: LibraryInsert) => {
  const now = new Date().toISOString();
  let lastConflict: unknown;
  for (let attempt = 0; attempt < MUTATE_STORE_MAX_ATTEMPTS; attempt++) {
    // A missing document resolves etag `null`, which makes the write
    // create-only and safe against concurrent first-time creation.
    const { etag } = await getStoredLibraryWithEtag();
    try {
      await saveStoredLibrary({
        ...library,
        id: LIBRARY_ID,
        updatedAt: now,
        createdAt: now,
      }, etag);
      return LIBRARY_ID;
    } catch (e) {
      if (!isStoreWriteConflictError(e)) { throw e; }
      lastConflict = e;
    }
  }
  throw lastConflict ??
    new Error('Library write failed after repeated conflicts');
};

export const getLibrary = async (): Promise<Library | undefined> => {
  const library = await getStoredLibrary();
  return library
    ? {
      ...library,
      createdAt: new Date(library.createdAt as unknown as string),
      updatedAt: new Date(library.updatedAt as unknown as string),
    } as unknown as Library
    : undefined;
};
