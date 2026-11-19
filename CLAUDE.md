# Jot — notes for Claude

Read this first in any chat about Jot. The full handover is imported below.

## How changes ship now (replaces "upload the zip" in the handover)
- Claude edits the files in this repo and pushes straight to `main`.
  GitHub Pages updates in about a minute. Bailey does nothing on the laptop.
- No zip, no attachments needed: this repo *is* the current Jot.
- Before every push: run `node tests/run.mjs`, add tests for anything new,
  and bump the version on line 1 of `sw.js` (`const CACHE = 'jot-vNN'`).
- Commit message = the version, e.g. `v35`. Update `_source/JOT_handover.md`
  in the same commit.
- Rolling back = revert the last commit. Every version stays in the history.
- This repo is **public**. Never commit keys, backups or personal notes.

@_source/JOT_handover.md
