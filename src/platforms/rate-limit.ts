import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './redis';

type RateLimitArgs = {
  identifier: string
  tokens?: number
  duration?: Parameters<typeof Ratelimit.slidingWindow>[1]
};

/**
 * Checks a sliding-window rate limit. `skipped: true` means no Redis is
 * configured and the check was bypassed; throws on Redis infrastructure
 * failures (as opposed to the limit simply being exhausted).
 */
export const checkRateLimit = async ({
  identifier,
  tokens = 100,
  duration = '1h',
}: RateLimitArgs): Promise<{ success: boolean, skipped: boolean }> => {
  const redis = getRedis();
  if (!redis) {
    return { success: true, skipped: true };
  }
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, duration),
  });
  try {
    return {
      success: (await limiter.limit(identifier)).success,
      skipped: false,
    };
  } catch (e: any) {
    const message =
      `Failed to connect to redis rate limiting store ('${identifier}')`;
    console.error(message, e);
    throw new Error(message);
  }
};

export const checkRateLimitAndThrow = async ({
  identifier,
  tokens = 100,
  duration = '1h',
}: RateLimitArgs) => {
  const { success, skipped } =
    await checkRateLimit({ identifier, tokens, duration });
  if (!skipped && !success) {
    const message = `'${identifier}' rate limit exceeded`;
    console.error(message);
    throw new Error(message);
  }
};
