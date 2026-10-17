// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { journeyRoutes } from "./OnboardingPages";
afterEach(cleanup);
function page(path: string) {
  return render(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)),
  );
}
describe("Sprint 3A rendered interactions", () => {
  it.each(journeyRoutes)(
    "renders %s with explicit preview boundaries",
    (path) => {
      page(path);
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      expect(screen.getByText(/Authentication is disabled/)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Use dark theme" }),
      ).toBeTruthy();
    },
  );
  it("focuses the first invalid field and shows accessible errors, then invalid credentials", async () => {
    const user = userEvent.setup();
    page("/auth/sign-in");
    await user.click(screen.getByRole("button", { name: "Validate preview" }));
    const email = screen.getByLabelText("Email address");
    expect(document.activeElement).toBe(email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    await user.type(email, "invented@example.test");
    await user.type(screen.getByLabelText("Preview password"), "invented-only");
    await user.click(screen.getByRole("button", { name: "Validate preview" }));
    expect(
      screen
        .getByRole("button", { name: "Loading preview…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await screen.findByText(/Preview: invalid email or password/);
    expect(
      (screen.getByLabelText("Preview password") as HTMLInputElement).value,
    ).toBe("");
  });
  it("presents recovery without claiming email delivery", async () => {
    const user = userEvent.setup();
    page("/auth/forgot-password");
    await user.type(
      screen.getByLabelText("Email address"),
      "invented@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Validate preview" }));
    expect(await screen.findByText(/No email was sent/)).toBeTruthy();
  });
  it("transitions registration to verification without creating an account", async () => {
    const user = userEvent.setup();
    page("/auth/create-account");
    await user.type(screen.getByLabelText("Full name"), "Invented Person");
    await user.type(
      screen.getByLabelText("Email address"),
      "invented@example.test",
    );
    await user.type(
      screen.getByLabelText("Preview password", { exact: true }),
      "invented-only-value",
    );
    await user.type(
      screen.getByLabelText("Confirm preview password"),
      "invented-only-value",
    );
    await user.click(screen.getByRole("button", { name: "Validate preview" }));
    expect(await screen.findByText(/No account was created/)).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Verification preview state"),
      "expired",
    );
    expect(screen.getByRole("status").textContent).toContain("expired");
    await user.selectOptions(
      screen.getByLabelText("Verification preview state"),
      "verified",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "has not been verified",
    );
  });
  it("reviews organization creation and completion without claiming persistence", async () => {
    const user = userEvent.setup();
    page("/onboarding/create");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "between 2 and 120",
    );
    await user.type(
      screen.getByLabelText("Organization name"),
      "Invented Studio",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Industry"), "Design");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Invented Studio")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Preview completion" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "has not been created",
    );
  });
  it("switches tenant navigation, clears context on expiration, and supports keyboard selection", async () => {
    const user = userEvent.setup();
    page("/onboarding/dashboard");
    const select = screen.getByRole("combobox", {
      name: "Preview organization context",
    });
    select.focus();
    await user.tab();
    expect(document.activeElement).not.toBe(select);
    await user.selectOptions(select, "preview-living");
    expect(screen.getByText("Billing configuration")).toBeTruthy();
    await user.selectOptions(select, "preview-studio");
    expect(screen.queryByText("Billing configuration")).toBeNull();
    expect(screen.getByText(/No administrative navigation/)).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Session expired" }));
    expect(screen.getByRole("status").textContent).toContain("expired");
    await user.click(screen.getByRole("link", { name: "Onboarding" }));
    await user.click(
      screen.getByRole("link", { name: "Join an existing organization" }),
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
    await user.click(screen.getByLabelText("Show empty organization state"));
    expect(screen.getByText("No organizations yet")).toBeTruthy();
  });
  it("presents invitation lifecycle, authentication requirements and new-user link", async () => {
    const user = userEvent.setup();
    page("/auth/invitation");
    expect(screen.getByRole("status").textContent).toContain(
      "Authentication is required",
    );
    await user.selectOptions(
      screen.getByLabelText("Recipient experience"),
      "new",
    );
    expect(
      screen
        .getByRole("link", { name: "Create account preview" })
        .getAttribute("href"),
    ).toBe("/auth/create-account");
    for (const state of ["expired", "revoked", "accepted"]) {
      await user.selectOptions(
        screen.getByLabelText("Invitation state"),
        state,
      );
      expect(screen.getByRole("status").textContent?.toLowerCase()).toContain(
        state,
      );
    }
    expect(
      screen
        .getByRole("button", { name: "Accept invitation unavailable" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("toggles themes and retains skip navigation", async () => {
    const user = userEvent.setup();
    page("/auth/sign-in");
    await user.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(
      screen.getByRole("button", { name: "Use light theme" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#journey-main");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy(),
    );
  });
});

describe("Sprint 3B member listing preview", () => {
  it("loads sample members, clears them on tenant switching and presents empty and error states", async () => {
    const user = userEvent.setup();
    page("/onboarding/dashboard");
    const select = screen.getByLabelText("Preview organization context");
    await user.selectOptions(select, "preview-studio");
    expect(await screen.findByText("preview-studio-owner")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Member listing state"), "empty");
    expect(screen.getByText("No sample members to display.")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Member listing state"), "error");
    expect(screen.getByRole("alert").textContent).toContain("unavailable");
    await user.selectOptions(select, "preview-living");
    expect(await screen.findByText("preview-person")).toBeTruthy();
    expect(screen.queryByText("preview-studio-owner")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear preview context" }));
    expect(screen.queryByLabelText("Member listing state")).toBeNull();
  });
});
