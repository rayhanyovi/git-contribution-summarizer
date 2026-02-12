#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ----------- CLI ARGS -----------

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    path: ".",
    email: null,
    emails: null,
    apiKey: null,
    apiKeys: null,
    geminiApiKey: null,
    geminiApiKeys: null,
    openaiApiKey: null,
    openaiApiKeys: null,
    anthropicApiKey: null,
    anthropicApiKeys: null,
    since: null,
    until: null,
    model: null,
    provider: null,
    include: null,
    exclude: null,
    outputDir: null,
    mode: null,
    maxDiffBytes: null,
    maxCommits: null,
    noLlm: false,
    includeMerges: false,
    only: null,
    fullDiff: false,
  };

  const takeNext = (i, arr) =>
    i + 1 < arr.length && !arr[i + 1].startsWith("-") ? arr[i + 1] : null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-p":
      case "--path": {
        const v = takeNext(i, args);
        if (v) {
          out.path = v;
          i++;
        }
        break;
      }
      case "-e":
      case "--email": {
        const v = takeNext(i, args);
        if (v) {
          out.email = v;
          i++;
        }
        break;
      }
      case "--emails": {
        const v = takeNext(i, args);
        if (v) {
          out.emails = v;
          i++;
        }
        break;
      }
      case "-g":
      case "--gemini-api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.geminiApiKey = v;
          i++;
        }
        break;
      }
      case "--gemini-api-keys": {
        const v = takeNext(i, args);
        if (v) {
          out.geminiApiKeys = v;
          i++;
        }
        break;
      }
      case "--openai-api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.openaiApiKey = v;
          i++;
        }
        break;
      }
      case "--openai-api-keys": {
        const v = takeNext(i, args);
        if (v) {
          out.openaiApiKeys = v;
          i++;
        }
        break;
      }
      case "--anthropic-api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.anthropicApiKey = v;
          i++;
        }
        break;
      }
      case "--anthropic-api-keys": {
        const v = takeNext(i, args);
        if (v) {
          out.anthropicApiKeys = v;
          i++;
        }
        break;
      }
      case "--api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.apiKey = v;
          i++;
        }
        break;
      }
      case "--api-keys": {
        const v = takeNext(i, args);
        if (v) {
          out.apiKeys = v;
          i++;
        }
        break;
      }
      case "--since": {
        const v = takeNext(i, args);
        if (v) {
          out.since = v;
          i++;
        }
        break;
      }
      case "--until": {
        const v = takeNext(i, args);
        if (v) {
          out.until = v;
          i++;
        }
        break;
      }
      case "--model": {
        const v = takeNext(i, args);
        if (v) {
          out.model = v;
          i++;
        }
        break;
      }
      case "--provider": {
        const v = takeNext(i, args);
        if (v) {
          out.provider = v;
          i++;
        }
        break;
      }
      case "--include": {
        const v = takeNext(i, args);
        if (v) {
          out.include = v;
          i++;
        }
        break;
      }
      case "--exclude": {
        const v = takeNext(i, args);
        if (v) {
          out.exclude = v;
          i++;
        }
        break;
      }
      case "--output-dir": {
        const v = takeNext(i, args);
        if (v) {
          out.outputDir = v;
          i++;
        }
        break;
      }
      case "--mode": {
        const v = takeNext(i, args);
        if (v) {
          out.mode = v;
          i++;
        }
        break;
      }
      case "--max-diff-bytes": {
        const v = takeNext(i, args);
        if (v) {
          out.maxDiffBytes = v;
          i++;
        }
        break;
      }
      case "--max-commits": {
        const v = takeNext(i, args);
        if (v) {
          out.maxCommits = v;
          i++;
        }
        break;
      }
      case "--no-llm": {
        out.noLlm = true;
        break;
      }
      case "--include-merges": {
        out.includeMerges = true;
        break;
      }
      case "--only": {
        const v = takeNext(i, args);
        if (v) {
          out.only = v;
          i++;
        }
        break;
      }
      case "--full-diff": {
        out.fullDiff = true;
        break;
      }
      default:
        break;
    }
  }

  return out;
}

// ----------- SMALL HELPERS -----------

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

function makeColorizer(enabled) {
  const codes = {
    gray: "90",
    red: "31",
    green: "32",
    yellow: "33",
    blue: "34",
    magenta: "35",
    cyan: "36",
  };
  return (text, color) => {
    if (!enabled || !color || !codes[color]) return text;
    return `\u001b[${codes[color]}m${text}\u001b[0m`;
  };
}

async function promptOptional(label, currentValue, colorize) {
  const suffix = currentValue ? ` [${currentValue}]` : "";
  const answer = (await ask(colorize(`${label}${suffix}: `, "cyan"))).trim();
  return answer || currentValue || null;
}

async function promptRequired(label, currentValue, colorize) {
  if (currentValue) return currentValue;
  while (true) {
    const answer = (await ask(colorize(`${label}: `, "cyan"))).trim();
    if (answer) return answer;
  }
}

function normalizeProvider(input) {
  if (!input) return null;
  const val = String(input).trim().toLowerCase();
  if (val === "gemini" || val === "google") return "gemini";
  if (val === "gpt" || val === "openai" || val === "chatgpt") return "gpt";
  if (val === "claude" || val === "anthropic") return "claude";
  return null;
}

async function selectFromList(
  label,
  options,
  initialIndex,
  colorize,
  timeoutMs,
) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return options[Math.max(0, Math.min(initialIndex, options.length - 1))];
  }

  const stdin = process.stdin;
  const stdout = process.stdout;
  const prevRaw = stdin.isRaw;
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);

  let index = Math.max(0, Math.min(initialIndex, options.length - 1));
  let linesCount = 0;
  let timer = null;
  let settled = false;

  const render = () => {
    const lines = [];
    const autoLabel =
      timeoutMs && timeoutMs > 0
        ? `${label} (use up/down, Enter, auto-select in ${Math.ceil(
            timeoutMs / 1000,
          )}s)`
        : `${label} (use up/down, Enter)`;
    lines.push(colorize(autoLabel, "cyan"));
    for (let i = 0; i < options.length; i++) {
      const prefix = i === index ? colorize(">", "green") : " ";
      lines.push(`${prefix} ${options[i]}`);
    }

    if (linesCount > 0) {
      stdout.write(`\u001b[${linesCount}A`);
    }
    stdout.write("\u001b[0J");
    stdout.write(lines.join("\n") + "\n");
    linesCount = lines.length;
  };

  render();

  return new Promise((resolve) => {
    const cancelAuto = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onKeypress = (_str, key) => {
      cancelAuto();
      if (key && key.ctrl && key.name === "c") {
        process.exit(130);
      }
      if (key && (key.name === "up" || key.name === "k")) {
        index = (index - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key && (key.name === "down" || key.name === "j")) {
        index = (index + 1) % options.length;
        render();
        return;
      }
      if (key && (key.name === "return" || key.name === "enter")) {
        resolveSelection();
      }
    };

    const cleanup = () => {
      cancelAuto();
      stdin.removeListener("keypress", onKeypress);
      if (stdin.setRawMode) stdin.setRawMode(Boolean(prevRaw));
      if (linesCount > 0) {
        stdout.write(`\u001b[${linesCount}A`);
        stdout.write("\u001b[0J");
      }
      stdout.write(colorize(`${label}: ${options[index]}\n`, "green"));
    };

    const resolveSelection = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(options[index]);
    };

    stdin.on("keypress", onKeypress);

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        resolveSelection();
      }, timeoutMs);
    }
  });
}

function shortHash(hash) {
  return hash.slice(0, 7);
}

function parseCommaList(input) {
  if (!input) return null;
  return String(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolEnv(input) {
  if (input == null) return false;
  const v = String(input).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
  return new RegExp(regex);
}

function matchesGlobs(value, globs) {
  if (!globs || !globs.length) return true;
  return globs.some((g) => globToRegExp(g).test(value));
}

function filterReposByGlobs(repos, includeGlobs, excludeGlobs) {
  return repos.filter((repo) => {
    const included = includeGlobs?.length ? matchesGlobs(repo.name, includeGlobs) : true;
    const excluded = excludeGlobs?.length ? matchesGlobs(repo.name, excludeGlobs) : false;
    return included && !excluded;
  });
}

function formatTimestampDir(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}__${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function clampNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ----------- GIT UTIL -----------

function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => {
      out += d.toString();
    });
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve(out);
      else
        reject(
          new Error(`git ${args.join(" ")} failed in ${cwd}:\n${err.trim()}`),
        );
    });
  });
}

// ----------- SCAN REPOSITORIES -----------

async function scanRepositories(rootPath) {
  const repos = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (!ent.isDirectory()) continue;

      if (ent.name === ".git") {
        const repoPath = path.dirname(full);
        const name = path.basename(repoPath);
        // avoid duplicate if multiple .git found somehow
        if (!repos.some((r) => r.path === repoPath)) {
          repos.push({ name, path: repoPath });
        }
        // don't walk inside .git
        continue;
      }

      // skip some heavy folders if you want
      if (ent.name === "node_modules") continue;

      await walk(full);
    }
  }

  await walk(rootPath);
  return repos;
}

// ----------- GET COMMITS (WITH DATE FILTER) -----------

async function getCommits(
  repoPath,
  emails,
  since,
  until,
  includeMerges,
  maxCommits,
) {
  const authorRegex = emails?.length
    ? `(${emails.map(escapeRegex).join("|")})`
    : null;
  const args = [
    "log",
    ...(authorRegex
      ? [
          `--author=${authorRegex}`,
          "--extended-regexp",
          "--regexp-ignore-case",
        ]
      : []),
    "--pretty=format:%H|%ad|%an|%ae|%s",
    "--date=iso",
  ];

  if (!includeMerges) args.push("--no-merges");

  if (since) args.push(`--since=${since}`); // e.g. 2025-01-01
  if (until) args.push(`--until=${until}`); // e.g. 2025-12-31
  if (maxCommits) args.push(`--max-count=${maxCommits}`);

  const out = await execGit(args, repoPath);

  const commits = [];

  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const [hash, dateStr, authorName, authorEmail, message] = parts;
    const date = new Date(dateStr);

    const lower = message.toLowerCase();
    let typeHint = "other";
    if (lower.startsWith("feat")) typeHint = "feature";
    else if (lower.startsWith("fix")) typeHint = "fix";
    else if (lower.startsWith("perf")) typeHint = "tech-improvement";
    else if (lower.startsWith("refactor")) typeHint = "tech-improvement";

    commits.push({
      hash,
      message,
      date,
      authorName,
      authorEmail,
      typeHint,
    });
  }

  return commits;
}

async function getDiffForCommit(repoPath, hash) {
  const args = ["show", "--format=", "--unified=3", hash];
  return execGit(args, repoPath);
}

function extractFilePathsFromDiff(diffText) {
  if (!diffText) return [];
  const files = new Set();
  for (const line of diffText.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const parts = line.split(" ");
    if (parts.length >= 4) {
      const aPath = parts[2]?.replace(/^a\//, "");
      const bPath = parts[3]?.replace(/^b\//, "");
      if (aPath) files.add(aPath);
      if (bPath) files.add(bPath);
    }
  }
  return Array.from(files);
}

function buildDiffSnippet(diffText, maxBytes, truncateReason) {
  if (!diffText) {
    return {
      snippet: "",
      bytesUsed: 0,
      truncated: false,
      truncateReason: null,
    };
  }

  const totalBytes = Buffer.byteLength(diffText);
  if (totalBytes <= maxBytes) {
    return {
      snippet: diffText,
      bytesUsed: totalBytes,
      truncated: false,
      truncateReason: null,
    };
  }

  let bytesUsed = 0;
  const lines = diffText.split("\n");
  const out = [];
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + "\n");
    if (bytesUsed + lineBytes > maxBytes) break;
    out.push(line);
    bytesUsed += lineBytes;
  }
  out.push("/* TRUNCATED: exceeded per-commit or per-repo diff limit */");

  return {
    snippet: out.join("\n"),
    bytesUsed,
    truncated: true,
    truncateReason: truncateReason || "per-commit",
  };
}

// ----------- REPO SELECTION -----------

async function selectReposInteractive(reposWithCommits, isInteractive) {
  if (!isInteractive) return reposWithCommits;
  console.log("\nRepositories with matching commits:\n");
  reposWithCommits.forEach((r, idx) => {
    console.log(`[${idx + 1}] ${r.name}  (${r.commits.length} commits)`);
  });
  console.log("");

  const ans = await ask("Select repos (e.g. 1,3,5) or press Enter for ALL: ");
  const trimmed = ans.trim();
  if (!trimmed) return reposWithCommits;

  const idxs = trimmed
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= reposWithCommits.length);

  if (!idxs.length) return reposWithCommits;

  return idxs.map((i) => reposWithCommits[i - 1]);
}

// ----------- BATCHING -----------

function chunkCommits(enrichedCommits, maxCharsPerBatch = 40000) {
  const batches = [];
  let current = [];
  let curLen = 0;

  for (const c of enrichedCommits) {
    const approxLen =
      (c.message?.length || 0) + (c.diffSnippet?.length || 0) + 400; // overhead

    if (current.length && curLen + approxLen > maxCharsPerBatch) {
      batches.push(current);
      current = [];
      curLen = 0;
    }

    current.push(c);
    curLen += approxLen;
  }

  if (current.length) batches.push(current);
  return batches;
}

// ----------- LLM CLIENTS (REST) -----------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash-lite",
  gpt: "gpt-4o-mini",
  claude: "claude-3-5-sonnet-20240620",
};

const MODEL_CHOICES = {
  gemini: [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
  ],
  gpt: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  claude: [
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
};

const PROVIDER_MENU = [
  { label: "Gemini (Google)", value: "gemini" },
  { label: "ChatGPT (OpenAI)", value: "gpt" },
  { label: "Claude (Anthropic)", value: "claude" },
];

function buildPrompt(commitsBatch) {
  const blocks = commitsBatch
    .map((c, idx) =>
      [
        `=== COMMIT ${idx + 1} START ===`,
        `HASH: ${c.hash}`,
        `REPO: ${c.repoName}`,
        `DATE: ${c.date.toISOString()}`,
        `TYPE_HINT: ${c.typeHint}`,
        `MESSAGE: ${c.message}`,
        `DIFF:`,
        "```diff",
        c.diffSnippet || "",
        "```",
        `=== COMMIT ${idx + 1} END ===`,
        "",
      ].join("\n"),
    )
    .join("\n");

  return `
You are analyzing git commits for a performance review brag document.

You receive multiple commits with:
- HASH
- REPO
- DATE
- TYPE_HINT (from commit prefix, may be useful but not always correct)
- MESSAGE (commit message)
- DIFF (unified diff)

For EACH commit:
1. Read MESSAGE and DIFF together to understand what changed and why.
2. Classify into EXACTLY ONE type:
   - "feature"          = new user-facing capability or significant behavior change
   - "fix"              = bug fix, defect resolution
   - "tech-improvement" = refactor, performance, infra, tests, DX, cleanup
   - "docs"             = documentation, comments, READMEs
   - "chore"            = minor config tweaks, housekeeping
   - "other"
3. Generate ONE concise summary (max 25 words) describing the impact of the change.

Use TYPE_HINT only as a weak signal; if DIFF clearly contradicts it, trust the DIFF.

Return ONLY a JSON array. Each element MUST be:

{
  "hash": "<commit hash from input>",
  "type": "feature" | "fix" | "tech-improvement" | "docs" | "chore" | "other",
  "summary": "<short impact-focused sentence>"
}

Now process the following commits:

${blocks}
`.trim();
}

function buildRepoSummaryPrompt({ repoName, commits }) {
  const lines = commits
    .map((c, idx) => {
      const files = c.files?.length ? c.files.join(", ") : "unknown";
      return [
        `COMMIT ${idx + 1}`,
        `HASH: ${c.hash}`,
        `DATE: ${c.date?.toISOString?.() || ""}`,
        `AUTHOR: ${c.authorName || ""} <${c.authorEmail || ""}>`,
        `TYPE: ${c.analysis?.type || c.typeHint || "other"}`,
        `SUBJECT: ${c.message}`,
        `SUMMARY: ${c.analysis?.summary || c.message}`,
        `FILES: ${files}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
You are summarizing contributions for a single git repository.

Rules:
- Use ONLY the provided commit subjects, summaries, and file paths.
- Do NOT invent metrics, tickets, or impact. If unclear, say "unclear from diff".
- Keep outputs concise and evidence-based.

Return ONLY a JSON object with this exact shape:
{
  "repo": "${repoName}",
  "themes": ["..."],
  "highlights": ["..."],
  "risks_or_debt": ["..."],
  "evidence": ["<commit subject> | <file path>", "..."],
  "outline": ["..."]
}

Commit data:
${lines}
`.trim();
}

function buildOverallSummaryPrompt({ repoSummaries }) {
  const payload = JSON.stringify(repoSummaries, null, 2);
  return `
You are producing a cross-repo summary of contributions.

Rules:
- Use ONLY the provided repo summaries.
- Do NOT invent metrics, tickets, or impact. If unclear, say "unclear from diff".
- Keep outputs concise and evidence-based.

Return ONLY a JSON object with this exact shape:
{
  "overall_themes": ["..."],
  "overall_highlights": ["..."],
  "by_project": {
    "<repo>": {
      "themes": ["..."],
      "highlights": ["..."],
      "risks_or_debt": ["..."]
    }
  },
  "skills_surface": {
    "frontend": ["..."],
    "backend": ["..."],
    "devops": ["..."]
  }
}

Repo summaries:
${payload}
`.trim();
}

function buildCvPrompt({ repoSummaries, overallSummary }) {
  const payload = JSON.stringify({ repoSummaries, overallSummary }, null, 2);
  return `
You are writing CV content from git contribution evidence.

Rules:
- Use ONLY the provided summaries.
- Do NOT invent metrics, tickets, or impact. If unclear, say "unclear from diff".
- Keep text concise and professional.
- Avoid fluff words like "helped" or "worked on".

Return ONLY a JSON object:
{
  "cv_md": "<markdown>",
  "cv_bullets_md": "<markdown>"
}

Required formatting:
1) cv_md:
   - 1-3 short paragraphs total
   - grouped by repo with short highlights (use headings)
2) cv_bullets_md:
   - 6-12 bullets total, grouped by repo headings
   - each bullet: action verb + scope + tech + impact (no invented numbers)
   - each bullet should be <= 2 lines

Input:
${payload}
`.trim();
}

function buildPerformancePrompt({ repoSummaries, overallSummary }) {
  const payload = JSON.stringify({ repoSummaries, overallSummary }, null, 2);
  return `
You are writing a performance report from git contribution evidence.

Rules:
- Use ONLY the provided summaries.
- Do NOT invent metrics, tickets, or impact. If unclear, say "unclear from diff".
- Keep outputs concise and evidence-based.

Return ONLY markdown with these sections:
- Summary (what I shipped / improved)
- Projects breakdown (per repo)
- Outcomes & impact (no fabricated metrics; qualify uncertainty)
- Challenges/constraints (if inferred)
- Risks/tech debt + follow-ups
- Next month plan suggestions (optional)

Input:
${payload}
`.trim();
}

async function callGemini({
  apiKey,
  model,
  prompt,
  responseMimeType = "application/json",
}) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      response_mime_type: responseMimeType,
    },
  };

  const url = `${GEMINI_BASE}/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = await res.json();
  let rawText = "";

  if (typeof data.output_text === "string") {
    rawText = data.output_text;
  } else if (Array.isArray(data.candidates)) {
    rawText = data.candidates
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
  } else if (typeof data === "string") {
    rawText = data;
  }

  return rawText;
}

async function callOpenAI({ apiKey, model, prompt }) {
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 2000,
  };

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callClaude({ apiKey, model, prompt }) {
  const body = {
    model,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.content)) return "";
  return data.content.map((p) => p?.text ?? "").join("");
}

async function callProviderText({
  provider,
  apiKey,
  model,
  prompt,
  responseMimeType,
}) {
  switch (provider) {
    case "gemini":
      return callGemini({ apiKey, model, prompt, responseMimeType });
    case "gpt":
      return callOpenAI({ apiKey, model, prompt });
    case "claude":
      return callClaude({ apiKey, model, prompt });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function extractJsonBlock(rawText, openChar, closeChar) {
  const txt = (rawText || "").trim();
  const start = txt.indexOf(openChar);
  const end = txt.lastIndexOf(closeChar);
  if (start >= 0 && end >= 0 && end > start) {
    return txt.slice(start, end + 1);
  }
  return txt;
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota")
  );
}

function createKeyRing(keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  return {
    keys: list,
    index: 0,
    current() {
      return this.keys[this.index];
    },
    rotate() {
      if (!this.keys.length) return;
      this.index = (this.index + 1) % this.keys.length;
    },
  };
}

async function callProviderTextWithKeyRing({
  provider,
  keyRing,
  model,
  prompt,
  responseMimeType,
}) {
  if (!keyRing?.keys?.length) {
    throw new Error("No API keys available for provider.");
  }
  let attempts = 0;
  let lastErr;
  while (attempts < keyRing.keys.length) {
    const apiKey = keyRing.current();
    try {
      return await callProviderText({
        provider,
        apiKey,
        model,
        prompt,
        responseMimeType,
      });
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && keyRing.keys.length > 1) {
        keyRing.rotate();
        attempts++;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function analyzeCommitsBatch({
  provider,
  keyRing,
  model,
  commitsBatch,
}) {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is not available. Use Node 18+ or polyfill fetch.",
    );
  }

  const prompt = buildPrompt(commitsBatch);
  const rawText = await callProviderTextWithKeyRing({
    provider,
    keyRing,
    model,
    prompt,
  });

  const jsonText = extractJsonBlock(rawText, "[", "]");

  let arr;
  try {
    arr = JSON.parse(jsonText);
  } catch {
    const fallback = {};
    for (const c of commitsBatch) {
      fallback[c.hash] = {
        type: c.typeHint || "other",
        summary: c.message,
      };
    }
    return fallback;
  }

  const allowed = [
    "feature",
    "fix",
    "tech-improvement",
    "docs",
    "chore",
    "other",
  ];

  const map = {};
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const hash = String(item.hash || "").trim();
    if (!hash) continue;
    const type = allowed.includes(item.type) ? item.type : "other";
    const summary =
      typeof item.summary === "string" && item.summary.trim()
        ? item.summary.trim()
        : "(no summary)";
    map[hash] = { type, summary };
  }

  return map;
}

async function analyzeAllCommitsWithDiff({
  provider,
  keyRing,
  model,
  enrichedCommits,
  colorize,
}) {
  const batches = chunkCommits(enrichedCommits, 40000);
  const analysisMap = {};

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      colorize(
        `🧠 Analyzing batch ${i + 1}/${batches.length} (${
          batch.length
        } commits)...`,
        "magenta",
      ),
    );
    try {
      const res = await analyzeCommitsBatch({
        provider,
        keyRing,
        model,
        commitsBatch: batch,
      });
      Object.assign(analysisMap, res);
    } catch (e) {
      console.error(colorize(`  ${provider} batch error: ${e.message}`, "red"));
      for (const c of batch) {
        if (!analysisMap[c.hash]) {
          analysisMap[c.hash] = {
            type: c.typeHint || "other",
            summary: c.message,
          };
        }
      }
    }
  }

  return analysisMap;
}

function buildFallbackAnalysisMap(enrichedCommits) {
  const map = {};
  for (const c of enrichedCommits) {
    map[c.hash] = {
      type: c.typeHint || "other",
      summary: c.message,
    };
  }
  return map;
}

function normalizeRepoSummary(input, repoName) {
  const ensureArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  return {
    repo: input?.repo || repoName,
    themes: ensureArray(input?.themes),
    highlights: ensureArray(input?.highlights),
    risks_or_debt: ensureArray(input?.risks_or_debt),
    evidence: ensureArray(input?.evidence),
    outline: ensureArray(input?.outline),
  };
}

function buildBasicRepoSummary(repoName, commits) {
  const typeNames = {
    feature: "features",
    fix: "fixes",
    "tech-improvement": "tech improvements",
    docs: "documentation",
    chore: "chores",
    other: "other work",
  };
  const themeSet = new Set();
  const highlights = [];
  const evidence = [];

  for (const c of commits) {
    const type = c.analysis?.type || c.typeHint || "other";
    themeSet.add(typeNames[type] || "other work");
    const summary = c.analysis?.summary || c.message;
    if (summary && highlights.length < 7) highlights.push(summary);
    if (c.files?.length) {
      for (const f of c.files.slice(0, 2)) {
        if (evidence.length >= 10) break;
        evidence.push(`${c.message} | ${f}`);
      }
    }
  }

  return {
    repo: repoName,
    themes: Array.from(themeSet),
    highlights,
    risks_or_debt: [],
    evidence,
    outline: highlights.slice(0, 7),
  };
}

function buildBasicOverallSummary(repoSummaries) {
  const themeSet = new Set();
  const highlights = [];
  const byProject = {};
  for (const s of repoSummaries) {
    s.themes?.forEach((t) => themeSet.add(t));
    if (s.highlights?.length) highlights.push(...s.highlights.slice(0, 2));
    byProject[s.repo] = {
      themes: s.themes || [],
      highlights: s.highlights || [],
      risks_or_debt: s.risks_or_debt || [],
    };
  }
  return {
    overall_themes: Array.from(themeSet),
    overall_highlights: highlights.slice(0, 10),
    by_project: byProject,
    skills_surface: { frontend: [], backend: [], devops: [] },
  };
}

async function analyzeRepoSummary({
  provider,
  keyRing,
  model,
  repoName,
  commits,
}) {
  const prompt = buildRepoSummaryPrompt({ repoName, commits });
  const rawText = await callProviderTextWithKeyRing({
    provider,
    keyRing,
    model,
    prompt,
  });
  const jsonText = extractJsonBlock(rawText, "{", "}");
  const parsed = JSON.parse(jsonText);
  return normalizeRepoSummary(parsed, repoName);
}

async function analyzeOverallSummary({
  provider,
  keyRing,
  model,
  repoSummaries,
}) {
  const prompt = buildOverallSummaryPrompt({ repoSummaries });
  const rawText = await callProviderTextWithKeyRing({
    provider,
    keyRing,
    model,
    prompt,
  });
  const jsonText = extractJsonBlock(rawText, "{", "}");
  const parsed = JSON.parse(jsonText);
  return {
    overall_themes: Array.isArray(parsed?.overall_themes)
      ? parsed.overall_themes
      : [],
    overall_highlights: Array.isArray(parsed?.overall_highlights)
      ? parsed.overall_highlights
      : [],
    by_project:
      parsed?.by_project && typeof parsed.by_project === "object"
        ? parsed.by_project
        : {},
    skills_surface:
      parsed?.skills_surface && typeof parsed.skills_surface === "object"
        ? parsed.skills_surface
        : { frontend: [], backend: [], devops: [] },
  };
}

async function generateCvDocs({
  provider,
  keyRing,
  model,
  repoSummaries,
  overallSummary,
}) {
  const prompt = buildCvPrompt({ repoSummaries, overallSummary });
  const rawText = await callProviderTextWithKeyRing({
    provider,
    keyRing,
    model,
    prompt,
  });
  const jsonText = extractJsonBlock(rawText, "{", "}");
  const parsed = JSON.parse(jsonText);
  return {
    cvMd: parsed?.cv_md || "",
    cvBulletsMd: parsed?.cv_bullets_md || "",
  };
}

async function generatePerformanceDoc({
  provider,
  keyRing,
  model,
  repoSummaries,
  overallSummary,
}) {
  const prompt = buildPerformancePrompt({ repoSummaries, overallSummary });
  const rawText = await callProviderTextWithKeyRing({
    provider,
    keyRing,
    model,
    prompt,
    responseMimeType: "text/plain",
  });
  return rawText?.trim() || "";
}

// ----------- MARKDOWN GENERATOR -----------

function pushGroup(lines, title, items) {
  if (!items.length) return;
  lines.push(`### ${title}`);
  for (const it of items) lines.push(it);
  lines.push("");
}

function formatBulletList(items, fallback) {
  if (!items || !items.length) return [fallback || "- (unclear from diff)"];
  return items.map((it) => `- ${it}`);
}

function inferTechFromEvidence(evidenceLines) {
  const techs = new Set();
  for (const line of evidenceLines || []) {
    const parts = String(line).split("|");
    const file = parts[1]?.trim();
    if (!file) continue;
    const base = path.basename(file);
    const ext = path.extname(file).toLowerCase();

    if (base.toLowerCase() === "dockerfile") techs.add("Docker");
    if (ext === ".ts" || ext === ".tsx") techs.add("TypeScript");
    if (ext === ".js" || ext === ".jsx") techs.add("JavaScript");
    if (ext === ".go") techs.add("Go");
    if (ext === ".php") techs.add("PHP");
    if (ext === ".py") techs.add("Python");
    if (ext === ".rb") techs.add("Ruby");
    if (ext === ".java") techs.add("Java");
    if (ext === ".cs") techs.add("C#");
    if (ext === ".kt" || ext === ".kts") techs.add("Kotlin");
    if (ext === ".swift") techs.add("Swift");
    if (ext === ".sql") techs.add("SQL");
    if (ext === ".vue") techs.add("Vue");
    if (ext === ".svelte") techs.add("Svelte");
    if (ext === ".css" || ext === ".scss" || ext === ".sass")
      techs.add("CSS");
    if (ext === ".yml" || ext === ".yaml") techs.add("YAML");
    if (ext === ".tf" || ext === ".hcl") techs.add("Terraform");
  }
  return Array.from(techs);
}

function buildSummaryDoc({
  emails,
  since,
  until,
  totalCommits,
  repoSummaries,
  overallSummary,
}) {
  const lines = [];
  lines.push("# Contribution Summary");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Emails: ${emails.join(", ")}`);
  if (since || until) {
    lines.push(`Date range: ${since || "?"} -> ${until || "?"}`);
  }
  lines.push(`Repos: ${repoSummaries.length} | Commits: ${totalCommits}`);
  lines.push("");

  lines.push("## Overall Summary");
  lines.push("### Themes");
  lines.push(...formatBulletList(overallSummary?.overall_themes));
  lines.push("");
  lines.push("### Highlights");
  lines.push(...formatBulletList(overallSummary?.overall_highlights));
  lines.push("");

  const skills = overallSummary?.skills_surface || {};
  if (
    (skills.frontend && skills.frontend.length) ||
    (skills.backend && skills.backend.length) ||
    (skills.devops && skills.devops.length)
  ) {
    lines.push("### Skills Surface (evidence-based)");
    if (skills.frontend?.length)
      lines.push(`- Frontend: ${skills.frontend.join(", ")}`);
    if (skills.backend?.length)
      lines.push(`- Backend: ${skills.backend.join(", ")}`);
    if (skills.devops?.length)
      lines.push(`- DevOps: ${skills.devops.join(", ")}`);
    lines.push("");
  }

  lines.push("## Per-Repo Summary");
  for (const summary of repoSummaries) {
    lines.push(`### ${summary.repo}`);
    lines.push("**Themes**");
    lines.push(...formatBulletList(summary.themes));
    lines.push("");
    lines.push("**Highlights**");
    lines.push(...formatBulletList(summary.highlights));
    lines.push("");
    lines.push("**Risks / Tech Debt**");
    lines.push(...formatBulletList(summary.risks_or_debt, "- (none noted)"));
    lines.push("");
    lines.push("**Evidence**");
    lines.push(...formatBulletList(summary.evidence));
    lines.push("");
    lines.push("**Contribution Outline**");
    lines.push(...formatBulletList(summary.outline));
    lines.push("");
  }

  return lines.join("\n");
}

function buildFallbackCvDocs({ repoSummaries, overallSummary }) {
  const lines = [];
  lines.push("# Experience Highlights");
  lines.push("");

  const themes = overallSummary?.overall_themes?.slice(0, 4).join(", ");
  const highlights = overallSummary?.overall_highlights?.slice(0, 4).join("; ");
  const para = [
    themes
      ? `Focused on ${themes} across multiple repositories.`
      : "Focused on product and technical improvements across multiple repositories.",
    highlights ? `Highlights include ${highlights}.` : "Highlights are unclear from diff.",
  ].join(" ");
  lines.push(para);
  lines.push("");

  for (const summary of repoSummaries) {
    lines.push(`## ${summary.repo}`);
    const items = summary.highlights?.slice(0, 3) || [];
    if (!items.length) {
      lines.push("- (unclear from diff)");
    } else {
      for (const it of items) lines.push(`- ${it}`);
    }
    lines.push("");
  }

  const bullets = [];
  for (const summary of repoSummaries) {
    const techHints = inferTechFromEvidence(summary.evidence).slice(0, 2);
    const techLabel = techHints.length ? techHints.join(", ") : "core stack";
    for (const highlight of summary.highlights || []) {
      if (bullets.length >= 12) break;
      bullets.push({
        repo: summary.repo,
        text: highlight,
        techLabel,
      });
    }
    if (bullets.length >= 12) break;
  }

  if (bullets.length < 6 && repoSummaries.length) {
    for (const summary of repoSummaries) {
      if (bullets.length >= 6) break;
      const techHints = inferTechFromEvidence(summary.evidence).slice(0, 2);
      const techLabel = techHints.length ? techHints.join(", ") : "core stack";
      bullets.push({
        repo: summary.repo,
        text: "additional improvements",
        techLabel,
      });
    }
  }

  const bulletLines = [];
  bulletLines.push("# CV Bullets");
  bulletLines.push("");
  const byRepo = new Map();
  for (const b of bullets.slice(0, 12)) {
    if (!byRepo.has(b.repo)) byRepo.set(b.repo, []);
    byRepo.get(b.repo).push({ text: b.text, techLabel: b.techLabel });
  }

  for (const [repo, items] of byRepo.entries()) {
    bulletLines.push(`## ${repo}`);
    for (const it of items.slice(0, 6)) {
      bulletLines.push(
        `- Delivered ${it.text} in ${repo} using ${it.techLabel} to improve maintainability (impact unclear from diff).`,
      );
    }
    bulletLines.push("");
  }

  return {
    cvMd: lines.join("\n"),
    cvBulletsMd: bulletLines.join("\n"),
  };
}

function buildFallbackPerformanceDoc({ repoSummaries, overallSummary }) {
  const lines = [];
  lines.push("# Performance Report");
  lines.push("");
  lines.push("## Summary (what I shipped / improved)");
  lines.push(...formatBulletList(overallSummary?.overall_highlights));
  lines.push("");
  lines.push("## Projects breakdown (per repo)");
  for (const summary of repoSummaries) {
    lines.push(`### ${summary.repo}`);
    lines.push(...formatBulletList(summary.highlights));
    lines.push("");
  }
  lines.push("## Outcomes & impact");
  lines.push("- Impact is unclear from diff; see highlights above.");
  lines.push("");
  lines.push("## Challenges/constraints");
  lines.push("- (unclear from diff)");
  lines.push("");
  lines.push("## Risks/tech debt + follow-ups");
  lines.push("- (none noted)");
  lines.push("");
  lines.push("## Next month plan suggestions");
  lines.push("- (optional)");
  lines.push("");
  return lines.join("\n");
}

async function createBragDoc({
  selectedRepos,
  enrichedByRepo,
  analysisMap,
  emails,
  outputDir,
}) {
  const lines = [];
  lines.push(`# Brag Document for ${emails.join(", ")}`);
  lines.push("");

  let totalCommits = 0;

  for (const repo of selectedRepos) {
    const repoKey = repo.name;
    const commits = enrichedByRepo.get(repoKey) || [];
    if (!commits.length) continue;

    lines.push(`## 📂 Repository: ${repo.name}`);
    lines.push("");

    const feats = [];
    const fixes = [];
    const techs = [];
    const docs = [];
    const chores = [];
    const others = [];

    for (const c of commits) {
      const a = analysisMap[c.hash] || {
        type: c.typeHint || "other",
        summary: c.message,
      };

      const dateStr = c.date?.toISOString?.().slice(0, 10) ?? "";
      const base = `- ${a.summary} (${shortHash(c.hash)}${dateStr ? ", " + dateStr : ""})`;

      switch (a.type) {
        case "feature":
          feats.push(base);
          break;
        case "fix":
          fixes.push(base);
          break;
        case "tech-improvement":
          techs.push(base);
          break;
        case "docs":
          docs.push(base);
          break;
        case "chore":
          chores.push(base);
          break;
        default:
          others.push(base);
          break;
      }

      totalCommits++;
    }

    pushGroup(lines, "🚀 Features Delivered", feats);
    pushGroup(lines, "🐛 Bug Fixes", fixes);
    pushGroup(lines, "⚙️ Technical Improvements", techs);
    pushGroup(lines, "📚 Documentation", docs);
    pushGroup(lines, "🧹 Chores & Housekeeping", chores);
    pushGroup(lines, "📝 Misc", others);

    lines.push("");
  }

  if (!totalCommits) {
    throw new Error("No commits to include in brag document.");
  }

  const out = lines.join("\n");
  const filename = path.join(outputDir, "brag.md");
  await fs.writeFile(filename, out, "utf8");
  return { filename, totalCommits };
}

// ----------- MAIN -----------

async function main() {
  const args = parseArgs();
  const rootPath = path.resolve(args.path || ".");
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const colorize = makeColorizer(process.stdout.isTTY);

  const includeGlobs =
    parseCommaList(args.include || process.env.GITBRAG_INCLUDE) || [];
  const excludeGlobs =
    parseCommaList(args.exclude || process.env.GITBRAG_EXCLUDE) || [];
  const outputBaseDir = path.resolve(
    args.outputDir || process.env.GITBRAG_OUTPUT_DIR || "./contrib-output",
  );
  const maxDiffBytes = clampNumber(
    args.maxDiffBytes || process.env.GITBRAG_MAX_DIFF_BYTES,
    1500000,
  );
  const maxCommits = clampNumber(
    args.maxCommits || process.env.GITBRAG_MAX_COMMITS,
    200,
  );
  const noLlm = Boolean(args.noLlm || parseBoolEnv(process.env.GITBRAG_NO_LLM));
  const includeMerges = Boolean(
    args.includeMerges || parseBoolEnv(process.env.GITBRAG_INCLUDE_MERGES),
  );
  const fullDiff = Boolean(
    args.fullDiff || parseBoolEnv(process.env.GITBRAG_FULL_DIFF),
  );
  const only =
    (args.only || process.env.GITBRAG_ONLY || "").trim().toLowerCase() || null;

  let mode = String(
    args.mode ||
      process.env.GITBRAG_MODE ||
      (isInteractive ? "interactive" : "all"),
  )
    .trim()
    .toLowerCase();

  if (!isInteractive && mode === "interactive") mode = "all";
  if (!["interactive", "cv", "perf", "all"].includes(mode)) {
    console.error(
      colorize(
        "ERROR: --mode must be interactive, cv, perf, or all.",
        "red",
      ),
    );
    process.exit(1);
  }
  if (only && !["brag", "summary", "cv", "perf"].includes(only)) {
    console.error(
      colorize("ERROR: --only must be brag, summary, cv, or perf.", "red"),
    );
    process.exit(1);
  }

  let provider = normalizeProvider(
    args.provider || process.env.GITBRAG_PROVIDER || "gemini",
  );
  let model = args.model || process.env.GITBRAG_MODEL;
  let since = args.since || process.env.GITBRAG_SINCE; // optional
  let until = args.until || process.env.GITBRAG_UNTIL; // optional

  const emailsFromList = parseCommaList(
    args.emails || process.env.GITBRAG_EMAILS,
  );
  const emailSingle = args.email || process.env.GITBRAG_EMAIL;
  let emails = emailsFromList?.length
    ? emailsFromList
    : emailSingle
      ? [emailSingle]
      : null;

  if (isInteractive) {
    if (!noLlm) {
      const normalized = normalizeProvider(provider) || "gemini";
      const defaultProviderIndex = Math.max(
        0,
        PROVIDER_MENU.findIndex((p) => p.value === normalized),
      );

      const pickedProviderLabel = await selectFromList(
        "Select provider",
        PROVIDER_MENU.map((p) => p.label),
        defaultProviderIndex,
        colorize,
      );

      provider =
        PROVIDER_MENU.find((p) => p.label === pickedProviderLabel)?.value ||
        "gemini";

      if (MODEL_CHOICES[provider]?.length) {
        const choices = MODEL_CHOICES[provider];
        const preferred = model || DEFAULT_MODELS[provider];
        const defaultIndex = Math.max(0, choices.indexOf(preferred));

        model = await selectFromList(
          "Select model",
          choices,
          defaultIndex,
          colorize,
        );
      }
    }

    if (!emails?.length) {
      const input = await promptRequired(
        "Author emails (comma-separated)",
        null,
        colorize,
      );
      emails = parseCommaList(input) || [];
    }

    since = await promptOptional("Since date (YYYY-MM-DD)", since, colorize);
    until = await promptOptional("Until date (YYYY-MM-DD)", until, colorize);
  }

  emails = Array.from(
    new Set((emails || []).map((e) => e.trim()).filter(Boolean)),
  );

  if (!emails.length) {
    console.error(
      colorize("ERROR: --emails/--email or GITBRAG_EMAIL(S) is required.", "red"),
    );
    process.exit(1);
  }

  let apiKeys = [];
  if (!noLlm) {
    if (!provider) {
      console.error(
        colorize("ERROR: --provider must be gemini, gpt, or claude.", "red"),
      );
      process.exit(1);
    }

    if (!model) {
      model = DEFAULT_MODELS[provider];
    }

    const envKeys = {
      gemini: process.env.GEMINI_API_KEY,
      gpt: process.env.OPENAI_API_KEY,
      claude: process.env.ANTHROPIC_API_KEY,
    };
    const envKeyLists = {
      gemini: process.env.GEMINI_API_KEYS,
      gpt: process.env.OPENAI_API_KEYS,
      claude: process.env.ANTHROPIC_API_KEYS,
    };

    const providerList =
      provider === "gemini"
        ? parseCommaList(args.geminiApiKeys || envKeyLists.gemini)
        : provider === "gpt"
          ? parseCommaList(args.openaiApiKeys || envKeyLists.gpt)
          : parseCommaList(args.anthropicApiKeys || envKeyLists.claude);

    const genericList = parseCommaList(
      args.apiKeys || process.env.GITBRAG_API_KEYS,
    );

    const providerSingle =
      provider === "gemini"
        ? args.geminiApiKey || envKeys.gemini
        : provider === "gpt"
          ? args.openaiApiKey || envKeys.gpt
          : args.anthropicApiKey || envKeys.claude;

    const genericSingle =
      args.apiKey || process.env.GITBRAG_API_KEY || null;

    apiKeys = [
      ...(providerList || []),
      ...(genericList || []),
      ...(providerSingle ? [providerSingle] : []),
      ...(genericSingle ? [genericSingle] : []),
    ]
      .map((k) => k.trim())
      .filter(Boolean);

    apiKeys = Array.from(new Set(apiKeys));

    if (isInteractive && !apiKeys.length) {
      const apiLabel =
        provider === "gemini"
          ? "Gemini API key(s) (comma-separated)"
          : provider === "gpt"
            ? "OpenAI API key(s) (comma-separated)"
            : "Anthropic API key(s) (comma-separated)";
      const input = await promptRequired(apiLabel, null, colorize);
      apiKeys = parseCommaList(input) || [];
    }

    if (!apiKeys.length) {
      const keyHint =
        provider === "gemini"
          ? "--gemini-api-key/--gemini-api-keys or GEMINI_API_KEY(S)"
          : provider === "gpt"
            ? "--openai-api-key/--openai-api-keys or OPENAI_API_KEY(S)"
            : "--anthropic-api-key/--anthropic-api-keys or ANTHROPIC_API_KEY(S)";
      console.error(colorize(`ERROR: ${keyHint} is required.`, "red"));
      process.exit(1);
    }
  }

  const keyRing = noLlm ? null : createKeyRing(apiKeys);

  console.log(colorize(`🔍 Scanning repositories under: ${rootPath}`, "cyan"));
  const repos = await scanRepositories(rootPath);
  const filteredRepos = filterReposByGlobs(repos, includeGlobs, excludeGlobs);

  if (!filteredRepos.length) {
    console.error(colorize("No git repositories found.", "red"));
    process.exit(1);
  }

  const reposWithCommits = [];
  const repoErrors = {};
  const recordRepoError = (repoName, message) => {
    if (!repoErrors[repoName]) repoErrors[repoName] = [];
    repoErrors[repoName].push(message);
  };
  let totalFound = 0;

  for (const repo of filteredRepos) {
    try {
      const commits = await getCommits(
        repo.path,
        emails,
        since,
        until,
        includeMerges,
        maxCommits,
      );
      if (commits.length) {
        reposWithCommits.push({ ...repo, commits });
        totalFound += commits.length;
      }
    } catch (e) {
      recordRepoError(repo.name, e.message);
    }
  }

  if (!reposWithCommits.length) {
    console.error(colorize("No commits found for this filter.", "yellow"));
    process.exit(1);
  }

  console.log(
    colorize(
      `Found ${reposWithCommits.length} repos with ${totalFound} commits for ${emails.join(
        ", ",
      )}`,
      "green",
    ),
  );

  const selectedRepos = await selectReposInteractive(
    reposWithCommits,
    isInteractive,
  );

  // Enrich with diffs
  const enrichedCommits = [];
  const enrichedByRepo = new Map();
  const perCommitMaxBytes = 12000;

  for (const repo of selectedRepos) {
    const repoCommits = [];
    let remainingBytes = maxDiffBytes;
    for (const c of repo.commits) {
      console.log(
        colorize(
          `Collecting diff ${repo.name}@${shortHash(c.hash)} (${c.date
            .toISOString()
            .slice(0, 10)})...`,
          "gray",
        ),
      );
      let diff = "";
      let diffError = null;
      let snippetInfo = {
        snippet: "",
        bytesUsed: 0,
        truncated: false,
        truncateReason: null,
      };

      if (remainingBytes <= 0) {
        snippetInfo = {
          snippet: "/* TRUNCATED: exceeded per-commit or per-repo diff limit */",
          bytesUsed: 0,
          truncated: true,
          truncateReason: "per-repo",
        };
      } else {
        try {
          diff = await getDiffForCommit(repo.path, c.hash);
        } catch (e) {
          diffError = e.message;
          recordRepoError(
            repo.name,
            `diff ${shortHash(c.hash)}: ${e.message}`,
          );
        }

        if (diff) {
          const maxBytes = Math.min(perCommitMaxBytes, remainingBytes);
          const reason =
            remainingBytes < perCommitMaxBytes ? "per-repo" : "per-commit";
          snippetInfo = buildDiffSnippet(diff, maxBytes, reason);
          remainingBytes = Math.max(0, remainingBytes - snippetInfo.bytesUsed);
        }
      }

      const files = extractFilePathsFromDiff(diff || snippetInfo.snippet);

      const enriched = {
        repoName: repo.name,
        repoPath: repo.path,
        hash: c.hash,
        date: c.date,
        message: c.message,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        typeHint: c.typeHint,
        diffSnippet: snippetInfo.snippet,
        diffBytes: snippetInfo.bytesUsed,
        diffTruncated: snippetInfo.truncated,
        diffTruncateReason: snippetInfo.truncateReason,
        diffError,
        files,
        ...(fullDiff && diff ? { diffFull: diff } : {}),
      };

      enrichedCommits.push(enriched);
      repoCommits.push(enriched);
    }
    enrichedByRepo.set(repo.name, repoCommits);
  }

  if (!enrichedCommits.length) {
    console.error(colorize("No diffs collected. Nothing to analyze.", "red"));
    process.exit(1);
  }

  let analysisMap = {};
  if (noLlm) {
    analysisMap = buildFallbackAnalysisMap(enrichedCommits);
  } else {
    console.log(
      colorize(
        `\n🧠 Using provider: ${provider} | model: ${model} (batched analysis, ${enrichedCommits.length} commits)...`,
        "magenta",
      ),
    );
    analysisMap = await analyzeAllCommitsWithDiff({
      provider,
      keyRing,
      model,
      enrichedCommits,
      colorize,
    });
  }

  for (const c of enrichedCommits) {
    if (!analysisMap[c.hash]) {
      analysisMap[c.hash] = {
        type: c.typeHint || "other",
        summary: c.message,
      };
    }
    c.analysis = analysisMap[c.hash];
  }

  const repoSummaries = [];
  for (const repo of selectedRepos) {
    const commits = enrichedByRepo.get(repo.name) || [];
    for (const c of commits) {
      c.analysis = analysisMap[c.hash];
    }
    if (noLlm) {
      repoSummaries.push(buildBasicRepoSummary(repo.name, commits));
      continue;
    }
    try {
      const summary = await analyzeRepoSummary({
        provider,
        keyRing,
        model,
        repoName: repo.name,
        commits,
      });
      repoSummaries.push(summary);
    } catch (e) {
      recordRepoError(repo.name, `summary: ${e.message}`);
      repoSummaries.push(buildBasicRepoSummary(repo.name, commits));
    }
  }

  let overallSummary = buildBasicOverallSummary(repoSummaries);
  if (!noLlm) {
    try {
      overallSummary = await analyzeOverallSummary({
        provider,
        keyRing,
        model,
        repoSummaries,
      });
    } catch (e) {
      recordRepoError("overall", `summary: ${e.message}`);
    }
  }

  if (noLlm) {
    console.log(
      colorize(
        "WARN: --no-llm enabled: only raw.json + summary.md will be generated.",
        "yellow",
      ),
    );
  }

  let outputPlan = { summary: true, brag: true, cv: false, perf: false };
  if (only) {
    outputPlan = {
      summary: only === "summary",
      brag: only === "brag",
      cv: only === "cv",
      perf: only === "perf",
    };
  } else if (!noLlm) {
    if (mode === "all") {
      outputPlan.cv = true;
      outputPlan.perf = true;
    } else if (mode === "cv") {
      outputPlan.cv = true;
    } else if (mode === "perf") {
      outputPlan.perf = true;
    } else if (mode === "interactive" && isInteractive) {
      const picked = await selectFromList(
        "Generate additional outputs",
        [
          "Performance report",
          "CV (cv.md + cv_bullets.md)",
          "All",
        ],
        2,
        colorize,
        10000,
      );
      if (picked.startsWith("Performance")) outputPlan.perf = true;
      if (picked.startsWith("CV")) outputPlan.cv = true;
      if (picked === "All") {
        outputPlan.cv = true;
        outputPlan.perf = true;
      }
    } else if (mode === "interactive") {
      outputPlan.cv = true;
      outputPlan.perf = true;
    }
  }

  if (noLlm) {
    outputPlan = { summary: true, brag: false, cv: false, perf: false };
  }

  const runTimestamp = new Date();
  const runDir = path.join(outputBaseDir, formatTimestampDir(runTimestamp));
  await fs.mkdir(runDir, { recursive: true });

  const summaryContent = buildSummaryDoc({
    emails,
    since,
    until,
    totalCommits: enrichedCommits.length,
    repoSummaries,
    overallSummary,
  });

  const enrichedByRepoObj = {};
  for (const [name, commits] of enrichedByRepo.entries()) {
    enrichedByRepoObj[name] = commits;
  }

  const rawData = {
    reposScanned: repos,
    reposAfterFilters: filteredRepos,
    reposWithCommits: reposWithCommits.map((r) => ({
      name: r.name,
      path: r.path,
      commits: r.commits,
    })),
    selectedRepos: selectedRepos.map((r) => ({ name: r.name, path: r.path })),
    enrichedCommits,
    enrichedCommitsByRepo: enrichedByRepoObj,
    analysisMap,
    repoSummaries,
    overallSummary,
    errorsByRepo: repoErrors,
  };

  const meta = {
    tool: {
      name: "git-contribution-summarizer",
      version: "unknown",
    },
    run: {
      timestamp: runTimestamp.toISOString(),
      outputDir: runDir,
    },
    args: {
      path: rootPath,
      emails,
      since,
      until,
      include: includeGlobs,
      exclude: excludeGlobs,
      outputDir: outputBaseDir,
      mode,
      only,
      maxDiffBytes,
      maxCommits,
      includeMerges,
      noLlm,
      fullDiff,
    },
    environment: {
      provider,
      model,
      apiKeyCount: noLlm ? 0 : apiKeys.length,
    },
  };

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkgRaw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(pkgRaw);
    if (pkg?.version) meta.tool.version = pkg.version;
  } catch {}

  await fs.writeFile(
    path.join(runDir, "raw.json"),
    JSON.stringify(rawData, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(runDir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );

  if (outputPlan.summary) {
    await fs.writeFile(path.join(runDir, "summary.md"), summaryContent, "utf8");
  }

  if (outputPlan.brag) {
    console.log(colorize("\n📝 Generating brag.md ...", "cyan"));
    await createBragDoc({
      selectedRepos,
      enrichedByRepo,
      analysisMap,
      emails,
      outputDir: runDir,
    });
  }

  if (outputPlan.cv) {
    let cvMd = "";
    let cvBulletsMd = "";
    if (noLlm) {
      const fallback = buildFallbackCvDocs({ repoSummaries, overallSummary });
      cvMd = fallback.cvMd;
      cvBulletsMd = fallback.cvBulletsMd;
    } else {
      try {
        const generated = await generateCvDocs({
          provider,
          keyRing,
          model,
          repoSummaries,
          overallSummary,
        });
        cvMd = generated.cvMd;
        cvBulletsMd = generated.cvBulletsMd;
        if (!cvMd?.trim() || !cvBulletsMd?.trim()) {
          throw new Error("CV output was empty");
        }
      } catch (e) {
        const fallback = buildFallbackCvDocs({ repoSummaries, overallSummary });
        cvMd = fallback.cvMd;
        cvBulletsMd = fallback.cvBulletsMd;
        recordRepoError("cv", e.message);
      }
    }

    await fs.writeFile(path.join(runDir, "cv.md"), cvMd, "utf8");
    await fs.writeFile(
      path.join(runDir, "cv_bullets.md"),
      cvBulletsMd,
      "utf8",
    );
  }

  if (outputPlan.perf) {
    let perfMd = "";
    if (noLlm) {
      perfMd = buildFallbackPerformanceDoc({ repoSummaries, overallSummary });
    } else {
      try {
        perfMd = await generatePerformanceDoc({
          provider,
          keyRing,
          model,
          repoSummaries,
          overallSummary,
        });
        if (!perfMd?.trim()) throw new Error("Performance output was empty");
      } catch (e) {
        perfMd = buildFallbackPerformanceDoc({ repoSummaries, overallSummary });
        recordRepoError("performance", e.message);
      }
    }
    await fs.writeFile(
      path.join(runDir, "performance.md"),
      perfMd,
      "utf8",
    );
  }

  console.log(
    colorize(
      `\n✅ Done. ${enrichedCommits.length} commits summarized.\nOutput directory: ${runDir}`,
      "green",
    ),
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
