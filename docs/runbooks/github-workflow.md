# GitHub workflow and branch protection

## Local checks

`pnpm install` activates Husky through the `prepare` script.

- `pre-commit`: lint-staged fixes ESLint and Prettier issues only in staged supported files.
- `commit-msg`: commitlint enforces Conventional Commits.
- `pre-push`: repository typechecking and unit tests must pass.

Do not use `--no-verify` as a normal workflow. CI repeats and extends local checks from a clean checkout.

## Branch protection

Protect `main` and configure pull requests as the only normal merge path. Require:

- the stable `CI gate` status check;
- the branch to be current before merge;
- at least one approving review;
- conversation resolution;
- force pushes and branch deletion to be disabled.

The `CI gate` aggregates changed-file formatting, environment validation, linting, dependency
boundaries, types, unit, contract, API, security, integration, workspace build, and every Docker build
matrix job. Changed-file formatting lets the repository ratchet toward full formatting without
rewriting unrelated legacy UI files in one pull request.

The coverage job uploads reports and evaluates the existing thresholds but is initially non-blocking.
The current baseline is below the configured 70% branch target in `documents`, `knowledge`, and
`profile`; make coverage required after those packages meet the committed thresholds.
The scheduled `Extended tests` workflow is intentionally not a pull-request merge requirement.

Create a protected GitHub environment named `production`. Only `main` may deploy to it, and its
`DOKPLOY_DEPLOY_WEBHOOK` secret must not be exposed to pull-request workflows.

## Extended tests

Playwright and Docling integration tests run on `main`, nightly, and on manual dispatch. Failure artifacts
are retained for 14 days. These checks stay outside the pull-request gate until authenticated E2E fixtures
and the full service stack are deterministic enough to avoid blocking unrelated changes.
