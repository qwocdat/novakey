/**
 * KEYNOVA · ACB ONE Bank Webhook & Firebase Auto-Topup Module (bank.js)
 * ---------------------------------------------------------------------
 * Ngân hàng: ACB ONE (Ngân hàng Á Châu - ACB)
 * Số tài khoản: 28233851
 * Chủ tài khoản: NGUYEN DAI QUOC DAT
 *
 * Hỗ trợ:
 * 1. Tích hợp trực tiếp trên trình duyệt (ES Module cho index.html & admin.html):
 *    - Tự động tạo mã VietQR ACB ONE theo số tiền và tên tài khoản đã tạo.
 *    - Lắng nghe nhánh `bankWebhooksQueue` trên Firebase Realtime Database để tự động
 *      đối soát nội dung chuyển khoản theo đúng tên tài khoản đã tạo và cộng tiền 24/7.
 * 2. Chạy độc lập như Webhook Server (Node.js / Express / Vercel / Cloudflare Workers):
 *    - Nhận POST Webhook từ SePay, Casso, Web2M hoặc thông báo biến động số dư ACB ONE.
 *    - Khớp tên tài khoản người dùng từ nội dung chuyển khoản, chống trùng lặp mã GD
 *      qua `processedBankTx/{txId}` và cộng số dư trực tiếp vào `users/{uid}/balance`.
 */

export const BANK_CONFIG = {
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
 * (Không phân biệt hoa thường, bỏ dấu tiếng Việt và ký tự đặc biệt thừa)
 */
export function normalizeAccountKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * Chuẩn hoá chuỗi chỉ giữ chữ và số viết hoa để đối soát nội dung chuyển khoản ngân hàng
 * (Ngân hàng thường loại bỏ dấu cách hoặc ký tự đặc biệt trong nội dung giao dịch)
 */
export function normalizeAlphaNum(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Lấy đúng tên tài khoản đã tạo của người dùng để làm nội dung chuyển khoản
 */
export function getAccountTransferContent(user, userProfile = {}) {
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
      .replace(/đ/gi, 'd')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleaned) return cleaned;
  }
  return String(user.uid || '').slice(0, 12);
}

/**
 * Tạo link mã QR chuẩn VietQR cho tài khoản ACB ONE 28233851 - NGUYEN DAI QUOC DAT
 */
export function buildAcbVietQrUrl(amount = 50000, transferContent = '') {
  const cleanAmount = Math.max(0, Math.round(Number(amount) || 0));
  const content = String(transferContent || '').trim();
  const params = new URLSearchParams();
  if (cleanAmount > 0) params.set('amount', String(cleanAmount));
  if (content) params.set('addInfo', content);
  params.set('accountName', BANK_CONFIG.accountOwner);
  return `https://img.vietqr.io/image/${BANK_CONFIG.bankCode}-${BANK_CONFIG.accountNumber}-compact2.png?${params.toString()}`;
}

/**
 * Phân tích dữ liệu Webhook từ nhiều cổng (SePay, Casso, Web2M, ACB ONE hoặc Custom JSON)
 */
export function parseWebhookTransactions(payload) {
  if (!payload || typeof payload !== 'object') return [];

  // Trường hợp Casso / Web2M gửi mảng `data` hoặc `transactions`
  const rawList = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.transactions)
    ? payload.transactions
    : [payload];

  const normalized = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    // Chỉ nhận giao dịch tiền vào (IN / credit)
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
export function matchUserByTransferContent(description, usersMap = {}) {
  const rawDesc = String(description || '').trim();
  if (!rawDesc) return null;

  const descLower = rawDesc.toLowerCase();
  const descAlphaNum = normalizeAlphaNum(rawDesc);
  const tokens = rawDesc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .split(/[\s,.;:|\-/+]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  const candidates = [];
  for (const [uid, u] of Object.entries(usersMap || {})) {
    if (!u || typeof u !== 'object') continue;
    const rawUsername = u.accountName || u.username || (u.rawIdentifier ? String(u.rawIdentifier).split('@')[0] : '') || (u.email ? String(u.email).split('@')[0] : '') || u.displayName || '';
    const cleanKey = normalizeAccountKey(rawUsername);
    const alphaKey = normalizeAlphaNum(rawUsername);
    if (!cleanKey && !alphaKey) continue;

    // Ưu tiên 1: Khớp chính xác toàn bộ nội dung chuyển khoản = tên tài khoản
    if (normalizeAccountKey(rawDesc) === cleanKey || (alphaKey.length >= 3 && descAlphaNum === alphaKey)) {
      return { uid, user: u, matchedAccountName: rawUsername, confidence: 100 };
    }

    // Ưu tiên 2: Tên tài khoản xuất hiện như một từ độc lập trong nội dung chuyển khoản
    if (cleanKey.length >= 3 && tokens.includes(cleanKey)) {
      candidates.push({ uid, user: u, matchedAccountName: rawUsername, confidence: 90, len: cleanKey.length });
      continue;
    }

    // Ưu tiên 3: Nội dung ngân hàng viết liền không dấu chứa tên tài khoản (độ dài >= 4 ký tự)
    if (alphaKey.length >= 4 && descAlphaNum.includes(alphaKey)) {
      candidates.push({ uid, user: u, matchedAccountName: rawUsername, confidence: 75, len: alphaKey.length });
      continue;
    }

    // Ưu tiên 4: Khớp theo displayName nếu người dùng ghi tên hiển thị
    const dispAlpha = normalizeAlphaNum(u.displayName || '');
    if (dispAlpha.length >= 4 && (descAlphaNum === dispAlpha || descLower.includes(String(u.displayName || '').toLowerCase()))) {
      candidates.push({ uid, user: u, matchedAccountName: u.displayName, confidence: 65, len: dispAlpha.length });
    }
  }

  if (!candidates.length) return null;
  // Sắp xếp theo độ ưu tiên và độ dài tên tài khoản dài nhất (tránh khớp nhầm chuỗi con ngắn)
  candidates.sort((a, b) => (b.confidence - a.confidence) || (b.len - a.len));
  return candidates[0];
}

/**
 * Xử lý cộng tiền tự động trên trình duyệt / Admin qua Firebase SDK v12
 */
export async function processBankWebhookWithFirebaseSdk({ db, firebaseFns, payload }) {
  const { ref, get, set, update, push, runTransaction } = firebaseFns;
  const txList = parseWebhookTransactions(payload);
  if (!txList.length) {
    return { ok: false, processed: 0, message: 'Không có giao dịch hợp lệ trong payload.' };
  }

  const usersSnap = await get(ref(db, 'users'));
  const usersMap = usersSnap.val() || {};
  const depositsSnap = await get(ref(db, 'deposits'));
  const allDeposits = depositsSnap.val() || {};

  const results = [];

  for (const tx of txList) {
    // Kiểm tra số tài khoản nếu webhook có gửi kèm
    if (
      tx.accountNumber &&
      !tx.accountNumber.includes(BANK_CONFIG.accountNumber) &&
      tx.accountNumber !== BANK_CONFIG.accountNumber
    ) {
      results.push({ txId: tx.txId, status: 'skipped_wrong_account', accountNumber: tx.accountNumber });
      continue;
    }

    // Khớp tên tài khoản đã tạo từ nội dung chuyển khoản
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

    // Chống cộng trùng lặp bằng transaction trên `processedBankTx/{txId}`
    const lockRef = ref(db, `processedBankTx/${tx.txId}`);
    const lockTx = await runTransaction(lockRef, cur => {
      if (cur !== null) return; // Đã xử lý trước đó
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

    // Cộng số dư trực tiếp vào `users/{uid}/balance`
    const balRef = ref(db, `users/${uid}/balance`);
    const balTx = await runTransaction(balRef, cur => (Number(cur) || 0) + tx.amount);
    const newBalance = Number(balTx.snapshot.val()) || tx.amount;

    // Tự động duyệt lệnh nạp đang chờ (nếu khách có bấm tạo lệnh trước đó)
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
        status: 'approved',
        createdAt: Date.now(),
        processedAt: Date.now()
      });
    }

    // Lưu vào lịch sử giao dịch
    const txHistoryRef = push(ref(db, `transactions/${uid}`));
    await set(txHistoryRef, {
      type: 'webhook_deposit',
      title: `Nạp tự động ${BANK_CONFIG.bankName} (+${tx.amount.toLocaleString('vi-VN')}đ)`,
      amount: tx.amount,
      balanceAfter: newBalance,
      detail: `TK nhận: ${BANK_CONFIG.accountNumber} (${BANK_CONFIG.accountOwner}) · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
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
 * để tự động xử lý mọi giao dịch Webhook đổ về Firebase REST API
 */
export function startBankWebhookListener({ db, firebaseFns, onCredited }) {
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
 * Không cần cài đặt thư viện ngoài — sử dụng `fetch` chuẩn để đọc/ghi Firebase RTDB.
 */
export async function handleServerlessBankWebhook(payload, options = {}) {
  const dbUrl = (options.databaseURL || BANK_CONFIG.firebaseDatabaseUrl).replace(/\/$/, '');
  const authQuery = options.databaseSecret ? `?auth=${encodeURIComponent(options.databaseSecret)}` : '';

  const txList = parseWebhookTransactions(payload);
  if (!txList.length) {
    return { statusCode: 200, body: { ok: false, message: 'No valid incoming transactions' } };
  }

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

    // Đánh dấu mã giao dịch đã xử lý
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

    // Cập nhật số dư người dùng
    await fetch(`${dbUrl}/users/${encodeURIComponent(uid)}/balance.json${authQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextBal)
    });

    // Ghi lịch sử giao dịch
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

// Export mặc định cho Cloudflare Workers / Vercel Serverless handler
export default {
  BANK_CONFIG,
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
          service: 'KEYNOVA ACB ONE Webhook',
          bank: BANK_CONFIG.bankName,
          accountNumber: BANK_CONFIG.accountNumber,
          accountOwner: BANK_CONFIG.accountOwner
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};