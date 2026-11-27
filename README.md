# ZCtrl

ZCtrl is a desktop and local-network management application for **MikroTik RouterOS** built with Electron, React 19, TypeScript, Express, and SQLite (`sql.js`).

## Requirements

- Node.js `>= 20` (`20.x` or `22.x`)
- npm (`package-lock.json` is the canonical lockfile)
- Windows x64 (for NSIS / Portable Electron builds) or Linux/macOS for development

## Installation

```bash
npm ci
```

## Scripts

- `npm run dev` — Start development Express + Vite server (binds `127.0.0.1:3000` by default)
- `npm run build` — Build frontend (`dist/`) and bundled backend (`dist/server.cjs`)
- `npm start` — Run server in production mode (`NODE_ENV=production`)
- `npm run lint` — Run TypeScript type check (`tsc --noEmit`) and ESLint (`eslint .`)
- `npm test` — Execute the Node test suite (`tests/*.test.ts`)
- `npm run electron:start` — Launch the Electron desktop application against the built bundle
- `npm run build:win` — Build Windows NSIS installer and Portable `.exe` using `electron-builder.json`

## Environment Variables

Copy `.env.example` to `.env` for local or server deployments (never commit `.env` or `*.key` files):

- `PORT` (default `3000`)
- `HOST` (default `127.0.0.1`; set `0.0.0.0` only behind a TLS reverse proxy)
- `APP_ENCRYPTION_KEY` — 32+ byte secret used for AES-256-GCM credential encryption (in Electron desktop builds, generated and protected automatically via OS `safeStorage` in `userData/vault.key.enc`)
- `ZCTRL_DATA_DIR` — Persistent directory for SQLite DB, RBAC operators, AP vault, and TLS pins (defaults to `.zctrl_data/` on server, `app.getPath('userData')/data` on Electron)
- `ZCTRL_LOG_DIR` — Rotating log directory
- `TRUST_PROXY` — Set `1` or `true` ONLY when running behind a trusted reverse proxy (nginx/Caddy)
- `ALLOWED_HOSTS` — Comma-separated extra hostnames permitted by the Host header DNS-rebinding guard
- `ALLOWED_ORIGINS` — Comma-separated extra origins permitted by production CORS
- `APP_URL` — Public base URL when hosted behind HTTPS reverse proxy

## Security Architecture

- **Loopback Binding & DNS Rebinding Protection**: Express binds `127.0.0.1` by default and validates the `Host` header against configured allowed hosts.
- **RBAC Enforcement**: Once an operator account exists, `/api/mikrotik/connect` requires authenticated operator credentials (server-verified `scrypt` hash, 10+ character minimum password, 5-attempt temporary lockout).
- **TOFU TLS Pinning**: MikroTik `api-ssl` (`8729`) and AP HTTPS connections verify SHA-256 peer certificate fingerprints before transmitting credentials.
- **Encrypted Credential Storage**: Secrets use AES-256-GCM with atomic `0600` file writes and automatic migration of legacy CBC records.

## Backup & Restore

Back up your entire `ZCTRL_DATA_DIR` directory while ZCtrl is stopped:

- **Desktop (Windows)**: `%APPDATA%\ZCtrl\` (`vault.key.enc` and `data/` including SQLite database, `operators.json`, `ap_vault.json`, `tls_pins.json`)
- **Server / CLI**: `.zctrl_data/` (plus securely store `APP_ENCRYPTION_KEY` separately; without the matching key or `vault.key.enc`, encrypted vault passwords cannot be decrypted).

To restore, stop ZCtrl, copy the backed-up `data/` folder and matching `vault.key.enc` (or `APP_ENCRYPTION_KEY`) into place, and restart ZCtrl.
