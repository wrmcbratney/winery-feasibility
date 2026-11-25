# Working on this repo

- Build and test with `npm test` before every commit. The page test loads `dist/index.html` in jsdom, so build first.
- Keep `src/core.js`, `src/flow.js` and `src/fin.js` free of DOM code. They must run under Node for tests.
- Every new assumption gets a row in `src/sources.js` with a confidence rating (High, Medium, Low). Low means estimate; say so rather than implying a source.
- When defaults or saved-setting shapes change, bump the localStorage key in `src/index.src.html` (currently `feasV11`) so old saved settings do not hide new defaults.
- If a change is meant to move the headline numbers, regenerate `test/baseline.json` deliberately and note it in the commit message.
- Page copy: plain prose, no em dashes.
- Prefer small, incremental changes. The owner is a former wine lab technical lead; cellar practice details are worth getting right, and he will check them.
- Publishing: the built page is a Claude artifact (slug `07b65d15-69f3-4b05-bc5f-577bbb926dff`). Republish `dist/index.html` after changes that should be visible.
