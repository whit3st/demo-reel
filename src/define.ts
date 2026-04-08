/**
 * Standalone config helpers with zero imports.
 * This file is the entry point for consumer imports to avoid circular deps.
 */

/** Type-safe config helper. Just returns the input — types do the work. */
export function defineConfig<T>(config: T): T {
	return config;
}

/** Alias for defineConfig */
export const demo = defineConfig;
