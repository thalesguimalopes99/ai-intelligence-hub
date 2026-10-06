import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static assertions over the GitHub Actions workflow YAML (read as plain text,
 * no YAML dependency) and vercel.json. These lock the operational properties
 * of the hourly loop: PIPE-01/02/04/05/06 and decisions D-03/D-04/D-10.
 */

const ROOT = process.cwd();
const OWNER_EMAIL = "215318905+thalesguimalopes99@users.noreply.github.com";
const OWNER_NAME = "Thales Guimarães Lopes";

function readText(rel: string): string {
  const path = join(ROOT, rel);
  if (!existsSync(path)) throw new Error(`${rel} does not exist`);
  // Normalise CRLF so the line-based helpers behave the same on Windows.
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const RUN_KEY = /^(\s*)(-\s+)?run:\s*(.*)$/;

/**
 * Returns the body of every `run:` step: inline scalars (`run: cmd`) as a
 * single line, block scalars (`run: |`) as every following line indented
 * deeper than the `run:` key (blank lines included).
 */
export function extractRunBlocks(yaml: string): string[] {
  const lines = yaml.split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = RUN_KEY.exec(lines[i]);
    if (!match) continue;
    // Indentation of the `run` key itself (a leading "- " counts as indent).
    const keyIndent = match[1].length + (match[2]?.length ?? 0);
    const rest = match[3].trim();
    if (rest !== "" && !/^[|>][+-]?\d*$/.test(rest)) {
      blocks.push(rest);
      continue;
    }
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") {
        body.push(line);
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= keyIndent) break;
      body.push(line);
    }
    blocks.push(body.join("\n"));
    i = j - 1;
  }
  return blocks;
}

function envValue(yaml: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, "m").exec(yaml);
  return match?.[1];
}

describe("extractRunBlocks helper", () => {
  it("captures inline and block run scalars", () => {
    const yaml = [
      "steps:",
      "  - run: npm ci",
      "  - name: x",
      "    run: |",
      "      echo a",
      "",
      "      echo b",
      "    env:",
      "      A: b",
    ].join("\n");
    const blocks = extractRunBlocks(yaml);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("npm ci");
    expect(blocks[1]).toContain("echo a");
    expect(blocks[1]).toContain("echo b");
    expect(blocks[1]).not.toContain("A: b");
  });
});

describe("collect.yml (PIPE-01, PIPE-02, PIPE-04, D-03, D-04, D-10)", () => {
  const yaml = readText(".github/workflows/collect.yml");

  it("runs hourly at an off-minute and on manual dispatch (PIPE-01)", () => {
    expect(yaml).toContain("cron: '17 * * * *'");
    expect(yaml).toContain("workflow_dispatch:");
  });

  it("is serialized without cancelling in-flight runs (PIPE-04)", () => {
    expect(yaml).toContain("group: collect");
    expect(yaml).toContain("cancel-in-progress: false");
  });

  it("checks out the branch tip, not the trigger-time SHA", () => {
    expect(yaml).toContain("actions/checkout@v7");
    expect(yaml).toMatch(/^\s+ref: main\s*$/m);
  });

  it("uses the pinned toolchain and hard limits", () => {
    expect(yaml).toContain("actions/setup-node@v7");
    expect(yaml).toContain("node-version-file: '.nvmrc'");
    expect(yaml).toContain("contents: write");
    expect(yaml).toContain("timeout-minutes: 10");
  });

  it("commits as the owner noreply identity, both author and committer (D-10)", () => {
    expect(envValue(yaml, "GIT_AUTHOR_EMAIL")).toBe(OWNER_EMAIL);
    expect(envValue(yaml, "GIT_COMMITTER_EMAIL")).toBe(OWNER_EMAIL);
    expect(envValue(yaml, "GIT_AUTHOR_NAME")).toBe(OWNER_NAME);
    expect(envValue(yaml, "GIT_COMMITTER_NAME")).toBe(OWNER_NAME);
    expect(yaml.split(OWNER_EMAIL).length - 1).toBe(2);
  });

  it("stages only data/ with the D-04 commit message", () => {
    const runs = extractRunBlocks(yaml).join("\n");
    expect(runs).toContain("git add data/");
    expect(runs).not.toMatch(/git add (-A|\.|--all)/);
    expect(runs).toMatch(/git commit -m "chore\(data\): update feed /);
    expect(runs).toContain("itens]");
  });

  it("retries the push with pull --rebase and never forces (PIPE-04)", () => {
    const runs = extractRunBlocks(yaml).join("\n");
    expect(runs).toContain("git pull --rebase origin main");
    expect(runs).toMatch(/for attempt in 1 2 3/);
    expect(runs).toContain("git rebase --abort");
    expect(yaml).not.toMatch(/--force|\s-f\b|force/);
  });

  it("invokes the collector with the trigger exposed via env", () => {
    expect(yaml).toMatch(/id: collect/);
    expect(yaml).toContain("npm run collect");
    expect(yaml).toMatch(/COLLECT_TRIGGER: \$\{\{ github\.event_name \}\}/);
    expect(yaml).toMatch(/steps\.collect\.outputs\.items_new/);
    expect(yaml).toMatch(/steps\.collect\.outputs\.run_status == 'failed'/);
  });

  it("validates the hold input before sleeping", () => {
    const runs = extractRunBlocks(yaml).join("\n");
    expect(yaml).toContain("hold_seconds");
    expect(runs).toMatch(/case "\$HOLD" in/);
    expect(runs).toContain("600");
  });

  it("wires an inert Deploy Hook fallback with a step-level secret (D-10, T-01-10)", () => {
    expect(yaml).toContain("steps.push.outputs.pushed == 'true'");
    const hookLines = yaml.split("\n").filter((l) => l.includes("secrets.VERCEL_DEPLOY_HOOK"));
    expect(hookLines).toHaveLength(1);
    // Step-level env sits deeper than the job-level env (4 spaces).
    expect(hookLines[0]).toMatch(/^ {10}HOOK: \$\{\{ secrets\.VERCEL_DEPLOY_HOOK \}\}\s*$/);
    const runs = extractRunBlocks(yaml).join("\n");
    expect(runs).toContain('if [ -z "$HOOK" ]');
    expect(runs).toContain('curl -fsS -X POST "$HOOK" > /dev/null');
  });

  it("never interpolates ${{ }} inside a run: script (T-01-07)", () => {
    const blocks = extractRunBlocks(yaml);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const block of blocks) expect(block).not.toContain("${{");
  });

  it("does not use the auto-commit action, the bot identity or pull_request_target", () => {
    expect(yaml).not.toContain("git-auto-commit-action");
    expect(yaml).not.toContain("github-actions[bot]");
    expect(yaml).not.toContain("pull_request_target");
  });
});

describe("ci.yml (PIPE-06, D-04, T-01-08)", () => {
  const yaml = readText(".github/workflows/ci.yml");

  it("runs on pushes to main and on pull requests, both ignoring data/**", () => {
    expect(yaml).toMatch(/^\s+push:\s*$/m);
    expect(yaml).toMatch(/branches: \[main\]/);
    expect(yaml).toMatch(/^\s+pull_request:\s*$/m);
    const ignores = yaml.split("\n").filter((l) => l.includes("paths-ignore"));
    expect(ignores).toHaveLength(2);
    for (const line of ignores) expect(line).toContain("'data/**'");
  });

  it("is read-only, never uses pull_request_target and references no secrets", () => {
    expect(yaml).toContain("contents: read");
    expect(yaml).not.toContain("contents: write");
    expect(yaml).not.toContain("pull_request_target");
    expect(yaml).not.toContain("secrets.");
  });

  it("uses the pinned toolchain", () => {
    expect(yaml).toContain("actions/checkout@v7");
    expect(yaml).toContain("actions/setup-node@v7");
    expect(yaml).toContain(".nvmrc");
  });

  it("runs the quality gates in order, ending with the static-route guard", () => {
    const commands = [
      "run: npm ci",
      "run: npm run typecheck",
      "run: npm run lint",
      "run: npm test",
      "run: npm run validate:data",
      "run: npm run build",
      "run: npm run check:static",
    ];
    const positions = commands.map((cmd) => yaml.indexOf(cmd));
    for (const [i, pos] of positions.entries()) {
      expect(pos, commands[i]).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(pos, commands[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("never interpolates ${{ }} inside a run: script", () => {
    for (const block of extractRunBlocks(yaml)) expect(block).not.toContain("${{");
  });
});

describe("vercel.json (PIPE-05)", () => {
  const config = JSON.parse(readText("vercel.json")) as {
    framework?: string;
    buildCommand?: string;
    git?: { deploymentEnabled?: Record<string, boolean> };
  };

  it("deploys only main", () => {
    expect(config.git?.deploymentEnabled).toEqual({ "**": false, main: true });
  });

  it("pins the build command so build-views runs before next build", () => {
    expect(config.buildCommand).toBe("npm run build");
  });

  it("pins the Next.js framework preset (CLI-created projects default to Other)", () => {
    expect(config.framework).toBe("nextjs");
  });
});
