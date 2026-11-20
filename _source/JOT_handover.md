# Jot — handover

Paste this at the start of a new chat, and upload the latest `jot_vNN.zip` with it.

---

## What Jot is

A quick-capture notes app I built with Claude. The app is `index.html` plus
`sw.js`, `manifest.json` and icons. No framework, no build step. Everything
saves to the phone's own storage on my iPhone, and it runs from my home screen.
It's for me only, not for selling.

**Hosted on GitHub Pages since v34** (moved off Netlify to save the subscription).
The app files sit at the top of the repo. To update: unzip, then on github.com
Add file → Upload files → drag everything in → Commit (see `UPDATING.md`).
No commands, no build. Data lives on the phone, so updating never touches it.
Moving to a new address = back up on the old one, restore on the new one.

**Current version: v36.** The version lives on line 1 of `sw.js` as
`const CACHE = 'jot-vNN'`.

I also have other apps built the same way (COACH, Ledger). Same rules apply.

---

## Rules I want followed

1. **Never break what's already saved.** Any update has to work with the data
   already on my phone. No wiping, no resets.
2. **Test before giving me files.** Run `node tests/run.mjs` (it's in the zip) and
   add tests for anything new. Don't hand me a zip that hasn't passed.
3. **Bump the version** in `sw.js` every time, or my phone keeps the old one.
4. **Plain language.** Short answers, no jargon, dot-point summary at the end.
5. **Number any list** of options or fixes in one run, so I can reply "do 1, 3, 5".
6. **Show me before applying** big or visual changes (comparison picture), and a demo after.

---

## How Jot works now

**Home screen.** "What's on your mind?" box, then five big category buttons that
fill the screen (Shopping, To-do, Remember, Idea, Question), then **Up next**
(overdue first, then soonest due, topped up with newest to-dos).

- Type something and tap a button — it saves there. If that category has
  subcategories, it asks which one first.
- Box empty and tap a button — it opens that list.
- While typing, the buttons shrink so they stay above the keyboard.
- On small phones (iPhone SE) the buttons stay compact.

**Bottom bar.** Write (home), Lists (with a red count of overdue/due today),
Search. Hides while the keyboard is up.

**Lists screen.** Back button, big title with open count, category tabs,
subcategory filter, one-line add bar (category chips appear once you type).
Notes are grouped into one card per category, round tick circles in the
category's colour, coloured tags for subcategories and dates.

**Subcategories.** Up to six per category, set in Settings. **Required**: if a
category has subcategories, a new note must have one. Adding while filtered to a
subcategory (e.g. To-do > Errand) puts it there automatically.

**Categories in detail.**
- Shopping, To-do, Remember — tick boxes. Remember/To-do take dates.
- Ideas — no ticking; marked **Applied** instead, filed into a log.
- Questions — each has an Answer box; answering files it into a searchable **Library**.

**Dates in plain English.** "passport friday", "mot 12 dec", "bins every monday",
"call mum tomorrow 6pm".

**Every pop-up page has a Back button** (Settings, Edit, Guide, Locked, Export),
and Back from Guide/Export returns to Settings. Drag-down still works too.

**Settings.** Numbers row (open, due today, overdue, done), sounds and haptics
switches, reminders, categories as one row each (tap to open and edit), export,
backup.

**Backup.** "Back up to Files" opens the iPhone share sheet → Save to Files →
same folder → Replace. Always called `jot-backup.json`, so there's only ever one
copy. Only counts as backed up if I actually save it. Warning on home goes amber
after 7 days and red after 14 (or never). Sunday prompt still asks once a week.
Restore reads the same file.

**Sounds** (all made by the app itself, no audio files): add = sticky note,
tick = marimba, untick = small eraser rub, delete = eraser, open/close page =
page flip, idea applied / question answered = sparkle, error = soft "no",
taps = soft tick. Switchable in Settings.

**Send to Claude.** In Ideas, pick a subcategory (e.g. COACH) and tap
"Send N COACH ideas to Claude". It copies every not-yet-applied idea in that
subcategory only, as a numbered ready-to-paste message (with extra notes), then
marks just those as Applied, with Undo. If copying fails, nothing is marked and
the Export page opens instead. An idea tagged in two subcategories counts as
applied in both once sent.

**Your own categories.** Settings → "+ Add a category": name, icon, and either
"Tick off, can have dates" or "Simple tick list". Up to 5 of my own (10 total).
They get their own home button, list page, tab and subcategories, ride along in
backups, and deleting one moves its notes to To-do. Stored in `prefs.customTypes`.

**Locked section.** 4-digit code, everything scrambled (names and categories too),
locks when I leave Jot. Has its own settings (gear button): Face ID on/off,
change code, its own categories + subcategories (subcategory required if the
category has them), erase. Face ID uses a passkey saved on the phone (shows in
the Passwords app as "Jot") and needs iOS 18+; changing the code switches Face ID
off. "Forgot your code?" erases the locked section only, after saying exactly
how many items would go.
Secrets always show in full (no dots). It opens on the categories as folder
tiles with a count; tap one to see every entry. Inside a category it shows
either cards side by side or big codes one per row — switch in locked settings
("Inside a category, show"). Tap a card or code to copy it; pencil to edit.

**Notifications — not running since the move to GitHub.** GitHub Pages can't run
the helper, so Settings shows "Not available here" and points to Calendar. The code
is all still in the app; it switches back on by itself if a helper answers at
`api/push/` on the same address (e.g. a free Cloudflare Worker — not built yet;
the old Netlify helper is in the v33 zip). How it worked: Settings → Notifications (open Jot from the home-screen icon,
tap Allow). Every note with a date and "Remind me" set buzzes the phone at that
time, even with Jot closed; tapping it opens the note. The helper checks every
minute and only ever gets a note id + time, never the words — the phone keeps
the words in a small store (`jot-rem`) that `sw.js` reads when the buzz arrives.
The edit page shows "Jot will buzz you Mon 16 Nov, 18:00". "Send a test
notification" in Settings. Calendar hand-off is still there as "Also add to
Calendar".

**Hours (the "Tally" idea, built into Jot — there is no separate Tally app).** Bottom bar → Hours. Add jobs (name, Employed or
Self-employed, hourly rate, usual start/finish/break, what the work is called,
employer name, optional staff no. and send-to email). Home shows "Today's work"
with a one-tap **Log it** for each job's usual shift (Undo); Log hours page for
anything else (day, start, finish, break, live hours + pay; past-midnight shifts
count). Hours page (v36) has four tabs: **Week** (total hours +
pay, a bar chart of the week coloured by job — tap a day to log it — and one row
per job with a **Send** button), **To send** (each job's unsent shifts + Make
timesheet/invoice; the tab shows a count), **Sent** (history), **Jobs** (jobs,
Add a job, Your details). Opens on Week every time; Back from a job returns to Jobs.
- Employed → **Timesheet** (TS-0001…): date, start, finish, break, hours, total
  hours. Never the rate. Per-job switches: Show £ amounts (pay per day + total pay
  before tax), Show payment details (bank). Both off by default.
- Self-employed → full **Invoice** (INV-0001…): from/to addresses, rate, amounts,
  total due, due in 14 days, payment details.
- Sheets are snapshots; sent shifts are locked; deleting a sheet returns its
  shifts and reuses the number if it was the last one.
- Hours show as decimals only when every line is exact (quarter hours etc.),
  otherwise h:mm, so lines always add up to the totals.
- **Copy for email** puts a formatted version (inline styles, tables) and a plain
  version on the clipboard; **Email it** opens Mail with the plain version;
  **Save as PDF** uses the print sheet. Jobs/shifts/sheets ride in backups.

**Other bits.** Swipe right
to tick/apply, left to delete with undo. Photos, search, pin, export to text for
pasting into Claude.

---

## How we work

Claude edits the file with small Python scripts that check for exact matches, so
a failed edit is loud. Then it syntax-checks, runs `tests/run.mjs` (suites:
basics, look, sounds, fit, categories, locked, claude, sweep, notify, hours, moved, backup;
`notify` skips itself when the helper files aren't in the folder), bumps the version and zips
it (tests folder included, never `node_modules` or `.netlify`).

---

## Things that caught us out — don't reintroduce

- `toISOString()` shifts the day in British Summer Time. Use the local date helpers.
- Every write to storage goes through the guarded helper (`lsSet`).
- Don't list storage keys with `Object.keys()` — it made backups empty once.
- The app stays open for days, so anything worked out once at startup goes stale.
  There's a day-watcher for that.
- A new `if` once stole an `else` and made answered questions vanish.
- Hiding the confirmation bar by sliding it down failed above the keyboard — it fades.
- Pop-up pages must not reach up under the camera island.
- Pop-up messages (toasts) must sit above the bottom bar, not on it.
- iPhone expects every buzz to show a notification — `sw.js` always shows
  something, even "Jot reminder" for a note that's gone.
- Never send note text to the helper; ids and times only.
- With jobs on home, buttons go compact and Up next shows one item on smaller
  phones; if it still can't fit above the bottom bar it steps aside (still in Lists).
- A week-strip number once read 7.3 for 7h 15m — show hours exactly (7.25).
- Face ID (the locked section's passkey) only works on the web address it was set
  up on. Jot now remembers the address and, after a move, switches Face ID off with
  a note saying to turn it on again. The `moved` test checks this from a sub-folder
  address like GitHub's `/jot/`.
- Keep every path relative (`sw.js`, `api/push/`) — GitHub serves Jot from a sub-folder.
- Settings must not crash if a file is missing (404) — the test server now returns 404s.
- "Open" means the same everywhere (isOpen): applied ideas and answered
  questions are not open. Settings once counted them and disagreed with the lists.
- Changing a note's category in the edit page must drop subcategories from the
  old category, and needs a subcategory if the new category has them.
- The tests run on `http://localhost` — the locked section's scrambling only works
  on a secure address, so a test on any other address silently skips it.
- Big home buttons once pushed Up next under the bottom bar on an iPhone mini —
  the `fit` tests now check SE, mini, 13/14 and Pro Max.

---

## Sync with Muse — v35 (19 Nov 2026)

Jot can now sync notes with Muse. **Off by default** — Bailey switches it on
in Settings → Sync with Muse. Full design + Muse's instructions:
`_source/SYNC.md`. Short version:
- Notes sync to ONE file, `jot-sync.json`, in a **private** repo
  `baileywalsh-maker/jot-sync` (Bailey creates it — Muse's GitHub App cannot
  create repos). The public jot repo never holds notes, backups or tokens.
- The phone uses a fine-grained token Bailey pastes in Settings. It lives
  only on the phone, never in a backup, never in code.
- Only notes, subcategories, tags and "buy again" sync. Locked notes, hours,
  jobs and invoices never sync.
- Merge is three-way by note id against the last good sync; a note changed
  on both sides keeps the newer copy and Settings says so.
- Muse adds/deletes notes by editing `jot-sync.json` in the private repo
  (see SYNC.md for the exact steps). The phone pulls it in on open and
  pushes changes ~8s after an edit, or on Sync now.
- Tests: `node tests/run.mjs sync` (27 checks, fake GitHub). Full suite:
  206 passed.

## Still open

**Jot** — Ledger and Coach sync next, only after Jot sync is proved on
Bailey's phone. Same pattern, separate private repos.
