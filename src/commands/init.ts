import { join } from "path";
import type { Command, CommandContext, GlobalOptions } from "./types.js";

const EXAMPLE_SCENARIO = `import { defineConfig } from 'demo-reel';

export default defineConfig({
  video: {
    resolution: "FHD",
  },

  name: 'example',

  cursor: 'dot',
  motion: 'smooth',
  typing: 'humanlike',
  timing: 'normal',

  steps: [
    { action: 'goto', url: 'https://example.com' },
    { action: 'wait', ms: 1000 },
  ],
});
`;

export class InitCommand implements Command {
  readonly name = "init";

  validate(args: string[]): boolean {
    // init takes no positional arguments
    return args.length === 0;
  }

  async execute(
    _args: string[],
    _options: GlobalOptions,
    ctx: CommandContext,
  ): Promise<number> {
    const demoPath = join(ctx.cwd(), "example.demo.ts");
    await ctx.fs.writeFile(demoPath, EXAMPLE_SCENARIO, "utf-8");
    ctx.console.log(`Created ${demoPath}`);
    return 0;
  }
}
