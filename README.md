# KEYNOVA · Firebase Key Store

Bộ website tĩnh gồm:

- `index.html`: cửa hàng cho khách, đọc nội dung từ Firebase, xem sản phẩm/danh mục/ảnh mẫu/feedback/bảng giá, tạo yêu cầu mua key và yêu cầu key free.
- `admin.html`: trang admin đăng nhập Firebase Authentication, chỉnh nội dung trang, quản lý danh mục/sản phẩm/ảnh mẫu/feedback, giá, kho key, chương trình free-link và xử lý đơn.
- `database.rules.json`: Rules cho Firebase Realtime Database.
- `storage.rules`: Rules Firebase Storage để ảnh chỉ được upload bởi UID admin được chỉ định.

Firebase SDK dùng ES modules CDN, phiên bản `12.19.0`; không cần npm build. Có thể upload các file lên hosting tĩnh như Cloudflare Pages, GitHub Pages (nếu cấu hình domain và HTTPS phù hợp), Netlify hoặc hosting riêng.

## Thiết lập bắt buộc trước khi chạy

### 1. Bật Firebase Authentication

Trong Firebase Console → Authentication → Sign-in method:

1. Bật **Email/Password** để tài khoản admin đăng nhập.
2. Bật **Anonymous** để khách gửi yêu cầu đặt key mà không cần tạo tài khoản.
3. Tạo tài khoản admin trong mục Users. Không thêm mật khẩu admin vào file HTML.

### 2. Cấp quyền admin

Trong Firebase Console → Authentication → Users, sao chép UID của tài khoản admin. Trong Realtime Database → Data, tạo node như sau (thay `ADMIN_UID` bằng UID thật):

```json
{
  "adminUsers": {
    "ADMIN_UID": true
  }
}
```

Không cấp `true` cho người dùng khác. Node `adminUsers` không cho phép ghi từ frontend.

### 3. Dán Realtime Database Rules

Firebase Console → Realtime Database → Rules: sao chép toàn bộ nội dung trong `database.rules.json` rồi Publish.

Rules này cho phép mọi người đọc nội dung cửa hàng ở `/store`, chỉ admin được ghi nội dung và đọc kho `/keyVault`, còn khách chỉ tạo đơn mới dưới UID anonymous của chính họ và chỉ đọc đơn của chính mình. Admin được đọc và xử lý toàn bộ đơn. Firebase kiểm tra quyền ở server, không dựa vào việc ẩn giao diện trong HTML.

### 4. Cấu hình Firebase Storage cho ảnh (nên làm)

Trong Firebase Console → Storage → Rules, dán nội dung `storage.rules`. Thay `REPLACE_WITH_ADMIN_UID` bằng đúng UID admin ở bước 2, rồi Publish. Quy tắc này cho phép đọc ảnh công khai, nhưng chỉ UID admin đã chỉ định mới được upload/xoá và chỉ nhận ảnh dưới 5 MB. Nếu chưa cấu hình Storage Rules, vẫn có thể dán URL ảnh HTTPS trong trang admin.

### 5. Đưa file lên hosting

Đưa `index.html` và `admin.html` lên cùng thư mục public. Mở `/admin.html` để đăng nhập. Sau khi vào được admin:

1. Mở **Nội dung trang** → bấm **Khởi tạo nội dung mặc định**.
2. Tạo danh mục.
3. Tạo sản phẩm và gán vào danh mục.
4. Mở **Bảng giá key**, chỉnh giá 1 ngày, 3 ngày, 7 ngày, 30 ngày, 90 ngày và vĩnh viễn.
5. Mở **Kho key**, chọn đúng sản phẩm + thời hạn rồi dán key (mỗi dòng một key).
6. Tạo ảnh mẫu, feedback và chương trình key free nếu cần.

Ảnh có thể dán bằng URL HTTPS công khai hoặc tải trực tiếp từ máy/điện thoại lên Firebase Storage. Muốn upload, cần cấu hình `storage.rules` với UID admin như hướng dẫn ở trên.

## Cách hoạt động của đơn hàng

- Khách gửi yêu cầu mua hoặc key free: đơn được tạo ở trạng thái `pending`.
- Admin đối soát bằng thông tin liên hệ, có thể bấm **Xác nhận** để chuyển thành `paid`.
- Bấm **Giao key** sẽ lấy một key còn trống khớp chính xác `productId + planId`, đánh dấu key đã giữ/giao, rồi ghi key vào đơn hàng.
- Kho key nằm riêng trong `/keyVault`; không đọc từ trang khách.

## Giới hạn cần biết về link free

Một trang HTML tĩnh không thể xác minh một cách đáng tin cậy rằng khách đã hoàn thành shortlink bên ngoài. Vì vậy, khách mở link rồi gửi yêu cầu nhận key; yêu cầu chờ admin kiểm tra trước khi giao. Nếu muốn tự động cấp key sau khi vượt link, cần tích hợp API/webhook xác thực của nhà cung cấp shortlink qua Cloudflare Worker/Pages Function hoặc Firebase Cloud Functions. Không nên coi nút “Tôi đã vượt link” ở frontend là bằng chứng xác thực.

## Cấu trúc dữ liệu chính

- `/store/settings`: tiêu đề, mô tả, thông báo, các nhãn và liên kết hiển thị trên `index.html`.
- `/store/categories`, `/store/products`, `/store/gallery`, `/store/reviews`, `/store/keyPlans`, `/store/freeOffers`: nội dung cửa hàng.
- `/keyVault/{productId}/{planId}/{keyId}`: kho key, admin-only.
- `/orders/{uid}/{orderId}`: yêu cầu mua/key free và trạng thái giao key.
- `/adminUsers/{uid}`: quyền quản trị được cài thủ công trong Console.

## Lưu ý

Firebase web config/API key nằm trong frontend là cấu hình nhận diện ứng dụng, không phải cơ chế bảo vệ dữ liệu. Bảo mật phải dựa vào Authentication, Realtime Database Security Rules và giới hạn quyền truy cập. Đừng publish với Rules mở toàn bộ database.
