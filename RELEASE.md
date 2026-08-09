# Release policy

Vitae follows semantic versioning. The public application, API behavior,
export format, and documented deployment contract remain compatible across a
minor release unless a migration guide says otherwise.

## Release requirements

- A clean checkout passes linting, type checks, unit tests, API tests,
  accessibility tests, end-to-end tests, production builds, and container
  checks.
- The dependency audit has no high or critical findings.
- OpenAPI output, release notes, runbooks, and migration guidance match the
  released code.
- The release includes an SPDX SBOM and checksums for generated artifacts.
- A backup and restore drill has passed for the supported data format.

## Version policy

Patch releases fix defects and security issues. Minor releases add compatible
features. Major releases may remove or change a documented contract and must
include an upgrade guide.

## Supported versions

The latest `1.x` release is supported. A security fix for an earlier supported
release is documented in the changelog when one is published.
