# Jot tests

Run these before giving Bailey any new version. They load the real `index.html`
in a phone-sized Chromium, with saved data shaped like older versions, and check
nothing breaks or gets wiped.

```
cd <the Jot folder>          # the one with index.html
npm i --no-save playwright  # once, only for testing
node tests/run.mjs          # all suites
node tests/run.mjs backup   # one suite by name
```

If Chromium isn't found, set `CHROME=/path/to/chrome`.

Suites: `basics` (back buttons, subcategories), `look` (v24 redesign: dock,
grouped lists, settings), `sounds`, `fit` (home screen on SE / mini / 13 / Pro Max),
`backup`, `claude`, `categories`, `locked`, `sweep`, `notify` (notifications: app +
the helper in netlify/lib/core.mjs, with a pretend store and push service).

Add a test for every new feature or bug fix, in the suite it belongs to.
