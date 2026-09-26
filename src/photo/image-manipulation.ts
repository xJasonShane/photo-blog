/**
 * Pure-JS RGBA manipulation used to generate blur placeholder data,
 * mirroring the original sharp pipeline: `modulate({saturation: 1.15})`
 * + `blur(4)` at ~200px width.
 */

const SATURATION = 1.15;
const BLUR_PASSES = 2;

const applySaturation = (data: Uint8Array | Uint8ClampedArray) => {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = Math.max(0, Math.min(255, l + (r - l) * SATURATION));
    data[i + 1] = Math.max(0, Math.min(255, l + (g - l) * SATURATION));
    data[i + 2] = Math.max(0, Math.min(255, l + (b - l) * SATURATION));
  }
};

// Separable box blur — repeated passes approximate a gaussian blur
const boxBlur = (
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) => {
  const temp = new Uint8ClampedArray(data.length);
  const passes = BLUR_PASSES;
  for (let pass = 0; pass < passes; pass++) {
    // Horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const index = (y * width + xx) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count++;
        }
        const tIndex = (y * width + x) * 4;
        temp[tIndex] = r / count;
        temp[tIndex + 1] = g / count;
        temp[tIndex + 2] = b / count;
        temp[tIndex + 3] = a / count;
      }
    }
    // Vertical
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const index = (yy * width + x) * 4;
          r += temp[index];
          g += temp[index + 1];
          b += temp[index + 2];
          a += temp[index + 3];
          count++;
        }
        const dIndex = (y * width + x) * 4;
        data[dIndex] = r / count;
        data[dIndex + 1] = g / count;
        data[dIndex + 2] = b / count;
        data[dIndex + 3] = a / count;
      }
    }
  }
};

export const applySaturationAndBlurToRgba = (
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(rgba);
  applySaturation(data);
  // Downscale by 2 (area average) before blurring to keep it fast and
  // output compact — the result is upscaled by CSS in the placeholder
  const downWidth = Math.max(1, Math.floor(width / 2));
  const downHeight = Math.max(1, Math.floor(height / 2));
  const down = new Uint8ClampedArray(downWidth * downHeight * 4);
  for (let y = 0; y < downHeight; y++) {
    for (let x = 0; x < downWidth; x++) {
      const sIndex = ((y * 2) * width + (x * 2)) * 4;
      const dIndex = (y * downWidth + x) * 4;
      down[dIndex] = data[sIndex];
      down[dIndex + 1] = data[sIndex + 1];
      down[dIndex + 2] = data[sIndex + 2];
      down[dIndex + 3] = data[sIndex + 3];
    }
  }
  boxBlur(down, downWidth, downHeight, 2);
  return down;
};
