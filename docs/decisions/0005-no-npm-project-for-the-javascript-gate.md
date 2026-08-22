# 0005. Gate JavaScript without introducing an npm project

- **Date:** 2026-08-22
- **Status:** accepted

## Context and problem statement

This repository declares `typescript` in the universe catalogue, which covers its
Node.js JavaScript. The [TypeScript
standard](https://github.com/hannosirkel/architecture/blob/main/standards/languages/typescript.md)
names `eslint` as that language's CI gate, and the conformance audit reports
`missing-gate: declares typescript but CI runs none of ['eslint']`. The
repository has no `package.json`, no lockfile, and no `node_modules`:
`scripts/validate` calls `node --test` and `node` directly. Its JavaScript is six
files totalling about 1,000 lines, none of which imports a third-party package.
Running ESLint at all means giving this repository a package manager it has
deliberately never had.

## Considered options

- Add `package.json`, `eslint.config.mjs`, and `package-lock.json`, install
  ESLint in CI with `npm ci`, and baseline the findings.
- Adopt a second JavaScript toolchain that lints without a package manager
  (`deno lint`).
- Record an exception, keep the JavaScript gated by the checks already in
  `scripts/validate`, and revisit if this repository ever gains an npm project
  for its own reasons.

## Decision

Record an exception. No `package.json`, no lockfile, and no ESLint. The
JavaScript gate stays what `scripts/validate` already runs: `node --test` over
each `logic.test.js`, and a byte-for-byte `cmp` of every regenerated
`workflow.json` against the committed one.

## Rationale

The [code quality
standard](https://github.com/hannosirkel/architecture/blob/main/standards/code-quality.md)
is explicit that the gate runs "through the lightest mechanism the repository
already has" and says: *do not add a task runner or a package manager for
uniformity*. Adding npm here would be exactly that — the gate is the only reason.

The measurement supports it rather than merely permitting it. ESLint 10 with
`@eslint/js` recommended rules over all six files reports four findings, every
one of them `no-unused-vars`. At least two are artefacts of this repository's
design rather than defects: `generate-workflow.js` splices `logic.js` into
`workflow.json` after stripping `module.exports`, so exported helpers that n8n
calls at runtime read as unused to a linter that cannot see the splice. All four
would be baselined on the day they were introduced, so the gate's first useful
day is its second. Against that: 71 packages and 13 MB of `node_modules`, a
lockfile, an `npm ci` step, a permanent Renovate stream, and a new supply-chain
surface in a repository that runs with credentialed access to n8n and GitHub.

`deno lint` was considered because it needs no package manager. It was rejected
because it introduces a second JavaScript runtime to a repository that has one,
and because it is not the tool the standard names — the exception would have to
be recorded anyway, for a tool nobody else in the universe runs.

The trade-off accepted is real and should not be minimised: a class of defect
that ESLint catches — an unused binding, a shadowed variable, an unreachable
branch — is not caught here by anything except review. What stands in for it is
narrower but not nothing. Every JavaScript file is parsed and executed on every
CI run, the pure logic functions have unit tests, and the generator round trip
means a change to `logic.js` that does not regenerate `workflow.json` fails the
build. Habit Hooks continues to run its `typescript` plugin as the coach; its
`eslint` and `knip` sensors report `incomplete-run` here for the same missing
`node_modules`, which the generated `.habit-hooks/config.toml` already accounts
for.

## Consequences

- `tooling/universe audit mihkel` continues to report one `missing-gate` failure
  for `typescript`. That finding is expected and is answered by this record.
- If this repository ever gains an npm project for a reason of its own — a
  dependency, a bundler, a test framework — the trade-off changes and ESLint
  should be added in the same change. Supersede this record then.
- New JavaScript here is reviewed rather than linted. Reviewers carry a load
  that a linter would otherwise carry.
