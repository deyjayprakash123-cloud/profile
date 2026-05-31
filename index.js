/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      AEROX — GitHub Contribution Graph Seeder               ║
 * ║      Author : Jayaprakash Dey                               ║
 * ║      Engine : Node.js + simple-git + moment                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * BEFORE RUNNING:
 *   1. Replace GIT_EMAIL below with your real GitHub-linked email.
 *   2. Ensure this script lives inside a valid git repository.
 *   3. Run:  node index.js
 *   4. Then: git push -u origin main --force
 */

'use strict';

const simpleGit = require('simple-git');
const moment = require('moment');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION  —  Edit only this block
// ─────────────────────────────────────────────────────────────────
const GIT_NAME = 'deyjayprakash123-cloud';
const GIT_EMAIL = 'deyjayprakash123@gamil.com'; // ← Replace before running

const LOOK_BACK_DAYS = 365;   // How many days back to seed
const MAX_COMMITS_PER_DAY = 8;   // Upper bound of daily commits
const MIN_COMMITS_PER_DAY = 1;   // Lower bound
const SKIP_DAY_CHANCE = 0.15;  // 15 % probability to leave a day empty
const LOG_FILE = path.resolve(__dirname, 'contribution-log.json');
// ─────────────────────────────────────────────────────────────────

/** Generates a cryptographically random hex string of `len` chars. */
function randomHex(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

/** Returns a random integer in [min, max] inclusive. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Builds the ISO 8601 timestamp string git needs for --date. */
function buildTimestamp(dayMoment, commitIndex) {
  // Spread commits across random hours within the working day (07:00–23:59)
  const hour = randInt(7, 23);
  const minute = randInt(0, 59);
  const second = randInt(0, 59);
  return dayMoment
    .clone()
    .hour(hour)
    .minute(minute)
    .second(second)
    .format('YYYY-MM-DDTHH:mm:ss');
}

/** Pretty-prints progress to stdout. */
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}]  ${msg}`);
}

// ─────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────
async function main() {
  // ── Validate email was replaced ──────────────────────────────
  if (GIT_EMAIL === 'YOUR_GITHUB_EMAIL_HERE') {
    console.error('\n  ✖  ERROR: You forgot to set GIT_EMAIL in index.js.\n');
    console.error('  Open index.js and replace YOUR_GITHUB_EMAIL_HERE with');
    console.error('  the email address linked to your GitHub account.\n');
    process.exit(1);
  }

  const git = simpleGit({ baseDir: __dirname });

  // ── Verify we are inside a git repo ─────────────────────────
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    console.error('\n  ✖  ERROR: Not a git repository. Run "git init" first.\n');
    process.exit(1);
  }

  // ── Inject identity GLOBALLY into local .git/config ─────────
  // This runs once before the loop as a hardcoded safety net.
  log('Injecting git identity into local config…');
  await git.addConfig('user.name', GIT_NAME, false, 'local');
  await git.addConfig('user.email', GIT_EMAIL, false, 'local');
  log(`  user.name  → ${GIT_NAME}`);
  log(`  user.email → ${GIT_EMAIL}`);

  // ── Build ordered date list (oldest → newest) ────────────────
  const today = moment().startOf('day');
  const dates = [];
  for (let d = LOOK_BACK_DAYS - 1; d >= 0; d--) {
    dates.push(today.clone().subtract(d, 'days'));
  }

  let totalCommits = 0;
  let skippedDays = 0;

  log(`\nStarting contribution seeder — ${LOOK_BACK_DAYS} days window…\n`);

  // ── Sequential daily loop ────────────────────────────────────
  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];
    const dateLabel = day.format('YYYY-MM-DD');

    // Organic skip
    if (Math.random() < SKIP_DAY_CHANCE) {
      log(`  ⊘  ${dateLabel}  —  skipped (organic gap)`);
      skippedDays++;
      continue;
    }

    const commitsToday = randInt(MIN_COMMITS_PER_DAY, MAX_COMMITS_PER_DAY);
    log(`  ● ${dateLabel}  →  ${commitsToday} commit(s)`);

    for (let c = 0; c < commitsToday; c++) {
      // ── Re-inject identity on EVERY commit iteration ─────────
      // This is the critical guard that prevents author mismatches.
      await git.addConfig('user.name', GIT_NAME, false, 'local');
      await git.addConfig('user.email', GIT_EMAIL, false, 'local');

      // ── Build a unique payload ────────────────────────────────
      const isoTimestamp = buildTimestamp(day, c);
      const payload = {
        _engine: 'AEROX Contribution Seeder v2',
        date: dateLabel,
        commitIndex: c + 1,
        totalOnDay: commitsToday,
        isoTimestamp: isoTimestamp,
        entropy: randomHex(32),
        salt: randomHex(8),
        author: GIT_NAME,
        email: GIT_EMAIL,
        sessionId: randomHex(12),
        buildTick: Date.now(),
      };

      // ── Write dynamic file ────────────────────────────────────
      await fs.writeFile(
        LOG_FILE,
        JSON.stringify(payload, null, 2),
        'utf8'
      );

      // ── Stage the file ────────────────────────────────────────
      await git.add(LOG_FILE);

      // ── Commit with forced author + committer timestamps ──────
      // GIT_COMMITTER_DATE env var locks in the committer date,
      // while --date locks the author date. Both must match for
      // GitHub to credit the contribution to the correct day.
      const commitOptions = {
        '--date': isoTimestamp,
        '--author': `${GIT_NAME} <${GIT_EMAIL}>`,
        '--allow-empty': null,   // safety: never fail on empty tree
      };

      const envPatch = {
        GIT_AUTHOR_NAME: GIT_NAME,
        GIT_AUTHOR_EMAIL: GIT_EMAIL,
        GIT_AUTHOR_DATE: isoTimestamp,
        GIT_COMMITTER_NAME: GIT_NAME,
        GIT_COMMITTER_EMAIL: GIT_EMAIL,
        GIT_COMMITTER_DATE: isoTimestamp,
      };

      // Temporarily extend the process environment so simple-git
      // inherits the patched variables for this child-process call.
      const originalEnv = { ...process.env };
      Object.assign(process.env, envPatch);

      try {
        const message = `chore: architecture sync [${dateLabel} · ${String(c + 1).padStart(2, '0')}/${String(commitsToday).padStart(2, '0')}] · ${randomHex(6)}`;
        await git.commit(message, undefined, commitOptions);
        totalCommits++;
      } finally {
        // Always restore the environment, even on error
        for (const key of Object.keys(envPatch)) {
          if (originalEnv[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = originalEnv[key];
          }
        }
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n');
  log('═══════════════════════════════════════════════════');
  log('  AEROX Contribution Seeder — Run Complete');
  log('═══════════════════════════════════════════════════');
  log(`  Total commits   : ${totalCommits}`);
  log(`  Days covered    : ${LOOK_BACK_DAYS - skippedDays} / ${LOOK_BACK_DAYS}`);
  log(`  Days skipped    : ${skippedDays}`);
  log(`  Author identity : ${GIT_NAME} <${GIT_EMAIL}>`);
  log('═══════════════════════════════════════════════════');
  console.log('\n  ✔  Now run the following to push to GitHub:\n');
  console.log('     git push -u origin main --force\n');
}

main().catch((err) => {
  console.error('\n  ✖  FATAL ERROR:', err.message || err);
  process.exit(1);
});
