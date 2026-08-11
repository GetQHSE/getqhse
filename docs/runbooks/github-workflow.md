# GitHub workflow and branch protection

## Local checks

`pnpm install` activates Husky through the `prepare` script.

- `pre-commit`: lint-staged fixes ESLint and Prettier issues only in staged supported files.
- `commit-msg`: commitlint enforces Conventional Commits.
- `pre-push`: repository typechecking and unit tests must pass.

Do not use `--no-verify` as a normal workflow. CI repeats and extends local checks from a clean checkout.

## Branch protection

Protect `main` and configure pull requests as the only normal merge path. Require:

- the stable `Build and unit tests` status check;
- the branch to be current before merge;
- at least one approving review;
- conversation resolution;
- force pushes and branch deletion to be disabled.

The default CI workflow intentionally stays lightweight on GitHub-hosted Ubuntu runners. It installs from
the frozen lockfile, validates environment templates, runs unit tests, and builds the workspace. API,
contract, security, integration, E2E, Docling, coverage, and Docker image validation are not blocking
checks by default.

Run heavier suites locally or from dedicated manual workflows when runner capacity allows.

Create a protected GitHub environment named `production`. Only `main` may deploy to it, and its
`DOKPLOY_DEPLOY_WEBHOOK` secret must not be exposed to pull-request workflows.

## Extended tests

Playwright and Docling integration tests run only through manual dispatch. Failure artifacts are retained
for 14 days. These checks stay outside the pull-request gate until authenticated E2E fixtures, runner
capacity, and the full service stack are deterministic enough to avoid blocking unrelated changes.
