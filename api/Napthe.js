import crypto from "crypto";

const FIREBASE_DB = "https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app";
const GACHTHEFAST_API = "https://gachthefast.com/chargingws/v2";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // 1. TRÍCH XUẤT DỮ LIỆU TỪ BODY HOẶC QUERY CỦA GACHTHEFAST.COM
    let data = {};
    if (req.query && typeof req.query === "object") {
      data = { ...req.query };
    }

    if (req.body) {
      let bodyData = req.body;
      if (typeof bodyData === "string") {
        try {
          bodyData = JSON.parse(bodyData);
        } catch (e) {
          const params = new URLSearchParams(bodyData);
          bodyData = Object.fromEntries(params.entries());
        }
      }
      if (bodyData && typeof bodyData === "object") {
        data = { ...data, ...bodyData };
      }
    }

    if (req.method === "GET" && Object.keys(data).length === 0) {
      return res.status(200).json({
        status: "online",
        service: "KEYNOVA GachTheFast.com Webhook & Charging Gateway",
        endpoint: "/api/Napthe.js",
        api: GACHTHEFAST_API,
        ready: true
      });
    }

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ status: "error", message: "Dữ liệu Webhook GachTheFast rỗng" });
    }

    // Lấy cấu hình Partner ID & Partner Key từ Firebase (`store/settings`) hoặc biến môi trường
    const settingsRes = await fetch(`${FIREBASE_DB}/store/settings.json`);
    const settings = (settingsRes.ok ? await settingsRes.json() : null) || {};
    const partnerId = String(data.partner_id || data.partnerId || process.env.GACHTHEFAST_PARTNER_ID || settings.gachthefastPartnerId || "").trim();
    const partnerKey = String(data.partner_key || data.partnerKey || process.env.GACHTHEFAST_PARTNER_KEY || settings.gachthefastPartnerKey || "").trim();

    // 2. NẾU LÀ YÊU CẦU GỬI THẺ MỚI TỪ WEB LÊN GACHTHEFAST.COM (action / command = "charging")
    if (data.command === "charging" || data.action === "charging" || data.action === "submit_card") {
      const telco = String(data.telco || "").trim().toUpperCase();
      const code = String(data.code || data.pin || "").replace(/\s+/g, "");
      const serial = String(data.serial || "").replace(/\s+/g, "");
      const amount = parseInt(data.amount || 0, 10);
      const uid = String(data.uid || "").trim();
      const accountName = String(data.accountName || "").trim();
      const requestId = String(data.request_id || data.requestId || `${uid || accountName || "CARD"}_${Date.now()}`).trim();

      if (!telco || !code || !serial || amount <= 0) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu thông tin thẻ cào (telco, code, serial, amount)"
        });
      }

      if (!partnerId || !partnerKey) {
        return res.status(200).json({
          status: "pending",
          sentToGateway: false,
          gtfStatus: 99,
          request_id: requestId,
          message: "Đã lưu thẻ chờ duyệt (Chưa cấu hình Partner ID / Partner Key GachTheFast)"
        });
      }

      // Tạo chữ ký chuẩn GachTheFast: md5(partner_key + code + serial)
      const sign = crypto
        .createHash("md5")
        .update(`${partnerKey}${code}${serial}`)
        .digest("hex")
        .toLowerCase();

      const gtfRes = await fetch(GACHTHEFAST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telco: telco,
          code: code,
          serial: serial,
          amount: amount,
          request_id: requestId,
          partner_id: partnerId,
          sign: sign,
          command: "charging"
        })
      });

      const gtfData = await gtfRes.json();

      return res.status(200).json({
        status: "success",
        sentToGateway: true,
        gtfStatus: Number(gtfData.status ?? 99),
        request_id: requestId,
        trans_id: gtfData.trans_id || "",
        message: gtfData.message || "Đã gửi thẻ lên GachTheFast.com thành công",
        data: gtfData
      });
    }

    // 3. XỬ LÝ WEBHOOK CALLBACK PHẢN HỒI KẾT QUẢ THẺ TỪ GACHTHEFAST.COM
    // Mã trạng thái chuẩn GachTheFast:
    // 1 = Thẻ đúng mệnh giá | 2 = Thẻ đúng nhưng sai mệnh giá | 3, 4 = Thẻ lỗi / Đã dùng | 99 = Đang chờ xử lý
    const cardStatus = parseInt(data.status ?? 99, 10);
    const requestId = String(data.request_id || data.requestId || "").trim();
    const code = String(data.code || data.pin || "").trim();
    const serial = String(data.serial || "").trim();
    const telco = String(data.telco || data.type || "VIETTEL").trim().toUpperCase();
    const declaredValue = parseInt(data.declared_value || data.amount || 0, 10);
    const realValue = parseInt(data.value || data.real_value || declaredValue || 0, 10);
    const receiveAmount = parseInt(data.amount || realValue || 0, 10);
    const callbackSign = String(data.callback_sign || data.sign || "").trim().toLowerCase();

    // Kiểm tra chữ ký bảo mật callback_sign = md5(partner_key + code + serial)
    if (partnerKey && callbackSign && code && serial) {
      const expectedSign = crypto
        .createHash("md5")
        .update(`${partnerKey}${code}${serial}`)
        .digest("hex")
        .toLowerCase();

      if (expectedSign !== callbackSign) {
        return res.status(403).json({
          status: "error",
          message: "Chữ ký callback_sign GachTheFast không hợp lệ"
        });
      }
    }

    // 4. NHẬN DIỆN UID TÀI KHOẢN & LỆNH NẠP THẺ TRÊN FIREBASE
    const [chargesRes, usersRes] = await Promise.all([
      fetch(`${FIREBASE_DB}/cardCharges.json`),
      fetch(`${FIREBASE_DB}/users.json`)
    ]);
    const allCharges = (chargesRes.ok ? await chargesRes.json() : null) || {};
    const usersMap = (usersRes.ok ? await usersRes.json() : null) || {};

    let userUid = "";
    let matchedChargeId = "";

    for (const [uid, userCards] of Object.entries(allCharges)) {
      for (const [cId, ch] of Object.entries(userCards || {})) {
        if (!ch) continue;
        if (
          (requestId && (ch.requestId === requestId || cId === requestId)) ||
          (serial && code && ch.serial === serial && ch.code === code)
        ) {
          userUid = uid;
          matchedChargeId = cId;
          break;
        }
      }
      if (userUid) break;
    }

    // Dự phòng: Nhận diện UID hoặc tên tài khoản từ đầu chuỗi request_id (VD: "datnguyen99_1710000000")
    if (!userUid && requestId) {
      const prefix = requestId.split("_")[0];
      if (usersMap[prefix]) {
        userUid = prefix;
      } else {
        const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        for (const [uid, u] of Object.entries(usersMap)) {
          if (!u || typeof u !== "object") continue;
          const acc = String(u.accountName || u.username || "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
          if (acc && acc === cleanPrefix) {
            userUid = uid;
            break;
          }
        }
      }
    }

    if (!userUid) {
      return res.status(200).json({
        status: "ignored",
        message: "Không tìm thấy UID người dùng hoặc lệnh nạp thẻ tương ứng",
        request_id: requestId,
        serial: serial
      });
    }

    // Nếu thẻ vẫn đang chờ xử lý (status = 99)
    if (cardStatus === 99) {
      return res.status(200).json({
        status: "pending",
        message: "Thẻ đang chờ GachTheFast xử lý",
        uid: userUid,
        request_id: requestId
      });
    }

    // 5. XỬ LÝ CHỐNG CỘNG TRÙNG LẶP (IDEMPOTENCY)
    const transId = String(data.trans_id || requestId || `${userUid}_${serial}_${code}`).replace(/[.#$/[\]\s]/g, "_");
    const cardCheckUrl = `${FIREBASE_DB}/processedCardTx/${transId}.json`;

    const checkRes = await fetch(cardCheckUrl);
    const existingCardTx = checkRes.ok ? await checkRes.json() : null;

    if (existingCardTx && existingCardTx.status === "PROCESSED") {
      return res.status(200).json({
        status: "success",
        message: "Giao dịch thẻ cào này đã được ghi nhận trước đó (bỏ qua trùng lặp)"
      });
    }

    // 6. TÍNH SỐ TIỀN CỘNG VÀO FIREBASE THEO TRẠNG THÁI GACHTHEFAST
    // - status = 1: Thẻ đúng mệnh giá -> Cộng 100% mệnh giá thực (realValue || declaredValue)
    // - status = 2: Thẻ sai mệnh giá -> Cộng 50% mệnh giá nhỏ hơn
    // - status = 3, 4: Thẻ lỗi / đã sử dụng -> Cộng 0đ
    let amountToAdd = 0;
    let finalCardStatus = "rejected";
    let statusMessage = data.message || "Thẻ sai hoặc đã được sử dụng";

    if (cardStatus === 1) {
      amountToAdd = realValue > 0 ? realValue : declaredValue;
      finalCardStatus = "approved";
      statusMessage = "Thẻ đúng mệnh giá (+100%)";
    } else if (cardStatus === 2) {
      const baseVal = Math.min(declaredValue || realValue, realValue || declaredValue);
      amountToAdd = Math.round(baseVal * 0.5);
      finalCardStatus = "wrong_amount";
      statusMessage = "Thẻ sai mệnh giá (Cộng 50% mệnh giá thực)";
    }

    const userBalanceUrl = `${FIREBASE_DB}/users/${encodeURIComponent(userUid)}/balance.json`;
    const getRes = await fetch(userBalanceUrl);
    const currentBalance = Number(getRes.ok ? await getRes.json() : 0) || 0;
    const newBalance = currentBalance + amountToAdd;

    if (amountToAdd > 0) {
      await fetch(userBalanceUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBalance)
      });
    }

    // 7. GHI LỊCH SỬ GIAO DỊCH THẺ CÀO VÀO FIREBASE
    const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

    await fetch(cardCheckUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transId: transId,
        requestId: requestId,
        uid: userUid,
        telco: telco,
        serial: serial,
        code: code,
        declaredValue: declaredValue,
        realValue: realValue,
        receiveAmount: receiveAmount,
        balanceAdded: amountToAdd,
        newBalance: newBalance,
        cardStatus: finalCardStatus,
        status: "PROCESSED",
        timestamp: Date.now()
      })
    });

    if (matchedChargeId) {
      await fetch(`${FIREBASE_DB}/cardCharges/${encodeURIComponent(userUid)}/${encodeURIComponent(matchedChargeId)}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: finalCardStatus,
          realValue: realValue,
          creditedAmount: amountToAdd,
          transId: transId,
          apiMessage: statusMessage,
          processedAt: Date.now()
        })
      });
    }

    await fetch(`${FIREBASE_DB}/transactions/${encodeURIComponent(userUid)}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: amountToAdd > 0 ? "card_recharge" : "card_rejected",
        title: amountToAdd > 0
          ? `GachTheFast · Nạp thẻ ${telco} ${(declaredValue || amountToAdd).toLocaleString("vi-VN")}đ`
          : `GachTheFast · Thẻ ${telco} ${(declaredValue || 0).toLocaleString("vi-VN")}đ thất bại`,
        amount: amountToAdd,
        balanceAfter: newBalance,
        detail: `Seri: ${serial} · Mã: ${code} · ${statusMessage}`,
        status: amountToAdd > 0 ? "completed" : "rejected",
        createdAt: Date.now()
      })
    });

    await fetch(`${FIREBASE_DB}/card_logs.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transId: transId,
        requestId: requestId,
        uid: userUid,
        telco: telco,
        serial: serial,
        declaredValue: declaredValue,
        realValue: realValue,
        balanceAdded: amountToAdd,
        newBalance: newBalance,
        time: vnTime,
        status: amountToAdd > 0 ? "THÀNH CÔNG" : "THẤT BẠI",
        note: statusMessage
      })
    });

    return res.status(200).json({
      status: "success",
      cardStatus: finalCardStatus,
      message: statusMessage,
      uid: userUid,
      telco: telco,
      serial: serial,
      added: amountToAdd,
      newBalance: newBalance
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Lỗi xử lý Webhook GachTheFast: " + err.message
    });
  }
}