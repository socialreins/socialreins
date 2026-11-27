// Reads the JSON of `npm audit --omit=dev --json` and decides the build: high and critical fail
// the job, moderate is reported as a warning, low and info are only counted.
// Usage: node .github/scripts/npm-audit.mjs <audit.json>
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("npm-audit: pass the path to the audit JSON as the first argument");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  // An empty or unreadable report means npm audit itself failed (no lockfile, registry down).
  // Failing here is deliberate: a silent pass would hide the audit not running at all.
  console.error(`npm-audit: could not read ${path}: ${error.message}`);
  process.exit(1);
}

if (report.error) {
  console.error(`npm-audit: npm audit failed: ${report.error.summary ?? report.error.code ?? "unknown error"}`);
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
const advisories = Object.values(report.vulnerabilities ?? {});

for (const advisory of advisories) {
  const titles = (advisory.via ?? [])
    .map((via) => (typeof via === "string" ? via : via.title))
    .filter(Boolean);
  const fix = advisory.fixAvailable ? "fix available" : "no fix available";
  console.log(`- ${advisory.name} (${advisory.severity}): ${titles.join("; ") || "advisory"} [${fix}]`);
}

const total = counts.total ?? 0;
console.log(
  `npm audit --omit=dev: ${total} vulnerabilities ` +
    `(critical ${counts.critical ?? 0}, high ${counts.high ?? 0}, moderate ${counts.moderate ?? 0}, ` +
    `low ${counts.low ?? 0}, info ${counts.info ?? 0})`,
);

if ((counts.critical ?? 0) > 0 || (counts.high ?? 0) > 0) {
  console.log(
    `::error title=npm audit::${counts.critical ?? 0} critical and ${counts.high ?? 0} high advisories in production dependencies`,
  );
  process.exit(1);
}

if ((counts.moderate ?? 0) > 0) {
  console.log(`::warning title=npm audit::${counts.moderate} moderate advisories in production dependencies`);
}
