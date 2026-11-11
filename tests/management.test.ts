import test from "node:test";
import assert from "node:assert/strict";
import { email, teamName, password, ManagementError } from "../src/lib/management/validation.ts";
import { hashPassword, verifyPassword, token, digest } from "../src/lib/management/crypto.ts";
import { requireStaff, type User } from "../src/lib/management/service.ts";

test("management validates identity, team names and credentials", () => {
  assert.equal(email(" TEST@example.COM "), "test@example.com");
  assert.deepEqual(teamName("  Equipo   UNO "), { name: "Equipo UNO", key: "equipo uno" });
  assert.throws(() => email("invalid"), ManagementError);
  assert.throws(() => password("short"), ManagementError);
  assert.throws(() => teamName(" "), ManagementError);
});
test("credentials are salted and tokens stored as digests", async () => {
  const first = await hashPassword("password-for-testing");
  const second = await hashPassword("password-for-testing");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("password-for-testing", first), true);
  assert.equal(await verifyPassword("another-password", first), false);
  const value = token();
  assert.equal(value.length, 64);
  assert.notEqual(value, digest(value));
});
test("pending and removed staff never get administrative permissions", () => {
  const user: User = { id: "test", email: "test@example.test", first_name: "Test", last_name: "Test", verified_at: new Date(), staff_status: "pending", is_owner: false };
  assert.throws(() => requireStaff(user), ManagementError);
  assert.throws(() => requireStaff({ ...user, staff_status: "removed" }), ManagementError);
  assert.doesNotThrow(() => requireStaff({ ...user, staff_status: "approved" }));
});
