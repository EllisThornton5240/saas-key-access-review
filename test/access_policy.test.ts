import assert from "node:assert/strict";
import test from "node:test";
import { decideKeyAccess } from "../src/key_scope_policy.ts";

test("offboarding marks every tenant key for revocation", () => {
  const decisions = decideKeyAccess("offboarding", ["account.keys.list"], [
    { id: "key-a", name: "billing sync", scopes: ["account.keys.list"] },
    { id: "key-b", name: "old admin", scopes: ["account.keys.list", "pdf.generate"] },
  ]);

  assert.deepEqual(decisions.map(({ id, decision }) => ({ id, decision })), [
    { id: "key-a", decision: "revoke" },
    { id: "key-b", decision: "revoke" },
  ]);
});

test("active tenants retain exact scope matches and review drift", () => {
  const decisions = decideKeyAccess("active", ["account.keys.list"], [
    { id: "key-a", name: "auditor", scopes: ["account.keys.list"] },
    { id: "key-b", name: "broad key", scopes: ["account.keys.list", "pdf.generate"] },
  ]);

  assert.equal(decisions[0]?.decision, "retain");
  assert.equal(decisions[1]?.decision, "review");
  assert.deepEqual(decisions[1]?.excess_scopes, ["pdf.generate"]);
});
