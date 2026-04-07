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
    { action: "type", selector: { strategy: "id", value: "slug" }, text: "demo-klacht", clear: true },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Demo Klacht", clear: true },
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Tenant')" } },
    { action: "wait", ms: 1500 },
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-klacht" } },
    { action: "wait", ms: 1000 },
  ],

  steps: [
    // Scene 1: "Welkom in Epistola. We beginnen in het templateoverzicht."
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-klacht/templates" }, delayAfterMs: 1500 },

    // Scene 2: "Laten we een nieuw template aanmaken voor een ontvangstbevestiging bij klachten."
    { action: "click", selector: { strategy: "href", value: "/tenants/demo-klacht/templates/new" }, delayAfterMs: 500 },
    { action: "waitFor", kind: "selector", selector: { strategy: "id", value: "slug" }, state: "visible" },
    { action: "type", selector: { strategy: "id", value: "slug" }, text: "ontvangstbevestiging-klacht", delayAfterMs: 300 },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Ontvangstbevestiging Klacht", delayAfterMs: 500 },

    // Scene 3: "Met een klik op 'Create Template' wordt het template direct aangemaakt."
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Template')" }, delayAfterMs: 2000 },

    // Scene 4: "We openen de editor om het template te gaan bewerken."
    { action: "click", selector: { strategy: "custom", value: "a[href*='editor']" }, delayAfterMs: 2500 },
  ],
});
