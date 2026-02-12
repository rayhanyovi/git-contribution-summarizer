# Git Contribution Summarizer

A CLI to scan git repositories, summarize contributions, and generate review-ready artifacts.

## Usage

```bash
node src/cli.mjs --path . --emails you@company.com --since 2025-01-01 --until 2025-12-31
```

## New Flags

- `--emails` Comma-separated list of author emails. If provided, it takes precedence over `--email`.
- `--api-keys` Comma-separated API keys (provider-agnostic). Rotates on rate-limit errors.
- `--gemini-api-keys` Comma-separated Gemini API keys.
- `--openai-api-keys` Comma-separated OpenAI API keys.
- `--anthropic-api-keys` Comma-separated Anthropic API keys.
- `--include` Comma-separated repo name globs to include (matches repo folder name only).
- `--exclude` Comma-separated repo name globs to exclude.
- `--output-dir` Base output directory (default: `./contrib-output`).
- `--mode` Output mode: `interactive` | `cv` | `perf` | `all` (default: interactive if TTY, else all).
- `--only` Output only one artifact: `brag` | `summary` | `cv` | `perf`.
- `--max-diff-bytes` Max diff bytes per repo (aggregate across commits). Default: `1500000`.
- `--max-commits` Max commits per repo. Default: `200`.
- `--no-llm` Skip LLM calls and generate only `raw.json` + `summary.md`.
- `--include-merges` Include merge commits (default: excluded).
- `--full-diff` Store full diffs in `raw.json` (snippets are still used for analysis).

Existing flags (`--email`, `--since`, `--until`, `--provider`, `--model`, `--api-key`, etc.) still work.

## Outputs

All outputs are written to a timestamped directory:

```
./contrib-output/YYYY-MM-DD__HHmmss/
```

Files generated:
- `raw.json` Full structured data (repos, commits, diffs/snippets, LLM analysis, errors).
- `summary.md` Overall + per-repo summary and contribution outline.
- `brag.md` Brag document grouped by change type.
- `cv.md` Narrative CV highlights grouped by repo.
- `cv_bullets.md` CV bullet points grouped by repo.
- `performance.md` Performance report format.
- `meta.json` Tool version, args, provider/model, run timestamp.
