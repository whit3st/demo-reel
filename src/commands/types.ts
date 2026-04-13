import type { WriteFile } from "../interfaces.js";

export interface GlobalOptions {
  verbose: boolean;
  dryRun: boolean;
  headed?: boolean;
  outputDir?: string;
  tags?: string[];
}

export interface CommandContext {
  fs: {
    writeFile: WriteFile;
  };
  cwd: () => string;
  console: {
    log: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export interface Command {
  readonly name: string;
  validate(args: string[], options: GlobalOptions): boolean;
  execute(args: string[], options: GlobalOptions, ctx: CommandContext): Promise<number>;
}
