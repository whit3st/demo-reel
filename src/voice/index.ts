import type { TTSProvider } from "./types.js";

const providers = new Map<string, TTSProvider>();

export function registerTTSProvider(provider: TTSProvider): void {
  providers.set(provider.name, provider);
}

export function getTTSProvider(name: string): TTSProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(
      `Unknown TTS provider: "${name}". Available: ${[...providers.keys()].join(", ")}`,
    );
  }
  return provider;
}

export function getAvailableProviders(): string[] {
  return [...providers.keys()];
}
