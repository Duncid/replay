import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageTune, canReplaceSystemTune } from "../_shared/tune-rules.ts";

const owner = "u1", other = "u2", admin = "a1";
const account = { owner_user_id: owner, is_global: false };
const system = { owner_user_id: admin, is_global: true };

test("owners manage their own account tunes", () => {
  assert.equal(canManageTune("rename", account, owner, false), true);
  assert.equal(canManageTune("delete", account, owner, false), true);
});
test("other users cannot manage someone else's account tune", () => {
  assert.equal(canManageTune("delete", account, other, false), false);
  assert.equal(canManageTune("rename", account, other, false), false);
});
test("only admins edit or remove system tunes", () => {
  assert.equal(canManageTune("delete", system, owner, false), false);
  assert.equal(canManageTune("rename", system, admin, false), false); // owning it is not enough
  assert.equal(canManageTune("delete", system, admin, true), true);
});
test("only admins promote, demote or replace", () => {
  for (const a of ["promote", "demote", "replace-system"]) {
    assert.equal(canManageTune(a, account, owner, false), false);
    assert.equal(canManageTune(a, account, admin, true), true);
  }
});
test("replace needs a system target and the admin's own account tune", () => {
  const mine = { owner_user_id: admin, is_global: false };
  assert.equal(canReplaceSystemTune(system, mine, admin, true), true);
  assert.equal(canReplaceSystemTune(system, account, admin, true), false);
  assert.equal(canReplaceSystemTune(account, mine, admin, true), false);
  assert.equal(canReplaceSystemTune(system, mine, admin, false), false);
});
