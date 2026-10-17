import { checkServerIdentity } from 'node:tls';
import { bounds } from './managed-gate';
/** Pure configuration builder for a future explicitly supplied pg.Pool.
 * Reject all URL overrides, including SSL and alternate host/options parameters.
 * Never serialize its returned configuration (it contains a credential).
 */
export function verifiedPoolOptions(raw: string, hostname: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('INVALID_TARGET_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== hostname ||
    !url.username || !url.password || url.search || url.hash ||
    ['localhost','127.0.0.1','[::1]'].includes(hostname) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('INVALID_TLS_TARGET');
  return { connectionString: raw, max: bounds.max, connectionTimeoutMillis: bounds.connectionTimeoutMillis,
    statement_timeout: bounds.statement_timeout, lock_timeout: bounds.lock_timeout,
    idle_in_transaction_session_timeout: bounds.idle_in_transaction_session_timeout,
    ssl: { rejectUnauthorized: true as const, servername: hostname, checkServerIdentity } };
}
