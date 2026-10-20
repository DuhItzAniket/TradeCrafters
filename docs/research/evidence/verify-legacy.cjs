/*
 * Controlled probes of the pinned coursework controller, not application tests.
 * Uses Node built-ins and Git only. No database, API, credentials or network.
 */
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');

const baseline = '8fa026527631bbfa51bcd0ba5e3412eaa8df5b16';
const root = path.resolve(__dirname, '../../..');
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const source = git('show', `${baseline}:server/controllers/tradeController.js`);
const dbTracked = git('ls-tree', '-r', '--name-only', baseline,
  'server/database/db.js').trim().length > 0;

async function probe({ name, side, quantity, balance, held }) {
  const writes = [];
  const db = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('select user_id, username')) {
        return [[{ user_id: 1, username: 'demo' }]];
      }
      if (normalized.startsWith('select account_balance')) {
        return [[{ account_balance: balance }]];
      }
      if (normalized.startsWith('select quantity, avg_price')) {
        return [held ? [{ quantity: held, avg_price: '10.00' }] : []];
      }
      if (/^(insert|update|delete)/.test(normalized)) {
        writes.push({ sql: normalized, params });
      }
      return [{ insertId: 1, affectedRows: 1 }];
    },
  };
  const exports = {};
  const sandbox = {
    exports,
    console: { log() {}, error() {} },
    require(name) {
      if (name === '../database/db') return db;
      if (name === 'bcrypt') return {};
      throw new Error(`Unexpected import in isolated probe: ${name}`);
    },
  };
  vm.runInNewContext(source, sandbox, { timeout: 1000, filename: 'pinned-tradeController.js' });
  let status = 200;
  let response;
  const res = {
    status(value) { status = value; return this; },
    json(value) { response = value; return this; },
  };
  await exports.trade({ body: {
    username: 'demo', symbol: 'TC.APEX', price: 10, type: side, quantity,
  } }, res);
  const cashWrite = writes.find(w => w.sql.startsWith('update users set account_balance'));
  const positionWrites = writes.filter(w => /^(update|insert into|delete from) portfolios/.test(w.sql));
  return {
    name, inputs: { side, quantity, balance, held }, status,
    controllerReportsSuccess: response?.message === 'Trade executed successfully',
    attemptedCashBinding: cashWrite?.params[0],
    attemptedPositionQuantity: positionWrites[0]?.params[0] ?? null,
    positionWriteCount: positionWrites.length,
  };
}

(async () => {
  assert.equal(dbTracked, false);
  const invalidSide = await probe({ name: 'unknown side credits without changing holdings',
    side: 'UNKNOWN', quantity: 2, balance: 100, held: 5 });
  assert.equal(invalidSide.status, 200);
  assert.equal(invalidSide.attemptedCashBinding, 120);
  assert.equal(invalidSide.positionWriteCount, 0);

  const stringQuantity = await probe({ name: 'string quantity concatenates on buy',
    side: 'buy', quantity: '2', balance: 1000, held: 5 });
  assert.equal(stringQuantity.status, 200);
  assert.equal(stringQuantity.attemptedPositionQuantity, '52');

  const stringBalance = await probe({ name: 'string DECIMAL balance concatenates on sell',
    side: 'sell', quantity: 2, balance: '100.00', held: 5 });
  assert.equal(stringBalance.status, 200);
  assert.equal(stringBalance.attemptedCashBinding, '100.0020');

  process.stdout.write(JSON.stringify({
    baseline,
    controllerSha256: createHash('sha256').update(source).digest('hex'),
    scope: 'Pinned controller with injected fake database; no integration or live endpoint test',
    baselineDatabaseModuleTracked: dbTracked,
    verifiedKnownDefects: [invalidSide, stringQuantity, stringBalance],
  }, null, 2) + '\n');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
