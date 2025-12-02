# Publishing / Deploy

## GitHub repository
1) Create a new repo `codex-desktop` on GitHub (empty).
2) Locally:
```bash
git init
git add .
git commit -m "Initial Codex Desktop"
git branch -M main
git remote add origin https://github.com/<user>/codex-desktop.git
git push -u origin main
```

## Desktop release
```bash
npm install
npm run dist
```
- electron-builder will place installers in `dist/`.
- Upload installers to GitHub Releases; code-sign if you can.

## Web variant (if needed)
- Current code is Electron-first (IPC). For web you’d need:
  - Replace IPC with HTTP client to a backend that wraps `codex exec --json`.
  - Small backend (Node/Express/serverless) that runs Codex CLI and streams JSONL.
  - Set `VITE_API_BASE_URL` at build time.
- Then `npm run build` → deploy `dist/` to Vercel/Netlify/Cloudflare Pages.

## CSP note
- `index.html` ships with a dev-friendly CSP (allows localhost:5175, inline). For production, tighten it: remove dev hosts/`unsafe-inline`, add hashes/nonces if needed.

## Screenshot
- Put your UI screenshot at `docs/screenshot.png` (README references it).
