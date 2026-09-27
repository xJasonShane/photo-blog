import { redirect } from 'next/navigation';
import { PATH_OG_SAMPLE } from '@/app/path';

export default function OgIndexPage() {
  redirect(PATH_OG_SAMPLE);
}
