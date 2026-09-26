'use client';

import { AiFillApple } from 'react-icons/ai';
import { pathForCamera } from '@/app/path';
import { Camera, formatCameraText } from '.';
import EntityLink, {
  EntityLinkExternalProps,
} from '@/components/entity/EntityLink';
import IconCamera from '@/components/icons/IconCamera';
import { isCameraApple } from '@/platforms/apple';
import useCategoryCounts from '@/category/useCategoryCounts';
import { getCameraBrand } from './brand';
import CameraBrand from './CameraBrand';

export default function PhotoCamera({
  camera,
  hideAppleIcon,
  showBrandLogo,
  ...props
}: {
  camera: Camera
  hideAppleIcon?: boolean
  showBrandLogo?: boolean
} & EntityLinkExternalProps) {
  const { getCameraCount } = useCategoryCounts();
  
  const isApple = isCameraApple(camera);
  const showAppleIcon = !hideAppleIcon && isApple;
  const brand = showBrandLogo
    ? getCameraBrand(camera.make)
    : undefined;

  return (
    <EntityLink
      {...props}
      label={brand
        ? <>
          <CameraBrand brand={brand} />{formatCameraText(camera, 'short')}
        </>
        : formatCameraText(camera)}
      labelForHover={brand
        ? formatCameraText(camera)
        : undefined}
      path={pathForCamera(camera)}
      hoverQueryOptions={{ camera }}
      icon={showAppleIcon
        ? <AiFillApple
          title="Apple"
          className="translate-x-[-0.5px] translate-y-[-1px]"
          size={16}
        />
        : <IconCamera
          size={15}
          className="translate-x-[-0.5px] translate-y-[-0.5px]"
        />}
      hoverCount={props.hoverCount ?? getCameraCount(camera)}
    />
  );
}
