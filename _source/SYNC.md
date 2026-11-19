# Jot sync with Muse — v35

## The shape of it

The phone and Muse never talk to each other directly. They share one file:

- **Private repo:** `baileywalsh-maker/jot-sync` (private — Bailey creates it;
  Muse's GitHub App cannot create repos, it can only write to repos it is
  installed on, so Bailey also installs the Muse GitHub App on it)
- **File in it:** `jot-sync.json`
- **Phone side:** Jot reads/writes that file with a token Bailey pastes into
  Settings → Sync with Muse (see below)
- **Muse side:** Muse reads/writes that same file through the GitHub
  connector (`get_file_contents` / `create_or_update_file` on
  `baileywalsh-maker/jot-sync`)

The **public** `jot` repo holds the app code only. It never holds notes,
backups, tokens or any personal data. The sync file format and the token
rules are the whole privacy story — read them before touching sync.

## The file

```json
{
  "__jotSync": 1,
  "version": 12,
  "updatedAt": "2026-11-19T15:50:00.000Z",
  "updatedBy": "phone",
  "notes": [ { "id": "...", "text": "...", "type": "todo", "done": false,
               "ts": 1730000000000, "upd": 1730000001000, "kinds": ["Errand"],
               "due": null, "dueTime": null, "repeat": null, "remind": null,
               "notes": "", "pinned": false, "answer": "", "answeredAt": null } ],
  "kinds": { "todo": ["Errand", "Home"], "idea": ["COACH", "Ledger"] },
  "tags": ["COACH", "Ledger"],
  "again": { "oat milk": { "n": 3, "t": 1730000000000, "label": "Oat milk" } },
  "custom": { "customTypes": [], "typeName": {}, "typeColour": {}, "kindColour": {} }
}
```

What syncs: notes, subcategories (`kinds`), tags, "buy again" (`again`), and
custom-category definitions (`custom`). What NEVER syncs: the locked section
(`jot:vault` — scrambled on the phone and never leaves it), hours, jobs,
shifts, sheets/invoices. The phone's sync code does not send them and Muse
must never add them to the file.

## The token (phone side)

- Bailey makes a **fine-grained personal access token** in GitHub:
  Settings → Developer settings → Personal access tokens → Fine-grained
  tokens. Repository access: **only `baileywalsh-maker/jot-sync`**.
  Permissions: **Contents — Read and write** only. Nothing else.
  No expiry is convenient; 90 days is safer — if it expires, sync just
  stops and Settings says the token was not accepted.
- He pastes it into Jot → Settings → Sync with Muse → token field.
- It is stored in `localStorage` under `jot:sync-token` only. It is never
  written into the app code, never included in a backup (`backupText()`
  does not read that key — a test checks this), and only ever sent to
  `https://api.github.com`. Revoking it in GitHub stops syncing instantly.
- Muse **never sees the token** and must never ask for it. If Bailey says
  sync stopped working, the first thing to check is whether the token
  expired or was revoked — Settings will say "GitHub did not accept the
  token".

## How the phone syncs

- Off by default (`prefs.syncEnabled`). Switching it on shows the token
  box and a Sync now button. Status line says Off / no token yet /
  Last synced … / Last sync failed: …
- **Auto:** on opening the app (2s after load), ~8 seconds after any note
  change, and when the app is hidden/closed (best effort).
- **Manual:** Settings → Sync now.
- **Merge (three-way, by note id):** the phone keeps a snapshot of the
  notes as they were at the last good sync (`jot:sync` in localStorage).
  A note changed on one side only is taken from that side. A note added
  on either side is kept. A note deleted on one side and unchanged on the
  other is deleted. A note changed on **both** sides keeps the copy with
  the later `upd` (stamped on every note write, in `lsSet`), and the
  conflict is listed in Settings ("kept the newer copy"). Nothing is
  ever deleted silently outside that rule.
- **Conflicts with GitHub itself:** if the file changed under the phone
  (HTTP 409 on PUT), the phone re-fetches, re-merges and retries once.
- **Failures are quiet and safe:** no token, bad token (401/403), offline,
  or a bad file all leave the phone's notes exactly as they are and say
  so in Settings. A failed sync never wipes local notes.

## How Muse adds / deletes a note (Muse's instructions)

1. Read the current file from the private repo:
   `get_file_contents` on `baileywalsh-maker/jot-sync`, path `jot-sync.json`.
   If it is a 404, there is nothing synced yet — tell Bailey to open Jot
   and tap Sync now once, then try again. Do **not** invent a file.
2. Decode the base64 content. Keep every note and every field exactly as
   it is, except the change Bailey asked for.
3. To **add** a note: append `{ "id": "<uid>", "text": "<Bailey's words>",
   "type": "<shopping|todo|remember|idea|question>", "done": false,
   "pinned": false, "ts": <now ms>, "upd": <now ms>, "kinds": null,
   "due": null, "dueTime": null, "repeat": null, "remind": null,
   "notes": "" }`. For an idea add `"applied": null`; for a question add
   `"answer": "", "answeredAt": null`. Use `uid()` style ids:
   `Date.now().toString(36) + random 5 chars` — never reuse an id.
   If the category has subcategories, the note needs one in `kinds`
   (e.g. To-do → `["Errand"]`); ask Bailey which one if unclear.
   Sort order does not matter — the phone sorts by `ts`.
4. To **delete** a note: remove that one object from `notes` and nothing
   else. To tick/untick: flip `done` and set `upd` to now. To edit text:
   change `text` and set `upd` to now.
5. Bump `version` by 1, set `updatedAt` to now (ISO), `updatedBy` to
   `"muse"`. Leave `kinds`, `tags`, `again`, `custom` untouched unless
   Bailey asked to change them.
6. Write it back with `create_or_update_file` on the same repo/path,
   passing the `sha` from step 1 and a message like
   `Jot sync: add "Buy oat milk"`. If the write fails with a sha conflict,
   re-read the file and redo the change on the fresh copy — never
   overwrite blindly.
7. Tell Bailey the note is synced and that it will appear in Jot the next
   time he opens it (or immediately if Jot is open — the phone auto-syncs
   on open and ~8s after its own edits; it does not poll while open, so
   if Jot is already open, ask him to close and reopen it, or tap
   Sync now in Settings).

## Limits (say these plainly, don't paper over them)

- Sync is **notes only**. Hours, invoices, locked notes and the "buy
  again" counts beyond what is in the file are not synced. Ledger and
  Coach are separate apps with no sync yet.
- The phone does **not** poll while open. A note Muse adds shows up when
  Jot is next opened, or after a manual Sync now — not live while Bailey
  stares at the app.
- If Bailey edits a note on the phone and Muse edits the same note before
  the phone syncs, the newer copy wins and the older edit is lost. The
  phone reports this in Settings; Muse cannot see it happened.
- If two phones ever shared one token, last-write-wins per note still
  applies, but the snapshot logic assumes one phone. Jot is one phone.
- The token is a bearer credential on the phone: anyone with the phone
  unlocked and the token could read/write the private repo. That is the
  same trust level as the phone itself. Revoke the token if the phone is
  lost.

## Tests

`node tests/run.mjs sync` — 27 checks against a pretend GitHub
(fake `api.github.com` route): off by default, Muse note pulled on open,
phone note pushed, delete propagates, merge rules, both-ways conflict
keeps newer + is reported, bad token fails cleanly, token never in backup.
Full suite: `node tests/run.mjs` — 206 passed, 0 failed (v35).
