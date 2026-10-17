import { describe, expect, it } from "vitest";
import {
  disabledAuthentication,
  recoverySchema,
  registrationSchema,
  resetSchema,
  signInSchema,
} from "./authentication";
import {
  invitationPresentation,
  organizationDraftSchema,
  selectPreviewOrganization,
  switchPreviewTenant,
  visibleActions,
} from "./onboarding";
import {
  previewInvitation,
  previewOrganizations,
  previewAuthOutcome,
} from "../infrastructure/preview-onboarding";
import { roles, hasExactlyOneOwner } from "../domain/organization";
const passwordFixture = ["invented", "only", "value"].join("-");
describe("Sprint 3A offline application contracts", () => {
  it("validates authentication input without weakening sign-in password compatibility", () => {
    expect(
      signInSchema.safeParse({ email: "invalid", password: "" }).success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({
        email: "person@example.test",
        password: passwordFixture,
      }).success,
    ).toBe(true);
    expect(recoverySchema.safeParse({ email: "invalid" }).success).toBe(false);
    expect(
      registrationSchema.safeParse({
        name: "Ali",
        email: "ali@example.test",
        password: "short",
        confirm: "short",
      }).success,
    ).toBe(false);
    expect(
      resetSchema.safeParse({ password: passwordFixture, confirm: "different" })
        .success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        name: "Ali",
        email: "ali@example.test",
        password: passwordFixture,
        confirm: passwordFixture,
      }).success,
    ).toBe(true);
  });
  it("keeps every real authentication operation disabled", async () => {
    const input = {
      name: "Ali",
      email: "ali@example.test",
      password: passwordFixture,
      confirm: passwordFixture,
    };
    const results = await Promise.all([
      disabledAuthentication.register(input),
      disabledAuthentication.signIn(input),
      disabledAuthentication.signOut(),
      disabledAuthentication.requestRecovery(input),
      disabledAuthentication.resetPassword({
        credential: "fixture",
        password: input.password,
      }),
      disabledAuthentication.verifyEmail({ credential: "fixture" }),
      disabledAuthentication.getSession(),
      disabledAuthentication.expireSession(),
    ]);
    expect(results.every((r) => !r.ok && r.error === "DISABLED")).toBe(true);
    expect(await previewAuthOutcome("invalid")).toBe("invalid");
  });
  it("validates organization drafts and time zones", () => {
    expect(
      organizationDraftSchema.safeParse({
        name: " ",
        industry: "",
        timezone: "invalid",
      }).success,
    ).toBe(false);
    expect(
      organizationDraftSchema.safeParse({
        name: "Cedar",
        industry: "Design",
        timezone: "Europe/London",
      }).success,
    ).toBe(true);
  });
  it("selects active matching memberships only, clears tenant state and supports multiple memberships", () => {
    expect(previewOrganizations).toHaveLength(2);
    expect(
      selectPreviewOrganization(previewOrganizations, "unknown"),
    ).toBeNull();
    const choice = previewOrganizations[0];
    expect(
      selectPreviewOrganization(
        [
          {
            ...choice,
            membership: { ...choice.membership, status: "revoked" },
          },
        ],
        choice.organization.id,
      ),
    ).toBeNull();
    expect(
      selectPreviewOrganization(
        [
          {
            ...choice,
            membership: { ...choice.membership, organizationId: "other" },
          },
        ],
        choice.organization.id,
      ),
    ).toBeNull();
    expect(
      switchPreviewTenant(
        previewOrganizations,
        previewOrganizations[1].organization.id,
      ),
    ).toEqual({
      selected: previewOrganizations[1],
      draft: "",
      resourceId: null,
    });
    expect(
      hasExactlyOneOwner([choice.membership], choice.organization.id),
    ).toBe(true);
  });
  it.each(["pending", "accepted", "revoked", "expired"] as const)(
    "presents invitation %s without changing membership",
    (state) => {
      expect(invitationPresentation({ ...previewInvitation, state }, 0)).toBe(
        state,
      );
      expect(
        invitationPresentation(
          { ...previewInvitation, state: "pending", expiresAt: 10 },
          10,
        ),
      ).toBe("expired");
    },
  );
  it.each(roles)("reuses role policy for %s navigation", (role) => {
    const labels = visibleActions(role).map((a) => a.label);
    expect(labels.includes("Billing configuration")).toBe(
      role === "OWNER" || role === "ADMIN",
    );
    expect(labels.includes("Project management")).toBe(
      ["OWNER", "ADMIN", "MANAGER"].includes(role),
    );
  });
});
