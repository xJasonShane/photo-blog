import { getPhotosCached } from '@/photo/cache';
import { SITE_FEEDS_ENABLED } from '@/app/config';
import { formatFeedRssXml } from '@/feed/rss';
import { PROGRAMMATIC_QUERY_OPTIONS } from '@/feed';

// Cache for 24 hours (ISR — requires the OpenNext incremental cache
// configured in open-next.config.ts to persist across isolates)
export const revalidate = 86400;

export async function GET() {
  if (SITE_FEEDS_ENABLED) {
    // No catch fallback: a transient store outage must fail this
    // generation instead of persisting an empty feed for the full
    // revalidate window — a thrown error serves any previous ISR entry
    // and retries on the next request.
    const photos = await getPhotosCached(PROGRAMMATIC_QUERY_OPTIONS);
    return new Response(
      formatFeedRssXml(photos),
      { headers: { 'Content-Type': 'text/xml' } },
    );
  } else {
    return new Response('Feeds disabled', { status: 404 });
  }
}
