import { useEffect, useState } from 'react';
import { disabledServerAuthentication, type AuthenticationState, type ServerAuthentication } from '../application/server-authentication';
const messages: Record<AuthenticationState, string> = {
  disabled: 'Server authentication is disabled. No provider connection or session is created.',
  'signed-out': 'You are signed out.',
  'callback-pending': 'Checking the authentication callback. Access remains unavailable.',
  failed: 'Authentication could not be completed. Try again when the service is available.',
  expired: 'Your session has expired. Sign in again.',
  'verification-pending': 'Verify your email with the identity provider before continuing.',
  'organization-selection': 'Choose an organization. The server must authorize its current membership.',
  'access-denied': 'Access denied. An active authorized organization membership is required.',
};
/** Separate from preview state; credentials and callback query values never enter presentation. */
export function ServerAuthenticationStatus({ callback = false, adapter = disabledServerAuthentication }: { callback?: boolean; adapter?: ServerAuthentication }) {
  const [state, setState] = useState<AuthenticationState>(callback ? 'callback-pending' : 'signed-out');
  useEffect(() => {
    let active = true;
    const operation = callback ? adapter.callback() : adapter.getSession();
    void operation.then(result => { if (active) setState(result.ok ? result.value : result.error === 'DISABLED' ? 'disabled' : result.error === 'EXPIRED' ? 'expired' : 'failed'); })
      .catch(() => { if (active) setState('failed'); });
    return () => { active = false; };
  }, [adapter, callback]);
  return <section aria-label="Server authentication"><h2>Server authentication</h2><p aria-live="polite">{messages[state]}</p><button type="button" className="primary-button" onClick={async () => {
    try { const result = await adapter.initiate(); setState(!result.ok && result.error === 'DISABLED' ? 'disabled' : 'failed'); }
    catch { setState('failed'); }
  }}>Check sign-in availability</button><p>Preview forms and sample organizations below do not grant access.</p></section>;
}
