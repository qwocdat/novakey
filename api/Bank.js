/**
 * ============================================================================
 * KEYNOVA · ACB ONE Bank Webhook & VietQR Auto-Payment Module (bank.js)
 * ============================================================================
 * - Ngân hàng: ACB ONE (Ngân hàng TMCP Á Châu - ACB)
 * - Mã BIN VietQR: 970416
 * - Số tài khoản: 28233851
 * - Chủ tài khoản: NGUYEN DAI QUOC DAT
 * - Firebase RTDB: https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app
 *
 * Tính năng:
 * 1. Tự động tạo mã QR VietQR ACB ONE theo đúng giá từng sản phẩm & gói thời hạn.
 * 2. Tự động lấy tên tài khoản đã tạo của khách làm nội dung chuyển khoản.
 * 3. Đối soát giao dịch ngân hàng (SePay, Casso, Web2M, ACB ONE) theo tên tài khoản:
 *    - Cộng số dư vào `users/{uid}/balance`.
 *    - Tự động duyệt lệnh nạp đang chờ trong `deposits/{uid}`.
 *    - Tự động thanh toán & xuất key từ `keyVault/{productId}/{planId}` cho đơn QR đang chờ trong `orders/{uid}`.
 * 4. Tương thích đa nền tảng: Browser ES Module, Window Global (`window.KEYNOVA_BANK`),
 *    Node.js / Express, Cloudflare Workers và Vercel Serverless Functions.
 * ============================================================================
 */

const BANK_CONFIG = {
  bankCode: 'ACB',
  bankBin: '970416',
  bankName: 'ACB ONE',
  bankFullName: 'ACB ONE - Ngân hàng TMCP Á Châu (ACB)',
  accountNumber: '28233851',
  accountOwner: 'NGUYEN DAI QUOC DAT',
  firebaseDatabaseUrl: 'https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app'
};

/**
 * Chuẩn hoá tên tài khoản để so khớp chính xác trong nội dung chuyển khoản
 * (Dùng Unicode escape \u0110\u0111 và \u0300-\u036f để không bao giờ lỗi font trên mọi hosting)
 */
function normalizeAccountKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Chuẩn hoá chuỗi chỉ giữ chữ cái in hoa A-Z và số 0-9 để đối soát nội dung ngân hàng
 */
function normalizeAlphaNum(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Lấy tên tài khoản đã tạo của người dùng làm nội dung chuyển khoản chuẩn
 */
function getAccountTransferContent(user, userProfile = {}) {
  if (!user || user.isAnonymous) return '';
  const candidates = [
    userProfile?.accountName,
    userProfile?.username,
    userProfile?.rawIdentifier,
    user?.displayName,
    user?.email ? String(user.email).split('@')[0] : ''
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const base = String(raw).includes('@') ? String(raw).split('@')[0] : String(raw);
    const cleaned = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u0110\u0111]/g, 'd')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleaned) return cleaned;
  }
  return String(user.uid || '').slice(0, 12);
}

/**
 * Tạo URL ảnh mã QR VietQR cho tài khoản ACB ONE 28233851 - NGUYEN DAI QUOC DAT
 */
function buildAcbVietQrUrl(amount = 50000, transferContent = '', customConfig = {}) {
  const bankCode = customConfig.bankCode || BANK_CONFIG.bankCode;
  const accountNumber = customConfig.accountNumber || BANK_CONFIG.accountNumber;
  const accountOwner = customConfig.accountOwner || BANK_CONFIG.accountOwner;
  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));
  const content = String(transferContent || '').trim();
  const params = new URLSearchParams();
  if (cleanAmount > 0) params.set('amount', String(cleanAmount));
  if (content) params.set('addInfo', content);
  params.set('accountName', accountOwner);
  return `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?${params.toString()}`;
}

/**
 * Phân tích dữ liệu Webhook từ SePay, Casso, Web2M, ACB ONE hoặc Custom JSON
 */
function parseWebhookTransactions(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const rawList = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.transactions)
    ? payload.transactions
    : [payload];

  const normalized = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    const transferType = String(item.transferType || item.type || item.direction || 'in').toLowerCase();
    if (['out', 'debit', 'expense'].includes(transferType)) continue;

    const amount = Number(
      item.transferAmount ??
      item.amount ??
      item.money ??
      item.value ??
      item.creditAmount ??
      0
    );
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const description = String(
      item.content ??
      item.description ??
      item.addInfo ??
      item.remark ??
      item.transactionContent ??
      item.memo ??
      ''
    ).trim();

    const rawTxId = String(
      item.id ??
      item.referenceCode ??
      item.tid ??
      item.transactionId ??
      item.txId ??
      item.code ??
      `${Date.now()}_${Math.round(amount)}`
    ).trim();

    const txId = rawTxId.replace(/[.#$/[\]\s]/g, '_');

    const accountNumber = String(
      item.accountNumber ??
      item.subAccount ??
      item.receiverAccount ??
      BANK_CONFIG.accountNumber
    ).trim();

    normalized.push({
      txId,
      rawTxId,
      amount: Math.round(amount),
      description,
      accountNumber,
      bankName: BANK_CONFIG.bankName,
      accountOwner: BANK_CONFIG.accountOwner,
      timestamp: Number(item.when || item.transactionDate || item.createdAt || Date.now()) || Date.now()
    });
  }
  return normalized;
}

/**
 * Tìm tài khoản người dùng khớp với nội dung chuyển khoản dựa trên tên tài khoản đã tạo
 */
function matchUserByTransferContent(description, usersMap = {}) {
  const rawDesc = String(description || '').trim();
  if (!rawDesc) return null;

  const descLower = rawDesc.toLowerCase();
  const descAlphaNum = normalizeAlphaNum(rawDesc);
  const tokens = rawDesc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .split(/[\s,.;:|\-/+]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  const candidates = [];
  for (const [uid, u] of Object.entries(usersMap || {})) {
    if (!u || typeof u !== 'object') continue;
    const rawUsername =
      u.accountName ||
      u.username ||
      (u.rawIdentifier ? String(u.rawIdentifier).split('@')[0] : '') ||
      (u.email ? String(u.email).split('@')[0] : '') ||
      u.displayName ||
      '';
    const cleanKey = normalizeAccountKey(rawUsername);
    const alphaKey = normalizeAlphaNum(rawUsername);
    if (!cleanKey && !alphaKey) continue;

    if (normalizeAccountKey(rawDesc) === cleanKey || (alphaKey.length >= 3 && descAlphaNum === alphaKey)) {
      return { uid, user: u, matchedAccountName: rawUsername, confidence: 100 };
    }

    if (cleanKey.length >= 3 && tokens.includes(cleanKey)) {
      candidates.push({ uid, user: u, matchedAccountName: rawUsername, confidence: 90, len: cleanKey.length });
      continue;
    }

    if (alphaKey.length >= 4 && descAlphaNum.includes(alphaKey)) {
      candidates.push({ uid, user: u, matchedAccountName: rawUsername, confidence: 75, len: alphaKey.length });
      continue;
    }

    const dispAlpha = normalizeAlphaNum(u.displayName || '');
    if (dispAlpha.length >= 4 && (descAlphaNum === dispAlpha || descLower.includes(String(u.displayName || '').toLowerCase()))) {
      candidates.push({ uid, user: u, matchedAccountName: u.displayName, confidence: 65, len: dispAlpha.length });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.confidence - a.confidence) || (b.len - a.len));
  return candidates[0];
}

/**
 * Xử lý cộng tiền tự động & tự động giao key đơn hàng chờ qua Firebase SDK
 */
async function processBankWebhookWithFirebaseSdk({ db, firebaseFns, payload }) {
  const { ref, get, set, update, push, runTransaction } = firebaseFns;
  const txList = parseWebhookTransactions(payload);
  if (!txList.length) {
    return { ok: false, processed: 0, message: 'Không có giao dịch hợp lệ trong payload.' };
  }

  const usersSnap = await get(ref(db, 'users'));
  const usersMap = usersSnap.val() || {};
  const depositsSnap = await get(ref(db, 'deposits'));
  const allDeposits = depositsSnap.val() || {};
  const ordersSnap = await get(ref(db, 'orders'));
  const allOrders = ordersSnap.val() || {};

  const results = [];

  for (const tx of txList) {
    if (
      tx.accountNumber &&
      !tx.accountNumber.includes(BANK_CONFIG.accountNumber) &&
      tx.accountNumber !== BANK_CONFIG.accountNumber
    ) {
      results.push({ txId: tx.txId, status: 'skipped_wrong_account', accountNumber: tx.accountNumber });
      continue;
    }

    const matched = matchUserByTransferContent(tx.description, usersMap);
    if (!matched) {
      results.push({
        txId: tx.txId,
        status: 'unmatched_account_name',
        description: tx.description,
        amount: tx.amount
      });
      continue;
    }

    const { uid, user, matchedAccountName } = matched;

    const lockRef = ref(db, `processedBankTx/${tx.txId}`);
    const lockTx = await runTransaction(lockRef, cur => {
      if (cur !== null) return;
      return {
        txId: tx.txId,
        uid,
        matchedAccountName,
        amount: tx.amount,
        description: tx.description,
        bankName: BANK_CONFIG.bankName,
        accountNumber: BANK_CONFIG.accountNumber,
        accountOwner: BANK_CONFIG.accountOwner,
        processedAt: Date.now()
      };
    });

    if (!lockTx.committed) {
      results.push({ txId: tx.txId, status: 'duplicate_ignored', uid });
      continue;
    }

    // Kiểm tra xem người dùng có đơn hàng QR nào đang chờ thanh toán (pending) khớp số tiền không
    const userOrders = allOrders[uid] || {};
    let fulfilledOrderId = null;
    let deliveredKey = null;
    for (const [ordId, ord] of Object.entries(userOrders)) {
      if (ord && ord.status === 'pending' && ord.payMethod === 'transfer' && Number(ord.price) > 0 && tx.amount >= Number(ord.price)) {
        fulfilledOrderId = ordId;
        // Thử xuất key tự động từ keyVault/{productId}/{planId}
        try {
          const vSnap = await get(ref(db, `keyVault/${ord.productId}/${ord.planId}`));
          const vObj = vSnap.val() || {};
          for (const [kId, kData] of Object.entries(vObj)) {
            if (kData && (kData.status || 'available') === 'available') {
              const stRef = ref(db, `keyVault/${ord.productId}/${ord.planId}/${kId}/status`);
              const kTx = await runTransaction(stRef, cur => cur === 'available' ? 'assigned' : undefined, { applyLocally: false });
              if (kTx.committed) {
                deliveredKey = kData.value;
                await update(ref(db, `keyVault/${ord.productId}/${ord.planId}/${kId}`), {
                  assignedOrderId: ordId,
                  assignedUid: uid,
                  assignedAt: Date.now()
                });
                break;
              }
            }
          }
        } catch {}

        await update(ref(db, `orders/${uid}/${ordId}`), {
          status: deliveredKey ? 'delivered' : 'paid',
          key: deliveredKey || ord.key || null,
          webhookTxId: tx.txId,
          deliveredAt: deliveredKey ? Date.now() : null,
          updatedAt: Date.now()
        });

        // Nếu số tiền chuyển dư so với giá đơn hàng thì cộng phần dư vào ví
        const remainder = Math.max(0, tx.amount - Number(ord.price));
        if (remainder > 0) {
          await runTransaction(ref(db, `users/${uid}/balance`), cur => (Number(cur) || 0) + remainder);
        }
        break;
      }
    }

    let newBalance = Number(user.balance) || 0;
    if (!fulfilledOrderId) {
      const balRef = ref(db, `users/${uid}/balance`);
      const balTx = await runTransaction(balRef, cur => (Number(cur) || 0) + tx.amount);
      newBalance = Number(balTx.snapshot.val()) || tx.amount;
    }

    const userDeps = allDeposits[uid] || {};
    let matchedDepositId = null;
    for (const [depId, dep] of Object.entries(userDeps)) {
      if (dep && dep.status === 'pending' && Number(dep.amount) === tx.amount) {
        matchedDepositId = depId;
        break;
      }
    }

    if (matchedDepositId) {
      await update(ref(db, `deposits/${uid}/${matchedDepositId}`), {
        status: 'approved',
        webhookTxId: tx.txId,
        processedAt: Date.now()
      });
    } else {
      const newDepRef = push(ref(db, `deposits/${uid}`));
      await set(newDepRef, {
        uid,
        userName: user.displayName || matchedAccountName,
        accountName: matchedAccountName,
        userEmail: user.email || '',
        amount: tx.amount,
        method: `${BANK_CONFIG.bankName} (${BANK_CONFIG.accountNumber})`,
        txCode: tx.description || tx.rawTxId,
        webhookTxId: tx.txId,
        fulfilledOrderId: fulfilledOrderId || '',
        status: 'approved',
        createdAt: Date.now(),
        processedAt: Date.now()
      });
    }

    const txHistoryRef = push(ref(db, `transactions/${uid}`));
    await set(txHistoryRef, {
      type: 'webhook_deposit',
      title: fulfilledOrderId
        ? `Thanh toán QR ACB ONE đơn #${fulfilledOrderId} (+${tx.amount.toLocaleString('vi-VN')}đ)`
        : `Nạp tự động ${BANK_CONFIG.bankName} (+${tx.amount.toLocaleString('vi-VN')}đ)`,
      amount: tx.amount,
      balanceAfter: newBalance,
      detail: fulfilledOrderId
        ? `Đã xác nhận đơn #${fulfilledOrderId}${deliveredKey ? ' · Key: ' + deliveredKey : ''} · Nội dung: ${tx.description}`
        : `TK nhận: ${BANK_CONFIG.accountNumber} (${BANK_CONFIG.accountOwner}) · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
      status: 'completed',
      userEmail: user.email || '',
      webhookTxId: tx.txId,
      createdAt: Date.now()
    });

    results.push({
      txId: tx.txId,
      status: 'credited',
      uid,
      matchedAccountName,
      amount: tx.amount,
      fulfilledOrderId,
      deliveredKey,
      newBalance
    });
  }

  return {
    ok: true,
    processed: results.filter(r => r.status === 'credited').length,
    results
  };
}

/**
 * Lắng nghe nhánh `bankWebhooksQueue` trên Firebase Realtime Database
 */
function startBankWebhookListener({ db, firebaseFns, onCredited }) {
  const { ref, onValue, update } = firebaseFns;
  const queueRef = ref(db, 'bankWebhooksQueue');
  return onValue(queueRef, async snap => {
    const queue = snap.val() || {};
    for (const [queueId, item] of Object.entries(queue)) {
      if (!item || item.processed) continue;
      try {
        const res = await processBankWebhookWithFirebaseSdk({
          db,
          firebaseFns,
          payload: item.payload || item
        });
        await update(ref(db, `bankWebhooksQueue/${queueId}`), {
          processed: true,
          processedAt: Date.now(),
          result: res
        });
        if (res.processed > 0 && typeof onCredited === 'function') {
          onCredited(res);
        }
      } catch (err) {
        console.warn('Bank webhook queue item error:', err);
      }
    }
  });
}

/**
 * Xử lý Webhook qua Firebase REST API (Dành cho Node.js / Cloudflare Workers / Vercel Serverless)
 */
async function handleServerlessBankWebhook(payload, options = {}) {
  const dbUrl = (options.databaseURL || BANK_CONFIG.firebaseDatabaseUrl).replace(/\/$/, '');
  const authQuery = options.databaseSecret ? `?auth=${encodeURIComponent(options.databaseSecret)}` : '';

  const txList = parseWebhookTransactions(payload);
  if (!txList.length) {
    return { statusCode: 200, body: { ok: false, message: 'No valid incoming transactions' } };
  }

  // Đẩy vào hàng đợi `bankWebhooksQueue` để Client/Admin cũng có thể đồng bộ
  try {
    await fetch(`${dbUrl}/bankWebhooksQueue.json${authQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        processed: false,
        receivedAt: Date.now()
      })
    });
  } catch {}

  const usersRes = await fetch(`${dbUrl}/users.json${authQuery}`);
  const usersMap = (await usersRes.json()) || {};

  const summary = [];
  for (const tx of txList) {
    const checkRes = await fetch(`${dbUrl}/processedBankTx/${encodeURIComponent(tx.txId)}.json${authQuery}`);
    const existing = await checkRes.json();
    if (existing) {
      summary.push({ txId: tx.txId, status: 'duplicate_ignored' });
      continue;
    }

    const matched = matchUserByTransferContent(tx.description, usersMap);
    if (!matched) {
      summary.push({ txId: tx.txId, status: 'unmatched_account_name', description: tx.description });
      continue;
    }

    const { uid, user, matchedAccountName } = matched;
    const currentBal = Number(user.balance) || 0;
    const nextBal = currentBal + tx.amount;

    await fetch(`${dbUrl}/processedBankTx/${encodeURIComponent(tx.txId)}.json${authQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txId: tx.txId,
        uid,
        matchedAccountName,
        amount: tx.amount,
        description: tx.description,
        bankName: BANK_CONFIG.bankName,
        accountNumber: BANK_CONFIG.accountNumber,
        accountOwner: BANK_CONFIG.accountOwner,
        processedAt: Date.now()
      })
    });

    await fetch(`${dbUrl}/users/${encodeURIComponent(uid)}/balance.json${authQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextBal)
    });

    await fetch(`${dbUrl}/transactions/${encodeURIComponent(uid)}.json${authQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook_deposit',
        title: `Nạp tự động ${BANK_CONFIG.bankName} (+${tx.amount.toLocaleString('vi-VN')}đ)`,
        amount: tx.amount,
        balanceAfter: nextBal,
        detail: `TK nhận: ${BANK_CONFIG.accountNumber} (${BANK_CONFIG.accountOwner}) · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
        status: 'completed',
        userEmail: user.email || '',
        webhookTxId: tx.txId,
        createdAt: Date.now()
      })
    });

    summary.push({ txId: tx.txId, status: 'credited', uid, matchedAccountName, amount: tx.amount, nextBal });
  }

  return { statusCode: 200, body: { ok: true, bank: BANK_CONFIG, summary } };
}

const KEYNOVA_BANK_MODULE = {
  BANK_CONFIG,
  normalizeAccountKey,
  normalizeAlphaNum,
  getAccountTransferContent,
  buildAcbVietQrUrl,
  parseWebhookTransactions,
  matchUserByTransferContent,
  processBankWebhookWithFirebaseSdk,
  startBankWebhookListener,
  handleServerlessBankWebhook,
  async fetch(request, env = {}) {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'KEYNOVA ACB ONE Webhook (bank.js)',
          bank: BANK_CONFIG.bankName,
          accountNumber: BANK_CONFIG.accountNumber,
          accountOwner: BANK_CONFIG.accountOwner
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    try {
      const payload = await request.json();
      const result = await handleServerlessBankWebhook(payload, {
        databaseURL: env.FIREBASE_DATABASE_URL || BANK_CONFIG.firebaseDatabaseUrl,
        databaseSecret: env.FIREBASE_DB_SECRET || ''
      });
      return new Response(JSON.stringify(result.body), {
        status: result.statusCode,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.KEYNOVA_BANK = KEYNOVA_BANK_MODULE;
  Object.assign(globalThis, KEYNOVA_BANK_MODULE);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KEYNOVA_BANK_MODULE;
  module.exports.default = KEYNOVA_BANK_MODULE;
}

// Nếu chạy trực tiếp bằng lệnh `node bank.js`, tự động mở cổng HTTP Webhook Server
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const http = require('http');
  const PORT = Number(process.env.BANK_WEBHOOK_PORT || process.env.PORT || 3001);
  const DB_URL = process.env.FIREBASE_DATABASE_URL || BANK_CONFIG.firebaseDatabaseUrl;
  const DB_SECRET = process.env.FIREBASE_DB_SECRET || '';

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        service: 'KEYNOVA ACB ONE Webhook Server (bank.js)',
        bank: BANK_CONFIG.bankName,
        accountNumber: BANK_CONFIG.accountNumber,
        accountOwner: BANK_CONFIG.accountOwner,
        firebaseDatabaseUrl: DB_URL
      }));
    }
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const out = await handleServerlessBankWebhook(payload, {
          databaseURL: DB_URL,
          databaseSecret: DB_SECRET
        });
        res.writeHead(out.statusCode || 200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out.body));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`[KEYNOVA bank.js] ACB ONE Webhook Server (${BANK_CONFIG.accountNumber} - ${BANK_CONFIG.accountOwner}) đang chạy tại http://0.0.0.0:${PORT}`);
  });
}
