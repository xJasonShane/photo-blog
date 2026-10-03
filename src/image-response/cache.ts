// Platform-neutral production check: the upstream template gated on
// NEXT_PUBLIC_VERCEL_ENV, which never matches on Cloudflare Workers /
// EdgeOne Pages and left every OG route uncached in production there.
export const getImageResponseCacheControlHeaders = (
  shouldCache = process.env.NODE_ENV === 'production',
) => {
  return {
    'Cache-Control': shouldCache
      ? 's-maxage=3600, stale-while-revalidate=31536000'
      : 's-maxage=1, stale-while-revalidate=59',
  };
};
