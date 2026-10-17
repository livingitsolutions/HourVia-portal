import type { PreviewOrganizationChoice } from "../application/onboarding";
import type { Invitation } from "../domain/organization";
/** Static public fixtures only. Never implements principal resolution or live organization use cases. */
export const previewOrganizations: readonly PreviewOrganizationChoice[] = [
  {
    organization: {
      id: "preview-living",
      name: "Living IT Solutions",
      status: "active",
    },
    membership: {
      userId: "preview-person",
      organizationId: "preview-living",
      role: "OWNER",
      status: "active",
    },
  },
  {
    organization: {
      id: "preview-studio",
      name: "Cedar Design Studio",
      status: "active",
    },
    membership: {
      userId: "preview-person",
      organizationId: "preview-studio",
      role: "CONTRACTOR",
      status: "active",
    },
  },
];
export const previewInvitation: Invitation = {
  id: "preview-invitation",
  organizationId: "preview-studio",
  email: "recipient@example.test",
  role: "EMPLOYEE",
  state: "pending",
  expiresAt: 4102444800000,
  version: 1,
};
/** UI outcome simulator accepts no credentials and never returns a principal or membership. */
export async function previewAuthOutcome(
  outcome: "invalid" | "unavailable" | "recovery",
) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return outcome;
}
