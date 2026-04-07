import { defineConfig } from "demo-reel";

export default defineConfig({
  video: {
    resolution: "FHD",
  },

  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  outputFormat: "mp4",
  name: "create-template",

  audio: {
    narration: "./create-template-narration.mp3",
    narrationDelay: 300,
  },

  // Login and create a fresh tenant (not recorded)
  auth: {
    loginSteps: [
      { action: "goto", url: "https://demo.epistola.app/login" },
      { action: "type", selector: { strategy: "id", value: "username" }, text: "admin@local" },
      { action: "type", selector: { strategy: "id", value: "password" }, text: "admin" },
      { action: "click", selector: { strategy: "class", value: "btn-primary" } },
    ],
    validate: {
      protectedUrl: "https://demo.epistola.app/",
      successIndicator: { strategy: "custom", value: "h1:has-text('Tenants')" },
    },
    storage: {
      name: "epistola-demo",
      types: ["cookies"],
    },
  },

  // Create a fresh tenant and navigate into it (not recorded)
  preSteps: [
    { action: "goto", url: "https://demo.epistola.app/" },
    { action: "type", selector: { strategy: "id", value: "slug" }, text: "demo-vid2", clear: true },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Demo Video", clear: true },
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Tenant')" } },
    { action: "wait", ms: 1500 },
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-vid2" } },
    { action: "wait", ms: 1000 },
  ],

  scenes: [
    { narration: "Welkom in Epistola. We beginnen in het templateoverzicht, waar je al je documenttemplates vindt.", stepIndex: 0, isIntro: true },
    { narration: "Laten we een nieuw template aanmaken. We maken een ontvangstbevestiging voor klachten.", stepIndex: 1 },
    { narration: "Met een klik op 'Create Template' wordt het template direct aangemaakt inclusief een standaard variant.", stepIndex: 5 },
    { narration: "We openen de editor om het template te gaan bewerken.", stepIndex: 8 },
  ],

  steps: [
    // Scene 1: Intro — navigate to templates
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-vid2/templates" }, delayAfterMs: 1500 },

    // Scene 2: Create template
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-vid2/templates/new" }, delayAfterMs: 500 },
    { action: "waitFor", kind: "selector", selector: { strategy: "id", value: "slug" }, state: "visible" },
    { action: "type", selector: { strategy: "id", value: "slug" }, text: "ontvangstbevestiging-klacht", delayAfterMs: 300 },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Ontvangstbevestiging Klacht", delayAfterMs: 500 },

    // Scene 3: Submit
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Template')" } },
    { action: "waitFor", kind: "selector", selector: { strategy: "custom", value: "a[href*='editor']" }, state: "visible", timeoutMs: 10000 },
    { action: "wait", ms: 2000 },

    // Scene 4: Open editor
    { action: "click", selector: { strategy: "custom", value: "a[href*='editor']" }, delayAfterMs: 2500 },
  ],
});
