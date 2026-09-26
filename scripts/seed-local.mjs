/**
 * Seeds local development data (`.data/`) with sample photos that have
 * realistic EXIF metadata so the site can be exercised without R2:
 *   node scripts/seed-local.mjs
 */
import fs from 'node:fs/promises';
import jpeg from 'jpeg-js';
import piexif from 'piexifjs';
import path from 'node:path';

const FILES_DIR = '.data/files';
const STORE_DIR = '.data/store';

const WIDTH = 1600;
const HEIGHT = 1067;

// Generate a simple color-graded gradient "photo"
const generateRgba = (width, height, offset) => {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.min(255, (x / width) * 200 + 40 + offset);
      data[i + 1] = Math.min(255, (y / height) * 160 + 60);
      data[i + 2] = Math.min(255, 255 - (x / width) * 120 + offset / 2);
      data[i + 3] = 255;
    }
  }
  return data;
};

const encodeJpegWithExif = ({ exif: exifFields, offset }) => {
  const raw = jpeg.encode(
    { data: generateRgba(WIDTH, HEIGHT, offset), width: WIDTH, height: HEIGHT },
    82,
  );
  const dataUrl = `data:image/jpeg;base64,${raw.data.toString('base64')}`;
  const exifObj = {
    '0th': {
      [piexif.ImageIFD.Make]: exifFields.make,
      [piexif.ImageIFD.Model]: exifFields.model,
      [piexif.ImageIFD.Software]: 'seed-local.mjs',
      [piexif.ImageIFD.DateTime]: '2026:08:15 10:30:00',
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: '2026:08:15 10:30:00',
      [piexif.ExifIFD.LensMake]: exifFields.lensMake,
      [piexif.ExifIFD.LensModel]: exifFields.lensModel,
      [piexif.ExifIFD.FNumber]: exifFields.fNumber,
      [piexif.ExifIFD.ISOSpeedRatings]: exifFields.iso,
      [piexif.ExifIFD.ExposureTime]: exifFields.exposureTime,
      [piexif.ExifIFD.FocalLength]: exifFields.focalLength,
      [piexif.ExifIFD.PixelXDimension]: WIDTH,
      [piexif.ExifIFD.PixelYDimension]: HEIGHT,
    },
    GPS: exifFields.gps ?? {},
    '1st': {},
    thumbnails: {},
  };
  const exifBytes = piexif.dump(exifObj);
  const withExif = piexif.insert(exifBytes, dataUrl);
  return Buffer.from(
    withExif.split(',')[1],
    'base64',
  );
};

const derivativeFromJpeg = (buffer, size, quality) => {
  const decoded = jpeg.decode(buffer, { useTArray: true });
  const scale = Math.min(1, size / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  // Nearest-neighbor downscale (good enough for local dev)
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(decoded.width - 1, Math.round(x / scale));
      const sy = Math.min(decoded.height - 1, Math.round(y / scale));
      const si = (sy * decoded.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = decoded.data[si];
      out[di + 1] = decoded.data[si + 1];
      out[di + 2] = decoded.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return jpeg.encode({ data: out, width, height }, quality).data;
};

const PHOTOS = [
  {
    id: 'AbCd1234',
    title: 'Harbor Fog',
    tags: ['seascape', 'morning'],
    exif: {
      make: 'Fujifilm',
      model: 'X-T5',
      lensMake: 'Fujifilm',
      lensModel: 'XF23mmF1.4 LM WR',
      focalLength: 23,
      fNumber: 1.4,
      iso: 160,
      exposureTime: 1 / 1000,
    },
    offset: 0,
    gps: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [[46, 1], [25, 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: 'W',
      [piexif.GPSIFD.GPSLongitude]: [[61, 1], [30, 1], [0, 1]],
    },
  },
  {
    id: 'EfGh5678',
    title: 'Alpine Dusk',
    tags: ['mountains'],
    exif: {
      make: 'Sony',
      model: 'ILCE-7M4',
      lensMake: 'Sony',
      lensModel: 'FE 24-70mm F2.8 GM II',
      focalLength: 45,
      fNumber: 5.6,
      iso: 400,
      exposureTime: 1 / 250,
    },
    offset: 50,
  },
  {
    id: 'IjKl9012',
    title: 'Street Geometry',
    tags: ['street', 'architecture'],
    exif: {
      make: 'Leica',
      model: 'Q3',
      lensMake: 'Leica',
      lensModel: 'SUMMILUX 1:1.7/28 ASPH.',
      focalLength: 28,
      fNumber: 2.8,
      iso: 100,
      exposureTime: 1 / 500,
    },
    offset: 90,
  },
];

const main = async () => {
  await fs.mkdir(FILES_DIR, { recursive: true });
  await fs.mkdir(path.join(STORE_DIR, '_data'), { recursive: true });

  const now = Date.now();
  const records = [];

  for (const [index, spec] of PHOTOS.entries()) {
    const fileNameBase = `photo-${spec.id}`;
    const original = encodeJpegWithExif(spec);
    await fs.writeFile(
      path.join(FILES_DIR, `${fileNameBase}.jpg`),
      original,
    );
    await fs.writeFile(
      path.join(FILES_DIR, `${fileNameBase}-sm.jpg`),
      derivativeFromJpeg(original, 200, 90),
    );
    await fs.writeFile(
      path.join(FILES_DIR, `${fileNameBase}-md.jpg`),
      derivativeFromJpeg(original, 640, 90),
    );
    await fs.writeFile(
      path.join(FILES_DIR, `${fileNameBase}-lg.jpg`),
      derivativeFromJpeg(original, 1080, 80),
    );

    const baseUrl = 'http://localhost:3000/local-file';
    const takenAt = new Date(`2026-08-${15 + index}T10:30:00Z`);

    records.push({
      id: spec.id,
      url: `${baseUrl}/${fileNameBase}.jpg`,
      extension: 'jpg',
      width: WIDTH,
      height: HEIGHT,
      aspectRatio: WIDTH / HEIGHT,
      blurData: undefined,
      title: spec.title,
      tags: spec.tags,
      make: spec.exif.make,
      model: spec.exif.model,
      lensMake: spec.exif.lensMake,
      lensModel: spec.exif.lensModel,
      focalLength: spec.exif.focalLength,
      focalLengthIn35MmFormat: spec.exif.focalLength,
      fNumber: spec.exif.fNumber,
      iso: spec.exif.iso,
      exposureTime: spec.exif.exposureTime,
      takenAt: takenAt.toISOString(),
      takenAtNaive: '2026-08-15 10:30:00',
      updatedAt: new Date(now - index * 1000).toISOString(),
      createdAt: new Date(now - index * 1000).toISOString(),
      hidden: false,
      excludeFromFeeds: false,
    });
  }

  await fs.writeFile(
    path.join(STORE_DIR, '_data/photos.json'),
    JSON.stringify({ photos: records }, null, 2),
  );

  console.log(`Seeded ${records.length} photos into .data/`);
};

main();
