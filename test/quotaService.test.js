const assert = require('assert');
const { normalizeAuthFilesResponse } = require('../out/authFiles');
const { normalizeProvider, parseProviderQuota, selectHourWindow, selectWeekWindow, shouldIncludeAuthFile } = require('../out/quotaParsers');

assert.strictEqual(normalizeAuthFilesResponse([{ name: 'codex-auth.json' }]).files.length, 1);
assert.strictEqual(normalizeAuthFilesResponse({ data: { items: [{ name: 'claude.json' }] } }).files.length, 1);
assert.strictEqual(normalizeProvider({ name: 'gemini-cli-oauth.json' }), 'gemini');
assert.strictEqual(shouldIncludeAuthFile({ name: 'codex-auth.json', disabled: true }, new Set(['codex'])), true);
assert.strictEqual(shouldIncludeAuthFile({ name: 'claude.json', unavailable: true }, new Set(['claude'])), true);

const codexWindows = parseProviderQuota('codex', {
  rate_limit: {
    primary_window: {
      used_percent: 25,
      limit_window_seconds: 18000,
      reset_after_seconds: 3600
    },
    secondary_window: {
      used_percent: 40,
      limit_window_seconds: 604800,
      reset_after_seconds: 7200
    }
  }
});

assert.strictEqual(selectHourWindow({ windows: codexWindows }).remainingPercent, 75);
assert.strictEqual(selectWeekWindow({ windows: codexWindows }).remainingPercent, 60);

const geminiWindows = parseProviderQuota('gemini', {
  buckets: [
    {
      model_id: 'gemini-2.5-pro',
      remaining_fraction: 0.33,
      reset_time: '2026-06-14T00:00:00Z'
    }
  ]
});

assert.strictEqual(Math.round(geminiWindows[0].remainingPercent), 33);
assert.ok(geminiWindows[0].resetAt > 0);

const claudeWindows = parseProviderQuota('claude', {
  five_hour: {
    utilization: 12,
    resets_at: '2026-06-14T00:00:00Z'
  },
  seven_day: {
    utilization: 80,
    resets_at: '2026-06-20T00:00:00Z'
  }
});

assert.strictEqual(selectHourWindow({ windows: claudeWindows }).remainingPercent, 88);
assert.strictEqual(selectWeekWindow({ windows: claudeWindows }).remainingPercent, 20);

console.log('quotaService tests passed');
