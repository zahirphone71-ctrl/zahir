# Security Policy

## Supported Versions

Security patches and fixes are provided for the current major release line:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in **ZCtrl**, please do **not** open a public GitHub issue with exploit details.

1. Report privately via GitHub Security Advisories (`Security` -> `Advisories` -> `Report a vulnerability`) or contact the maintainers directly at `security@zctrl.local`.
2. Include steps to reproduce, affected version, and potential impact.
3. You will receive an acknowledgement within **48 hours**, a status update within **5 business days**, and coordinated disclosure once a fix is released.

## Security Hardening Practices

- Never commit `.env`, `.zctrl_data/`, `*.key`, or `*.key.enc` files.
- Always prefer MikroTik `api-ssl` (port `8729`) with TOFU SHA-256 certificate pinning over unencrypted port `8728`.
- When exposing ZCtrl outside `127.0.0.1`, run it behind a TLS-terminating reverse proxy (e.g., Caddy or nginx) and configure `TRUST_PROXY`, `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and `APP_ENCRYPTION_KEY`.
