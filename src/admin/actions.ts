'use server';

import { runAuthenticatedAdminServerAction } from '@/auth/server';
import { testRedisConnection } from '@/platforms/redis';
import { testOpenAiConnection } from '@/platforms/openai';
import { testDatabaseConnection } from '@/platforms/postgres';
import { testStorageConnection } from '@/platforms/storage';
import { testGooglePlacesConnection } from '@/platforms/google-places';
import {
  getRawStoredDocuments,
  METADATA_BACKUP_FORMAT,
  METADATA_BACKUP_VERSION,
  restoreRawStoredDocuments,
} from '@/platforms/store';
import { revalidateAllKeysAndPaths } from '@/cache';
import { APP_CONFIGURATION } from '@/app/config';
import { getStorageUploadUrlsNoStore } from '@/platforms/storage/cache';
import {
  getGitHubMetaForCurrentApp,
  indicatorStatusForSignificantInsights,
} from './insights';
import {
  getPhotosInNeedOfUpdateCountCached,
  getPhotosMetaCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/photo/cache';
import { getAlbumsWithMetaCached } from '@/album/cache';

export type AdminData = Awaited<ReturnType<typeof getAdminDataAction>>;

export const getAdminDataAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const [
      photosCount,
      photosCountHidden,
      photosCountNeedSync,
      codeMeta,
      uploadsCount,
      albumsCount,
      tagsCount,
      recipesCount,
    ] = await Promise.all([
      getPhotosMetaCached()
        .then(({ count }) => count)
        .catch(() => 0),
      getPhotosMetaCached({ hidden: 'only' })
        .then(({ count }) => count)
        .catch(() => 0),
      getPhotosInNeedOfUpdateCountCached(),
      getGitHubMetaForCurrentApp(),
      getStorageUploadUrlsNoStore()
        .then(urls => urls.length)
        .catch(e => {
          console.error(`Error getting blob upload urls: ${e}`);
          return 0;
        }),
      getAlbumsWithMetaCached()
        .then(albums => albums.length)
        .catch(() => 0),
      getUniqueTagsCached()
        .then(tags => tags.length)
        .catch(() => 0),
      getUniqueRecipesCached()
        .then(recipes => recipes.length)
        .catch(() => 0),
    ]);

    const insightsIndicatorStatus = indicatorStatusForSignificantInsights({
      codeMeta,
      photosCountNeedSync,
    });

    const photosCountTotal = (
      photosCount !== undefined &&
      photosCountHidden !== undefined
    )
      ? photosCount + photosCountHidden
      : undefined;

    return {
      photosCount,
      photosCountHidden,
      photosCountNeedSync,
      photosCountTotal,
      uploadsCount,
      albumsCount,
      tagsCount,
      recipesCount,
      insightsIndicatorStatus,
    } as const;
  });

const scanForError = (
  shouldCheck: boolean,
  promise: () => Promise<any>,
): Promise<string> =>
  shouldCheck
    ? promise()
      .then(() => '')
      .catch(error => error.message)
    : Promise.resolve('');

export const testConnectionsAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const {
      hasDatabase,
      hasStorageProvider,
      hasRedisStorage,
      hasLocationServices,
      isAiContentGenerationEnabled,
    } = APP_CONFIGURATION;

    const [
      databaseError,
      storageError,
      redisError,
      aiError,
      locationError,
    ] = await Promise.all([
      scanForError(hasDatabase, testDatabaseConnection),
      scanForError(hasStorageProvider, testStorageConnection),
      scanForError(hasRedisStorage, testRedisConnection),
      scanForError(isAiContentGenerationEnabled, testOpenAiConnection),
      scanForError(hasLocationServices, testGooglePlacesConnection),
    ]);

    return {
      databaseError,
      storageError,
      redisError,
      aiError,
      locationError,
    };
  });

export const exportMetadataAction = async () =>
  runAuthenticatedAdminServerAction(async () => {
    const documents = await getRawStoredDocuments();
    return JSON.stringify({
      format: METADATA_BACKUP_FORMAT,
      version: METADATA_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      documents,
    }, null, 2);
  });

export const importMetadataAction = async (formData: FormData) =>
  runAuthenticatedAdminServerAction(async () => {
    const file = formData.get('bundle');
    if (!(file instanceof File) || file.size === 0) {
      throw new Error('Select a metadata backup file to restore');
    }
    let bundle: {
      format?: string
      documents?: Record<string, unknown>
    };
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      throw new Error('Backup file is not valid JSON');
    }
    if (bundle?.format !== METADATA_BACKUP_FORMAT) {
      throw new Error('Unrecognized backup file format');
    }
    if (!bundle.documents) {
      throw new Error('Backup file contains no metadata documents');
    }
    const restoredKeys = await restoreRawStoredDocuments(bundle.documents);
    if (restoredKeys.length === 0) {
      throw new Error('Backup file contains no metadata documents');
    }
    revalidateAllKeysAndPaths();
    return { restoredKeys };
  });
