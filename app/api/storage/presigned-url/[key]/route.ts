import { auth } from '@/auth/server';
import { getSignedUrlForKey } from '@/platforms/storage';

// Only client-side upload flows may request presigned PUT URLs: photo
// originals and browser-generated derivatives, under the reserved
// `photo-` / `upload-` prefixes. This keeps signed writes off metadata
// documents and any other bucket key.
const PRESIGNED_PUT_KEY_PATTERN =
  /^(photo|upload)-[A-Za-z0-9-]+\.(jpe?g|png)$/i;

export async function GET(
  _: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const session = await auth();

  if (!session?.user) {
    return new Response('Unauthorized request', { status: 401 });
  }

  if (!key || !PRESIGNED_PUT_KEY_PATTERN.test(key)) {
    return new Response('Forbidden key', { status: 403 });
  }

  const url = await getSignedUrlForKey(key, 'PUT');
  return new Response(
    url,
    {
      headers: {
        'content-type': 'text/plain',
        'cache-control': 'no-store',
      },
    },
  );
}
