export const DATABASE_MIGRATIONS = [
  "001-management",
  "002-operations",
  "003-github",
  "004-private-dashboards",
  "005-community-roles",
  "006-registration-communities",
];

export function assertExpectedMigrations(actual) {
  if (JSON.stringify(actual) !== JSON.stringify(DATABASE_MIGRATIONS)) {
    throw new Error("Unexpected database migration state.");
  }
}
