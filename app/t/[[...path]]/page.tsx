import { redirect } from 'next/navigation';
import { PREFIX_TAG } from '@/app/path';

// Legacy URL support (previously handled by middleware):
// accept /t/* paths, but serve /tag/*
export default async function LegacyTagPage({
  params,
}: {
  params: Promise<{ path?: string[] }>,
}) {
  const { path } = await params;
  redirect(`${PREFIX_TAG}/${path?.join('/') ?? ''}`);
}
