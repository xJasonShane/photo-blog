import { redirectIfUnauthenticated } from '@/auth/guard';

export default async function PrivateTagLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await redirectIfUnauthenticated();
  return children;
}
