# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an IPTV project that follows the 3-layer architecture defined in the global agent instructions (`~/.claude/CLAUDE.md`). The global instructions govern operating principles, self-annealing behavior, and file organization — refer to them as the authoritative guide.

## Repository Structure

```
directives/     # SOPs in Markdown — task instructions and learned constraints
execution/      # Deterministic Python scripts — API calls, data processing, file ops
.tmp/           # Intermediate files (never commit; always regeneratable)
.env            # Environment variables and API keys
```

## Workflow

1. Read the relevant directive in `directives/` before starting any task.
2. Find or create the appropriate script in `execution/`.
3. Run the script, fix errors, update the directive with what you learned.
4. Deliverables go to cloud services (Google Sheets, etc.) — local files are intermediates only.
