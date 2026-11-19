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

## Mockups and demos: one page per app
- All design ideas, mockups and demos for Jot go on ONE artifact titled "Jot designs".
  Update that same page every time (republish to its link). Never make a new one.
- Its link: (none yet — create it the first time a mockup is needed, then write the link here)
- Old ideas get replaced on the page, not kept. Decisions go in the handover instead.

@_source/JOT_handover.md
