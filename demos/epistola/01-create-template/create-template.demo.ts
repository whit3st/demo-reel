import { defineConfig } from "demo-reel";

const TENANT_SLUG = "demo-reel";
const BASE = "https://demo.epistola.app";

const deleteTenantSteps = [
  { action: "goto" as const, url: `${BASE}/` },
  { action: "click" as const, selector: { strategy: "custom" as const, value: `tr:has(a[href="/tenants/${TENANT_SLUG}"]) button[title="Delete tenant"]` } },
  { action: "wait" as const, ms: 300 },
  { action: "click" as const, selector: { strategy: "custom" as const, value: "button.btn-destructive" } },
  { action: "wait" as const, ms: 1000 },
];

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
  outputDir: "./output",

  audio: {
    narration: "./output/create-template-narration.mp3",
    narrationDelay: 300,
  },

  auth: {
    loginSteps: [
      { action: "goto", url: `${BASE}/login` },
      { action: "type", selector: { strategy: "id", value: "username" }, text: "admin@local" },
      { action: "type", selector: { strategy: "id", value: "password" }, text: "admin" },
      { action: "click", selector: { strategy: "class", value: "btn-primary" } },
    ],
    validate: {
      protectedUrl: `${BASE}/`,
      successIndicator: { strategy: "custom", value: "h1:has-text('Tenants')" },
    },
    storage: {
      name: "epistola-demo",
      types: ["cookies"],
    },
  },

  preSteps: [
    // Delete tenant if it exists (tolerant — won't fail if it doesn't)
    ...deleteTenantSteps,
    // Create fresh tenant
    { action: "goto", url: `${BASE}/` },
    { action: "wait", ms: 500 },
    { action: "type", selector: { strategy: "id", value: "slug" }, text: TENANT_SLUG, clear: true },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Demo Reel", clear: true },
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Tenant')" } },
    { action: "wait", ms: 2000 },
    { action: "click", selector: { strategy: "href", value: `/tenants/${TENANT_SLUG}` } },
    { action: "wait", ms: 1500 },
  ],

  postSteps: deleteTenantSteps,

  scenes: [
    { narration: "Welkom in Epistola. Vanuit het dashboard navigeren we naar het templateoverzicht.", stepIndex: 0, isIntro: true },
    { narration: "Laten we een nieuw template aanmaken. We maken een ontvangstbevestiging voor klachten.", stepIndex: 3 },
    { narration: "Met een klik op 'Create Template' wordt het template direct aangemaakt inclusief een standaard variant.", stepIndex: 8 },
    { narration: "We openen de editor om het template te gaan bewerken.", stepIndex: 11 },
  ],

  steps: [
    // Scene 1: Dashboard → hover templates stat card → click → templates list
    { action: "hover", selector: { strategy: "custom", value: `a.stat-card[href="/tenants/${TENANT_SLUG}/templates"]` }, delayAfterMs: 800 },
    { action: "click", selector: { strategy: "custom", value: `a.stat-card[href="/tenants/${TENANT_SLUG}/templates"]` }, delayAfterMs: 1500 },
    { action: "wait", ms: 500 },

    // Scene 2: Templates list → hover "New Template" → click → fill form
    { action: "hover", selector: { strategy: "custom", value: `a[href="/tenants/${TENANT_SLUG}/templates/new"]` }, delayAfterMs: 600 },
    { action: "click", selector: { strategy: "custom", value: `a[href="/tenants/${TENANT_SLUG}/templates/new"]` }, delayAfterMs: 500 },
    { action: "waitFor", kind: "selector", selector: { strategy: "id", value: "slug" }, state: "visible" },
    { action: "type", selector: { strategy: "id", value: "slug" }, text: "ontvangstbevestiging-klacht", delayAfterMs: 300 },
    { action: "type", selector: { strategy: "id", value: "name" }, text: "Ontvangstbevestiging Klacht", delayAfterMs: 500 },

    // Scene 3: Hover "Create Template" → click → wait for result
    { action: "hover", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Template')" }, delayAfterMs: 600 },
    { action: "click", selector: { strategy: "custom", value: "button[type='submit']:has-text('Create Template')" } },
    { action: "waitFor", kind: "selector", selector: { strategy: "custom", value: "a[href*='editor']" }, state: "visible", timeoutMs: 10000 },

    // Scene 4: Hover editor link → click → end on editor
    { action: "wait", ms: 1000 },
    { action: "hover", selector: { strategy: "custom", value: "a[href*='editor']" }, delayAfterMs: 600 },
    { action: "click", selector: { strategy: "custom", value: "a[href*='editor']" }, delayAfterMs: 2500 },
  ],
});
