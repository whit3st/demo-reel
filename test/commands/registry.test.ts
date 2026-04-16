import { describe, expect, it } from "vitest";
import { CommandRegistry, createDefaultRegistry } from "../../src/commands/registry.js";
import type { Command, GlobalOptions } from "../../src/commands/types.js";

function createCommand(name: string): Command {
  return {
    name,
    validate: (_args: string[], _options: GlobalOptions) => true,
    execute: async () => 0,
  };
}

describe("CommandRegistry", () => {
  it("returns null when args list empty", () => {
    const registry = new CommandRegistry();

    expect(registry.find([])).toBeNull();
  });

  it("finds command by first arg", () => {
    const registry = new CommandRegistry();
    const command = createCommand("run");
    registry.register(command);

    expect(registry.find(["run"])).toBe(command);
  });

  it("returns null when command not registered", () => {
    const registry = new CommandRegistry();
    registry.register(createCommand("run"));

    expect(registry.find(["script"])).toBeNull();
  });

  it("returns registered commands in insertion order", () => {
    const registry = new CommandRegistry();
    const first = createCommand("run");
    const second = createCommand("script");
    registry.register(first);
    registry.register(second);

    expect(registry.getAll()).toEqual([first, second]);
  });
});

describe("createDefaultRegistry", () => {
  it("creates empty registry", () => {
    const registry = createDefaultRegistry();

    expect(registry.getAll()).toEqual([]);
  });
});
