# Dependency evidence

Baseline npm ci --ignore-scripts on Node 24.19.0 installed the original lock and reported 20 affected packages (5 moderate, 14 high, 1 critical). Actual audit paths were inspected. Compatible audit fix, matrix/brace-expansion patch updates, and removal of unused rollup-plugin-copy reduced this to four affected packages (1 moderate, 3 high). Original runtime libraries remain. The copy plugin had no import/caller; the custom copy script remains canonical. No new dependencies were added. Lock entries retain integrity and license metadata.

Rollup moved within v4 to a patch for [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc); compatible transitive fixes address glob/brace/express paths. Matrix 3.4.2 is a compatible MIT patch; remaining whole-tree typed-array errors are documented rather than cast away.

Unfixed boundaries, inspected 2026-10-21:

- servez-lib → selfsigned → node-forge@1.4.0: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), RSA verification accepts nested DigestAlgorithm elements. Registry latest is 1.4.0, advisory covers <=1.4.0. Verification requests loopback HTTP, no self-signed HTTPS. This is not proof that all server features are safe.
- showdown@2.1.0: [ReDoS](https://github.com/advisories/GHSA-rmmh-p597-ppvv), [metadata XSS](https://github.com/advisories/GHSA-cr32-g25g-vxjj), [table header injection](https://github.com/advisories/GHSA-22g5-r2x5-97cx), no fixed release. Caller src/main.ts passes trusted descriptions from sample/*/meta.ts into makeHtml and innerHTML. The new sample adds a constant string, with no untrusted Markdown/HTML input.

No force upgrade, fabricated fixed version, or replacement server was used. Upstream server CLI remains available. Deployment is disabled and added CI has contents: read. Do not expand the documented trust boundaries without addressing advisories.
