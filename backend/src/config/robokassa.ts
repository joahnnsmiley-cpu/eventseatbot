/**
 * Robokassa acquiring — configuration read from the environment.
 *
 * The shop runs on Робочеки СМЗ: the merchant is an ИП on НПД, so receipts go
 * through «Мой налог» under 422-ФЗ rather than through a cash register under
 * 54-ФЗ. Two consequences are baked in below:
 *
 *  - `sno` is never sent. Robokassa's list of tax systems is ОСН, УСН (two
 *    kinds), ЕСХН and патент; НПД is not among them, so the field has no
 *    correct value and an incorrect one would be worse than none.
 *  - the receipt line carries `tax: "none"`. Под ст. 2 ч. 9 422-ФЗ an ИП on
 *    НПД is not a VAT payer (import VAT aside), so «без НДС» is the only
 *    honest rate.
 *
 * Whether Robokassa wants a `Receipt` at all for Робочеки СМЗ is still an open
 * question with their support, so ROBOKASSA_SEND_RECEIPT decides it without a
 * deploy.
 */

export type HashAlgorithm = 'md5' | 'sha256' | 'sha384' | 'sha512';

const HASHES: HashAlgorithm[] = ['md5', 'sha256', 'sha384', 'sha512'];

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

function bool(name: string, fallback: boolean): boolean {
  const raw = env(name).toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Robokassa's own servers. Anything else posting to ResultURL is not them. */
export const ROBOKASSA_IPS = ['185.59.216.65', '185.59.217.65'];

export type RobokassaConfig = {
  merchantLogin: string;
  /** Signs the payment we start. */
  password1: string;
  /** Signs the notification Robokassa sends back. */
  password2: string;
  hash: HashAlgorithm;
  isTest: boolean;
  sendReceipt: boolean;
  /** Tax rate for every receipt line; 'none' for НПД. */
  tax: string;
  /** Where Robokassa's hosted payment page lives. */
  payUrl: string;
  /** Extra IPs allowed to call ResultURL, on top of ROBOKASSA_IPS. */
  extraAllowedIps: string[];
  /** false turns the whole integration off, and the routes answer 503. */
  enabled: boolean;
};

export function getRobokassaConfig(): RobokassaConfig {
  const isTest = bool('ROBOKASSA_IS_TEST', false);

  // The test passwords are a separate pair in the shop's technical settings.
  // Mixing them up is the most common reason a signature is rejected, so the
  // choice is made here once rather than at every call site.
  const password1 = isTest
    ? env('ROBOKASSA_TEST_PASSWORD_1') || env('ROBOKASSA_PASSWORD_1')
    : env('ROBOKASSA_PASSWORD_1');
  const password2 = isTest
    ? env('ROBOKASSA_TEST_PASSWORD_2') || env('ROBOKASSA_PASSWORD_2')
    : env('ROBOKASSA_PASSWORD_2');

  const rawHash = env('ROBOKASSA_HASH').toLowerCase() as HashAlgorithm;
  const hash: HashAlgorithm = HASHES.includes(rawHash) ? rawHash : 'md5';

  const merchantLogin = env('ROBOKASSA_MERCHANT_LOGIN');

  return {
    merchantLogin,
    password1,
    password2,
    hash,
    isTest,
    sendReceipt: bool('ROBOKASSA_SEND_RECEIPT', true),
    tax: env('ROBOKASSA_TAX') || 'none',
    payUrl: env('ROBOKASSA_PAY_URL') || 'https://auth.robokassa.ru/Merchant/Index.aspx',
    extraAllowedIps: env('ROBOKASSA_EXTRA_IPS').split(',').map((s) => s.trim()).filter(Boolean),
    enabled: Boolean(merchantLogin && password1 && password2),
  };
}
