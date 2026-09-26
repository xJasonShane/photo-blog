import type { CameraBrand } from './brand';
import { CAMERA_BRAND_LOGOS } from './cameraBrandLogos';

export type CameraBrandMetrics = {
  // Height relative to the surrounding font size.
  // Wordmarks match adjacent cap height; the Leica mark is
  // slightly larger so the circle stays recognizable.
  heightEm: number
  // Baseline shift. Negative values move the logo down.
  verticalAlignEm: number
  fill?: string
};

// IBM Plex Mono space advance is 600/1000 em.
const CAMERA_BRAND_GAP_EM = 0.6;

// Tuned so each mark shares a baseline and cap height with
// the model name rendered beside it.
const CAMERA_BRAND_METRICS: Record<
  CameraBrand,
  CameraBrandMetrics
> = {
  fujifilm: {
    heightEm: 0.72,
    verticalAlignEm: 0,
  },
  nikon: {
    heightEm: 0.74,
    verticalAlignEm: 0,
  },
  canon: {
    heightEm: 0.72,
    verticalAlignEm: 0,
  },
  leica: {
    heightEm: 1.2,
    verticalAlignEm: -0.25,
    fill: '#E20612',
  },
  hasselblad: {
    heightEm: 0.72,
    verticalAlignEm: 0,
  },
  panasonic: {
    heightEm: 0.72,
    verticalAlignEm: 0,
  },
  sony: {
    heightEm: 0.74,
    verticalAlignEm: 0,
  },
};

const viewBoxSize = (viewBox: string) => {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return { width, height };
};

export default function CameraBrand({
  brand,
}: {
  brand: CameraBrand
}) {
  const logo = CAMERA_BRAND_LOGOS[brand];
  const metrics = CAMERA_BRAND_METRICS[brand];
  const { width, height } = viewBoxSize(logo.viewBox);
  const widthEm = metrics.heightEm * width / height;

  return (
    <svg
      role="img"
      viewBox={logo.viewBox}
      width={`${widthEm}em`}
      height={`${metrics.heightEm}em`}
      className="inline-block shrink-0"
      style={{
        verticalAlign: `${metrics.verticalAlignEm}em`,
        marginRight: `${CAMERA_BRAND_GAP_EM}em`,
      }}
      fill={metrics.fill ?? 'currentColor'}
    >
      <title>{logo.label}</title>
      <g transform={logo.transform}>
        {logo.paths.map(path =>
          <path key={path} d={path} />)}
        {logo.detail?.paths.map(path =>
          <path
            key={path}
            d={path}
            fill={logo.detail?.fill}
            fillRule={logo.detail?.fillRule}
          />)}
      </g>
    </svg>
  );
}
