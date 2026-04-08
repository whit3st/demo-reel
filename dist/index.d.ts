export interface DemoConfig {
	video?: { resolution?: "HD" | "FHD" | "2K" | "4K" | { width: number; height: number } };
	cursor?: "dot" | "arrow" | "none";
	motion?: "smooth" | "snappy" | "instant";
	typing?: "humanlike" | "fast" | "instant";
	timing?: "normal" | "fast" | "instant";
	name?: string;
	outputDir?: string;
	outputFormat?: "webm" | "mp4";
	voice?: {
		provider?: "piper" | "openai" | "elevenlabs";
		voice?: string;
		speed?: number;
		pronunciation?: Record<string, string>;
	};
	auth?: {
		loginSteps: Step[];
		validate: { protectedUrl: string; successIndicator: SelectorConfig };
		storage: { name: string; types: ("cookies" | "localStorage")[] };
		behavior?: { autoReauth?: boolean; forceReauth?: boolean; clearInvalid?: boolean };
	};
	setup?: Step[];
	cleanup?: Step[];
	scenes?: { narration: string; stepIndex: number; isIntro?: boolean }[];
	steps: Step[];
	audio?: { narration?: string; narrationDelay?: number; background?: string; backgroundVolume?: number };
	randomization?: { seed?: string | number };
	tags?: string[];
	timestamp?: boolean;
}

export interface SelectorConfig {
	strategy: "testId" | "id" | "class" | "href" | "data-node-id" | "custom";
	value: string;
	index?: number;
}

export type Step =
	| { action: "goto"; url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle" }
	| { action: "click"; selector: SelectorConfig; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "hover"; selector: SelectorConfig; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "type"; selector: SelectorConfig; text: string; clear?: boolean; delayMs?: number; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "press"; selector: SelectorConfig; key: string; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "scroll"; selector: SelectorConfig; x: number; y: number; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "select"; selector: SelectorConfig; value: string | string[]; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "check"; selector: SelectorConfig; checked: boolean; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "upload"; selector: SelectorConfig; filePath: string | string[]; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "drag"; source: SelectorConfig; target: SelectorConfig; delayBeforeMs?: number; delayAfterMs?: number }
	| { action: "wait"; ms: number }
	| { action: "waitFor"; kind: "selector"; selector: SelectorConfig; state?: "attached" | "detached" | "visible" | "hidden"; timeoutMs?: number }
	| { action: "waitFor"; kind: "url"; url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeoutMs?: number }
	| { action: "waitFor"; kind: "loadState"; state?: "load" | "domcontentloaded" | "networkidle"; timeoutMs?: number }
	| { action: "waitFor"; kind: "request"; url: string; timeoutMs?: number }
	| { action: "waitFor"; kind: "response"; url: string; timeoutMs?: number }
	| { action: "waitFor"; kind: "function"; expression: string; arg?: unknown; polling?: "raf" | number; timeoutMs?: number };

export interface GenerateOptions {
	verbose?: boolean;
	noDocker?: boolean;
}

/** Type-safe config helper. Returns config unchanged — types do the work. */
export declare function defineConfig(config: DemoConfig): DemoConfig;

/** Alias for defineConfig */
export declare const demo: typeof defineConfig;

/** Generate a demo video from a config object. Runs via Docker or locally. */
export declare function generate(config: DemoConfig, options?: GenerateOptions): Promise<void>;
