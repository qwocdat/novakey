const GACHTHEFAST_CONFIG = {
  provider: 'Pay2S',
  apiUrl: 'https://gachthefast.com/chargingws/v2',
  firebaseDatabaseUrl: 'https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app',
  defaultPartnerId: '',
  defaultPartnerKey: '',
  defaultWebhookToken: '',
  telcos: [
    { code: 'VIETTEL', name: 'Thẻ Viettel', discount: 10.7, serialLen: [11, 15], pinLen: [13, 15] },
    { code: 'VINAPHONE', name: 'Thẻ Vinaphone', discount: 14.5, serialLen: [14, 14], pinLen: [12, 14] },
    { code: 'MOBIFONE', name: 'Thẻ Mobifone', discount: 15.2, serialLen: [15, 15], pinLen: [12, 12] },
    { code: 'VIETNAMOBILE', name: 'Thẻ Vietnamobile', discount: 18.0, serialLen: [11, 16], pinLen: [12, 16] },
    { code: 'ZING', name: 'Thẻ Zing (VNG)', discount: 14.0, serialLen: [9, 15], pinLen: [9, 15] },
    { code: 'GARENA', name: 'Thẻ Garena', discount: 15.0, serialLen: [8, 16], pinLen: [8, 16] },
    { code: 'GATE', name: 'Thẻ Gate (FPT)', discount: 15.5, serialLen: [8, 15], pinLen: [8, 15] },
    { code: 'VCOIN', name: 'Thẻ Vcoin (VTC)', discount: 15.0, serialLen: [9, 15], pinLen: [9, 15] },
    { code: 'APPOTA', name: 'Thẻ Appota', discount: 16.0, serialLen: [8, 16], pinLen: [8, 16] },
    { code: 'SCOIN', name: 'Thẻ Scoin', discount: 16.5, serialLen: [8, 16], pinLen: [8, 16] }
  ],
  denominations: [
    10000,
    20000,
    30000,
    50000,
    100000,
    200000,
    300000,
    500000,
    1000000
  ]
};

function md5Hash(string) {
  function rotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(str) {
    const utf8 = unescape(encodeURIComponent(String(str ?? '')));
    const lMessageLength = utf8.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    const lWordArray = new Array(lNumberOfWords - 1).fill(0);
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      const lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = (lWordArray[lWordCount] || 0) | (utf8.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }
    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    const lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = (lWordArray[lWordCount] || 0) | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    let wordToHexValue = '';
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const temp = '0' + lByte.toString(16);
      wordToHexValue += temp.substr(temp.length - 2, 2);
    }
    return wordToHexValue;
  }

  const x = convertToWordArray(string);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);

    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);

    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);

    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

function buildGachTheFastSign(partnerKey, code, serial) {
  return md5Hash(`${String(partnerKey || '').trim()}${String(code || '').trim()}${String(serial || '').trim()}`);
}

function buildPay2sAckResponse(extra = {}, isSuccess = true) {
  return {
    success: Boolean(isSuccess),
    status: extra.status !== undefined ? extra.status : Boolean(isSuccess),
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

function normalizeAccountKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function normalizeAlphaNum(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

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

async function submitCardToGachTheFast({
  telco,
  code,
  serial,
  amount,
  requestId,
  partnerId,
  partnerKey
}) {
  const cleanTelco = String(telco || '').trim().toUpperCase();
  const cleanCode = String(code || '').replace(/\s+/g, '');
  const cleanSerial = String(serial || '').replace(/\s+/g, '');
  const cleanAmount = Number(amount) || 0;
  const pId = String(partnerId || GACHTHEFAST_CONFIG.defaultPartnerId || '').trim();
  const pKey = String(partnerKey || GACHTHEFAST_CONFIG.defaultPartnerKey || '').trim();

  if (!pId || !pKey) {
    return {
      sentToApi: false,
      status: 99,
      message: 'Thẻ đã được ghi nhận vào hệ thống và đang chờ đối soát.'
    };
  }

  const sign = buildGachTheFastSign(pKey, cleanCode, cleanSerial);
  const body = {
    telco: cleanTelco,
    code: cleanCode,
    serial: cleanSerial,
    amount: cleanAmount,
    request_id: String(requestId),
    partner_id: pId,
    sign,
    command: 'charging'
  };

  try {
    const res = await fetch(GACHTHEFAST_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return {
      sentToApi: true,
      status: Number(data.status ?? 99),
      message: data.message || 'Đã gửi thẻ sang cổng gạch thẻ tự động',
      transId: data.trans_id || '',
      raw: data
    };
  } catch (err) {
    return {
      sentToApi: false,
      status: 99,
      message: 'Đã lưu thẻ lên hệ thống chờ xử lý (' + (err?.message || 'Queue') + ')'
    };
  }
}

function parseCardCallbackPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload.transactions) || (payload.payload && Array.isArray(payload.payload.transactions))) {
    return null;
  }

  const rawStatus = payload.status ?? payload.resultCode;
  let status = 99;
  if (rawStatus === 1 || rawStatus === '1' || rawStatus === 'SUCCESS' || rawStatus === 'PAID' || rawStatus === true || rawStatus === 0 || rawStatus === '0') {
    status = (rawStatus === 0 || rawStatus === '0') && payload.resultCode !== undefined ? 1 : Number(rawStatus === true ? 1 : rawStatus);
  } else if (rawStatus !== undefined) {
    status = Number(rawStatus);
    if (Number.isNaN(status)) status = 3;
  }

  const requestId = String(
    payload.request_id ||
    payload.requestId ||
    payload.orderId ||
    payload.paymentCode ||
    ''
  ).trim();
  const code = String(payload.code || payload.pin || payload.card_code || '').trim();
  const serial = String(payload.serial || payload.seri || payload.card_serial || '').trim();
  const telco = String(payload.telco || payload.type || payload.card_type || 'VIETTEL').trim().toUpperCase();
  const declaredValue = Number(payload.declared_value ?? payload.amount_declared ?? payload.card_value ?? payload.amount ?? 0);
  const realValue = Number(payload.value ?? payload.real_value ?? payload.transferAmount ?? declaredValue ?? 0);
  const receivedAmount = Number(payload.amount ?? payload.transferAmount ?? realValue ?? 0);
  const callbackSign = String(payload.callback_sign || payload.sign || payload.checksum || payload.signature || '').trim().toLowerCase();
  const transId = String(payload.trans_id || payload.transaction_id || payload.transactionNumber || payload.id || requestId || Date.now()).trim();
  const message = String(payload.message || payload.content || payload.description || '').trim();

  if (!requestId && !serial && !code) return null;

  let creditedValue = 0;
  if (status === 1) {
    creditedValue = realValue > 0 ? realValue : declaredValue;
  } else if (status === 2) {
    const minVal = Math.min(declaredValue || realValue, realValue || declaredValue);
    creditedValue = Math.round(minVal * 0.5);
  }

  return {
    status,
    requestId,
    code,
    serial,
    telco,
    declaredValue,
    realValue,
    receivedAmount,
    creditedValue,
    callbackSign,
    transId,
    message,
    timestamp: Date.now()
  };
}

function parsePay2sTransactionsInNapthe(payload = {}) {
  if (!payload || typeof payload !== 'object') return [];
  const rawList = Array.isArray(payload.transactions)
    ? payload.transactions
    : payload.payload && Array.isArray(payload.payload.transactions)
    ? payload.payload.transactions
    : payload.data && Array.isArray(payload.data.transactions)
    ? payload.data.transactions
    : Array.isArray(payload.data)
    ? payload.data
    : (payload.transferAmount !== undefined || payload.gateway !== undefined || payload.transactionNumber !== undefined)
    ? [payload]
    : [];

  const list = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const transferType = String(item.transferType || item.type || 'IN').toLowerCase();
    if (['out', 'debit', 'expense'].includes(transferType)) continue;
    const amount = Number(item.transferAmount ?? item.amount ?? item.value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const content = String(item.content ?? item.description ?? item.orderInfo ?? item.paymentCode ?? '').trim();
    const rawTxId = String(item.id ?? item.transactionNumber ?? item.checksum ?? `${Date.now()}_${Math.round(amount)}`).trim();
    list.push({
      txId: rawTxId.replace(/[.#$/[\]\s]/g, '_'),
      rawTxId,
      gateway: String(item.gateway || 'ACB').trim(),
      amount: Math.round(amount),
      description: content,
      accountNumber: String(item.accountNumber || item.vaNumber || '').trim(),
      checksum: String(item.checksum || '').trim(),
      timestamp: Date.now()
    });
  }
  return list;
}

async function processCardWebhookWithFirebaseSdk({ db, firebaseFns, payload, partnerKey = '' }) {
  const { ref, get, set, update, push, runTransaction } = firebaseFns;

  const pay2sTxs = parsePay2sTransactionsInNapthe(payload);
  if (pay2sTxs.length > 0 && typeof globalThis !== 'undefined' && globalThis.KEYNOVA_BANK?.processBankWebhookWithFirebaseSdk) {
    return globalThis.KEYNOVA_BANK.processBankWebhookWithFirebaseSdk({ db, firebaseFns, payload });
  }

  const parsed = parseCardCallbackPayload(payload);
  if (!parsed) {
    return buildPay2sAckResponse({
      message: 'Giao dịch được xử lý và xác nhận thành công (Pay2S Webhook Ready)'
    }, true);
  }

  if (partnerKey && parsed.callbackSign && parsed.code && parsed.serial) {
    const expectedSign = buildGachTheFastSign(partnerKey, parsed.code, parsed.serial);
    if (expectedSign !== parsed.callbackSign) {
      return buildPay2sAckResponse({
        message: 'Chữ ký callback_sign không khớp.'
      }, false);
    }
  }

  const chargesSnap = await get(ref(db, 'cardCharges'));
  const allCharges = chargesSnap.val() || {};
  let matchedUid = '';
  let matchedChargeId = '';
  let matchedCharge = null;

  for (const [uid, userCharges] of Object.entries(allCharges)) {
    for (const [cId, ch] of Object.entries(userCharges || {})) {
      if (!ch) continue;
      if (
        (parsed.requestId && (ch.requestId === parsed.requestId || cId === parsed.requestId)) ||
        (parsed.serial && parsed.code && ch.serial === parsed.serial && ch.code === parsed.code)
      ) {
        matchedUid = uid;
        matchedChargeId = cId;
        matchedCharge = ch;
        break;
      }
    }
    if (matchedCharge) break;
  }

  if (!matchedUid) {
    const usersSnap = await get(ref(db, 'users'));
    const usersMap = usersSnap.val() || {};
    const matchedUser = matchUserByTransferContent(parsed.requestId || parsed.message, usersMap);
    if (matchedUser && (parsed.status === 1 || parsed.status === 2) && parsed.creditedValue > 0) {
      matchedUid = matchedUser.uid;
      const newCardRef = push(ref(db, `cardCharges/${matchedUid}`));
      matchedChargeId = newCardRef.key;
      await set(newCardRef, {
        uid: matchedUid,
        accountName: matchedUser.matchedAccountName,
        telco: parsed.telco,
        amount: parsed.declaredValue || parsed.creditedValue,
        serial: parsed.serial || 'PAY2S',
        code: parsed.code || parsed.transId,
        requestId: parsed.requestId || parsed.transId,
        status: 'pending',
        createdAt: Date.now()
      });
    }
  }

  if (!matchedUid) {
    return buildPay2sAckResponse({
      cardStatus: 'unmatched_card',
      requestId: parsed.requestId,
      serial: parsed.serial,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true);
  }

  const lockKey = (parsed.requestId || `${matchedUid}_${matchedChargeId}`).replace(/[.#$/[\]\s]/g, '_');

  if (parsed.status === 99) {
    await update(ref(db, `cardCharges/${matchedUid}/${matchedChargeId}`), {
      status: 'pending',
      apiMessage: parsed.message || 'Đang chờ hệ thống xử lý',
      updatedAt: Date.now()
    });
    return buildPay2sAckResponse({
      cardStatus: 'pending',
      uid: matchedUid,
      chargeId: matchedChargeId,
      message: 'Giao dịch đang chờ xử lý'
    }, true);
  }

  const lockRef = ref(db, `processedCardTx/${lockKey}`);
  const lockTx = await runTransaction(lockRef, cur => {
    if (cur !== null) return;
    return {
      lockKey,
      uid: matchedUid,
      chargeId: matchedChargeId,
      telco: parsed.telco,
      serial: parsed.serial,
      status: parsed.status,
      creditedValue: parsed.creditedValue,
      provider: 'Pay2S',
      processedAt: Date.now()
    };
  });

  if (!lockTx.committed) {
    return buildPay2sAckResponse({
      cardStatus: 'duplicate_ignored',
      uid: matchedUid,
      chargeId: matchedChargeId,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true);
  }

  if (parsed.status === 1 || parsed.status === 2) {
    const creditAmt = parsed.creditedValue;
    const balRef = ref(db, `users/${matchedUid}/balance`);
    const balTx = await runTransaction(balRef, cur => (Number(cur) || 0) + creditAmt);
    const newBalance = Number(balTx.snapshot.val()) || creditAmt;

    await update(ref(db, `cardCharges/${matchedUid}/${matchedChargeId}`), {
      status: parsed.status === 1 ? 'approved' : 'wrong_amount',
      realValue: parsed.realValue,
      creditedAmount: creditAmt,
      webhookProvider: 'Pay2S',
      apiMessage: parsed.status === 1 ? 'Thẻ đúng mệnh giá' : 'Thẻ sai mệnh giá (Phạt 50%)',
      processedAt: Date.now()
    });

    const txRef = push(ref(db, `transactions/${matchedUid}`));
    await set(txRef, {
      type: 'card_recharge',
      title: `Nạp thẻ ${parsed.telco} ${(parsed.declaredValue || creditAmt).toLocaleString('vi-VN')}đ (${parsed.status === 1 ? 'Thẻ đúng' : 'Sai mệnh giá'})`,
      amount: creditAmt,
      balanceAfter: newBalance,
      detail: `Seri: ${parsed.serial} · Mã: ${parsed.code} · Cộng: +${creditAmt.toLocaleString('vi-VN')}đ`,
      status: 'completed',
      webhookProvider: 'Pay2S',
      createdAt: Date.now()
    });

    return buildPay2sAckResponse({
      status: parsed.status === 1 ? 'approved' : 'wrong_amount',
      cardStatus: parsed.status === 1 ? 'approved' : 'wrong_amount',
      uid: matchedUid,
      chargeId: matchedChargeId,
      creditedAmount: creditAmt,
      newBalance,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true);
  }

  await update(ref(db, `cardCharges/${matchedUid}/${matchedChargeId}`), {
    status: 'rejected',
    apiMessage: parsed.message || 'Thẻ sai hoặc đã được sử dụng',
    processedAt: Date.now()
  });

  const txRef = push(ref(db, `transactions/${matchedUid}`));
  await set(txRef, {
    type: 'card_rejected',
    title: `Nạp thẻ ${parsed.telco} ${(parsed.declaredValue || 0).toLocaleString('vi-VN')}đ thất bại`,
    amount: 0,
    detail: `Seri: ${parsed.serial} · Lý do: ${parsed.message || 'Thẻ sai hoặc đã sử dụng'}`,
    status: 'rejected',
    createdAt: Date.now()
  });

  return buildPay2sAckResponse({
    status: 'rejected',
    cardStatus: 'rejected',
    uid: matchedUid,
    chargeId: matchedChargeId,
    message: 'Giao dịch được xử lý và xác nhận thành công'
  }, true);
}

function startCardWebhookListener({ db, firebaseFns, getPartnerKey, onProcessed }) {
  const { ref, onValue, update } = firebaseFns;
  const queueRef = ref(db, 'cardWebhooksQueue');
  return onValue(queueRef, async snap => {
    const queue = snap.val() || {};
    for (const [queueId, item] of Object.entries(queue)) {
      if (!item || item.processed) continue;
      try {
        const res = await processCardWebhookWithFirebaseSdk({
          db,
          firebaseFns,
          payload: item.payload || item,
          partnerKey: typeof getPartnerKey === 'function' ? getPartnerKey() : ''
        });
        await update(ref(db, `cardWebhooksQueue/${queueId}`), {
          processed: true,
          processedAt: Date.now(),
          result: res
        });
        if (res.ok && typeof onProcessed === 'function') {
          onProcessed(res);
        }
      } catch (err) {
        console.warn('Pay2S / Card webhook queue error:', err);
      }
    }
  });
}

async function handleServerlessCardWebhook(payload, options = {}) {
  const dbUrl = (options.databaseURL || GACHTHEFAST_CONFIG.firebaseDatabaseUrl).replace(/\/$/, '');
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

  const pay2sTxList = parsePay2sTransactionsInNapthe(payload);
  if (pay2sTxList.length > 0) {
    try {
      await fetch(`${dbUrl}/bankWebhooksQueue.json${authQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'Pay2S',
          source: 'api/Napthe.js',
          payload,
          processed: false,
          receivedAt: Date.now()
        })
      });
    } catch {}

    const summary = [];
    let creditedCount = 0;
    try {
      const usersRes = await fetch(`${dbUrl}/users.json${authQuery}`).catch(() => null);
      const usersMap = (usersRes && usersRes.ok ? await usersRes.json() : null) || {};

      for (const tx of pay2sTxList) {
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
        const currentBal = Number(user.balance) || 0;
        const nextBal = currentBal + tx.amount;

        const lockPut = await fetch(`${dbUrl}/processedBankTx/${encodeURIComponent(tx.txId)}.json${authQuery}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txId: tx.txId,
            uid,
            matchedAccountName,
            amount: tx.amount,
            description: tx.description,
            provider: 'Pay2S',
            processedAt: Date.now()
          })
        });
        if (!lockPut.ok) {
          summary.push({ txId: tx.txId, status: 'queued_for_sdk', uid, matchedAccountName, amount: tx.amount });
          continue;
        }

        await fetch(`${dbUrl}/users/${encodeURIComponent(uid)}/balance.json${authQuery}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextBal)
        });
        user.balance = nextBal;

        await fetch(`${dbUrl}/transactions/${encodeURIComponent(uid)}.json${authQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'webhook_deposit',
            title: `Pay2S · Nạp tự động (+${tx.amount.toLocaleString('vi-VN')}đ)`,
            amount: tx.amount,
            balanceAfter: nextBal,
            detail: `Cổng: Pay2S (${tx.gateway}) · Nội dung: ${tx.description} · Khớp TK: ${matchedAccountName}`,
            status: 'completed',
            webhookTxId: tx.txId,
            webhookProvider: 'Pay2S',
            createdAt: Date.now()
          })
        });

        creditedCount++;
        summary.push({ txId: tx.txId, status: 'credited', uid, matchedAccountName, amount: tx.amount, nextBal });
      }
    } catch {}

    return {
      statusCode: 200,
      body: buildPay2sAckResponse({
        service: 'KEYNOVA Pay2S Webhook (api/Napthe.js)',
        processed: creditedCount,
        summary,
        message: 'Giao dịch được xử lý và xác nhận thành công'
      }, true)
    };
  }

  const parsed = parseCardCallbackPayload(payload);
  if (!parsed) {
    return {
      statusCode: 200,
      body: buildPay2sAckResponse({
        service: 'KEYNOVA Pay2S & Card Webhook (api/Napthe.js)',
        message: 'Giao dịch được xử lý và xác nhận thành công'
      }, true)
    };
  }

  let queueNodeKey = '';
  try {
    const qRes = await fetch(`${dbUrl}/cardWebhooksQueue.json${authQuery}`, {
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

  try {
    const chargesRes = await fetch(`${dbUrl}/cardCharges.json${authQuery}`);
    const allCharges = (chargesRes.ok ? await chargesRes.json() : null) || {};
    let matchedUid = '';
    let matchedChargeId = '';
    for (const [uid, userCharges] of Object.entries(allCharges)) {
      for (const [cId, ch] of Object.entries(userCharges || {})) {
        if (!ch) continue;
        if (
          (parsed.requestId && (ch.requestId === parsed.requestId || cId === parsed.requestId)) ||
          (parsed.serial && parsed.code && ch.serial === parsed.serial && ch.code === parsed.code)
        ) {
          matchedUid = uid;
          matchedChargeId = cId;
          break;
        }
      }
      if (matchedUid) break;
    }

    if (matchedUid && parsed.status !== 99) {
      const lockKey = (parsed.requestId || `${matchedUid}_${matchedChargeId}`).replace(/[.#$/[\]\s]/g, '_');
      const checkRes = await fetch(`${dbUrl}/processedCardTx/${encodeURIComponent(lockKey)}.json${authQuery}`);
      const existing = checkRes.ok ? await checkRes.json() : null;
      if (!existing) {
        const lockPut = await fetch(`${dbUrl}/processedCardTx/${encodeURIComponent(lockKey)}.json${authQuery}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lockKey,
            uid: matchedUid,
            chargeId: matchedChargeId,
            telco: parsed.telco,
            serial: parsed.serial,
            status: parsed.status,
            creditedValue: parsed.creditedValue,
            provider: 'Pay2S',
            processedAt: Date.now()
          })
        });

        if (lockPut.ok) {
          if (parsed.status === 1 || parsed.status === 2) {
            const balRes = await fetch(`${dbUrl}/users/${encodeURIComponent(matchedUid)}/balance.json${authQuery}`);
            const curBal = Number(balRes.ok ? await balRes.json() : 0) || 0;
            const nextBal = curBal + parsed.creditedValue;
            await fetch(`${dbUrl}/users/${encodeURIComponent(matchedUid)}/balance.json${authQuery}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nextBal)
            });
            await fetch(`${dbUrl}/cardCharges/${encodeURIComponent(matchedUid)}/${encodeURIComponent(matchedChargeId)}.json${authQuery}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: parsed.status === 1 ? 'approved' : 'wrong_amount',
                realValue: parsed.realValue,
                creditedAmount: parsed.creditedValue,
                webhookProvider: 'Pay2S',
                apiMessage: parsed.status === 1 ? 'Thẻ đúng mệnh giá' : 'Thẻ sai mệnh giá (-50%)',
                processedAt: Date.now()
              })
            });
            await fetch(`${dbUrl}/transactions/${encodeURIComponent(matchedUid)}.json${authQuery}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'card_recharge',
                title: `Nạp thẻ ${parsed.telco} ${(parsed.declaredValue || parsed.creditedValue).toLocaleString('vi-VN')}đ (${parsed.status === 1 ? 'Thẻ đúng' : 'Sai mệnh giá'})`,
                amount: parsed.creditedValue,
                balanceAfter: nextBal,
                detail: `Seri: ${parsed.serial} · Mã: ${parsed.code} · Cộng: +${parsed.creditedValue.toLocaleString('vi-VN')}đ`,
                status: 'completed',
                webhookProvider: 'Pay2S',
                createdAt: Date.now()
              })
            });
          } else {
            await fetch(`${dbUrl}/cardCharges/${encodeURIComponent(matchedUid)}/${encodeURIComponent(matchedChargeId)}.json${authQuery}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'rejected',
                apiMessage: parsed.message || 'Thẻ lỗi hoặc đã sử dụng',
                processedAt: Date.now()
              })
            });
            await fetch(`${dbUrl}/transactions/${encodeURIComponent(matchedUid)}.json${authQuery}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'card_rejected',
                title: `Nạp thẻ ${parsed.telco} ${(parsed.declaredValue || 0).toLocaleString('vi-VN')}đ thất bại`,
                amount: 0,
                detail: `Seri: ${parsed.serial} · Lý do: ${parsed.message || 'Thẻ lỗi hoặc đã sử dụng'}`,
                status: 'rejected',
                createdAt: Date.now()
              })
            });
          }

          if (queueNodeKey) {
            await fetch(`${dbUrl}/cardWebhooksQueue/${encodeURIComponent(queueNodeKey)}.json${authQuery}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ processed: true, processedAt: Date.now() })
            }).catch(() => {});
          }
        }
      }
    }
  } catch {}

  return {
    statusCode: 200,
    body: buildPay2sAckResponse({
      service: 'KEYNOVA Pay2S & GachTheFast Webhook (api/Napthe.js)',
      requestId: parsed.requestId,
      cardStatus: parsed.status,
      creditedValue: parsed.creditedValue,
      message: 'Giao dịch được xử lý và xác nhận thành công'
    }, true)
  };
}

async function pay2sNaptheWebhookHandler(req, res) {
  if (req && typeof req.json === 'function' && (!res || typeof res.setHeader !== 'function')) {
    return KEYNOVA_NAPTHE_MODULE.fetch(req, res || {});
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

  const envDbUrl = (typeof process !== 'undefined' && process.env?.FIREBASE_DATABASE_URL) || GACHTHEFAST_CONFIG.firebaseDatabaseUrl;
  const envDbSecret = (typeof process !== 'undefined' && process.env?.FIREBASE_DB_SECRET) || '';
  const envWebhookToken = (typeof process !== 'undefined' && process.env?.PAY2S_WEBHOOK_TOKEN) || GACHTHEFAST_CONFIG.defaultWebhookToken;

  try {
    let payload = {};
    const reqUrl = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);

    if (req.method === 'GET') {
      reqUrl.searchParams.forEach((v, k) => { payload[k] = v; });
      if (!Object.keys(payload).length && (!req.query || !Object.keys(req.query).length)) {
        return sendJson(200, buildPay2sAckResponse({
          service: 'KEYNOVA Pay2S & Card Webhook (api/Napthe.js)',
          telcos: GACHTHEFAST_CONFIG.telcos.map(t => t.code),
          denominations: GACHTHEFAST_CONFIG.denominations,
          message: 'Giao dịch được xử lý và xác nhận thành công'
        }, true));
      }
      if (req.query && typeof req.query === 'object') {
        payload = { ...payload, ...req.query };
      }
    } else {
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        payload = req.body;
      } else {
        const rawStr = typeof req.body === 'string'
          ? req.body
          : await new Promise((resolve, reject) => {
              let acc = '';
              req.on('data', chunk => { acc += chunk; });
              req.on('end', () => resolve(acc));
              req.on('error', reject);
            });
        if (rawStr && rawStr.trim()) {
          const ct = String(req.headers?.['content-type'] || '');
          if (ct.includes('application/json') || rawStr.trim().startsWith('{') || rawStr.trim().startsWith('[')) {
            try {
              payload = JSON.parse(rawStr);
            } catch {
              return sendJson(400, buildPay2sAckResponse({ message: 'JSON không hợp lệ' }, false));
            }
          } else {
            new URLSearchParams(rawStr).forEach((v, k) => { payload[k] = v; });
          }
        }
      }
    }

    const out = await handleServerlessCardWebhook(payload, {
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

const KEYNOVA_NAPTHE_MODULE = {
  GACHTHEFAST_CONFIG,
  md5Hash,
  buildGachTheFastSign,
  buildPay2sAckResponse,
  verifyPay2sWebhookToken,
  submitCardToGachTheFast,
  parseCardCallbackPayload,
  parsePay2sTransactionsInNapthe,
  processCardWebhookWithFirebaseSdk,
  startCardWebhookListener,
  handleServerlessCardWebhook,
  pay2sNaptheWebhookHandler,
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

    try {
      let payload = {};
      const url = new URL(request.url);
      if (request.method === 'GET') {
        url.searchParams.forEach((v, k) => { payload[k] = v; });
      } else if (request.method === 'POST') {
        const rawText = await request.text();
        if (rawText && rawText.trim()) {
          const ct = request.headers.get('content-type') || '';
          if (ct.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
            try {
              payload = JSON.parse(rawText);
            } catch {
              return new Response(
                JSON.stringify(buildPay2sAckResponse({ message: 'JSON không hợp lệ' }, false)),
                { status: 400, headers: corsHeaders }
              );
            }
          } else {
            new URLSearchParams(rawText).forEach((v, k) => { payload[k] = v; });
          }
        }
      }

      if (!Object.keys(payload).length) {
        return new Response(
          JSON.stringify(buildPay2sAckResponse({
            service: 'KEYNOVA Pay2S & Card Webhook (api/Napthe.js)',
            telcos: GACHTHEFAST_CONFIG.telcos.map(t => t.code),
            denominations: GACHTHEFAST_CONFIG.denominations,
            message: 'Giao dịch được xử lý và xác nhận thành công'
          }, true)),
          { status: 200, headers: corsHeaders }
        );
      }

      const result = await handleServerlessCardWebhook(payload, {
        databaseURL: env.FIREBASE_DATABASE_URL || GACHTHEFAST_CONFIG.firebaseDatabaseUrl,
        databaseSecret: env.FIREBASE_DB_SECRET || '',
        headers: request.headers,
        webhookToken: env.PAY2S_WEBHOOK_TOKEN || GACHTHEFAST_CONFIG.defaultWebhookToken
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

Object.assign(pay2sNaptheWebhookHandler, KEYNOVA_NAPTHE_MODULE);
pay2sNaptheWebhookHandler.default = pay2sNaptheWebhookHandler;

if (typeof globalThis !== 'undefined') {
  globalThis.KEYNOVA_NAPTHE = pay2sNaptheWebhookHandler;
  Object.assign(globalThis, KEYNOVA_NAPTHE_MODULE);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = pay2sNaptheWebhookHandler;
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const http = require('http');
  const PORT = Number(process.env.NAPTHE_WEBHOOK_PORT || process.env.PORT || 3002);
  const server = http.createServer((req, res) => pay2sNaptheWebhookHandler(req, res));
  server.listen(PORT, () => {
    console.log(`[KEYNOVA api/Napthe.js] Pay2S & GachTheFast Webhook Server đang chạy tại http://0.0.0.0:${PORT}`);
  });
}
