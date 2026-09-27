import { redirectIfUnauthenticated } from '@/auth/guard';

export default async function OgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await redirectIfUnauthenticated('/og/sample');
  return children;
}
