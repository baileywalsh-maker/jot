# Jot — notes for Claude

Read this first in any chat about Jot. The full handover is imported below.

## Before ANY change — Muse edits this app too
- Bailey uses Muse (his other assistant) to run Jot day to day, and Muse can also
  change the app code in this repo. Claude handles app changes, but must never
  assume the code is where it left it.
- So before every change: `git pull` this repo and read the last few commits
  (`git log`). Build on what's in `main`, never on a zip, an upload or an old copy.
- If the version on line 1 of `sw.js` is newer than you expected, or a commit isn't
  yours, read what changed first and keep it. Mention it in one line to Bailey.
- Pull again right before pushing, so a change Muse made in the meantime isn't lost.

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
- Bailey only wants a short summary of changes + a visual when there is one.
  Don't send zips or handover files. Write a handover only when he asks or the
  chat is getting full.

## Mockups and demos: one page per app
- All design ideas, mockups and demos for Jot go on ONE artifact titled "Jot designs".
  Update that same page every time (republish to its link). Never make a new one.
- Its link: https://claude.ai/artifact/YEttgp2afLfS6AgCAdF1aa (slug fcfbf24f-62bd-4ddb-85f6-d231a86f3beb)
- Old ideas get replaced on the page, not kept. Decisions go in the handover instead.

@_source/JOT_handover.md
