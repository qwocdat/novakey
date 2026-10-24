/**
 * ============================================================================
 * KEYNOVA · Pay2S & ACB ONE Bank Webhook & VietQR Auto-Payment Module (api/Bank.js)
 * ============================================================================
 * - Cổng Webhook chính thức: Pay2S (https://pay2s.vn / https://docs.pay2s.vn/partner/webhook.html)
 * - Ngân hàng liên kết: ACB ONE (Ngân hàng TMCP Á Châu - ACB)
 * - Mã BIN VietQR: 970416
 * - Số tài khoản: 28233851
 * - Chủ tài khoản: NGUYEN DAI QUOC DAT
 * - Firebase RTDB: https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app
 *
 * Quy chuẩn phản hồi Pay2S Webhook (Bắt buộc theo tài liệu Pay2S):
 * - Header nhận từ Pay2S:
 *     Content-Type: application/json
 *     Authorization: Bearer <webhook_token>
 * - Payload nhận từ Pay2S:
 *     {
 *       "transactions": [
 *         {
 *           "id": 32756283,
 *           "gateway": "ACB",
 *           "transactionDate": "2026-10-03 03:43:57",
 *           "transactionNumber": "24936",
 *           "vaNumber": "963869789",
 *           "accountNumber": "28233851",
 *           "content": "TEN_TAI_KHOAN ...",
 *           "transferType": "IN",
 *           "transferAmount": 90000,
 *           "checksum": "37eccdf35d7eaf58fb0ff608be0ebc3e"
 *         }
 *       ]
 *     }
 * - Phản hồi chuẩn cho Pay2S (HTTP 200 OK):
 *     {
 *       "success": true,
 *       "status": true,
 *       "ok": true,
 *       "error": 0,
 *       "message": "Giao dịch được xử lý và xác nhận thành công"
 *     }
 * ============================================================================
 */

const BANK_CONFIG = {
  provider: 'Pay2S',
  bankCode: 'ACB',
  bankBin: '970416',
  bankName: 'ACB ONE',
  bankFullName: 'ACB ONE - Ngân hàng TMCP Á Châu (ACB)',
  accountNumber: '28233851',
  accountOwner: 'NGUYEN DAI QUOC DAT',
  firebaseDatabaseUrl: 'https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app',
  defaultWebhookToken: ''
};

/**
 * Chuẩn hoá tên tài khoản để so khớp chính xác trong nội dung chuyển khoản
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
 * Kiểm tra Bearer Token từ Header Authorization của Pay2S Webhook
 */
function verifyPay2sWebhookToken(headers = {}, expectedToken = '') {
  const cleanExpected = String(expectedToken || '').trim().replace(/^Bearer\s+/i, '');
  if (!cleanExpected) return { valid: true, token: '' };

  const getHeader = name => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
  };

  const rawAuth = String(
    getHeader('authorization') ||
    getHeader('Authorization') ||
    getHeader('pay2s-token') ||
    getHeader('x-pay2s-token') ||
    getHeader('x-webhook-token') ||
    getHeader('x-api-key') ||
    ''
  ).trim();

  const token = rawAuth.replace(/^Bearer\s+/i, '').replace(/^Apikey\s+/i, '').trim();
  return {
    valid: token === cleanExpected,
    token
  };
}

/**
 * Phân tích dữ liệu Webhook chuẩn Pay2S (`transactions` array, IPN Collection Link, BankHub)
 */
function parseWebhookTransactions(payload) {
  if (!payload || typeof payload !== 'object') return [];

  let rawList = [];
  if (Array.isArray(payload.transactions)) {
    rawList = payload.transactions;
  } else if (payload.payload && Array.isArray(payload.payload.transactions)) {
    rawList = payload.payload.transactions;
  } else if (payload.data && Array.isArray(payload.data.transactions)) {
    rawList = payload.data.transactions;
  } else if (Array.isArray(payload.data)) {
    rawList = payload.data;
  } else if (Array.isArray(payload)) {
    rawList = payload;
  } else {
    rawList = [payload];
  }

  const normalized = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    const transferType = String(
      item.transferType ??
      item.type ??
      item.direction ??
      'IN'
    ).trim().toLowerCase();

    if (['out', 'debit', 'expense'].includes(transferType)) continue;

    if (item.resultCode !== undefined && Number(item.resultCode) !== 0 && item.transferAmount === undefined) {
      continue;
    }

    const amount = Number(
      item.transferAmount ??
      item.amount ??
      item.money ??
      item.value ??
      item.creditAmount ??
      item.totalAmount ??
      0
    );
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const primaryContent = String(
      item.content ??
      item.description ??
      item.orderInfo ??
      item.addInfo ??
      item.remark ??
      item.transactionContent ??
      item.memo ??
      ''
    ).trim();

    const paymentCode = String(item.paymentCode ?? item.orderId ?? item.requestId ?? '').trim();
    const description = [primaryContent, paymentCode].filter(Boolean).join(' ').trim();

    const rawTxId = String(
      item.id ??
      item.transactionNumber ??
      item.transId ??
      item.referenceCode ??
      item.tid ??
      item.transactionId ??
      item.txId ??
      item.checksum ??
      item.code ??
      `${Date.now()}_${Math.round(amount)}`
    ).trim();

    const txId = rawTxId.replace(/[.#$/[\]\s]/g, '_');

    const accountNumber = String(
      item.accountNumber ??
      item.vaNumber ??
      item.subAccount ??
      item.receiverAccount ??
      BANK_CONFIG.accountNumber
    ).trim();

    const gateway = String(item.gateway || item.bankCode || item.shortBankName || BANK_CONFIG.bankCode).trim();
    const transactionNumber = String(item.transactionNumber || item.referenceCode || rawTxId).trim();
    const checksum = String(item.checksum || item.signature || '').trim();
    const remitterName = String(item.extraData?.remitterName || item.remitterName || item.corresponsiveName || '').trim();
    const remitterAccountNumber = String(item.extraData?.remitterAccountNumber || item.remitterAccountNumber || item.corresponsiveAccount || '').trim();

    let parsedTime = Date.now();
    if (item.transactionDate) {
      const t = Date.parse(String(item.transactionDate).replace(' ', 'T'));
      if (!Number.isNaN(t)) parsedTime = t;
    } else if (item.when || item.createdAt) {
      const t = Number(item.when || item.createdAt);
      if (Number.isFinite(t) && t > 0) parsedTime = t;
    }

    normalized.push({
      txId,
      rawTxId,
      transactionNumber,
      gateway,
      amount: Math.round(amount),
      description,
      primaryContent: primaryContent || description,
      paymentCode,
      accountNumber,
      vaNumber: String(item.vaNumber || '').trim(),
      checksum,
      remitterName,
      remitterAccountNumber,
      transferType: transferType.toUpperCase(),
      bankName: BANK_CONFIG.bankName,
      accountOwner: BANK_CONFIG.accountOwner,
      timestamp: parsedTime
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
 * Tạo phản hồi JSON chuẩn Pay2S Webhook (`{ "success": true, ... }`)
 */
function buildPay2sAckResponse(extra = {}, isSuccess = true) {
  return {
    success: Boolean(isSuccess),
    status: Boolean(isSuccess),
    ok: Boolean(isSuccess),
    error: isSuccess ? 0 : 1,
    errorCode: isSuccess ? 0 : 1,
    message: extra.message || (isSuccess
      ? 'Giao dịch được xử lý và xác nhận thành công'
      : 'Thông tin không hợp lệ, không tìm thấy giao dịch'),
    provider: 'Pay2S',
    ...extra
  };
}

/**
 * Xử lý cộng tiền tự động & tự động giao key đơn hàng chờ qua Firebase SDK
 */
async function processBankWebhookWithFirebaseSdk({ db, firebaseFns, payload }) {
  const { ref, get, set, update, push, runTransaction } = firebaseFns;
  const txList = parseWebhookTransactions(payload);
  if (!txList.length) {
    return buildPay2sAckResponse({
      processed: 0,
      message: 'Không có giao dịch tiền vào cần xử lý (Pay2S Webhook Ready).'
    }, true);
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
      tx.accountNumber !== BANK_CONFIG.accountNumber &&
      !tx.vaNumber
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
        transactionNumber: tx.transactionNumber || tx.rawTxId,
        gateway: tx.gateway || BANK_CONFIG.bankCode,
        uid,
        matchedAccountName,
        amount: tx.amount,
        description: tx.description,
        checksum: tx.checksum || '',
        bankName: BANK_CONFIG.bankName,
        accountNumber: BANK_CONFIG.accountNumber,
        accountOwner: BANK_CONFIG.accountOwner,
        provider: 'Pay2S',
        processedAt: Date.now()
      };
    });

    if (!lockTx.committed) {
      results.push({ txId: tx.txId, status: 'duplicate_ignored', uid });
      continue;
    }

    const userOrders = allOrders[uid] || {};
    let fulfilledOrderId = null;
    let deliveredKey = null;
    for (const [ordId, ord] of Object.entries(userOrders)) {
      if (ord && ord.status === 'pending' && ord.payMethod === 'transfer' && Number(ord.price) > 0 && tx.amount >= Number(ord.price)) {
        fulfilledOrderId = ordId;
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
          webhookProvider: 'Pay2S',
          deliveredAt: deliveredKey ? Date.now() : null,
          updatedAt: Date.now()
        });

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
        webhookProvider: 'Pay2S',
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
        method: `Pay2S · ${BANK_CONFIG.bankName} (${BANK_CONFIG.accountNumber})`,
        txCode: tx.description || tx.rawTxId,
        webhookTxId: tx.txId,
        webhookProvider: 'Pay2S',
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
        ? `Pay2S · Thanh toán QR ${BANK_CONFIG.bankName} đơn #${fulfilledOrderId} (+${tx.amount.toLocaleString('vi-VN')}đ)`
        : `Pay2S · Nạp tự động ${BANK_CONFIG.bankName} (+${tx.amount.toLocaleString('vi-VN')}đ)`,
      amount: tx.amount,
      balanceAfter: newBalance,
      detail: fulfilledOrderId
        ? `Đã xác nhận đơn #${fulfilledOrderId}${deliveredKey ? ' · Key: ' + deliveredKey : ''} · Nội dung: ${tx.description}`
        : `Cổng: Pay2S (${tx.gateway}) · TK nhận: ${BANK_CONFIG.accountNumber} · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
      status: 'completed',
      userEmail: user.email || '',
      webhookTxId: tx.txId,
      webhookProvider: 'Pay2S',
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

  return buildPay2sAckResponse({
    processed: results.filter(r => r.status === 'credited').length,
    results,
    message: 'Giao dịch được xử lý và xác nhận thành công'
  }, true);
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
        console.warn('Pay2S Bank webhook queue item error:', err);
      }
    }
  });
}

/**
 * Xử lý Webhook Pay2S qua Firebase REST API (Dành cho Vercel Serverless / Node.js / Cloudflare Workers)
 */
async function handleServerlessBankWebhook(payload, options = {}) {
  const dbUrl = (options.databaseURL || BANK_CONFIG.firebaseDatabaseUrl).replace(/\/$/, '');
  const authQuery = options.databaseSecret ? `?auth=${encodeURIComponent(options.databaseSecret)}` : '';

  if (options.headers && options.webhookToken) {
    const authCheck = verifyPay2sWebhookToken(options.headers, options.webhookToken);
    if (!authCheck.valid) {
      return {
        statusCode: 401,
        body: buildPay2sAckResponse({
          message: 'Unauthorized: Token Webhook Pay2S không khớp.'
        }, false)
      };
    }
  }

  const txList = parseWebhookTransactions(payload);

  if (!txList.length) {
    return {
      statusCode: 200,
      body: buildPay2sAckResponse({
        processed: 0,
        bank: BANK_CONFIG,
        message: 'Giao dịch được xử lý và xác nhận thành công'
      }, true)
    };
  }

  let queueNodeKey = '';
  try {
    const qRes = await fetch(`${dbUrl}/bankWebhooksQueue.json${authQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'Pay2S',
        payload,
        processed: false,
        receivedAt: Date.now()
      })
    });
    if (qRes.ok) {
      const qData = await qRes.json();
      queueNodeKey = qData?.name || '';
    }
  } catch {}

  const summary = [];
  let serverProcessedCount = 0;

  try {
    const [usersRes, ordersRes, depositsRes] = await Promise.all([
      fetch(`${dbUrl}/users.json${authQuery}`).catch(() => null),
      fetch(`${dbUrl}/orders.json${authQuery}`).catch(() => null),
      fetch(`${dbUrl}/deposits.json${authQuery}`).catch(() => null)
    ]);

    const usersMap = (usersRes && usersRes.ok ? await usersRes.json() : null) || {};
    const allOrders = (ordersRes && ordersRes.ok ? await ordersRes.json() : null) || {};
    const allDeposits = (depositsRes && depositsRes.ok ? await depositsRes.json() : null) || {};

    for (const tx of txList) {
      if (
        tx.accountNumber &&
        !tx.accountNumber.includes(BANK_CONFIG.accountNumber) &&
        tx.accountNumber !== BANK_CONFIG.accountNumber &&
        !tx.vaNumber
      ) {
        summary.push({ txId: tx.txId, status: 'skipped_wrong_account', accountNumber: tx.accountNumber });
        continue;
      }

      const checkRes = await fetch(`${dbUrl}/processedBankTx/${encodeURIComponent(tx.txId)}.json${authQuery}`);
      const existing = checkRes.ok ? await checkRes.json() : null;
      if (existing) {
        summary.push({ txId: tx.txId, status: 'duplicate_ignored' });
        continue;
      }

      const matched = matchUserByTransferContent(tx.description, usersMap);
      if (!matched) {
        summary.push({ txId: tx.txId, status: 'unmatched_account_name', description: tx.description, amount: tx.amount });
        continue;
      }

      const { uid, user, matchedAccountName } = matched;

      const lockPut = await fetch(`${dbUrl}/processedBankTx/${encodeURIComponent(tx.txId)}.json${authQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txId: tx.txId,
          transactionNumber: tx.transactionNumber || tx.rawTxId,
          gateway: tx.gateway || BANK_CONFIG.bankCode,
          uid,
          matchedAccountName,
          amount: tx.amount,
          description: tx.description,
          checksum: tx.checksum || '',
          bankName: BANK_CONFIG.bankName,
          accountNumber: BANK_CONFIG.accountNumber,
          accountOwner: BANK_CONFIG.accountOwner,
          provider: 'Pay2S',
          processedAt: Date.now()
        })
      });

      if (!lockPut.ok) {
        summary.push({ txId: tx.txId, status: 'queued_for_sdk', uid, matchedAccountName, amount: tx.amount });
        continue;
      }

      const userOrders = allOrders[uid] || {};
      let fulfilledOrderId = null;
      let deliveredKey = null;

      for (const [ordId, ord] of Object.entries(userOrders)) {
        if (ord && ord.status === 'pending' && ord.payMethod === 'transfer' && Number(ord.price) > 0 && tx.amount >= Number(ord.price)) {
          fulfilledOrderId = ordId;
          try {
            const vRes = await fetch(`${dbUrl}/keyVault/${encodeURIComponent(ord.productId)}/${encodeURIComponent(ord.planId)}.json${authQuery}`);
            const vObj = (vRes.ok ? await vRes.json() : null) || {};
            for (const [kId, kData] of Object.entries(vObj)) {
              if (kData && (kData.status || 'available') === 'available' && kData.value) {
                deliveredKey = kData.value;
                await fetch(`${dbUrl}/keyVault/${encodeURIComponent(ord.productId)}/${encodeURIComponent(ord.planId)}/${encodeURIComponent(kId)}.json${authQuery}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: 'assigned',
                    assignedOrderId: ordId,
                    assignedUid: uid,
                    assignedAt: Date.now()
                  })
                });
                break;
              }
            }
          } catch {}

          await fetch(`${dbUrl}/orders/${encodeURIComponent(uid)}/${encodeURIComponent(ordId)}.json${authQuery}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: deliveredKey ? 'delivered' : 'paid',
              key: deliveredKey || ord.key || null,
              webhookTxId: tx.txId,
              webhookProvider: 'Pay2S',
              deliveredAt: deliveredKey ? Date.now() : null,
              updatedAt: Date.now()
            })
          });
          break;
        }
      }

      const currentBal = Number(user.balance) || 0;
      const orderPrice = fulfilledOrderId ? (Number(userOrders[fulfilledOrderId]?.price) || 0) : 0;
      const creditDelta = fulfilledOrderId ? Math.max(0, tx.amount - orderPrice) : tx.amount;
      const nextBal = currentBal + creditDelta;

      if (creditDelta > 0) {
        await fetch(`${dbUrl}/users/${encodeURIComponent(uid)}/balance.json${authQuery}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextBal)
        });
        user.balance = nextBal;
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
        await fetch(`${dbUrl}/deposits/${encodeURIComponent(uid)}/${encodeURIComponent(matchedDepositId)}.json${authQuery}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'approved',
            webhookTxId: tx.txId,
            webhookProvider: 'Pay2S',
            processedAt: Date.now()
          })
        });
      } else {
        await fetch(`${dbUrl}/deposits/${encodeURIComponent(uid)}.json${authQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            userName: user.displayName || matchedAccountName,
            accountName: matchedAccountName,
            userEmail: user.email || '',
            amount: tx.amount,
            method: `Pay2S · ${BANK_CONFIG.bankName} (${BANK_CONFIG.accountNumber})`,
            txCode: tx.description || tx.rawTxId,
            webhookTxId: tx.txId,
            webhookProvider: 'Pay2S',
            fulfilledOrderId: fulfilledOrderId || '',
            status: 'approved',
            createdAt: Date.now(),
            processedAt: Date.now()
          })
        });
      }

      await fetch(`${dbUrl}/transactions/${encodeURIComponent(uid)}.json${authQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'webhook_deposit',
          title: fulfilledOrderId
            ? `Pay2S · Thanh toán QR ${BANK_CONFIG.bankName} đơn #${fulfilledOrderId} (+${tx.amount.toLocaleString('vi-VN')}đ)`
            : `Pay2S · Nạp tự động ${BANK_CONFIG.bankName} (+${tx.amount.toLocaleString('vi-VN')}đ)`,
          amount: tx.amount,
          balanceAfter: nextBal,
          detail: fulfilledOrderId
            ? `Đã xác nhận đơn #${fulfilledOrderId}${deliveredKey ? ' · Key: ' + deliveredKey : ''} · Nội dung: ${tx.description}`
            : `Cổng: Pay2S (${tx.gateway}) · TK nhận: ${BANK_CONFIG.accountNumber} · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
          status: 'completed',
          userEmail: user.email || '',
          webhookTxId: tx.txId,
          webhookProvider: 'Pay2S',
          createdAt: Date.now()
        })
      });

      serverProcessedCount++;
      summary.push({
        txId: tx.txId,
        status: 'credited',
        uid,
        matchedAccountName,
        amount: tx.amount,
        fulfilledOrderId,
        deliveredKey,
        nextBal
      });
    }

    if (queueNodeKey && serverProcessedCount > 0) {
      await fetch(`${dbUrl}/bankWebhooksQueue/${encodeURIComponent(queueNodeKey)}.json${authQuery}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processed: true,
          processedAt: Date.now(),
          summary
        })
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('Pay2S Bank REST processing notice:', err);
  }

  return {
    statusCode: 200,
    body: buildPay2sAckResponse({
      processed: serverProcessedCount,
      bank: BANK_CONFIG,
      summary,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true)
  };
}

/**
 * Handler chuẩn cho Vercel Serverless Functions (`/api/Bank` hoặc `/api/bank`), Express và Node.js HTTP
 */
async function pay2sBankWebhookHandler(req, res) {
  if (req && typeof req.json === 'function' && (!res || typeof res.setHeader !== 'function')) {
    return KEYNOVA_BANK_MODULE.fetch(req, res || {});
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, pay2s-token, x-pay2s-token, x-webhook-token, x-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const sendJson = (statusCode, data) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(data));
  };

  const envDbUrl = (typeof process !== 'undefined' && process.env?.FIREBASE_DATABASE_URL) || BANK_CONFIG.firebaseDatabaseUrl;
  const envDbSecret = (typeof process !== 'undefined' && process.env?.FIREBASE_DB_SECRET) || '';
  const envWebhookToken = (typeof process !== 'undefined' && process.env?.PAY2S_WEBHOOK_TOKEN) || BANK_CONFIG.defaultWebhookToken;

  if (req.method === 'GET') {
    return sendJson(200, buildPay2sAckResponse({
      service: 'KEYNOVA Pay2S Bank Webhook (api/Bank.js)',
      bank: BANK_CONFIG.bankName,
      accountNumber: BANK_CONFIG.accountNumber,
      accountOwner: BANK_CONFIG.accountOwner,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true));
  }

  try {
    let payload = req.body;
    if (!payload || typeof payload === 'string') {
      const rawStr = typeof payload === 'string'
        ? payload
        : await new Promise((resolve, reject) => {
            let acc = '';
            req.on('data', chunk => { acc += chunk; });
            req.on('end', () => resolve(acc));
            req.on('error', reject);
          });
      if (rawStr && rawStr.trim()) {
        try {
          payload = JSON.parse(rawStr);
        } catch {
          const params = {};
          new URLSearchParams(rawStr).forEach((v, k) => { params[k] = v; });
          if (Object.keys(params).length) {
            payload = params;
          } else {
            return sendJson(400, buildPay2sAckResponse({ message: 'JSON không hợp lệ' }, false));
          }
        }
      } else {
        payload = {};
      }
    }

    const out = await handleServerlessBankWebhook(payload, {
      databaseURL: envDbUrl,
      databaseSecret: envDbSecret,
      headers: req.headers || {},
      webhookToken: envWebhookToken
    });

    return sendJson(out.statusCode || 200, out.body);
  } catch (err) {
    return sendJson(400, buildPay2sAckResponse({
      message: 'Lỗi xử lý webhook Pay2S: ' + (err?.message || 'Invalid Request')
    }, false));
  }
}

const KEYNOVA_BANK_MODULE = {
  BANK_CONFIG,
  normalizeAccountKey,
  normalizeAlphaNum,
  getAccountTransferContent,
  buildAcbVietQrUrl,
  verifyPay2sWebhookToken,
  parseWebhookTransactions,
  matchUserByTransferContent,
  buildPay2sAckResponse,
  processBankWebhookWithFirebaseSdk,
  startBankWebhookListener,
  handleServerlessBankWebhook,
  pay2sBankWebhookHandler,
  async fetch(request, env = {}) {
    const corsHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, pay2s-token, x-pay2s-token, x-webhook-token, x-api-key'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify(buildPay2sAckResponse({
          service: 'KEYNOVA Pay2S Bank Webhook (api/Bank.js)',
          bank: BANK_CONFIG.bankName,
          accountNumber: BANK_CONFIG.accountNumber,
          accountOwner: BANK_CONFIG.accountOwner,
          message: 'Giao dịch được xử lý và xác nhận thành công'
        }, true)),
        { status: 200, headers: corsHeaders }
      );
    }

    try {
      const rawText = await request.text();
      let payload = {};
      if (rawText && rawText.trim()) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          return new Response(
            JSON.stringify(buildPay2sAckResponse({ message: 'JSON không hợp lệ' }, false)),
            { status: 400, headers: corsHeaders }
          );
        }
      }
      const result = await handleServerlessBankWebhook(payload, {
        databaseURL: env.FIREBASE_DATABASE_URL || BANK_CONFIG.firebaseDatabaseUrl,
        databaseSecret: env.FIREBASE_DB_SECRET || '',
        headers: request.headers,
        webhookToken: env.PAY2S_WEBHOOK_TOKEN || BANK_CONFIG.defaultWebhookToken
      });
      return new Response(JSON.stringify(result.body), {
        status: result.statusCode || 200,
        headers: corsHeaders
      });
    } catch (err) {
      return new Response(
        JSON.stringify(buildPay2sAckResponse({ message: err.message || 'JSON không hợp lệ' }, false)),
        { status: 400, headers: corsHeaders }
      );
    }
  }
};

Object.assign(pay2sBankWebhookHandler, KEYNOVA_BANK_MODULE);
pay2sBankWebhookHandler.default = pay2sBankWebhookHandler;

if (typeof globalThis !== 'undefined') {
  globalThis.KEYNOVA_BANK = pay2sBankWebhookHandler;
  Object.assign(globalThis, KEYNOVA_BANK_MODULE);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = pay2sBankWebhookHandler;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const http = require('http');
  const PORT = Number(process.env.BANK_WEBHOOK_PORT || process.env.PORT || 3001);
  const server = http.createServer((req, res) => pay2sBankWebhookHandler(req, res));
  server.listen(PORT, () => {
    console.log(`[KEYNOVA api/Bank.js] Pay2S & ACB ONE Webhook Server (${BANK_CONFIG.accountNumber} - ${BANK_CONFIG.accountOwner}) đang chạy tại http://0.0.0.0:${PORT}`);
  });
}
