# Local demo diagnostics

Use this when a large demo fails to parse. The diagnostic downloads the pinned
4.0.0 and 5.0.0 browser parser bundles and reads your extracted `.dem` locally.
It does not upload the demo or contact the NickStats API, change the production
parser, or require a backend, login, `npm install`, or frontend build.

From the repository root, with Node.js 20 or newer:

```sh
node tools/diagnose-demo.mjs "/path/to/match.dem"
```

On Windows, a path such as `"C:\Users\Nick\Downloads\match.dem"` works too.
Extract `.bz2` or `.zst` files first. Leave the demo outside the repository to
avoid accidentally committing it.

Send back `nickstats-parser-report.json`. It contains a demo fingerprint and
size, runtime details, parser bundle fingerprints, numeric game build metadata,
packet counts, the most recent packet types/ticks, entity-packet sizes and flags,
and sanitized error locations. It excludes demo contents, file paths, player or
server names, Steam IDs, chat, and raw packet payloads. Unrecognized error text
is deliberately omitted; its code location is retained where available.

The tool runs each parser both with NickStats' class/message filters and without
filters. When the script remains inside `tools/` in the repository, it also runs
the actual current NickStats 4.0.0 worker, discarding the exported match data.
A standalone copy still runs the four parser comparisons. This helps distinguish
an integration failure from an underlying decoding failure. A successful raw
parse does not verify the correctness of NickStats statistics or validate a
5.0.0 integration. The report can narrow down a defect; some fixes may still
require a reproducible demo or an upstream test case.
`passed` means the parser returned without an exception. Some parsers tolerate
truncated files; `saw_demo_stop` records whether a terminal demo packet was seen.

Runs are sequential and isolated in separate worker threads. Each has a default
three-minute timeout; the tool prints periodic progress and saves the report
after each run. If a run times out, try a larger limit and a new output name:

```sh
node tools/diagnose-demo.mjs "/path/to/match.dem" --timeout 600 --out report-long.json
```

Existing output files are never overwritten at startup. Subsequent checkpoints
update only the new report created by that invocation. The actual NickStats
worker reads the whole demo into memory, as it does in the browser; other runs
use a file stream. Close other memory-heavy applications for very large demos.

For offline diagnosis, download the two bundles from the URLs below, save them together as
`deadem-4.0.0.js` and `deadem-5.0.0.js`, and add `--bundles "/path/to/bundles"`:

- https://cdn.jsdelivr.net/npm/@deademx/cs2@4.0.0/dist/deadem-cs2.min.js
- https://cdn.jsdelivr.net/npm/@deademx/cs2@5.0.0/dist/deadem-cs2.min.js
