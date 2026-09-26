import { NextRequest, NextResponse } from 'next/server';

/**
 * Development-only file server for the local storage driver
 * (`.data/files/`). Never invoked when R2 storage is configured; the
 * `node:fs` import is resolved at runtime so bundler builds stay clean.
 */
const LOCAL_FILES_DIR = '.data/files';

const fsModule = () =>
  // eslint-disable-next-line max-len
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:fs/promises')
    .then(fs => fs as unknown as typeof import('node:fs/promises'));

const safeFileNameFromKey = (key: string[]): string | undefined => {
  const fileName = key.join('/');
  if (!fileName || fileName.includes('..')) { return undefined; }
  return fileName;
};

const contentTypeForFileName = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileName = safeFileNameFromKey(key);
  if (!fileName) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const fs = await fsModule();
    const data = await fs.readFile(`${LOCAL_FILES_DIR}/${fileName}`);
    return new NextResponse(new Uint8Array(data.buffer), {
      // eslint-disable-next-line max-len
      headers: {
        'Content-Type': contentTypeForFileName(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    console.log('[local-file] read error:', e);
    return new NextResponse(String(e), { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileName = safeFileNameFromKey(key);
  if (!fileName) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const fs = await fsModule();
    await fs.mkdir(LOCAL_FILES_DIR, { recursive: true });
    const body = await request.arrayBuffer();
    await fs.writeFile(
      `${LOCAL_FILES_DIR}/${fileName}`,
      new Uint8Array(body),
    );
    return new NextResponse(null, { status: 200 });
  } catch (e) {
    return new NextResponse(`${e}`, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const fileName = safeFileNameFromKey(key);
  if (!fileName) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const fs = await fsModule();
    await fs.rm(`${LOCAL_FILES_DIR}/${fileName}`, { force: true });
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 200 });
  }
}
