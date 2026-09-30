import { z } from "zod";
import type { InfraiControlPlane } from "./infrai_control_plane.ts";
import { decideKeyAccess, type KeyDecision, type ReviewedKey } from "./key_scope_policy.ts";

export const accessReviewRequestSchema = z.object({
  tenant_id: z.string().min(1),
  tenant_name: z.string().min(1),
  lifecycle: z.enum(["onboarding", "active", "offboarding"]),
  required_scopes: z.array(z.string()).min(1),
  review_date: z.string().date(),
}).strict();

export type AccessReviewRequest = z.infer<typeof accessReviewRequestSchema>;

const keySchema = z.object({
  id: z.string(),
  name: z.string().default("Unnamed key"),
  scopes: z.array(z.string()).default([]),
  project_id: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

function readKeys(data: unknown): ReviewedKey[] {
  const candidates = Array.isArray(data)
    ? data
    : z.object({ items: z.array(z.unknown()) }).passthrough().parse(data).items;
  return z.array(keySchema).parse(candidates);
}

function renderMarkdown(input: AccessReviewRequest, decisions: KeyDecision[]): string {
  const rows = decisions.length === 0
    ? "| none | none | review |"
    : decisions.map((key) =>
      `| ${key.name} | ${key.scopes.join(", ") || "none"} | ${key.decision} |`,
    ).join("\n");

  return [
    `# Access review: ${input.tenant_name}`,
    "",
    `Review date: ${input.review_date}`,
    `Tenant: ${input.tenant_id}`,
    `Lifecycle: ${input.lifecycle}`,
    "",
    "| Key | Current scopes | Decision |",
    "| --- | --- | --- |",
    rows,
  ].join("\n");
}

export async function runTenantAccessReview(client: InfraiControlPlane, raw: unknown) {
  const input = accessReviewRequestSchema.parse(raw);
  const keys = readKeys(await client.listKeys());
  const decisions = decideKeyAccess(input.lifecycle, input.required_scopes, keys);
  const markdown = renderMarkdown(input, decisions);
  const document = await client.generatePdf({
    markdown,
    page_size: "A4",
    orientation: "portrait",
    store: true,
  });
  return { tenant_id: input.tenant_id, review_date: input.review_date, decisions, document };
}
