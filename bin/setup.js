#!/usr/bin/env node

/**
 * pi-xai-oauth — One-command installer for xAI (Grok) OAuth + Grok 4.3
 * Enhanced with --scaffold support for 2026 agent best practices
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const NPM_SPEC = "npm:pi-xai-oauth";
const SETTINGS_PATH = path.join(os.homedir(), ".pi/agent/settings.json");

// ANSI colors
const colors = {
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function color(text, c) {
  return `${colors[c] || ""}${text}${colors.reset}`;
}

function printHeader() {
  console.log(`\n${color("🚀  pi-xai-oauth", "cyan")} — ${color("xAI Grok + OAuth for pi", "bold")}\n`);
  console.log("   One-command setup for Grok 4.3, Grok Build, and Composer 2.5 with clean OAuth login.\n");
}

function checkPi() {
  try {
    execSync("which pi", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installPackage() {
  console.log(color("📦 Installing pi-xai-oauth into pi...", "cyan"));
  try {
    execSync(`pi install ${NPM_SPEC}`, { stdio: "inherit" });
    console.log(color("\n✅ Package installed successfully!", "green"));
    return true;
  } catch (err) {
    console.error(color("\n❌ Failed to run 'pi install'.", "red"));
    console.log(`Please run manually:  ${color(`pi install ${NPM_SPEC}`, "yellow")}`);
    return false;
  }
}

function updateSettings() {
  console.log(color("\n⚙️  Configuring pi settings...", "cyan"));

  let settings = {};

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch (e) {
      const backupPath = `${SETTINGS_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        fs.copyFileSync(SETTINGS_PATH, backupPath);
        console.log(color(`   Warning: Could not parse existing settings.json; backed it up to ${backupPath}`, "yellow"));
      } catch {
        console.log(color("   Warning: Could not parse existing settings.json and could not create a backup", "yellow"));
      }
    }
  }

  let changed = false;

  if (!Array.isArray(settings.packages)) {
    settings.packages = [];
  }

  const hasPackage = settings.packages.some(p => {
    if (typeof p === "string") return p === NPM_SPEC;
    if (p && typeof p === "object") return p.source === NPM_SPEC;
    return false;
  });

  if (!hasPackage) {
    settings.packages.push(NPM_SPEC);
    changed = true;
    console.log(color("   + Added npm:pi-xai-oauth to packages", "green"));
  }

  if (settings.defaultProvider !== "xai-auth") {
    settings.defaultProvider = "xai-auth";
    changed = true;
    console.log(color("   + Set defaultProvider: xai-auth", "green"));
  }

  if (settings.defaultModel !== "grok-4.3") {
    settings.defaultModel = "grok-4.3";
    changed = true;
    console.log(color("   + Set defaultModel: grok-4.3", "green"));
  }

  if (settings.defaultThinkingLevel !== "high") {
    settings.defaultThinkingLevel = "high";
    changed = true;
    console.log(color("   + Set defaultThinkingLevel: high", "green"));
  }

  if (changed) {
    try {
      const dir = path.dirname(SETTINGS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      console.log(color("   ✅ Settings updated!", "green"));
    } catch (e) {
      console.log(color("   ⚠️  Could not write settings.json (you can configure manually)", "yellow"));
    }
  } else {
    console.log(color("   (Settings already configured)", "reset"));
  }
}

function printNextSteps(nonInteractive = false) {
  console.log(`\n${color("🎉  Setup complete!", "green")}\n`);

  if (!nonInteractive) {
    console.log("Next steps:\n");
    console.log(`   ${color("1.", "bold")} Authenticate with xAI OAuth:`);
    console.log(`      ${color("pi /login xai-auth", "cyan")}\n`);
    console.log(`   ${color("2.", "bold")} Start chatting with Grok 4.3 (already set as default)`);
    console.log(`      ${color("pi", "cyan")}\n`);
  } else {
    console.log("Grok 4.3, Grok Build, Composer 2.5 + xAI OAuth are now configured and ready.\n");
  }

  console.log("You now have access to powerful reasoning, coding models, and 1M context!\n");
  console.log("Bonus tools available:");
  console.log("   • xai_generate_text     — Generate text with full reasoning");
  console.log("   • xai_multi_agent       — Multi-agent research with web/X tools");
  console.log("   • xai_web_search        — Native xAI web search");
  console.log("   • xai_x_search          — Native X/Twitter search");
  console.log("   • xai_code_execution    — Native code interpreter");
  console.log("   • xai_generate_image    — Image generation");
  console.log("   • xai_analyze_image     — Image analysis");
  console.log("   • xai_critique          — Structured critique");
  console.log("   • xai_deep_research     — Deep research with web/X tools\n");
  console.log(`   Update later: ${color("pi update npm:pi-xai-oauth", "yellow")}\n`);
}

function printScaffoldHeader() {
  console.log(`\n${color("🛠️  Agent Scaffolding", "cyan")} — ${color("2026 best practices for pi agents", "bold")}\n`);
  console.log("   Bootstraps AGENTS.md + .scaffold/ persistent state harness for reliable multi-agent work.\n");
}

function generateScaffold(nonInteractive = false) {
  printScaffoldHeader();
  console.log(color("🛠️  Generating enhanced agent scaffolding (2026 best practices)...", "cyan"));

  const scaffoldDir = path.join(process.cwd(), ".scaffold");
  const date = new Date().toISOString().split("T")[0];
  let branch = "feature/your-task";
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {}
  let projectName = "pi-package";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    if (pkg.name) projectName = pkg.name;
  } catch {}
  // projectName and branch now dynamic

  const templates = {
    "plan.md": `# Implementation Plan: Enhanced Agent Scaffolding

**Project:** ${projectName}
**Branch:** ${branch}
**Date:** ${date}

## Phase 1: Foundation
- [ ] Run setup with --scaffold
- [ ] Customize this plan

## Phase 2: Persistent State
- [ ] Review constraints.md
- [ ] Update progress.md after each step

## Next
Use parallel subagents and keep this plan updated.

This harness follows 2026 best practices for reliable agentic work.`,
    
    "constraints.md": `# Constraints & Safety Rules

## Hard Boundaries (MUST NOT)
- Never commit API keys, tokens, or secrets
- Never skip feature branches
- Never ignore subagent failures or tool errors

## MUST
- Always read AGENTS.md before starting work
- Update .scaffold/progress.md after every significant step
- Prefer PARALLEL subagent mode for independent tasks
- Use external state files for long-running work

## Tool Rules
- Specify cwd when relevant
- Run reviewer before final merges
- Keep context lean with vertical slices where possible`,
    
    "progress.md": `# Execution Progress

**Project:** ${projectName}
**Branch:** ${branch}
**Started:** ${date}

## Completed
- [x] Created new branch
- [x] Parallel agent research + recon
- [x] Generated AGENTS.md
- [x] Generated .scaffold/ persistent state files
- [x] Enhanced bin/setup.js with --scaffold support

## In Progress
- [ ] Customize templates for this project
- [ ] Implement additional phases from plan.md

## Next
Run \`node bin/setup.js --scaffold\` in new projects to bootstrap this harness.

Update this file frequently.`,

    "context.md": `# Shared Agent Context

**Project:** ${projectName}
**Branch:** ${branch}
**Date:** ${date}

## Key Context
- This project provides xAI OAuth + Grok 4.3 for pi agents.
- Use subagent tool for delegation.
- Persistent state lives in .scaffold/.

## Current Focus
See plan.md for active phases.

Update as work progresses.`
  };

  try {
    if (!fs.existsSync(scaffoldDir)) {
      fs.mkdirSync(scaffoldDir, { recursive: true });
      console.log(color("   + Created .scaffold/ directory", "green"));
    }

    Object.entries(templates).forEach(([filename, content]) => {
      const filePath = path.join(scaffoldDir, filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, "utf8");
        console.log(color(`   + Generated ${filename}`, "green"));
      } else {
        console.log(color(`   (Skipped existing ${filename})`, "yellow"));
      }
    });

    // Generate basic AGENTS.md if missing
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      const basicAgents = `# AGENTS.md — AI Agent Operations Manual

> For AI coding agents. Human docs in README.md.

## Project
pi-xai-oauth — xAI OAuth provider for pi framework.

## Commands
- Scaffold: node bin/setup.js --scaffold
- Install: pi install npm:pi-xai-oauth

## Workflow
- Always use feature branches
- Use subagent with PARALLEL for research/planning
- Track everything in .scaffold/

See .scaffold/plan.md for current roadmap.`;
      fs.writeFileSync(agentsPath, basicAgents, "utf8");
      console.log(color("   + Generated AGENTS.md", "green"));
    }

    console.log(color("\n✅ Scaffolding generation complete!", "green"));
    console.log("   Ready for multi-agent workflows with persistent state.\n");

    if (!nonInteractive) {
      console.log("Next: Customize the generated files and start using parallel subagents.\n");
    }
  } catch (err) {
    console.error(color("\n❌ Scaffolding generation failed:", "red"), err.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`\n${color("pi-xai-oauth", "cyan")} — CLI for xAI OAuth setup and agent scaffolding\n`);
  console.log("Usage:");
  console.log("  npx pi-xai-oauth              Run interactive xAI OAuth + settings setup");
  console.log("  npx pi-xai-oauth --scaffold   Generate .scaffold/ harness in current project");
  console.log("  npx pi-xai-oauth --yes        Non-interactive / automated mode");
  console.log("  npx pi-xai-oauth --help       Show this help\n");
  console.log("Examples:");
  console.log("  npx pi-xai-oauth --scaffold   # in any pi project to add agent harness\n");
}

function main() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes") || args.includes("-y");
  const scaffold = args.includes("--scaffold") || args.includes("-s");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    printHelp();
    return;
  }

  if (scaffold) {
    generateScaffold(yes);
    return;
  }

  printHeader();

  if (!checkPi()) {
    console.log(color("❌ 'pi' command not found in PATH.", "red"));
    console.log("Please install pi first → https://pi.dev\n");
    process.exit(1);
  }

  const success = installPackage();
  if (success) {
    updateSettings();
    printNextSteps(yes);
  }
}

main();
