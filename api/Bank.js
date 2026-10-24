const FIREBASE_DB = "https://ideo-dd376-default-rtdb.asia-southeast1.firebasedatabase.app";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, pay2s-token");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(200).json({
      status: "online",
      service: "KEYNOVA Pay2S.vn Webhook Gateway",
      bank: "ACB ONE",
      accountNo: "28233851",
      accountOwner: "NGUYEN DAI QUOC DAT",
      endpoint: "/api/Bank.js",
      ready: true
    });
  }

  try {
    let data = req.body;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        const params = new URLSearchParams(data);
        data = Object.fromEntries(params.entries());
      }
    }

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ status: "error", message: "Dữ liệu Webhook Pay2S rỗng" });
    }

    // 1. TRÍCH XUẤT THÔNG TIN GIAO DỊCH TỪ MẢNG TRANSACTIONS CỦA PAY2S.VN
    let tx = data;
    if (Array.isArray(data.transactions) && data.transactions.length > 0) {
      tx = data.transactions[0];
    } else if (Array.isArray(data.data) && data.data.length > 0) {
      tx = data.data[0];
    }

    // Bỏ qua nếu là giao dịch chuyển tiền ra (OUT / DEBIT)
    const transferType = String(tx.transferType || tx.type || "IN").toUpperCase();
    if (transferType === "OUT" || transferType === "DEBIT") {
      return res.status(200).json({
        success: true,
        status: "ignored",
        message: "Bỏ qua giao dịch tiền ra (OUT)"
      });
    }

    // Lấy số tiền chuyển khoản
    const amount = parseInt(tx.transferAmount || tx.amount || data.transferAmount || data.amount || 0, 10);

    // Lấy nội dung chuyển khoản
    const content = String(tx.content || tx.description || tx.orderInfo || data.content || "").trim();
    const rawSearch = `${content} ${JSON.stringify(data)}`;

    // 2. NHẬN DIỆN UID HOẶC TÊN TÀI KHOẢN (HỖ TRỢ NOVA_, KEY_, AETH_ LẪN TÊN TÀI KHOẢN KHÁCH TẠO TRÊN WEB)
    const usersRes = await fetch(`${FIREBASE_DB}/users.json`);
    const usersMap = (usersRes.ok ? await usersRes.json() : null) || {};

    let userUid = "";
    let accountName = "";

    // 2.1. Tìm theo tiền tố NOVA_ / KEY_ / AETH_ (kể cả khi ACB tự lọc bỏ dấu gạch dưới _)
    const match =
      rawSearch.match(/(?:NOVA|KEY|AETH)_?([A-Za-z0-9]{20,36})/i) ||
      rawSearch.match(/(?:NOVA|KEY|AETH)_?([A-Za-z0-9_-]+)/i);

    if (match && match[1]) {
      const candidate = match[1].split(/[\s_]+/)[0];
      if (usersMap[candidate]) {
        userUid = candidate;
        accountName = usersMap[candidate].accountName || usersMap[candidate].username || candidate;
      } else {
        const cleanToken = candidate.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        for (const [uid, u] of Object.entries(usersMap)) {
          if (!u || typeof u !== "object") continue;
          const acc = String(u.accountName || u.username || "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
          if (acc && acc === cleanToken) {
            userUid = uid;
            accountName = u.accountName || u.username || uid;
            break;
          }
        }
        if (!userUid && candidate.length >= 15) {
          userUid = candidate;
          accountName = candidate;
        }
      }
    }

    // 2.2. Nếu khách chuyển khoản bằng đúng Tên tài khoản (accountName / username) trên mã QR VietQR
    if (!userUid && content) {
      const cleanDesc = content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u0110\u0111]/g, "d")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      const words = content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u0110\u0111]/g, "d")
        .toLowerCase()
        .split(/[\s,.;:|\-/+]+/)
        .filter(Boolean);

      for (const [uid, u] of Object.entries(usersMap)) {
        if (!u || typeof u !== "object") continue;
        const rawAcc =
          u.accountName ||
          u.username ||
          (u.rawIdentifier ? String(u.rawIdentifier).split("@")[0] : "") ||
          (u.email ? String(u.email).split("@")[0] : "") ||
          "";
        const accLower = rawAcc.toLowerCase().replace(/[^a-z0-9._-]/g, "");
        const accUpper = rawAcc.toUpperCase().replace(/[^A-Z0-9]/g, "");

        if (
          words.includes(uid.toLowerCase()) ||
          (accLower.length >= 3 && words.includes(accLower)) ||
          (accUpper.length >= 4 && cleanDesc.includes(accUpper))
        ) {
          userUid = uid;
          accountName = rawAcc || uid;
          break;
        }
      }
    }

    if (userUid && amount > 0) {
      // 3. XỬ LÝ CHỐNG CỘNG TRÙNG LẶP (IDEMPOTENCY)
      const rawTransId = String(tx.id || tx.transactionNumber || tx.checksum || data.orderId || `TX_${Date.now()}`);
      const transId = rawTransId.replace(/[.#$/[\]\s]/g, "_");
      const orderCheckUrl = `${FIREBASE_DB}/processedBankTx/${transId}.json`;

      const checkRes = await fetch(orderCheckUrl);
      const existingOrder = checkRes.ok ? await checkRes.json() : null;

      if (existingOrder && existingOrder.status === "SUCCESS") {
        return res.status(200).json({
          success: true,
          status: "success",
          message: "Giao dịch này đã được ghi nhận trước đó (bỏ qua trùng lặp)"
        });
      }

      // 4. KIỂM TRA ĐƠN HÀNG QR ĐANG CHỜ & CỘNG SỐ DƯ VÀO FIREBASE (1 VNĐ = 1 ĐỒNG SỐ DƯ)
      const userOrdersRes = await fetch(`${FIREBASE_DB}/orders/${encodeURIComponent(userUid)}.json`);
      const userOrders = (userOrdersRes.ok ? await userOrdersRes.json() : null) || {};
      let fulfilledOrderId = null;
      let deliveredKey = null;

      for (const [ordId, ord] of Object.entries(userOrders)) {
        if (ord && ord.status === "pending" && ord.payMethod === "transfer" && Number(ord.price) > 0 && amount >= Number(ord.price)) {
          fulfilledOrderId = ordId;
          const vaultUrl = `${FIREBASE_DB}/keyVault/${encodeURIComponent(ord.productId)}/${encodeURIComponent(ord.planId)}.json`;
          const vaultRes = await fetch(vaultUrl);
          const vaultData = (vaultRes.ok ? await vaultRes.json() : null) || {};

          for (const [kId, kObj] of Object.entries(vaultData)) {
            if (kObj && (kObj.status || "available") === "available" && kObj.value) {
              deliveredKey = kObj.value;
              await fetch(`${FIREBASE_DB}/keyVault/${encodeURIComponent(ord.productId)}/${encodeURIComponent(ord.planId)}/${encodeURIComponent(kId)}.json`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "assigned",
                  assignedOrderId: ordId,
                  assignedUid: userUid,
                  assignedAt: Date.now()
                })
              });
              break;
            }
          }

          await fetch(`${FIREBASE_DB}/orders/${encodeURIComponent(userUid)}/${encodeURIComponent(ordId)}.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: deliveredKey ? "delivered" : "paid",
              key: deliveredKey || ord.key || "",
              webhookTxId: transId,
              webhookProvider: "Pay2S.vn",
              deliveredAt: deliveredKey ? Date.now() : null,
              updatedAt: Date.now()
            })
          });
          break;
        }
      }

      const orderPrice = fulfilledOrderId ? (Number(userOrders[fulfilledOrderId]?.price) || 0) : 0;
      const balanceToAdd = fulfilledOrderId ? Math.max(0, amount - orderPrice) : amount;

      const userBalanceUrl = `${FIREBASE_DB}/users/${encodeURIComponent(userUid)}/balance.json`;
      const getRes = await fetch(userBalanceUrl);
      const currentBalance = Number(getRes.ok ? await getRes.json() : 0) || 0;
      const newBalance = currentBalance + balanceToAdd;

      if (balanceToAdd > 0) {
        await fetch(userBalanceUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBalance)
        });
      }

      // 5. GHI LỊCH SỬ GIAO DỊCH VÀO FIREBASE
      const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      await fetch(orderCheckUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: transId,
          uid: userUid,
          accountName: accountName,
          amount: amount,
          balanceAdded: balanceToAdd,
          newBalance: newBalance,
          fulfilledOrderId: fulfilledOrderId || "",
          deliveredKey: deliveredKey || "",
          bank: "ACB",
          accountNo: "28233851",
          content: content,
          status: "SUCCESS",
          timestamp: Date.now()
        })
      });

      await fetch(`${FIREBASE_DB}/deposits/${encodeURIComponent(userUid)}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: userUid,
          accountName: accountName,
          amount: amount,
          method: "Pay2S · ACB ONE (28233851)",
          txCode: content || transId,
          webhookTxId: transId,
          status: "approved",
          createdAt: Date.now(),
          processedAt: Date.now()
        })
      });

      await fetch(`${FIREBASE_DB}/transactions/${encodeURIComponent(userUid)}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "webhook_deposit",
          title: fulfilledOrderId
            ? `Pay2S · Thanh toán QR đơn #${fulfilledOrderId} (+${amount.toLocaleString("vi-VN")}đ)`
            : `Pay2S · Nạp tự động ACB ONE (+${amount.toLocaleString("vi-VN")}đ)`,
          amount: amount,
          balanceAfter: newBalance,
          detail: `TK nhận: 28233851 (NGUYEN DAI QUOC DAT) · Nội dung: ${content}`,
          status: "completed",
          webhookTxId: transId,
          createdAt: Date.now()
        })
      });

      await fetch(`${FIREBASE_DB}/recharge_logs.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: transId,
          uid: userUid,
          accountName: accountName,
          amountVND: amount,
          balanceAdded: balanceToAdd,
          newBalance: newBalance,
          bank: "ACB",
          accountNo: "28233851",
          content: content,
          time: vnTime,
          status: "THÀNH CÔNG"
        })
      });

      return res.status(200).json({
        success: true,
        status: "success",
        message: "Xác nhận nạp tiền và cộng số dư thành công",
        uid: userUid,
        accountName: accountName,
        added: balanceToAdd,
        newBalance: newBalance,
        fulfilledOrderId: fulfilledOrderId,
        deliveredKey: deliveredKey
      });
    }

    return res.status(200).json({
      success: true,
      status: "ignored",
      message: "Không tìm thấy mã định danh UID / Tên tài khoản hoặc số tiền không hợp lệ",
      content_received: content,
      amount_received: amount
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Lỗi xử lý Webhook Pay2S: " + err.message
    });
  }
}