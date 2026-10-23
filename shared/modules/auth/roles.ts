export const APP_ROLE_VALUES = [
  "unassigned",
  "marketing",
  "owner",
  "manager",
  "spv",
  "designer",
  "mpp",
  "admin",
  "superadmin",
  "qc1",
  "qc2",
] as const;

export type AppRoleValue = (typeof APP_ROLE_VALUES)[number];
export type AppRole = AppRoleValue;

export const ROLES = [
  "marketing",
  "owner",
  "manager",
  "spv",
  "designer",
  "mpp",
  "admin",
  "qc1",
  "qc2",
] as const;

export const APP_ROLE_LABELS: Record<string, string> = {
  unassigned: "Belum diberi akses",
  marketing: "Marketing",
  owner: "Owner",
  manager: "Manager",
  spv: "SPV Lokal",
  designer: "Designer",
  mpp: "MPP",
  admin: "Admin operasional",
  superadmin: "Administrator aplikasi",
  qc1: "QC Checker 1",
  qc2: "QC Checker 2",
};

export function canSeeAllTickets(role: string) {
  return ["owner", "manager", "spv", "admin", "mpp", "qc1", "qc2"].includes(role);
}
