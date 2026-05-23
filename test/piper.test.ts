import { describe, expect, it } from "vitest";
import { getPiperVoiceUrl } from "../src/piper.js";

describe("piper", () => {
  describe("getPiperVoiceUrl", () => {
    it("parses en_US-amy-medium", () => {
      const result = getPiperVoiceUrl("en_US-amy-medium");
      expect(result).toEqual({
        model:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
        config:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json",
      });
    });

    it("parses nl_NL-mls-medium", () => {
      const result = getPiperVoiceUrl("nl_NL-mls-medium");
      expect(result).toEqual({
        model:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx",
        config:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx.json",
      });
    });

    it("parses de_DE-thorsten-medium", () => {
      const result = getPiperVoiceUrl("de_DE-thorsten-medium");
      expect(result).toEqual({
        model:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        config:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json",
      });
    });

    it("parses fr_FR-siwis-medium", () => {
      const result = getPiperVoiceUrl("fr_FR-siwis-medium");
      expect(result).toEqual({
        model:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
        config:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json",
      });
    });

    it("parses nl_NL-pim-medium", () => {
      const result = getPiperVoiceUrl("nl_NL-pim-medium");
      expect(result).toEqual({
        model:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/pim/medium/nl_NL-pim-medium.onnx",
        config:
          "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/pim/medium/nl_NL-pim-medium.onnx.json",
      });
    });

    it("returns null for unrecognized voice names", () => {
      expect(getPiperVoiceUrl("custom-voice")).toBeNull();
      expect(getPiperVoiceUrl("")).toBeNull();
      expect(getPiperVoiceUrl("en_us-lowercase")).toBeNull();
    });
  });
});
