/**
 * The original project used a Postgres connection here. All metadata now
 * lives in Cloudflare R2 (see `@/platforms/store`), so this module only
 * keeps the connection-test surface used by the admin insights page.
 */
import { testStoreConnection } from '@/platforms/store';

export const testDatabaseConnection = testStoreConnection;
