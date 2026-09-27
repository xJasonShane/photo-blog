import { redirect } from 'next/navigation';
import { PREFIX_PHOTO } from '@/app/path';

// Legacy URL support (previously handled by middleware):
// accept /photos/* paths, but serve /p/*
export default async function LegacyPhotosPage({
  params,
}: {
  params: Promise<{ path?: string[] }>,
}) {
  const { path } = await params;
  redirect(`${PREFIX_PHOTO}/${path?.join('/') ?? ''}`);
}
