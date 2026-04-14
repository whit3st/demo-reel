import type { Command } from "./types.js";

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  find(args: string[]): Command | null {
    if (args.length === 0) {
      return null; // No command specified
    }

    const firstArg = args[0];

    // Direct command match
    if (this.commands.has(firstArg)) {
      return this.commands.get(firstArg)!;
    }

    return null;
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }
}

export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  // Commands will be registered here
  return registry;
}
