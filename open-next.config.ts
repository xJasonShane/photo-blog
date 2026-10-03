import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from
  '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import doShardedTagCache from
  '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';

/**
 * Cross-isolate caching for Cloudflare Workers (the defaults are all
 * in-memory dummies, which makes `unstable_cache`/`revalidateTag` reset
 * on every cold start):
 * - incremental cache (ISR / data cache) persists in the R2 bucket
 * - cache tags are tracked by a sharded Durable Object, so
 *   `revalidateTag`/`revalidatePath` propagate across isolates
 * - revalidation events are processed through a Durable Object queue
 * Requires the matching bindings in wrangler.jsonc — see README.md.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  tagCache: doShardedTagCache,
  queue: doQueue,
});
