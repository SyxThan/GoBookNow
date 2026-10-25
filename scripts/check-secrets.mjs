import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Small offline guard, not a substitute for provider-side secret scanning.
// Report locations/rule names only: never echo matched credentials.
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  ],
  ["sentry-auth-token", /\bsntrys_[A-Za-z0-9_-]{35,}\b/],
  [
    "bearer-token",
    /Bearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16,}/,
  ],
];
const knownSynthetic =
  /(?:test|tests|testing|e2e|integration|ci-only|change-me|placeholder|example|synthetic)/i;
function violations(path, source) {
  const found = [];
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith(".example"))
    found.push([1, "tracked-runtime-env"]);
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (
      /^\s*NEXT_PUBLIC_(?:JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|SEPAY_SECRET_KEY|SEPAY_IPN_SECRET|TICKET_TOKEN_SECRET|SENTRY_AUTH_TOKEN|DATABASE_URL|CLOUDINARY_API_SECRET)\s*[:=]/.test(
        line,
      )
    )
      found.push([index + 1, "public-server-secret"]);
    for (const [name, pattern] of rules)
      if (pattern.test(line)) found.push([index + 1, name]);
    // Check actual literal environment assignments, including accidental server
    // secrets exposed through NEXT_PUBLIC_. Blank values/references are fine.
    const assignment = line.match(
      /^\s*(?:NEXT_PUBLIC_)?(?:JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|SEPAY_SECRET_KEY|SEPAY_IPN_SECRET|TICKET_TOKEN_SECRET|SENTRY_AUTH_TOKEN)\s*[:=]\s*['"]?([^'"\s,}]+)/,
    );
    const fixture = /(?:\.spec\.[jt]sx?$|(?:^|\/)test\/)/.test(path);
    const reference =
      assignment &&
      /^[A-Z][A-Z_]+$/.test(assignment[1]) &&
      !/(^|\/)\.env/.test(path);
    if (
      assignment &&
      assignment[1] &&
      !reference &&
      !(fixture && /secret/i.test(assignment[1])) &&
      !knownSynthetic.test(assignment[1]) &&
      !/^\$|process\.|undefined|null/.test(assignment[1])
    )
      found.push([index + 1, "literal-secret-assignment"]);
  }
  return found;
}
// Self-check the scanner without storing a usable credential fixture.
assert.equal(
  violations(
    "src/sample.ts",
    `const token = "${"gh" + "p_"}${"x".repeat(36)}";`,
  ).length,
  1,
);
assert.equal(violations("apps/backend/.env", "EMPTY=").length, 1);
assert.equal(
  violations(".env.example", "JWT_ACCESS_SECRET=change-me").length,
  0,
);
assert.equal(violations(".env.example", "SENTRY_AUTH_TOKEN=").length, 0);
assert.equal(
  violations(".env.example", "NEXT_PUBLIC_SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN")
    .length,
  1,
);

const paths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
let failures = 0;
for (const path of paths) {
  if (
    !/\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql|example|txt)$|(^|\/)\.env(?:\.|$)/.test(
      path,
    ) ||
    /(?:^|\/)pnpm-lock\.yaml$/.test(path)
  )
    continue;
  const source = readFileSync(path, "utf8");
  for (const [line, rule] of violations(path, source)) {
    console.error(`${path}:${line}: ${rule}`);
    failures++;
  }
}
if (failures) {
  console.error(
    `Secret scan failed: ${failures} location(s); values suppressed.`,
  );
  process.exitCode = 1;
} else
  console.log(
    `Secret scan passed (${paths.length} tracked paths; scanner self-check passed).`,
  );
