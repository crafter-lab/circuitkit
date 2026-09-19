# npm releases

CircuitKit publishes stable versions from `.github/workflows/release.yml`, following the version-driven release flow used by `crafter-station/trx`.

## Normal release

1. Choose the version deliberately and update `package.json`. The workflow does not choose a patch, minor or major bump.
2. Merge the version change into `main`. Only changes to `package.json` trigger an automatic release. Manual workflow dispatch is also available on `main`.
3. The workflow checks that the exact version does not already exist on the public npm registry. Only HTTP 404 means unpublished; authentication, rate-limit and network errors stop the release.
4. Bun installs the frozen dependencies, builds declarations and CLI bundles, typechecks and runs the public test suite. Private Gradual qualification remains a separate opt-in gate.
5. Pinned npm packs one tarball. The package inventory must contain the CLI, declarations, versioned guides and examples, without credentials, private artifacts or native bindings.
6. A fresh npm consumer installs that tarball and runs the Node CLI/API/PNG verification. The same tarball is then published with OIDC and provenance.
7. The workflow compares registry integrity with the tested tarball, then creates `v<version>` and a GitHub release targeting the workflow's exact commit.

An existing version is skipped, never overwritten. If npm publication succeeded but creation of the GitHub release failed, inspect the successful publish step, registry integrity and original commit before creating the missing release. Do not change the version merely to retry a failed GitHub release step.

## Trusted publisher configuration

Configure the package with these exact values:

- Package: `circuitkit`
- Provider: GitHub Actions
- Repository: `crafter-lab/circuitkit`
- Workflow filename: `release.yml`
- Environment: unset
- Allowed action: `npm publish`

The job requests `id-token: write` and runs on GitHub-hosted Ubuntu with Node 24 and npm 11.16.0. It does not require `NPM_TOKEN` or `NODE_AUTH_TOKEN`; the publish step removes those variables and ignores user-level npm configuration. GitHub's short-lived token is used only for the GitHub release.

```sh
npm trust github circuitkit --repository crafter-lab/circuitkit --file release.yml --allow-publish
npm trust list circuitkit --json
```

npm requires a human-authenticated session and account 2FA to configure this relationship. Do not weaken 2FA or copy account tokens into GitHub secrets.

## First publication

npm requires a package to exist before trusted publishing can be configured. The initial `0.1.0` release is authorized as a one-time interactive bootstrap using the maintainer's npm session. Subsequent versions use OIDC. The bootstrap is not an OIDC publication and has no GitHub Actions provenance claim.

Build and pack from a clean, validated release checkout, verify the package inventory with `node scripts/npm-release.mjs verify-pack <pack.json>`, install the actual tarball into a fresh consumer, and run the copied `scripts/verify-agent-package.mjs` there. Publish that exact tarball with `npm publish <tarball> --ignore-scripts --access public --registry https://registry.npmjs.org`, completing npm's authentication prompt yourself if requested. Then configure and inspect the trusted publisher above.

The workflow skips `0.1.0` once the bootstrap exists. A successful no-op workflow confirms version detection, not a successful OIDC exchange. The first future version published by Actions is the end-to-end proof of OIDC publication.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
