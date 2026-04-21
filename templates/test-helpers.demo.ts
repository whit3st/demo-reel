import "dotenv/config";
import { defineConfig } from "demo-reel";
import { epistolaAuth, createTemplateSteps, deleteTemplateSteps } from "../helpers/epistola.js";

const TEST_SLUG = "test-helper-demo";
const TEST_NAME = "Test Helper Demo";

export default defineConfig({
  video: { resolution: "FHD" },
  name: "test-helpers",
  outputDir: "./videos",
  outputFormat: "mp4",
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  voice: {
    provider: "piper",
    voice: "en_US-amy-medium",
    speed: 1,
  },
  auth: epistolaAuth(),
  // Pre-step: delete the template if it exists (cleanup from a previous run)
  preSteps: deleteTemplateSteps({ slug: TEST_SLUG }),
  // Post-step: delete the template after recording
  postSteps: deleteTemplateSteps({ slug: TEST_SLUG }),
  scenes: [
    {
      narration:
        "We are testing the create template helper. It navigates to the templates page and creates a new template.",
      stepIndex: 0,
      isIntro: true,
    },
    {
      narration: "The template has been created successfully. We can see the detail page.",
      stepIndex: 5,
    },
  ],
  steps: [...createTemplateSteps({ slug: TEST_SLUG, name: TEST_NAME })],
});
