import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Pure utility functions (no mocks needed) ──────────────────────
import {
  formatTimecode,
  generateSRT,
  generateVTT,
  buildSubtitleCues,
  buildSubtitleCuesWithNarrationPlacements,
  generateMetadata,
  setOnBrowserCreated,
  type SubtitleCue,
} from "../src/video-handler.js";

// ── formatTimecode ────────────────────────────────────────────────
describe("formatTimecode", () => {
  it("formats zero", () => {
    expect(formatTimecode(0, ",")).toBe("00:00:00,000");
  });

  it("formats millis only", () => {
    expect(formatTimecode(42, ",")).toBe("00:00:00,042");
  });

  it("formats seconds + millis", () => {
    expect(formatTimecode(12345, ",")).toBe("00:00:12,345");
  });

  it("formats minutes + seconds + millis", () => {
    expect(formatTimecode(123456, ",")).toBe("00:02:03,456");
  });

  it("formats hours", () => {
    expect(formatTimecode(3661001, ",")).toBe("01:01:01,001");
  });

  it("uses custom separator", () => {
    expect(formatTimecode(500, ".")).toBe("00:00:00.500");
  });

  it("handles large values", () => {
    expect(formatTimecode(7200000, ",")).toBe("02:00:00,000");
  });
});

// ── generateSRT ───────────────────────────────────────────────────
describe("generateSRT", () => {
  it("generates single cue", () => {
    const cues: SubtitleCue[] = [{ narration: "Hello", startMs: 0, endMs: 1000, isIntro: false }];
    const srt = generateSRT(cues);

    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,000\nHello\n");
  });

  it("generates multiple cues", () => {
    const cues: SubtitleCue[] = [
      { narration: "First", startMs: 0, endMs: 500, isIntro: false },
      { narration: "Second", startMs: 500, endMs: 1000, isIntro: false },
    ];
    const srt = generateSRT(cues);

    expect(srt).toContain("1\n");
    expect(srt).toContain("2\n");
    expect(srt).toContain("First\n");
    expect(srt).toContain("Second\n");
  });

  it("handles empty array", () => {
    expect(generateSRT([])).toBe("");
  });
});

// ── generateVTT ───────────────────────────────────────────────────
describe("generateVTT", () => {
  it("starts with WEBVTT header", () => {
    const cues: SubtitleCue[] = [{ narration: "Test", startMs: 0, endMs: 1000, isIntro: false }];
    const vtt = generateVTT(cues);

    expect(vtt).toMatch(/^WEBVTT/);
  });

  it("uses dot separator in timecodes", () => {
    const cues: SubtitleCue[] = [{ narration: "Dot", startMs: 500, endMs: 1500, isIntro: false }];
    const vtt = generateVTT(cues);

    expect(vtt).toContain("00:00:00.500 --> 00:00:01.500");
  });

  it("handles multiple cues", () => {
    const cues: SubtitleCue[] = [
      { narration: "A", startMs: 0, endMs: 500, isIntro: false },
      { narration: "B", startMs: 500, endMs: 1000, isIntro: false },
    ];
    const vtt = generateVTT(cues);

    expect(vtt).toContain("A\n");
    expect(vtt).toContain("B\n");
  });
});

// ── buildSubtitleCues ─────────────────────────────────────────────
describe("buildSubtitleCues", () => {
  const timestamps = [
    { sceneIndex: 0, narration: "Intro", startMs: 0, endMs: 1000, isIntro: true },
    { sceneIndex: 1, narration: "Body", startMs: 1000, endMs: 3000, isIntro: false },
  ];

  it("uses recording timestamps when no audio", () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const cues = buildSubtitleCues(timestamps, config);

    expect(cues).toEqual([
      { narration: "Intro", startMs: 0, endMs: 1000, isIntro: true },
      { narration: "Body", startMs: 1000, endMs: 3000, isIntro: false },
    ]);
  });

  it("computes audio-based timing when narration path present", () => {
    const config = {
      video: { resolution: { width: 1920, height: 1080 } },
      audio: { narration: "audio.mp3" },
      scenes: [{}],
    } as any;
    const cues = buildSubtitleCues(timestamps, config);

    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBe(1000);
    expect(cues[1].startMs).toBe(1000);
    expect(cues[1].endMs).toBe(3000);
  });

  it("applies narrationDelay offset", () => {
    const config = {
      video: { resolution: { width: 1920, height: 1080 } },
      audio: { narration: "audio.mp3", narrationDelay: 500 },
      scenes: [{}],
    } as any;
    const cues = buildSubtitleCues(timestamps, config);

    expect(cues[0].startMs).toBe(500);
    expect(cues[0].endMs).toBe(1500);
    expect(cues[1].startMs).toBe(1500);
    expect(cues[1].endMs).toBe(3500);
  });

  it("handles empty timestamps", () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const cues = buildSubtitleCues([], config);

    expect(cues).toEqual([]);
  });
});

// ── buildSubtitleCuesWithNarrationPlacements ──────────────────────
describe("buildSubtitleCuesWithNarrationPlacements", () => {
  const timestamps = [
    { sceneIndex: 0, narration: "Intro", startMs: 0, endMs: 1000, isIntro: true },
    { sceneIndex: 1, narration: "Body", startMs: 1000, endMs: 3000, isIntro: false },
  ];

  it("falls back to buildSubtitleCues when placements empty", () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const cues = buildSubtitleCuesWithNarrationPlacements(timestamps, config, []);

    expect(cues[0].startMs).toBe(0);
    expect(cues[0].endMs).toBe(1000);
  });

  it("uses placement timing when scene matches", () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const placements = [
      { sceneIndex: 0, narration: "Intro", clipPath: "/a", startMs: 100, endMs: 600 },
      { sceneIndex: 1, narration: "Body", clipPath: "/b", startMs: 600, endMs: 2500 },
    ];
    const cues = buildSubtitleCuesWithNarrationPlacements(timestamps, config, placements);

    expect(cues[0]).toEqual({ narration: "Intro", startMs: 100, endMs: 600, isIntro: true });
    expect(cues[1]).toEqual({ narration: "Body", startMs: 600, endMs: 2500, isIntro: false });
  });

  it("falls back to scene timing for missing placement", () => {
    const config = { video: { resolution: { width: 1920, height: 1080 } } } as any;
    const placements = [
      { sceneIndex: 0, narration: "Intro", clipPath: "/a", startMs: 100, endMs: 600 },
    ];
    const cues = buildSubtitleCuesWithNarrationPlacements(timestamps, config, placements);

    expect(cues[0].startMs).toBe(100);
    expect(cues[1]).toEqual({ narration: "Body", startMs: 1000, endMs: 3000, isIntro: false });
  });
});

// ── generateMetadata ──────────────────────────────────────────────
describe("generateMetadata", () => {
  it("returns metadata with intro scene", () => {
    const timestamps = [
      { sceneIndex: 0, narration: "Intro", startMs: 0, endMs: 1000, isIntro: true },
      { sceneIndex: 1, narration: "Body", startMs: 1000, endMs: 3000, isIntro: false },
    ];
    const cues = [
      { narration: "Intro", startMs: 0, endMs: 800, isIntro: true },
      { narration: "Body", startMs: 800, endMs: 2800, isIntro: false },
    ];
    const meta = generateMetadata(timestamps, cues, "/out/demo.mp4");

    expect(meta.video).toBe("demo.mp4");
    expect(meta.introEndMs).toBe(1000);
    expect(meta.totalDurationMs).toBe(3000);
    expect(meta.scenes).toHaveLength(2);
    expect(meta.scenes[0].audioStartMs).toBe(0);
    expect(meta.scenes[0].audioEndMs).toBe(800);
  });

  it("handles no intro scene", () => {
    const timestamps = [
      { sceneIndex: 0, narration: "Body", startMs: 0, endMs: 1000, isIntro: false },
    ];
    const cues = [{ narration: "Body", startMs: 0, endMs: 1000, isIntro: false }];
    const meta = generateMetadata(timestamps, cues, "/out/video.mp4");

    expect(meta.introEndMs).toBeNull();
  });

  it("handles empty timestamps", () => {
    const meta = generateMetadata([], [], "/out/video.mp4");

    expect(meta.totalDurationMs).toBe(0);
    expect(meta.introEndMs).toBeNull();
    expect(meta.scenes).toEqual([]);
  });

  it("falls back to scene timing when cue missing", () => {
    const timestamps = [
      { sceneIndex: 0, narration: "Only", startMs: 100, endMs: 200, isIntro: false },
    ];
    const meta = generateMetadata(timestamps, [], "/out/video.mp4");

    expect(meta.scenes[0].audioStartMs).toBe(100);
    expect(meta.scenes[0].audioEndMs).toBe(200);
  });
});

// ── setOnBrowserCreated ───────────────────────────────────────────
describe("setOnBrowserCreated", () => {
  it("sets callback without error", () => {
    const cb = vi.fn();
    expect(() => setOnBrowserCreated(cb)).not.toThrow();
  });
});
