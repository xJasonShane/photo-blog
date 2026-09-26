import { Library, LibraryInsert } from '.';
import {
  getStoredLibrary,
  saveStoredLibrary,
} from '@/platforms/store';

const LIBRARY_ID = 1;

// Kept for API compatibility with the original Postgres implementation
export const createLibraryTable = () => Promise.resolve();

export const upsertLibrary = async (library: LibraryInsert) => {
  await saveStoredLibrary({
    ...library,
    id: LIBRARY_ID,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  return LIBRARY_ID;
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
