import { existsSync } from 'node:fs';
import { release } from 'node:os';
import { spawnSync } from 'node:child_process';

const isMacOS12 = process.platform === 'darwin' && Number(release().split('.')[0]) === 21;
const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const calls = [
  ['run', 'validate'],
  ['run', 'test:unit'],
  ['audit', '--omit=dev', '--audit-level=high'],
  ['run', 'test:e2e'],
];

if (!existsSync('package-lock.json')) {
  console.error('Missing package-lock.json. Run npm install first. Commit the lockfile for CI.');
  process.exit(1);
}
if (isMacOS12) {
  console.warn('\nPaprify compatibility mode: macOS 12 is unsupported by current Playwright bundled browsers.');
  console.warn('Tests will use your already-installed system Google Chrome.');
  console.warn('This run CANNOT certify the full cross-browser public release; Linux CI must pass as well.\n');
}
for (const args of calls) {
  console.log(`\nRelease gate: npm ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // Validation already compiled dist/. Run the actual build in an isolated
    // preview server without compiling it twice in this release gate.
    env: args[1] === 'test:e2e' ? { ...process.env, PAPRIFY_PREBUILT: '1' } : process.env,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
if (isMacOS12) {
  console.log('\nLOCAL MACOS 12 CHECKS PASSED (LIMITED COVERAGE).');
  console.log('Next: commit source + package-lock.json and require the GitHub Actions Linux job to pass.');
  console.log('Do not mark public release approved until supported Chromium/WebKit tests and manual PDF checks pass.');
} else {
  console.log('\nAutomated local release gates passed. Perform HTTPS deployment smoke tests and manual PDF checks before public launch.');
}
