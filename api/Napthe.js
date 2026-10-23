/**
 * ============================================================================
 * KEYNOVA · GachTheFast.Com Scratch Card Charging & Webhook Module (napthe.js)
 * ============================================================================
 * - Cổng gạch thẻ tự động: https://gachthefast.com/chargingws/v2
 * - Chữ ký bảo mật chuẩn: sign = md5(partner_key + code + serial)
 * - Firebase RTDB: https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app
 *
 * Hỗ trợ đầy đủ 10 loại thẻ trên GachTheFast.com:
 * VIETTEL, VINAPHONE, MOBIFONE, VIETNAMOBILE, ZING, GARENA, GATE, VCOIN, APPOTA, SCOIN
 * Mệnh giá: 10.000đ -> 1.000.000đ
 *
 * Quy chuẩn xử lý Callback GachTheFast.com:
 * - status == 1: Thẻ đúng mệnh giá -> Tự động cộng 100% giá trị vào `users/{uid}/balance`.
 * - status == 2: Thẻ đúng nhưng sai mệnh giá -> Tự động cộng 50% mệnh giá nhỏ.
 * - status == 3 / 4: Thẻ lỗi hoặc đã sử dụng -> Cập nhật trạng thái từ chối.
 * - status == 99: Đang chờ xử lý.
 * ============================================================================
 */

const GACHTHEFAST_CONFIG = {
  apiUrl: 'https://gachthefast.com/chargingws/v2',
  firebaseDatabaseUrl: 'https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app',
  defaultPartnerId: '',
  defaultPartnerKey: '',
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

/**
 * Thuật toán MD5 thuần JavaScript để tạo chữ ký `sign = md5(partner_key + code + serial)`
 */
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

/**
 * Tạo chữ ký chuẩn GachTheFast.com: md5(partner_key + code + serial)
 */
function buildGachTheFastSign(partnerKey, code, serial) {
  return md5Hash(`${String(partnerKey || '').trim()}${String(code || '').trim()}${String(serial || '').trim()}`);
}

/**
 * Gửi thẻ cào lên hệ thống GachTheFast.com (`POST https://gachthefast.com/chargingws/v2`)
 */
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
      message: data.message || 'Đã gửi thẻ sang GachTheFast.com',
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

/**
 * Chuẩn hoá dữ liệu Callback Webhook từ GachTheFast.com
 */
function parseCardCallbackPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const status = Number(payload.status ?? 99);
  const requestId = String(payload.request_id || payload.requestId || '').trim();
  const code = String(payload.code || payload.pin || '').trim();
  const serial = String(payload.serial || '').trim();
  const telco = String(payload.telco || payload.type || 'VIETTEL').trim().toUpperCase();
  const declaredValue = Number(payload.declared_value ?? payload.amount_declared ?? payload.amount ?? 0);
  const realValue = Number(payload.value ?? payload.real_value ?? declaredValue ?? 0);
  const receivedAmount = Number(payload.amount ?? realValue ?? 0);
  const callbackSign = String(payload.callback_sign || payload.sign || '').trim().toLowerCase();
  const transId = String(payload.trans_id || payload.transaction_id || requestId || Date.now()).trim();
  const message = String(payload.message || '').trim();

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

/**
 * Xử lý Callback Webhook GachTheFast.com trực tiếp qua Firebase SDK
 */
async function processCardWebhookWithFirebaseSdk({ db, firebaseFns, payload, partnerKey = '' }) {
  const { ref, get, set, update, push, runTransaction } = firebaseFns;
  const parsed = parseCardCallbackPayload(payload);
  if (!parsed) {
    return { ok: false, message: 'Dữ liệu callback thẻ cào không hợp lệ.' };
  }

  if (partnerKey && parsed.callbackSign && parsed.code && parsed.serial) {
    const expectedSign = buildGachTheFastSign(partnerKey, parsed.code, parsed.serial);
    if (expectedSign !== parsed.callbackSign) {
      return { ok: false, message: 'Chữ ký callback_sign không khớp.' };
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
    return {
      ok: false,
      status: 'unmatched_card',
      requestId: parsed.requestId,
      serial: parsed.serial
    };
  }

  const lockKey = (parsed.requestId || `${matchedUid}_${matchedChargeId}`).replace(/[.#$/[\]\s]/g, '_');

  if (parsed.status === 99) {
    await update(ref(db, `cardCharges/${matchedUid}/${matchedChargeId}`), {
      status: 'pending',
      apiMessage: parsed.message || 'Đang chờ GachTheFast.com xử lý',
      updatedAt: Date.now()
    });
    return { ok: true, status: 'pending', uid: matchedUid, chargeId: matchedChargeId };
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
      processedAt: Date.now()
    };
  });

  if (!lockTx.committed) {
    return { ok: true, status: 'duplicate_ignored', uid: matchedUid, chargeId: matchedChargeId };
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
      createdAt: Date.now()
    });

    return {
      ok: true,
      status: parsed.status === 1 ? 'approved' : 'wrong_amount',
      uid: matchedUid,
      chargeId: matchedChargeId,
      creditedAmount: creditAmt,
      newBalance
    };
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

  return {
    ok: true,
    status: 'rejected',
    uid: matchedUid,
    chargeId: matchedChargeId
  };
}

/**
 * Lắng nghe nhánh `cardWebhooksQueue` trên Firebase Realtime Database
 */
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
        console.warn('Card webhook queue error:', err);
      }
    }
  });
}

/**
 * Serverless Webhook Handler cho GachTheFast.com (Node.js / Cloudflare Workers / Vercel)
 * Vừa đẩy vào `cardWebhooksQueue`, vừa tự động đối soát & cộng tiền trực tiếp qua REST API!
 */
async function handleServerlessCardWebhook(payload, options = {}) {
  const dbUrl = (options.databaseURL || GACHTHEFAST_CONFIG.firebaseDatabaseUrl).replace(/\/$/, '');
  const authQuery = options.databaseSecret ? `?auth=${encodeURIComponent(options.databaseSecret)}` : '';
  const parsed = parseCardCallbackPayload(payload);
  if (!parsed) {
    return { statusCode: 400, body: { ok: false, message: 'Invalid GachTheFast callback payload' } };
  }

  try {
    await fetch(`${dbUrl}/cardWebhooksQueue.json${authQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        processed: false,
        receivedAt: Date.now()
      })
    });
  } catch {}

  // Đối soát trực tiếp trên Firebase REST API nếu chạy độc lập trên Worker/Server
  try {
    const chargesRes = await fetch(`${dbUrl}/cardCharges.json${authQuery}`);
    const allCharges = (await chargesRes.json()) || {};
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
      const existing = await checkRes.json();
      if (!existing) {
        await fetch(`${dbUrl}/processedCardTx/${encodeURIComponent(lockKey)}.json${authQuery}`, {
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
            processedAt: Date.now()
          })
        });

        if (parsed.status === 1 || parsed.status === 2) {
          const balRes = await fetch(`${dbUrl}/users/${encodeURIComponent(matchedUid)}/balance.json${authQuery}`);
          const curBal = Number(await balRes.json()) || 0;
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
              apiMessage: parsed.status === 1 ? 'Thẻ đúng mệnh giá' : 'Thẻ sai mệnh giá (-50%)',
              processedAt: Date.now()
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
        }
      }
    }
  } catch {}

  return {
    statusCode: 200,
    body: {
      ok: true,
      service: 'KEYNOVA GachTheFast.com Webhook (napthe.js)',
      requestId: parsed.requestId,
      status: parsed.status,
      creditedValue: parsed.creditedValue
    }
  };
}

const KEYNOVA_NAPTHE_MODULE = {
  GACHTHEFAST_CONFIG,
  md5Hash,
  buildGachTheFastSign,
  submitCardToGachTheFast,
  parseCardCallbackPayload,
  processCardWebhookWithFirebaseSdk,
  startCardWebhookListener,
  handleServerlessCardWebhook,
  async fetch(request, env = {}) {
    try {
      let payload = {};
      const url = new URL(request.url);
      if (request.method === 'GET') {
        url.searchParams.forEach((v, k) => { payload[k] = v; });
      } else if (request.method === 'POST') {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          payload = await request.json();
        } else {
          const text = await request.text();
          new URLSearchParams(text).forEach((v, k) => { payload[k] = v; });
        }
      }
      if (!Object.keys(payload).length) {
        return new Response(
          JSON.stringify({
            ok: true,
            service: 'KEYNOVA GachTheFast.com Webhook (napthe.js)',
            telcos: GACHTHEFAST_CONFIG.telcos.map(t => t.code),
            denominations: GACHTHEFAST_CONFIG.denominations
          }),
          { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }
      const result = await handleServerlessCardWebhook(payload, {
        databaseURL: env.FIREBASE_DATABASE_URL || GACHTHEFAST_CONFIG.firebaseDatabaseUrl,
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
  globalThis.KEYNOVA_NAPTHE = KEYNOVA_NAPTHE_MODULE;
  Object.assign(globalThis, KEYNOVA_NAPTHE_MODULE);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KEYNOVA_NAPTHE_MODULE;
  module.exports.default = KEYNOVA_NAPTHE_MODULE;
}

// Nếu chạy trực tiếp bằng lệnh `node napthe.js`, tự động mở cổng HTTP Webhook Callback cho GachTheFast.com
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const http = require('http');
  const PORT = Number(process.env.NAPTHE_WEBHOOK_PORT || process.env.PORT || 3002);
  const DB_URL = process.env.FIREBASE_DATABASE_URL || GACHTHEFAST_CONFIG.firebaseDatabaseUrl;
  const DB_SECRET = process.env.FIREBASE_DB_SECRET || '';

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET') {
      const payload = {};
      reqUrl.searchParams.forEach((v, k) => { payload[k] = v; });
      if (!Object.keys(payload).length) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: true,
          service: 'KEYNOVA GachTheFast.com Webhook Server (napthe.js)',
          apiUrl: GACHTHEFAST_CONFIG.apiUrl,
          telcos: GACHTHEFAST_CONFIG.telcos.map(t => t.code),
          denominations: GACHTHEFAST_CONFIG.denominations
        }));
      }
      handleServerlessCardWebhook(payload, { databaseURL: DB_URL, databaseSecret: DB_SECRET })
        .then(out => {
          res.writeHead(out.statusCode || 200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out.body));
        })
        .catch(err => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      return;
    }

    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        let payload = {};
        const ct = String(req.headers['content-type'] || '');
        if (ct.includes('application/json')) {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } else {
          new URLSearchParams(rawBody).forEach((v, k) => { payload[k] = v; });
        }
        const out = await handleServerlessCardWebhook(payload, {
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
    console.log(`[KEYNOVA napthe.js] GachTheFast.com Webhook Server đang chạy tại http://0.0.0.0:${PORT}`);
  });
}
