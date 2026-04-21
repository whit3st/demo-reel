/**
 * Reusable demo-reel helpers for Epistola template operations.
 *
 * Import and use these as setup/cleanup steps in any demo script.
 *
 * @example
 * import { createTemplateSteps, deleteTemplateSteps, epistolaAuth } from "../helpers/epistola";
 *
 * export default defineConfig({
 *   setup: createTemplateSteps({ slug: "my-template", name: "My Template" }),
 *   cleanup: deleteTemplateSteps({ slug: "my-template" }),
 *   auth: epistolaAuth(),
 *   ...
 * });
 */
import "dotenv/config";
import { requireEnv } from "./require-env.ts";
import type { Step } from "../src/schemas.ts";

// --- Types ---

export interface EpistolaEnv {
  tenantSlug: string;
  tenantEmail: string;
  tenantPassword: string;
  baseUrl?: string;
}

export interface TemplateOpts {
  slug: string;
  name: string;
  catalog?: string; // defaults to "default"
}

// --- Env helpers ---

function loadEnv(): EpistolaEnv {
  return {
    tenantSlug: requireEnv("TENANT_SLUG"),
    tenantEmail: requireEnv("TENANT_EMAIL"),
    tenantPassword: requireEnv("TENANT_PASSWORD"),
    baseUrl: process.env.BASE_URL || "https://demo.epistola.app",
  };
}

function tenantUrl(env: EpistolaEnv, path: string = ""): string {
  return `${env.baseUrl}/tenants/${env.tenantSlug}${path}`;
}

function templatePath(env: EpistolaEnv, opts: TemplateOpts, path: string = ""): string {
  const catalog = opts.catalog ?? "default";
  return tenantUrl(env, `/templates/${catalog}/${opts.slug}${path}`);
}

// --- Auth ---

/**
 * Standard Epistola SSO login steps.
 * Use as the `auth` config in any demo.
 */
export function epistolaAuth(overrides?: Partial<EpistolaEnv>) {
  const env = loadEnv();
  const e = { ...env, ...overrides };

  return {
    loginSteps: [
      { action: "goto" as const, url: `${e.baseUrl}/login` },
      { action: "wait" as const, ms: 100 },
      {
        action: "click" as const,
        selector: {
          strategy: "href" as const,
          value: "/oauth2/authorization/keycloak?popup=",
        },
      },
      {
        action: "type" as const,
        selector: { strategy: "id" as const, value: "username" },
        text: e.tenantEmail,
      },
      { action: "wait" as const, ms: 500 },
      {
        action: "click" as const,
        selector: { strategy: "id" as const, value: "password" },
      },
      {
        action: "type" as const,
        selector: { strategy: "id" as const, value: "password" },
        text: e.tenantPassword,
      },
      { action: "wait" as const, ms: 500 },
      {
        action: "click" as const,
        selector: { strategy: "id" as const, value: "kc-login" },
      },
    ],
    validate: {
      protectedUrl: e.baseUrl!,
      successIndicator: { strategy: "custom" as const, value: "h1:has-text('Tenants')" },
    },
    storage: { name: "epistola-demo", types: ["cookies", "localStorage"] as const },
  };
}

// --- Template CRUD steps ---

/**
 * Steps to create a new template.
 *
 * Starts from the templates list page and ends on the template detail page.
 * Suitable for `setup` or standalone recording.
 */
export function createTemplateSteps(opts: TemplateOpts, overrides?: Partial<EpistolaEnv>): Step[] {
  const env = loadEnv();
  const e = { ...env, ...overrides };

  return [
    // Navigate to templates list
    { action: "goto", url: tenantUrl(e, "/templates") } as Step,
    { action: "wait", ms: 500 } as Step,

    // Click "New Template"
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: `a[href="/tenants/${e.tenantSlug}/templates/new"]`,
      },
      delayAfterMs: 500,
    } as Step,

    // Wait for form
    {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "id", value: "slug" },
      state: "visible",
    } as Step,

    // Fill slug
    {
      action: "type",
      selector: { strategy: "id", value: "slug" },
      text: opts.slug,
      delayAfterMs: 300,
    } as Step,

    // Fill name
    {
      action: "type",
      selector: { strategy: "id", value: "name" },
      text: opts.name,
      delayAfterMs: 500,
    } as Step,

    // Click "Create Template"
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: "button[type='submit']:has-text('Create Template')",
      },
    } as Step,

    // Wait for redirect to detail page
    { action: "waitFor", kind: "loadState", state: "networkidle" } as Step,
    { action: "wait", ms: 1500 } as Step,
  ];
}

/**
 * Steps to delete a template via its Settings tab.
 *
 * Navigates to the template settings, clicks delete, handles the browser
 * confirm dialog, and returns to the templates list page.
 * Suitable for `cleanup` or standalone recording.
 */
export function deleteTemplateSteps(opts: TemplateOpts, overrides?: Partial<EpistolaEnv>): Step[] {
  const env = loadEnv();
  const e = { ...env, ...overrides };

  return [
    // Go to template settings
    { action: "goto", url: templatePath(e, opts, "/settings") } as Step,
    { action: "wait", ms: 500 } as Step,

    // Click "Delete Template" button (opens native confirm dialog)
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: "button:has-text('Delete Template')",
      },
      delayAfterMs: 300,
    } as Step,

    // Handle the native confirm dialog
    {
      action: "confirm",
      accept: true,
      timeoutMs: 5000,
    } as Step,

    // Wait for deletion + redirect to templates list
    { action: "wait", ms: 1500 } as Step,
    { action: "goto", url: tenantUrl(e, "/templates") } as Step,
    { action: "wait", ms: 800 } as Step,
  ];
}

/**
 * Steps to open a template's editor from the templates list.
 *
 * Starts at the templates list and ends with the editor loaded.
 */
export function openTemplateEditorSteps(
  opts: TemplateOpts,
  overrides?: Partial<EpistolaEnv>,
): Step[] {
  const env = loadEnv();
  const e = { ...env, ...overrides };
  const catalog = opts.catalog ?? "default";
  const variantSlug = `${opts.slug}-default`;

  return [
    // Go to templates list
    { action: "goto", url: tenantUrl(e, "/templates") } as Step,
    { action: "wait", ms: 500 } as Step,

    // Click the template
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: `a[href="/tenants/${e.tenantSlug}/templates/${catalog}/${opts.slug}"]`,
      },
      delayAfterMs: 1200,
    } as Step,

    // Click "Open editor" for the default variant
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: `a[href="/tenants/${e.tenantSlug}/templates/${catalog}/${opts.slug}/variants/${variantSlug}/editor"]`,
      },
      delayAfterMs: 1200,
    } as Step,

    // Wait for editor to load
    {
      action: "waitFor",
      kind: "selector",
      selector: { strategy: "custom", value: "button:has-text('Preview')" },
      state: "visible",
    } as Step,
  ];
}

/**
 * Steps to go to the templates list page (simple navigation).
 */
export function goToTemplatesList(overrides?: Partial<EpistolaEnv>): Step[] {
  const env = loadEnv();
  const e = { ...env, ...overrides };

  return [
    { action: "goto", url: tenantUrl(e, "/templates") } as Step,
    { action: "wait", ms: 600 } as Step,
  ];
}
