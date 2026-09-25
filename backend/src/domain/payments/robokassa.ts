/**
 * Robokassa: signatures, the payment link, and the receipt.
 *
 * Three different signature formulas are in play and mixing them up is the
 * usual reason an integration silently fails, so each one is named after the
 * moment it belongs to:
 *
 *   starting a payment   MerchantLogin:OutSum:InvId[:Receipt]:Пароль#1[:Shp_*]
 *   ResultURL callback   OutSum:InvId:Пароль#2[:Shp_*]
 *   SuccessURL return    OutSum:InvId:Пароль#1[:Shp_*]
 *
 * We send no Shp_* parameters at all: InvId already identifies the payment row,
 * and every extra field is one more thing that has to be ordered identically on
 * both sides.
 */

import crypto from 'crypto';
import type { HashAlgorithm, RobokassaConfig } from '../../config/robokassa';

export type ReceiptItem = {
  name: string;
  quantity: number;
  sum: number;
  tax: string;
};

function digest(value: string, hash: HashAlgorithm): string {
  return crypto.createHash(hash).update(value, 'utf8').digest('hex');
}

/**
 * Robokassa compares hex case-insensitively, but we normalise both sides
 * ourselves rather than trusting that.
 */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase(), 'utf8');
  const right = Buffer.from(b.trim().toLowerCase(), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Robokassa wants a plain decimal with two places: 1500 → "1500.00". */
export function formatSum(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * The receipt for Робочеки СМЗ.
 *
 * No `sno`: НПД is not one of the tax systems Robokassa accepts there, and a
 * wrong one is worse than none. No `payment_method` / `payment_object` either —
 * both fall back to the shop's own defaults, which is what support tells ИП on
 * НПД to rely on. Names are capped at 128 characters by Robokassa's own rule.
 */
export function buildReceipt(items: ReceiptItem[]): string {
  const safe = items.map((item) => ({
    name: item.name.slice(0, 128),
    quantity: item.quantity,
    sum: Math.round(item.sum * 100) / 100,
    tax: item.tax,
  }));
  return JSON.stringify({ items: safe });
}

export type PaymentLinkInput = {
  invId: number;
  amount: number;
  description: string;
  receiptItems?: ReceiptItem[];
  email?: string | undefined;
};

/**
 * The link the guest opens.
 *
 * Receipt is url-encoded once for the signature, and URLSearchParams encodes it
 * a second time on the way into the query string. That double encoding is not a
 * bug: Robokassa decodes the transport layer once and must then find exactly
 * the string that was signed.
 */
export function buildPaymentLink(cfg: RobokassaConfig, input: PaymentLinkInput): string {
  const outSum = formatSum(input.amount);
  const invId = String(input.invId);

  const receipt = cfg.sendReceipt && input.receiptItems && input.receiptItems.length > 0
    ? encodeURIComponent(buildReceipt(input.receiptItems))
    : '';

  const parts = [cfg.merchantLogin, outSum, invId];
  if (receipt) parts.push(receipt);
  parts.push(cfg.password1);
  const signature = digest(parts.join(':'), cfg.hash);

  const params = new URLSearchParams();
  params.set('MerchantLogin', cfg.merchantLogin);
  params.set('OutSum', outSum);
  params.set('InvId', invId);
  params.set('Description', input.description.slice(0, 100));
  params.set('SignatureValue', signature);
  params.set('Culture', 'ru');
  params.set('Encoding', 'utf-8');
  if (receipt) params.set('Receipt', receipt);
  if (input.email) params.set('Email', input.email);
  if (cfg.isTest) params.set('IsTest', '1');

  return `${cfg.payUrl}?${params.toString()}`;
}

/** Shared by both callbacks: the amount and number Robokassa reports back. */
export type CallbackParams = {
  OutSum?: string;
  InvId?: string;
  SignatureValue?: string;
  [key: string]: string | undefined;
};

export type VerifiedCallback = {
  ok: boolean;
  invId: number;
  outSum: string;
  reason?: string;
};

function verify(
  cfg: RobokassaConfig,
  params: CallbackParams,
  password: string,
): VerifiedCallback {
  const outSum = String(params.OutSum ?? '').trim();
  const rawInvId = String(params.InvId ?? '').trim();
  const received = String(params.SignatureValue ?? '').trim();
  const invId = Number(rawInvId);

  if (!outSum || !rawInvId || !received) {
    return { ok: false, invId: 0, outSum, reason: 'missing_params' };
  }
  if (!Number.isSafeInteger(invId) || invId <= 0) {
    return { ok: false, invId: 0, outSum, reason: 'bad_inv_id' };
  }

  // The sum is echoed back with the shop's own precision — six decimals in
  // production, two in the test sandbox — so the string is signed as received.
  const expected = digest([outSum, rawInvId, password].join(':'), cfg.hash);
  if (!sameSignature(expected, received)) {
    return { ok: false, invId, outSum, reason: 'bad_signature' };
  }
  return { ok: true, invId, outSum };
}

/** ResultURL — the server-to-server notification. Signed with password #2. */
export function verifyResult(cfg: RobokassaConfig, params: CallbackParams): VerifiedCallback {
  return verify(cfg, params, cfg.password2);
}

/** SuccessURL — where the guest's browser lands. Signed with password #1. */
export function verifySuccess(cfg: RobokassaConfig, params: CallbackParams): VerifiedCallback {
  return verify(cfg, params, cfg.password1);
}

/** What Robokassa expects in the body of a successful ResultURL response. */
export function resultAck(invId: number): string {
  return `OK${invId}`;
}
