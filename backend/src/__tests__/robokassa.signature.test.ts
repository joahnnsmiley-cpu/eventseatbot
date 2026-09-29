/**
 * Robokassa signatures.
 * Run with: npx ts-node src/__tests__/robokassa.signature.test.ts
 *
 * Three formulas, three different passwords and orders. Getting one of them
 * subtly wrong shows up as "payments simply never confirm", which is expensive
 * to discover in production, so each is pinned against a hash computed here
 * from the documented string.
 */

import crypto from 'crypto';
import {
  buildPaymentLink,
  buildReceipt,
  safeText,
  verifyResult,
  verifySuccess,
  resultAck,
  formatSum,
} from '../domain/payments/robokassa';
import type { RobokassaConfig } from '../config/robokassa';

const cfg: RobokassaConfig = {
  merchantLogin: 'NiktoNeKruche',
  password1: 'pass1',
  password2: 'pass2',
  hash: 'md5',
  isTest: true,
  sendReceipt: true,
  tax: 'none',
  payUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
  extraAllowedIps: [],
  enabled: true,
};

const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const results: { name: string; passed: boolean; error?: string }[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err) {
    results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) });
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

check('formatSum always gives two decimals', () => {
  assert(formatSum(1500) === '1500.00', `got ${formatSum(1500)}`);
  assert(formatSum(1500.5) === '1500.50', `got ${formatSum(1500.5)}`);
  assert(formatSum(0.005) === '0.01', `got ${formatSum(0.005)}`);
});

check('receipt carries no sno and tax none', () => {
  const json = buildReceipt([{ name: 'Участие', quantity: 1, sum: 1500, tax: 'none' }]);
  const parsed = JSON.parse(json) as { sno?: string; items: { tax: string }[] };
  assert(parsed.sno === undefined, 'sno must be absent for НПД');
  assert(parsed.items[0]!.tax === 'none', 'tax must be none');
});

check('receipt name is capped at 128 characters', () => {
  const long = 'я'.repeat(300);
  const parsed = JSON.parse(buildReceipt([{ name: long, quantity: 1, sum: 1, tax: 'none' }])) as
    { items: { name: string }[] };
  assert(parsed.items[0]!.name.length === 128, `got ${parsed.items[0]!.name.length}`);
});

check('payment link signs MerchantLogin:OutSum:InvId:Receipt:Password1', () => {
  const items = [{ name: 'Участие', quantity: 1, sum: 1500, tax: 'none' }];
  const receipt = encodeURIComponent(buildReceipt(items));
  const expected = md5(`NiktoNeKruche:1500.00:42:${receipt}:pass1`);

  const url = new URL(buildPaymentLink(cfg, {
    invId: 42, amount: 1500, description: 'Участие', receiptItems: items,
  }));
  assert(url.searchParams.get('SignatureValue') === expected,
    `signature ${url.searchParams.get('SignatureValue')} != ${expected}`);
  assert(url.searchParams.get('OutSum') === '1500.00', 'OutSum');
  assert(url.searchParams.get('InvId') === '42', 'InvId');
  assert(url.searchParams.get('IsTest') === '1', 'IsTest must be set in test mode');
  // URLSearchParams decodes once, so what comes back is the signed string.
  assert(url.searchParams.get('Receipt') === receipt, 'Receipt must survive round-trip');
});

check('payment link omits Receipt when receipts are off', () => {
  const off = { ...cfg, sendReceipt: false };
  const url = new URL(buildPaymentLink(off, {
    invId: 7, amount: 600, description: 'Участие',
    receiptItems: [{ name: 'Участие', quantity: 1, sum: 600, tax: 'none' }],
  }));
  assert(url.searchParams.get('Receipt') === null, 'Receipt must be absent');
  assert(url.searchParams.get('SignatureValue') === md5('NiktoNeKruche:600.00:7:pass1'),
    'signature must drop the Receipt segment too');
});

check('special characters are stripped from names', () => {
  // Название концерта содержит вертикальную черту и кавычки-ёлочки; Робокасса
  // требует «без спецсимволов» и в Description, и в позиции чека.
  const cleaned = safeText('Участие в мероприятии «НиктоНеКруче|Карина Лубнина», 1 место', 128);
  assert(!/[«»|]/.test(cleaned), `остались спецсимволы: ${cleaned}`);
  assert(cleaned.includes('НиктоНеКруче'), 'название не должно теряться');
  assert(cleaned.includes('Карина Лубнина'), 'вторая часть названия не должна теряться');
  assert(!/\s{2,}/.test(cleaned), 'двойные пробелы должны схлопываться');
});

check('a name of nothing but symbols does not become empty', () => {
  // В чеке должна быть хотя бы одна названная позиция.
  assert(safeText('«|»', 128) === 'Услуга', `got ${safeText('«|»', 128)}`);
});

check('the receipt item carries the cleaned name', () => {
  const parsed = JSON.parse(buildReceipt([
    { name: 'Концерт «А|Б»', quantity: 1, sum: 600, tax: 'none' },
  ])) as { items: { name: string }[] };
  assert(!/[«»|]/.test(parsed.items[0]!.name), `в чеке спецсимволы: ${parsed.items[0]!.name}`);
});

check('the payment link carries the cleaned description', () => {
  const url = new URL(buildPaymentLink(cfg, {
    invId: 4, amount: 1000, description: 'Участие в мероприятии «НиктоНеКруче|Карина Лубнина»',
  }));
  const d = url.searchParams.get('Description') ?? '';
  assert(!/[«»|]/.test(d), `в Description спецсимволы: ${d}`);
  assert(d.length <= 100, 'Description не длиннее 100 символов');
});

check('ResultURL is signed with password #2', () => {
  const sig = md5('1500.000000:42:pass2');
  const ok = verifyResult(cfg, { OutSum: '1500.000000', InvId: '42', SignatureValue: sig });
  assert(ok.ok, `expected valid, got ${ok.reason}`);
  assert(ok.invId === 42, 'invId');

  const withPassword1 = verifyResult(cfg, {
    OutSum: '1500.000000', InvId: '42', SignatureValue: md5('1500.000000:42:pass1'),
  });
  assert(!withPassword1.ok, 'password #1 must not pass the ResultURL check');
});

check('SuccessURL is signed with password #1', () => {
  const sig = md5('1500.00:42:pass1');
  assert(verifySuccess(cfg, { OutSum: '1500.00', InvId: '42', SignatureValue: sig }).ok,
    'password #1 must pass');
  assert(!verifySuccess(cfg, { OutSum: '1500.00', InvId: '42', SignatureValue: md5('1500.00:42:pass2') }).ok,
    'password #2 must not pass the SuccessURL check');
});

check('signature comparison ignores hex case', () => {
  const sig = md5('1500.00:42:pass2').toUpperCase();
  assert(verifyResult(cfg, { OutSum: '1500.00', InvId: '42', SignatureValue: sig }).ok,
    'upper-case hex must verify');
});

check('malformed callbacks are rejected, not crashed on', () => {
  assert(verifyResult(cfg, {}).reason === 'missing_params', 'empty params');
  assert(verifyResult(cfg, { OutSum: '1', InvId: 'abc', SignatureValue: 'x' }).reason === 'bad_inv_id',
    'non-numeric InvId');
  assert(verifyResult(cfg, { OutSum: '1', InvId: '5', SignatureValue: 'short' }).reason === 'bad_signature',
    'a signature of the wrong length must not throw');
});

check('the acknowledgement is exactly what Robokassa waits for', () => {
  assert(resultAck(450009) === 'OK450009', `got ${resultAck(450009)}`);
});

const failed = results.filter((r) => !r.passed);
for (const r of results) {
  console.log(`${r.passed ? 'ok  ' : 'FAIL'} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
