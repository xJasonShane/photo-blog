export const CAMERA_BRANDS = [
  'fujifilm',
  'nikon',
  'canon',
  'leica',
  'hasselblad',
  'panasonic',
  'sony',
] as const;

export type CameraBrand = typeof CAMERA_BRANDS[number];

const CAMERA_BRAND_PATTERN: Record<CameraBrand, RegExp> = {
  fujifilm: /\bfuji/i,
  nikon: /\bnikon/i,
  canon: /\bcanon/i,
  leica: /\bleica/i,
  hasselblad: /\bhasselblad/i,
  panasonic: /\b(?:panasonic|lumix)/i,
  sony: /\bsony/i,
};

export const getCameraBrand = (
  make?: string,
): CameraBrand | undefined => {
  if (!make) {
    return undefined;
  }
  return CAMERA_BRANDS.find(brand =>
    CAMERA_BRAND_PATTERN[brand].test(make),
  );
};
