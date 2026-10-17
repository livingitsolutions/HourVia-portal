/** Pure validation; no connection, environment fallback, or credential output. */
export function authorizeDisposable(rawTarget, args, driver) {
  if (!rawTarget || driver === 'serverless') throw new Error('DISPOSABLE_TARGET_REQUIRED');
  let target;
  try { target = new URL(rawTarget); } catch { throw new Error('INVALID_DISPOSABLE_TARGET'); }
  const name = target.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.search || target.hash || !/^hourvia_disposable_[a-z0-9_]{8,64}$/.test(name) ||
      !args.includes('--authorize-disposable=' + name) || !args.includes('--authorize-isolated-cluster') || !args.includes('--apply-quarantined-candidates')) {
    throw new Error('DISPOSABLE_AUTHORIZATION_REQUIRED');
  }
  return name;
}
