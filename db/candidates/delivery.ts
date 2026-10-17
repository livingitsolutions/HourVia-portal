/** Storage/worker contract only. No provider, token generation, email or worker activation. */
export interface InvitationDelivery {
  readonly id: string;
  readonly organizationId: string;
  readonly invitationId: string;
  /** Stable provider idempotency identity; retries must never allocate a replacement. */
  readonly deliveryKey: string;
  readonly state: 'queued' | 'leased' | 'delivered' | 'failed' | 'cancelled';
  readonly attempts: number;
  readonly version: number;
  readonly nextAttemptAt: number;
  readonly leaseUntil: number | null;
}
export interface InvitationDeliveryStore {
  /** Future privileged worker: atomic lease with tenant/invitation state/expiry revalidation,
   * max 10 attempts, bounded lease and expected version. No runtime worker grants exist. */
  lease(input: { organizationId: string; deliveryId: string; expectedVersion: number; now: number }): Promise<InvitationDelivery | null>;
  /** Must match lease/version and stable delivery key; safe error codes only, never token/body. */
  finish(input: { organizationId: string; deliveryId: string; expectedVersion: number; deliveryKey: string; outcome: 'delivered' | 'unavailable' | 'rate_limited' | 'rejected' }): Promise<void>;
}
export interface InvitationDeliveryProvider {
  /** Provider integration deferred. A secure one-time exchange must be reviewed before this
   * handle can resolve a credential; neither queue nor audit may contain raw tokens. */
  deliver(input: { deliveryKey: string; credentialExchangeHandle: string }): Promise<{ reference: string }>;
}
