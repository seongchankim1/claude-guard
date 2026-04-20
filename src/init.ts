import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { defaultConfig } from "./config.js";
import type { Config, Severity } from "./types.js";

export interface DetectedStack {
  nextjs: boolean;
  react: boolean;
  vue: boolean;
  svelte: boolean;
  express: boolean;
  fastify: boolean;
  django: boolean;
  fastapi: boolean;
  flask: boolean;
  supabase: boolean;
  prisma: boolean;
  has_dockerfile: boolean;
  has_tf: boolean;
  has_k8s: boolean;
  has_llm_sdk: boolean;
}

export async function detectStack(projectPath: string): Promise<DetectedStack> {
  const pkgPath = join(projectPath, "package.json");
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    } catch {
      /* ignore */
    }
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = (name: string): boolean => name in deps;

  const req = await readFirst(projectPath, [
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
  ]);

  return {
    nextjs: has("next"),
    react: has("react"),
    vue: has("vue"),
    svelte: has("svelte"),
    express: has("express"),
    fastify: has("fastify"),
    django: /django/i.test(req),
    fastapi: /fastapi/i.test(req),
    flask: /\bflask\b/i.test(req),
    supabase: has("@supabase/supabase-js"),
    prisma: has("@prisma/client") || has("prisma"),
    has_dockerfile:
      existsSync(join(projectPath, "Dockerfile")) ||
      existsSync(join(projectPath, "Dockerfile.dev")),
    has_tf: await hasFileLike(projectPath, ".tf"),
    has_k8s: await hasFileLike(projectPath, "k8s") || await hasFileLike(projectPath, "kubernetes"),
    has_llm_sdk:
      has("@anthropic-ai/sdk") ||
      has("openai") ||
      /anthropic|openai/i.test(req),
  };
}

async function readFirst(root: string, names: string[]): Promise<string> {
  for (const n of names) {
    const p = join(root, n);
    if (existsSync(p)) {
      try {
        return await readFile(p, "utf8");
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

async function hasFileLike(root: string, needle: string): Promise<boolean> {
  const { globby } = await import("globby");
  const files = await globby([`**/*${needle}*`], {
    cwd: root,
    gitignore: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
    onlyFiles: true,
  });
  return files.length > 0;
}

export interface InitOptions {
  projectPath: string;
  write: boolean;
}

export interface InitResult {
  stack: DetectedStack;
  config_path: string;
  wrote_config: boolean;
  suggested_overrides: Record<string, Severity>;
  summary: string;
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const stack = await detectStack(opts.projectPath);

  const suggested_overrides: Record<string, Severity> = {};
  if (!stack.express && !stack.fastify) {
    suggested_overrides["CG-CFG-005"] = "LOW";
    suggested_overrides["CG-AUTH-008"] = "LOW";
    suggested_overrides["CG-CFG-016"] = "LOW";
  }
  if (!stack.nextjs) {
    suggested_overrides["CG-SEC-001"] = "MEDIUM";
    suggested_overrides["CG-CFG-006"] = "LOW";
    suggested_overrides["CG-CFG-011"] = "LOW";
  }
  if (!stack.supabase) suggested_overrides["CG-SEC-003"] = "MEDIUM";
  if (!stack.has_tf) {
    suggested_overrides["CG-IAC-001"] = "LOW";
    suggested_overrides["CG-IAC-002"] = "LOW";
  }
  if (!stack.has_k8s) {
    suggested_overrides["CG-IAC-003"] = "LOW";
    suggested_overrides["CG-IAC-004"] = "LOW";
  }
  if (!stack.has_dockerfile) {
    suggested_overrides["CG-DOCKER-001"] = "LOW";
    suggested_overrides["CG-DOCKER-002"] = "LOW";
  }

  const config: Config = {
    ...defaultConfig,
    severity_overrides: suggested_overrides,
  };

  const dir = join(opts.projectPath, ".claude-guard");
  const configPath = join(dir, "config.yaml");
  let wrote = false;
  if (opts.write && !existsSync(configPath)) {
    await mkdir(dir, { recursive: true });
    await writeFile(configPath, yaml.dump(config));
    wrote = true;
  }

  const detectedList: string[] = [];
  if (stack.nextjs) detectedList.push("Next.js");
  if (stack.react && !stack.nextjs) detectedList.push("React");
  if (stack.vue) detectedList.push("Vue");
  if (stack.svelte) detectedList.push("Svelte");
  if (stack.express) detectedList.push("Express");
  if (stack.fastify) detectedList.push("Fastify");
  if (stack.django) detectedList.push("Django");
  if (stack.fastapi) detectedList.push("FastAPI");
  if (stack.flask) detectedList.push("Flask");
  if (stack.supabase) detectedList.push("Supabase");
  if (stack.prisma) detectedList.push("Prisma");
  if (stack.has_dockerfile) detectedList.push("Dockerfile");
  if (stack.has_tf) detectedList.push("Terraform");
  if (stack.has_k8s) detectedList.push("Kubernetes");
  if (stack.has_llm_sdk) detectedList.push("LLM SDK");

  const summary = [
    detectedList.length
      ? `Detected: ${detectedList.join(", ")}`
      : "Detected: (nothing claude-guard knows about — MVP rules still apply)",
    wrote
      ? `Wrote ${configPath}. ${Object.keys(suggested_overrides).length} suggested severity overrides applied.`
      : existsSync(configPath)
      ? `Kept existing ${configPath}.`
      : `Would write ${configPath}.`,
    "Next steps:",
    "  1. claude-guard scan              # first scan",
    "  2. claude-guard baseline          # optional: suppress existing noise",
    "  3. claude-guard install-hooks     # optional: block CRITICAL on commit",
  ].join("\n");

  return {
    stack,
    config_path: configPath,
    wrote_config: wrote,
    suggested_overrides,
    summary,
  };
}
