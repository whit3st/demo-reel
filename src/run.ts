import type { DemoReelConfigInput } from "./schemas.js";

export interface RunOptions {
  verbose?: boolean;
  dryRun?: boolean;
  headed?: boolean;
  silent?: boolean;
}

function resolveArg(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export async function run(config: DemoReelConfigInput, options: RunOptions = {}): Promise<void> {
  const argv = process.argv.slice(2);

  const verbose = options.verbose ?? resolveArg(argv, "--verbose");
  const dryRun = options.dryRun ?? resolveArg(argv, "--dry-run");
  const headed = options.headed ?? resolveArg(argv, "--headed");
  const silent = options.silent ?? resolveArg(argv, "--silent");

  let finalConfig = config;

  if (silent) {
    finalConfig = { ...finalConfig, voice: undefined, outputFormat: "webm" as const };

    if (finalConfig.outputPath?.endsWith(".mp4")) {
      finalConfig = {
        ...finalConfig,
        outputPath: finalConfig.outputPath.replace(/\.mp4$/, ".webm"),
      };
    }

    if (finalConfig.scenes) {
      finalConfig = {
        ...finalConfig,
        scenes: finalConfig.scenes.map((s) => ({ ...s, narration: "" })),
      };
    }
  }

  const { generate } = await import("./index.js");
  await generate(finalConfig, { verbose, dryRun, headed });
}
