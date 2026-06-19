#!/usr/bin/env node
/**
 * Live smoke test for xAI image generation payload changes.
 * Compares deprecated `size` vs new aspect_ratio/resolution bodies.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const LEGACY_SIZE_TO_ASPECT_RATIO = {
  "1024x1024": "1:1",
  "1792x1024": "16:9",
  "1024x1792": "9:16",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

function buildXaiImageGenerationBody(params, defaultModel) {
  const body = {
    model: params.model || defaultModel,
    prompt: params.prompt,
    n: params.n || 1,
  };

  const aspectRatio =
    params.aspect_ratio ||
    (params.size ? LEGACY_SIZE_TO_ASPECT_RATIO[params.size.trim().toLowerCase()] ?? "auto" : undefined);
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  if (params.resolution === "1k" || params.resolution === "2k") {
    body.resolution = params.resolution;
  }

  return body;
}

const XAI_IMAGES_GENERATIONS_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_MODEL = "grok-imagine-image-quality";
const PROMPT = "A minimal blue circle on a white background, flat vector icon";

function loadAccessToken() {
  const authPath = join(homedir(), ".pi", "agent", "auth.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  const access = auth?.["xai-auth"]?.access;
  if (!access) throw new Error("No xai-auth access token in ~/.pi/agent/auth.json — run: pi /login xai-auth");
  return access;
}

async function postImageGeneration(token, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response;
  try {
    response = await fetch(XAI_IMAGES_GENERATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { ok: response.ok, status: response.status, body: json, sent: body };
}

function hasImageUrl(result) {
  const urls = (result.body?.data || []).map((item) => item?.url).filter(Boolean);
  return urls.length > 0;
}

async function main() {
  const token = loadAccessToken();

  console.log("1) Deprecated payload with size (expected to fail)...");
  const legacyDirect = await postImageGeneration(token, {
    model: DEFAULT_MODEL,
    prompt: PROMPT,
    n: 1,
    size: "1024x1024",
  });
  assert.equal(legacyDirect.ok, false, `size payload should fail, got ${legacyDirect.status}`);
  console.log(`   FAIL as expected (${legacyDirect.status})`);

  console.log("2) New minimal payload (model + prompt only)...");
  const minimal = await postImageGeneration(
    token,
    buildXaiImageGenerationBody({ prompt: PROMPT, n: 1 }, DEFAULT_MODEL),
  );
  assert.equal(minimal.ok, true, `minimal payload failed: ${minimal.status} ${JSON.stringify(minimal.body)}`);
  assert.equal(minimal.sent.size, undefined);
  assert.ok(hasImageUrl(minimal), "minimal payload should return image URL");
  console.log("   OK");

  console.log("3) New payload with aspect_ratio + resolution...");
  const configured = await postImageGeneration(
    token,
    buildXaiImageGenerationBody(
      { prompt: PROMPT, aspect_ratio: "1:1", resolution: "1k", n: 1 },
      DEFAULT_MODEL,
    ),
  );
  assert.equal(configured.ok, true, `configured payload failed: ${configured.status} ${JSON.stringify(configured.body)}`);
  assert.equal(configured.sent.aspect_ratio, "1:1");
  assert.equal(configured.sent.resolution, "1k");
  assert.equal(configured.sent.size, undefined);
  assert.ok(hasImageUrl(configured), "configured payload should return image URL");
  console.log("   OK");

  console.log("4) Legacy size param mapped to aspect_ratio...");
  const mapped = await postImageGeneration(
    token,
    buildXaiImageGenerationBody({ prompt: PROMPT, size: "1024x1024", n: 1 }, DEFAULT_MODEL),
  );
  assert.equal(mapped.ok, true, `mapped payload failed: ${mapped.status} ${JSON.stringify(mapped.body)}`);
  assert.equal(mapped.sent.aspect_ratio, "1:1");
  assert.equal(mapped.sent.size, undefined);
  assert.ok(hasImageUrl(mapped), "mapped payload should return image URL");
  console.log("   OK");

  console.log("\nLive image generation test: all checks passed.");
}

main().catch((error) => {
  console.error("\nLive image generation test: FAILED");
  console.error(error?.message || error);
  process.exit(1);
});