import { existsSync, readFileSync } from "fs";
import { extname, isAbsolute, resolve } from "path";
import { fileURLToPath } from "url";

function stripShellQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function unescapeShellPath(value: string): string {
  // Users often paste paths copied from a shell prompt, e.g. /tmp/My\ File.png.
  return stripShellQuotes(value).replace(/\\([\\\s'"()&;@])/g, "$1");
}

function imageMimeTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      throw new Error("xAI image understanding supports local .jpg, .jpeg, and .png files only");
  }
}

function resolveLocalImagePath(value: string): string | undefined {
  const cleaned = unescapeShellPath(value);
  if (!cleaned) return undefined;

  if (cleaned.startsWith("file://")) {
    try {
      return fileURLToPath(cleaned);
    } catch {
      return undefined;
    }
  }

  const candidates = [cleaned];
  if (!isAbsolute(cleaned)) candidates.push(resolve(process.cwd(), cleaned));

  return candidates.find((candidate) => existsSync(candidate));
}

const LEGACY_SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  "1024x1024": "1:1",
  "1792x1024": "16:9",
  "1024x1792": "9:16",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

export type XaiImageGenerationParams = {
  prompt?: string;
  model?: string;
  aspect_ratio?: string;
  resolution?: string;
  /** @deprecated Use aspect_ratio instead. */
  size?: string;
  n?: number;
};

/** Map deprecated OpenAI-style size strings to xAI aspect ratios. */
export function legacySizeToAspectRatio(size: string): string | undefined {
  return LEGACY_SIZE_TO_ASPECT_RATIO[size.trim().toLowerCase()];
}

/** Build the JSON body for xAI /images/generations requests. */
export function buildXaiImageGenerationBody(
  params: XaiImageGenerationParams,
  defaultModel: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model || defaultModel,
    prompt: params.prompt,
    n: params.n || 1,
  };

  const aspectRatio =
    params.aspect_ratio ||
    (params.size ? legacySizeToAspectRatio(params.size) ?? "auto" : undefined);
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  if (params.resolution === "1k" || params.resolution === "2k") {
    body.resolution = params.resolution;
  }

  return body;
}

/** Normalize an image URL/path into an xAI-compatible URL or data URI. */
export function normalizeXaiImageInput(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const cleaned = stripShellQuotes(value);

  if (/^https?:\/\//i.test(cleaned) || /^data:image\//i.test(cleaned)) {
    return cleaned;
  }

  const localPath = resolveLocalImagePath(cleaned);
  if (!localPath) {
    throw new Error(`Image file does not exist or is not a valid URL: ${cleaned}`);
  }

  const mimeType = imageMimeTypeForPath(localPath);
  const data = readFileSync(localPath).toString("base64");
  return `data:${mimeType};base64,${data}`;
}
