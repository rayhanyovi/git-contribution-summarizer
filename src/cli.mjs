#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import process from "node:process";

// ----------- CLI ARGS -----------

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    path: ".",
    email: null,
    apiKey: null,
    geminiApiKey: null,
    openaiApiKey: null,
    anthropicApiKey: null,
    since: null,
    until: null,
    model: null,
    provider: null,
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
      case "-g":
      case "--gemini-api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.geminiApiKey = v;
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
      case "--anthropic-api-key": {
        const v = takeNext(i, args);
        if (v) {
          out.anthropicApiKey = v;
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

async function selectFromList(label, options, initialIndex, colorize) {
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

  const render = () => {
    const lines = [];
    lines.push(colorize(`${label} (use up/down, Enter)`, "cyan"));
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
    const onKeypress = (_str, key) => {
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
        cleanup();
        resolve(options[index]);
      }
    };

    const cleanup = () => {
      stdin.removeListener("keypress", onKeypress);
      if (stdin.setRawMode) stdin.setRawMode(Boolean(prevRaw));
      if (linesCount > 0) {
        stdout.write(`\u001b[${linesCount}A`);
        stdout.write("\u001b[0J");
      }
      stdout.write(colorize(`${label}: ${options[index]}\n`, "green"));
    };

    stdin.on("keypress", onKeypress);
  });
}

function shortHash(hash) {
  return hash.slice(0, 7);
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

async function getCommits(repoPath, email, since, until) {
  const args = [
    "log",
    `--author=${email}`,
    "--pretty=format:%H|%ad|%an|%s",
    "--date=iso",
    "--no-merges",
  ];

  if (since) args.push(`--since=${since}`); // e.g. 2025-01-01
  if (until) args.push(`--until=${until}`); // e.g. 2025-12-31

  let out;
  try {
    out = await execGit(args, repoPath);
  } catch {
    return [];
  }

  const commits = [];

  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const [hash, dateStr, author, message] = parts;
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
      author,
      typeHint,
    });
  }

  return commits;
}

async function getDiffForCommit(repoPath, hash) {
  const args = ["show", "--format=", "--unified=3", hash];
  return execGit(args, repoPath);
}

// ----------- REPO SELECTION -----------

async function selectReposInteractive(reposWithCommits) {
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

async function callGemini({ apiKey, model, prompt }) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
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

async function analyzeCommitsBatch({ provider, apiKey, model, commitsBatch }) {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is not available. Use Node 18+ or polyfill fetch.",
    );
  }

  const prompt = buildPrompt(commitsBatch);
  let rawText = "";

  switch (provider) {
    case "gemini":
      rawText = await callGemini({ apiKey, model, prompt });
      break;
    case "gpt":
      rawText = await callOpenAI({ apiKey, model, prompt });
      break;
    case "claude":
      rawText = await callClaude({ apiKey, model, prompt });
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const txt = (rawText || "").trim();
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  const jsonText = start >= 0 && end >= 0 ? txt.slice(start, end + 1) : txt;

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
  apiKey,
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
        apiKey,
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

// ----------- MARKDOWN GENERATOR -----------

function pushGroup(lines, title, items) {
  if (!items.length) return;
  lines.push(`### ${title}`);
  for (const it of items) lines.push(it);
  lines.push("");
}

async function createBragDoc({
  selectedRepos,
  enrichedByRepo,
  analysisMap,
  email,
}) {
  const lines = [];
  lines.push(`# Brag Document for ${email}`);
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
  const filename = "brag.md";
  await fs.writeFile(filename, out, "utf8");
  return { filename, totalCommits };
}

// ----------- MAIN -----------

async function main() {
  const args = parseArgs();
  const rootPath = path.resolve(args.path || ".");
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const colorize = makeColorizer(process.stdout.isTTY);

  let provider = normalizeProvider(
    args.provider || process.env.GITBRAG_PROVIDER || "gemini",
  );
  let email = args.email || process.env.GITBRAG_EMAIL;
  let since = args.since || process.env.GITBRAG_SINCE; // optional
  let until = args.until || process.env.GITBRAG_UNTIL; // optional
  let model = args.model || process.env.GITBRAG_MODEL;

  if (isInteractive) {
    // ---- PROVIDER ----
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

    // ---- MODEL (PILIH DI SINI, SEBELUM readline) ----
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

    // ---- BARU PROMPT TEKS ----
    email = await promptRequired("Author email", email, colorize);
    since = await promptOptional("Since date (YYYY-MM-DD)", since, colorize);
    until = await promptOptional("Until date (YYYY-MM-DD)", until, colorize);
  }

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

  let apiKey = args.apiKey;
  if (!apiKey) {
    if (provider === "gemini") apiKey = args.geminiApiKey || envKeys.gemini;
    if (provider === "gpt") apiKey = args.openaiApiKey || envKeys.gpt;
    if (provider === "claude") apiKey = args.anthropicApiKey || envKeys.claude;
  }

  if (isInteractive) {
    const apiLabel =
      provider === "gemini"
        ? "Gemini API key"
        : provider === "gpt"
          ? "OpenAI API key"
          : "Anthropic API key";
    apiKey = await promptRequired(apiLabel, apiKey, colorize);
  }

  if (!email) {
    console.error(
      colorize("ERROR: --email or GITBRAG_EMAIL is required.", "red"),
    );
    process.exit(1);
  }
  if (!apiKey) {
    const keyHint =
      provider === "gemini"
        ? "--gemini-api-key or GEMINI_API_KEY"
        : provider === "gpt"
          ? "--openai-api-key or OPENAI_API_KEY"
          : "--anthropic-api-key or ANTHROPIC_API_KEY";
    console.error(colorize(`ERROR: ${keyHint} is required.`, "red"));
    process.exit(1);
  }

  console.log(colorize(`🔍 Scanning repositories under: ${rootPath}`, "cyan"));
  const repos = await scanRepositories(rootPath);

  if (!repos.length) {
    console.error(colorize("No git repositories found.", "red"));
    process.exit(1);
  }

  const reposWithCommits = [];
  let totalFound = 0;

  for (const repo of repos) {
    const commits = await getCommits(repo.path, email, since, until);
    if (commits.length) {
      reposWithCommits.push({ ...repo, commits });
      totalFound += commits.length;
    }
  }

  if (!reposWithCommits.length) {
    console.error(colorize("No commits found for this filter.", "yellow"));
    process.exit(1);
  }

  console.log(
    colorize(
      `Found ${reposWithCommits.length} repos with ${totalFound} commits for ${email}`,
      "green",
    ),
  );

  const selectedRepos = await selectReposInteractive(reposWithCommits);

  // Enrich with diffs
  const enrichedCommits = [];
  const enrichedByRepo = new Map();

  for (const repo of selectedRepos) {
    const repoCommits = [];
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
      try {
        diff = await getDiffForCommit(repo.path, c.hash);
      } catch (e) {
        console.error(
          colorize(`  Failed to get diff for ${c.hash}: ${e.message}`, "red"),
        );
        continue;
      }

      const enriched = {
        repoName: repo.name,
        repoPath: repo.path,
        hash: c.hash,
        date: c.date,
        message: c.message,
        typeHint: c.typeHint,
        diffSnippet: diff.slice(0, 4000),
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

  console.log(
    colorize(
      `\n🧠 Using provider: ${provider} | model: ${model} (batched analysis, ${enrichedCommits.length} commits)...`,
      "magenta",
    ),
  );
  const analysisMap = await analyzeAllCommitsWithDiff({
    provider,
    apiKey,
    model,
    enrichedCommits,
    colorize,
  });

  console.log(colorize("\n📝 Generating brag.md ...", "cyan"));
  const { filename, totalCommits } = await createBragDoc({
    selectedRepos,
    enrichedByRepo,
    analysisMap,
    email,
  });

  const outPath = path.resolve(filename);
  console.log(
    colorize(
      `\n✅ Done. ${totalCommits} commits summarized.\n📄 Brag document: ${outPath}`,
      "green",
    ),
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
