import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function parseArgs(argv) {
  const [auditPath, outputPath] = argv;

  if (!auditPath || !outputPath) {
    throw new Error("Usage: node scripts/write-security-badge.mjs <audit-path> <output-path>");
  }

  return { auditPath, outputPath };
}

function pickColor(vulns) {
  if (vulns.critical > 0) return "red";
  if (vulns.high > 0) return "orange";
  if (vulns.moderate > 0) return "yellow";
  return "brightgreen";
}

function buildMessage(vulns) {
  const parts = [];
  if (vulns.critical > 0) parts.push(`${vulns.critical} critical`);
  if (vulns.high > 0) parts.push(`${vulns.high} high`);
  if (vulns.moderate > 0) parts.push(`${vulns.moderate} moderate`);
  if (parts.length === 0) return "none";
  return parts.join(", ");
}

async function main() {
  const { auditPath, outputPath } = parseArgs(process.argv.slice(2));
  const raw = await readFile(auditPath, "utf-8");
  const audit = JSON.parse(raw);
  const vulns = audit.metadata?.vulnerabilities ?? {};
  const message = buildMessage(vulns);

  const badge = {
    schemaVersion: 1,
    label: "vulnerabilities",
    message,
    color: pickColor(vulns),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(badge, null, 2)}\n`, "utf-8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
