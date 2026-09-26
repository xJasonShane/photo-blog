import { IBM_PLEX_MONO_MEDIUM_BASE64 } from './font-data';

const FONT_IBM_PLEX_MONO_FAMILY = 'IBMPlexMono';

const getFontData = async () => {
  const binary = atob(IBM_PLEX_MONO_MEDIUM_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const getIBMPlexMono = () => getFontData()
  .then(data => ({
    fontFamily: FONT_IBM_PLEX_MONO_FAMILY,
    fonts: [{
      name: FONT_IBM_PLEX_MONO_FAMILY,
      data,
      weight: 500,
      style: 'normal',
    } as const],
  }));
