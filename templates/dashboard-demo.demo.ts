import "dotenv/config";
import { requireEnv } from "../helpers/require-env";
import { defineConfig } from "demo-reel";

const TENANT_SLUG = requireEnv("TENANT_SLUG");
const TENANT_EMAIL = requireEnv("TENANT_EMAIL");
const TENANT_PASSWORD = requireEnv("TENANT_PASSWORD");
const TEMPLATE_SLUG = "vergunning-brief";
const TARGET_BLOCK_ID = "DfShcJqgXUGZ2Fth2whJ9";

export default defineConfig({
  video: {
    resolution: "FHD",
  },
  name: "dashboard-demo",
  outputFormat: "mp4",
  outputDir: "./videos",
  cursor: "dot",
  motion: "smooth",
  typing: "humanlike",
  timing: "normal",
  voice: {
    provider: "piper",
    voice: "en_US-amy-medium",
    speed: 1,
  },
  steps: [
    { action: "wait", ms: 10 },
    {
      action: "goto",
      url: `https://demo.epistola.app/tenants/${TENANT_SLUG}`,
    },
    { action: "wait", ms: 1000 },
    {
      action: "click",
      selector: {
        strategy: "href",
        value: `/tenants/${TENANT_SLUG}/templates`,
        index: 2,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "scroll",
      y: 200,
      x: 0,
      selector: {
        strategy: "href",
        value: `/tenants/${TENANT_SLUG}/templates/${TEMPLATE_SLUG}`,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "href",
        value: `/tenants/${TENANT_SLUG}/templates/${TEMPLATE_SLUG}`,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "href",
        value: `/tenants/${TENANT_SLUG}/templates/${TEMPLATE_SLUG}/variants/${TEMPLATE_SLUG}-default/editor`,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "custom",
        value: "[data-node-id='DfShcJqgXUGZ2Fth2whJ9'] .canvas-block-header",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "click",
      selector: {
        strategy: "class",
        value: "sidebar-tab",
        index: 2,
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "scroll",
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
      y: 100,
      x: 0,
    },
    {
      action: "click",
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "type",
      text: "#c3c3c3",
      clear: true,
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
    { action: "wait", ms: 10 },
    {
      action: "press",
      key: "Enter",
      selector: {
        strategy: "id",
        value: "inspector-style-backgroundColor",
      },
    },
  ],
  auth: {
    loginSteps: [
      { action: "goto", url: "https://demo.epistola.app/login" },
      { action: "wait", ms: 100 },
      {
        action: "click",
        selector: {
          strategy: "href",
          value: "/oauth2/authorization/keycloak?popup=",
        },
      },
      {
        action: "type",
        selector: { strategy: "id", value: "username" },
        text: TENANT_EMAIL,
      },
      { action: "wait", ms: 500 },
      {
        action: "click",
        selector: { strategy: "id", value: "password" },
      },
      {
        action: "type",
        selector: { strategy: "id", value: "password" },
        text: TENANT_PASSWORD,
      },
      { action: "wait", ms: 500 },
      {
        action: "click",
        selector: { strategy: "id", value: "kc-login" },
      },
    ],
    validate: {
      protectedUrl: "https://demo.epistola.app",
      successIndicator: { strategy: "href", value: `/tenants/${TENANT_SLUG}` },
    },
    storage: {
      name: "demo-session",
      types: ["cookies", "localStorage"],
    },
  },
  scenes: [
    {
      narration: "In this demo, we will explore the template editor and its features.",
      stepIndex: 0,
    },
    {
      narration: "First, we navigate to the Epistola dashboard and select a template to edit.",
      stepIndex: 4,
    },
    {
      narration: "We then open the template editor and select a block to customize its style.",
      stepIndex: 11,
    },
    {
      narration: "Let's change the background color of the block.",
      stepIndex: 13,
    },
  ],
});
