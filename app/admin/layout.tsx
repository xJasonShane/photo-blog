import AdminNav from '@/admin/AdminNav';
import { redirectIfUnauthenticated } from '@/auth/guard';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await redirectIfUnauthenticated();

  return (
    <div className="mt-4 space-y-4">
      <AdminNav />
      {children}
    </div>
  );
}
