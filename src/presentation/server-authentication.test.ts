// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerAuthenticationStatus } from './ServerAuthenticationStatus';
import { disabledServerAuthentication, type AuthenticationState } from '../application/server-authentication';
import { success } from '../domain/result';
afterEach(cleanup);
it('keeps real sign-in disabled independently of preview state', async () => {
  render(createElement(ServerAuthenticationStatus));
  await screen.findByText(/Server authentication is disabled/);
  await userEvent.click(screen.getByRole('button', { name: 'Check sign-in availability' }));
  expect(screen.getByText(/No provider connection or session is created/)).toBeTruthy();
});
it.each<AuthenticationState>(['signed-out', 'callback-pending', 'failed', 'expired', 'verification-pending', 'organization-selection', 'access-denied'])('renders safe %s server state using controlled doubles', async state => {
  render(createElement(ServerAuthenticationStatus, { adapter: { ...disabledServerAuthentication, getSession: async () => success(state) } }));
  await screen.findByText({ 'signed-out': 'You are signed out.', 'callback-pending': 'Checking the authentication callback. Access remains unavailable.', failed: 'Authentication could not be completed. Try again when the service is available.', expired: 'Your session has expired. Sign in again.', 'verification-pending': 'Verify your email with the identity provider before continuing.', 'organization-selection': 'Choose an organization. The server must authorize its current membership.', 'access-denied': 'Access denied. An active authorized organization membership is required.', disabled: '' }[state]);
});
