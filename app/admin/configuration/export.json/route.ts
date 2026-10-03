import { auth } from '@/auth/server';
import { APP_CONFIGURATION, DEBUG_OUTPUTS_ENABLED } from '@/app/config';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized request', { status: 401 });
  }
  return DEBUG_OUTPUTS_ENABLED
    ? Response.json(APP_CONFIGURATION)
    : new Response('Debugging disabled', { status: 404 });
}
