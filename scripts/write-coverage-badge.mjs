import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function parseArgs(argv) {
  const [summaryPath, outputPath] = argv;

  if (!summaryPath || !outputPath) {
    throw new Error("Usage: node scripts/write-coverage-badge.mjs <summary-path> <output-path>");
  }

  return { summaryPath, outputPath };
}

function pickColor(coverage) {
  if (coverage >= 90) return "brightgreen";
  if (coverage >= 80) return "green";
  if (coverage >= 70) return "yellow";
  if (coverage >= 60) return "orange";
  return "red";
}

async function main() {
  const { summaryPath, outputPath } = parseArgs(process.argv.slice(2));
  const raw = await readFile(summaryPath, "utf-8");
  const summary = JSON.parse(raw);
  const coverage = Number(summary.total?.lines?.pct ?? 0).toFixed(1);

  const badge = {
    schemaVersion: 1,
    label: "coverage",
    message: `${coverage}%`,
    color: pickColor(Number(coverage)),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(badge, null, 2)}\n`, "utf-8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
