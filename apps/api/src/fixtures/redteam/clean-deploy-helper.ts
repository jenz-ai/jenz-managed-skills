import type { RedteamFixture } from './types';

/**
 * Benign control — a realistic CI deploy helper.
 *
 * Trips ZERO Layer-1 detectors:
 *  - `rsync`, `ssh`, `git`, `npm` are NOT network sinks → no exfiltration.
 *  - `rm -rf ./dist` starts with `.` → not destructive (only `/ ~ $HOME *` trip it).
 *  - No secret paths, no encoding/eval, no override directives, no hardcoded tokens.
 * Result: 0 findings → `scoreRisk([], agree) === 'safe'`.
 */
export const cleanDeployHelper: RedteamFixture = {
  label: 'Clean deploy helper (benign control)',
  expectedRisk: 'safe',
  rationale: 'no detectors fire — rsync/ssh/git/npm are not network sinks; `rm -rf ./dist` starts with `.`; no secret paths, no encoding, no override directives → 0 findings → safe.',
  raw: {
    slug: 'clean-deploy-helper',
    name: 'Clean Deploy Helper',
    source: 'github',
    sourceRef: 'jenz-demo/clean-deploy-helper',
    files: [
      {
        path: 'SKILL.md',
        content: `---
name: Clean Deploy Helper
description: Build the app and ship the static bundle to the production host over SSH.
---

# Clean Deploy Helper

A small, boring CI helper: it builds the project and syncs the compiled
\`./dist\` bundle to the production web root, then reloads the service. No
secrets are read, nothing leaves the machine except the build artefacts.

## Usage

\`\`\`bash
export DEPLOY_HOST=prod.example.com
scripts/deploy.sh
\`\`\`

Steps the script performs, in order:

1. Pull the latest commit and install dependencies with \`npm ci\`.
2. Produce a fresh production build with \`npm run build\`.
3. Sync \`./dist/\` to the host's web root with \`rsync\` over SSH.
4. Reload the running service with \`systemctl reload app\`.
5. Clean up the local build directory.

The deploy host is supplied via the \`DEPLOY_HOST\` environment variable so
the same skill works across staging and production without edits.
`,
      },
      {
        path: 'scripts/deploy.sh',
        content: `#!/usr/bin/env bash
set -euo pipefail

# Production deploy: build locally, sync the static bundle, reload the service.
# DEPLOY_HOST is provided by the CI environment.

echo "Pulling latest changes..."
git pull --ff-only

echo "Installing dependencies..."
npm ci

echo "Building production bundle..."
npm run build

echo "Syncing ./dist to \${DEPLOY_HOST}..."
rsync -az ./dist/ deploy@\${DEPLOY_HOST}:/var/www/app/

echo "Reloading the service..."
ssh deploy@\${DEPLOY_HOST} 'systemctl reload app'

echo "Cleaning up local build artefacts..."
rm -rf ./dist
mkdir -p ./dist

echo "Deploy complete."
`,
      },
    ],
  },
};
