import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_PALETTE_ACTIONS, ADMIN_PALETTE_PAGES } from "../command-palette.ts";
import {
  ADMIN_PALETTE_ACTION_PERMISSIONS,
  ADMIN_PERMISSIONS,
  ADMIN_ROUTE_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  NO_STAFF_ACCESS,
  canGrantRole,
  canManageStaffMember,
  canUsePaletteEntry,
  canViewAdminPath,
  firstViewableAdminHref,
  hasPermission,
  permissionForAdminPath,
  permissionsByArea,
  type StaffAccessSnapshot,
} from "../staff-permissions.ts";

const staff = (...permissions: string[]): StaffAccessSnapshot => ({
  isStaff: true,
  roleSlug: "custom_test",
  roleName: "Test",
  isSuperAdmin: false,
  permissions,
});

const SUPER: StaffAccessSnapshot = {
  isStaff: true,
  roleSlug: "super_admin",
  roleName: "Super Admin",
  isSuperAdmin: true,
  permissions: [...ALL_ADMIN_PERMISSIONS],
};

describe("staff permissions (G10)", () => {
  it("has 30 unique codes, each in exactly one area group", () => {
    assert.equal(ALL_ADMIN_PERMISSIONS.length, 30);
    assert.equal(new Set(ALL_ADMIN_PERMISSIONS).size, 30);
    const grouped = permissionsByArea().flatMap((group) => group.permissions);
    assert.deepEqual([...grouped].sort(), [...ALL_ADMIN_PERMISSIONS].sort());
  });

  it("grants nothing to someone who is not staff, whatever the code", () => {
    for (const code of ALL_ADMIN_PERMISSIONS) assert.equal(hasPermission(NO_STAFF_ACCESS, code), false);
    assert.equal(canViewAdminPath(NO_STAFF_ACCESS, "/admin"), false);
  });

  it("gives a Super Admin every page, including ones without rows", () => {
    for (const { href } of ADMIN_ROUTE_PERMISSIONS) assert.equal(canViewAdminPath(SUPER, href), true, href);
    // An /admin page nobody mapped yet: only a Super Admin is let in.
    assert.equal(canViewAdminPath(SUPER, "/admin/brand-new"), true);
    assert.equal(canViewAdminPath(staff(ADMIN_PERMISSIONS.workspacesRead), "/admin/brand-new"), false);
  });

  it("matches the longest route prefix, so nested pages inherit their section", () => {
    assert.equal(permissionForAdminPath("/admin"), null);
    assert.equal(permissionForAdminPath("/admin/workspaces/acme"), ADMIN_PERMISSIONS.workspacesRead);
    assert.equal(permissionForAdminPath("/admin/email-templates/auth.verify-email"), ADMIN_PERMISSIONS.contentEmailTemplates);
    assert.equal(permissionForAdminPath("/admin/roles"), ADMIN_PERMISSIONS.staffRead);
  });

  it("shows Support the workspaces but not the plans, and every staff member the landing page", () => {
    const support = staff(ADMIN_PERMISSIONS.workspacesRead, ADMIN_PERMISSIONS.accountsRead);
    assert.equal(canViewAdminPath(support, "/admin/workspaces"), true);
    assert.equal(canViewAdminPath(support, "/admin/plans"), false);
    assert.equal(canViewAdminPath(support, "/admin"), true);
    assert.equal(firstViewableAdminHref(support), "/admin");
  });

  it("maps every palette action to a permission, and filters pages and actions by it", () => {
    for (const action of ADMIN_PALETTE_ACTIONS) {
      assert.ok(ADMIN_PALETTE_ACTION_PERMISSIONS[action.id], `palette action ${action.id} has no permission`);
    }
    const content = staff(ADMIN_PERMISSIONS.contentAnnouncements);
    const pages = ADMIN_PALETTE_PAGES.filter((entry) => canUsePaletteEntry(content, entry)).map((entry) => entry.id);
    assert.ok(pages.includes("announcements"));
    assert.ok(!pages.includes("billing"));
    const actions = ADMIN_PALETTE_ACTIONS.filter((entry) => canUsePaletteEntry(content, entry)).map((entry) => entry.id);
    assert.deepEqual(actions, ["composeAnnouncement"]);
  });

  it("lets a staff manager grant only roles within their own permissions, and Super Admin only as a Super Admin", () => {
    const lead = staff(ADMIN_PERMISSIONS.staffManage, ADMIN_PERMISSIONS.staffRead, ADMIN_PERMISSIONS.workspacesRead);
    assert.equal(canGrantRole(lead, { isSuperAdmin: false, permissions: [ADMIN_PERMISSIONS.workspacesRead] }), true);
    assert.equal(canGrantRole(lead, { isSuperAdmin: false, permissions: [ADMIN_PERMISSIONS.billingRead] }), false);
    assert.equal(canGrantRole(lead, { isSuperAdmin: true, permissions: [] }), false);
    assert.equal(canGrantRole(SUPER, { isSuperAdmin: true, permissions: [] }), true);
    assert.equal(canGrantRole(staff(ADMIN_PERMISSIONS.staffRead), { isSuperAdmin: false, permissions: [] }), false);
  });

  it("never offers someone their own access, or someone who holds more", () => {
    const lead = staff(ADMIN_PERMISSIONS.staffManage, ADMIN_PERMISSIONS.workspacesRead);
    const target = { userId: "b", isSuperAdmin: false, rolePermissions: [ADMIN_PERMISSIONS.workspacesRead] };
    assert.equal(canManageStaffMember(lead, "a", target), true);
    assert.equal(canManageStaffMember(lead, "b", target), false);
    assert.equal(canManageStaffMember(lead, "a", { ...target, rolePermissions: [ADMIN_PERMISSIONS.billingRead] }), false);
    assert.equal(canManageStaffMember(lead, "a", { ...target, isSuperAdmin: true }), false);
    assert.equal(canManageStaffMember(SUPER, "a", { ...target, isSuperAdmin: true }), true);
    assert.equal(canManageStaffMember(SUPER, "b", target), false);
  });
});
