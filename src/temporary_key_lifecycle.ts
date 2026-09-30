import { randomUUID } from "node:crypto";
import { z } from "zod";
import { controlPlaneFromEnvironment } from "./infrai_control_plane.ts";

const createdKeySchema = z.object({ id: z.string() }).passthrough();

async function demonstrateTemporaryKeyLifecycle(): Promise<void> {
  const client = controlPlaneFromEnvironment();
  const runId = randomUUID();
  const created = createdKeySchema.parse(await client.createTemporaryKey({
    name: `access-review-demo-${runId}`,
    scopes: ["account.keys.list", "pdf.generate"],
    idempotency_key: `create-${runId}`,
  }));

  console.log(`Temporary key ${created.id} created. Store its plaintext value now; it cannot be retrieved again.`);
  await client.rotateTemporaryKey(created.id, {
    grace_hours: 1,
    idempotency_key: `rotate-${runId}`,
  });
  console.log(`Temporary key ${created.id} rotated with a one-hour overlap.`);

  await client.revokeTemporaryKey(created.id);
  console.log(`Temporary key ${created.id} revoked. The active INFRAI_API_KEY was not changed.`);
}

await demonstrateTemporaryKeyLifecycle();
