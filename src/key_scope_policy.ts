export type ReviewedKey = {
  id: string;
  name: string;
  scopes: string[];
  project_id?: string;
  status?: string;
};

export type KeyDecision = ReviewedKey & {
  decision: "retain" | "review" | "revoke";
  excess_scopes: string[];
  missing_scopes: string[];
};

export function decideKeyAccess(
  lifecycle: "onboarding" | "active" | "offboarding",
  requiredScopes: string[],
  keys: ReviewedKey[],
): KeyDecision[] {
  return keys.map((key) => {
    const excessScopes = key.scopes.filter((scope) => !requiredScopes.includes(scope));
    const missingScopes = requiredScopes.filter((scope) => !key.scopes.includes(scope));
    const decision = lifecycle === "offboarding"
      ? "revoke"
      : excessScopes.length > 0 || missingScopes.length > 0
        ? "review"
        : "retain";
    return { ...key, decision, excess_scopes: excessScopes, missing_scopes: missingScopes };
  });
}
