import { redirect } from 'next/navigation';
import { PATH_ADMIN_PHOTOS } from '@/app/path';

export default function AdminIndexPage() {
  redirect(PATH_ADMIN_PHOTOS);
}
