# Security policy

## Supported release

The current `1.x` release line receives security fixes. Older versions may not
receive patches, so upgrade before filing a report when possible.

## Reporting a vulnerability

Use GitHub's private security advisory flow for this repository. Do not include
exploit details, credentials, personal data, or proof-of-concept code in a
public issue.

Include the affected version, a clear impact statement, steps to reproduce,
and any suggested mitigation. Maintainers will acknowledge a complete report,
assess the impact, and coordinate a fix before public disclosure.

## Scope

Reports are welcome for the web app, API, build service, deployment templates,
CI workflows, and documented recovery tooling. Third-party services and local
misconfiguration may require coordinated remediation rather than a code patch.

## Operational guidance

Use a unique production session secret and build-service HMAC secret. Keep
Firebase, database, Cloudinary, and backup credentials in a secret manager.
Disable development login outside local development. Apply dependency updates
promptly and test restore procedures before relying on a backup.
