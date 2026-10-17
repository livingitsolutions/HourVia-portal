import { z } from "zod";
import type {
  Invitation,
  Membership,
  Organization,
  Role,
} from "../domain/organization";
import { rolePermissions, type Permission } from "../domain/authorization";
export const organizationDraftSchema = z.object({
  name: z.string().trim().min(2, "Use at least two characters.").max(120),
  industry: z.string().trim().min(2, "Enter an industry.").max(100),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA time zone, such as Europe/London."),
});
export type OrganizationDraft = z.infer<typeof organizationDraftSchema>;
export interface PreviewOrganizationChoice {
  readonly organization: Organization;
  readonly membership: Membership;
}
export function selectPreviewOrganization(
  choices: readonly PreviewOrganizationChoice[],
  id: string,
): PreviewOrganizationChoice | null {
  return (
    choices.find(
      (c) =>
        c.organization.id === id &&
        c.organization.status === "active" &&
        c.membership.organizationId === id &&
        c.membership.status === "active",
    ) ?? null
  );
}
export function invitationPresentation(
  invitation: Invitation,
  now: number,
): Invitation["state"] {
  return invitation.state === "pending" && invitation.expiresAt <= now
    ? "expired"
    : invitation.state;
}
export const presentationActions: readonly {
  label: string;
  permission: Permission;
}[] = [
  { label: "Organization settings", permission: "organization.admin" },
  { label: "Member management", permission: "membership.admin" },
  { label: "Invitation management", permission: "membership.admin" },
  { label: "Project management", permission: "project.manage" },
  { label: "Timesheet approvals", permission: "timesheet.approve" },
  { label: "Billing configuration", permission: "billing.prepare" },
];
export function visibleActions(role: Role) {
  return presentationActions.filter((a) =>
    rolePermissions[role].includes(a.permission),
  );
}
/** Switching clears tenant-specific presentation state. This is never an authorization context. */
export function switchPreviewTenant(
  choices: readonly PreviewOrganizationChoice[],
  id: string,
) {
  return {
    selected: selectPreviewOrganization(choices, id),
    draft: "",
    resourceId: null,
  };
}
