import {
  getPhotosMeta,
  getUniqueCameras,
  getUniqueFilms,
  getUniqueFocalLengths,
  getUniqueLenses,
  getUniqueRecipes,
  getUniqueTags,
  getPhotosInNeedOfUpdateCount,
} from '@/photo/query';
import AdminAppInsightsClient from './AdminAppInsightsClient';
import { getAllInsights, getGitHubMetaForCurrentApp } from '.';
import { APP_CONFIGURATION, USED_DEPRECATED_ENV_VARS } from '@/app/config';
import { KEY_PHOTOS } from '@/platforms/store';
import { CLOUDFLARE_R2_BASE_URL_PUBLIC } from '@/platforms/storage/r2';
import WarningNote from '@/components/WarningNote';

// The R2 bucket that serves photos publicly also holds the metadata
// documents (`_data/*.json`) and the OpenNext incremental cache. If the
// public domain can read those keys, all photo metadata — including
// private photos' — is exposed; the bucket config must block `_data/*`
// (see the README deployment checklist).
const checkMetadataPublicReadability = async () =>
  CLOUDFLARE_R2_BASE_URL_PUBLIC
    ? await fetch(
      `${CLOUDFLARE_R2_BASE_URL_PUBLIC}/${KEY_PHOTOS}`,
      { method: 'HEAD', cache: 'no-store' },
    )
      .then(res => res.ok)
      .catch(() => false)
    : undefined;

export default async function AdminAppInsights() {
  const [
    { count: photosCount, dateRange },
    { count: photosCountHidden },
    photosCountNeedSync,
    { count: photosCountPortrait },
    codeMeta,
    cameras,
    lenses,
    tags,
    recipes,
    films,
    focalLengths,
  ] = await Promise.all([
    getPhotosMeta({ hidden: 'include' }),
    getPhotosMeta({ hidden: 'only' }),
    getPhotosInNeedOfUpdateCount(),
    getPhotosMeta({ maximumAspectRatio: 0.9 }),
    getGitHubMetaForCurrentApp(),
    getUniqueCameras(),
    getUniqueLenses(),
    getUniqueTags(),
    getUniqueRecipes(),
    getUniqueFilms(),
    getUniqueFocalLengths(),
  ]);

  const isMetadataPubliclyReadable = await checkMetadataPublicReadability();

  return <>
    {isMetadataPubliclyReadable !== undefined &&
      <div className="mb-4">
        {isMetadataPubliclyReadable
          ? <WarningNote>
              Metadata exposure detected: the R2 public domain serves
              {' '}metadata documents ({KEY_PHOTOS}) — anyone can download
              all photo metadata, including private photos. Block
              {' '}{'"_data/*"'} on the public domain (WAF / Transform Rule)
              or move metadata to a private bucket — see the README
              deployment checklist.
            </WarningNote>
          : <div className="text-xs opacity-50">
              ✅ Metadata documents are not readable from the public R2
              {' '}domain.
            </div>}
      </div>}
    <AdminAppInsightsClient
      codeMeta={codeMeta}
      nextVersion={APP_CONFIGURATION.nextVersion}
      reactVersion={APP_CONFIGURATION.reactVersion}
      nodeVersion={APP_CONFIGURATION.nodeVersion}
      insights={getAllInsights({
        codeMeta,
        photosCount,
        photosCountNeedSync,
        photosCountPortrait,
      })}
      usedDeprecatedEnvVars={USED_DEPRECATED_ENV_VARS}
      photoStats={{
        photosCount,
        photosCountHidden,
        photosCountNeedSync,
        camerasCount: cameras.length,
        lensesCount: lenses.length,
        tagsCount: tags.length,
        recipesCount: recipes.length,
        filmsCount: films.length,
        focalLengthsCount: focalLengths.length,
        dateRange,
      }}
    />
  </>;
}
