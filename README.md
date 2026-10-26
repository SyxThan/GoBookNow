# GoBookNow

Monorepo gồm frontend Next.js, backend NestJS, PostgreSQL và Redis. Chạy các lệnh dưới đây bằng PowerShell tại thư mục gốc repository.

## Yêu cầu

- Node.js 22 và pnpm **11.24.0** (phiên bản khai báo trong `package.json`).
- Docker Desktop đang chạy, hỗ trợ Linux containers.

Nếu chưa có pnpm, cài phiên bản dự án dùng bằng `npm install -g pnpm@11.24.0`.

## Khởi tạo lần đầu

```powershell
cd D:\AIWebApplication\GoBookNow
pnpm install --frozen-lockfile

# Chỉ tạo file nếu chưa có, giữ nguyên cấu hình hiện tại.
if (!(Test-Path apps/backend/.env)) {
  Copy-Item apps/backend/.env.example apps/backend/.env
}
if (!(Test-Path apps/frontend/.env.local)) {
  Copy-Item apps/frontend/.env.example apps/frontend/.env.local
}

docker compose up -d
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma db seed
```

Đợi PostgreSQL báo `healthy` trong `docker compose ps` trước khi chạy migration nếu container vừa được tạo lần đầu.

`docker-compose.yml` khởi động PostgreSQL ở cổng **5432**, Redis ở **6379**. Cấu hình database trong `apps/backend/.env` phải khớp với file Compose. Bản `.env.example` đã có URL dành cho database local này.

Trước khi dùng tài khoản/vé, chỉnh trong `apps/backend/.env`:

- `JWT_ACCESS_SECRET`: khóa riêng của môi trường local, thay giá trị mẫu.
- `TICKET_TOKEN_SECRET`: khóa ngẫu nhiên tối thiểu **32 byte**, cần để tạo và kiểm tra vé QR.
- `PLATFORM_COMMISSION_BPS=1000`: phí nền tảng 10% theo cấu hình mẫu; bắt buộc là số nguyên từ `0` đến `10000` (`0` là 0%, `10000` là 100%). File `.env` cũ cần bổ sung dòng này nếu chưa có.
- `PORT=3001`, `FRONTEND_ORIGIN=http://localhost:3000`, `CORS_ORIGINS=http://localhost:3000`.

Có thể tạo từng khóa bằng lệnh dưới đây rồi lưu vào `.env` (không đưa khóa vào Git):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Frontend dùng `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` trong `apps/frontend/.env.local`. Dùng cùng hostname `localhost` cho trình duyệt và API để cookie đăng nhập hoạt động nhất quán.

Sau khi chỉnh `.env`, khởi động lại backend để nạp cấu hình mới. Nếu thiếu hoặc sai `PLATFORM_COMMISSION_BPS`, backend sẽ từ chối khởi động và ghi sự kiện `booking.configuration.invalid` với mã `PLATFORM_COMMISSION_BPS_INVALID`, thay vì đợi đến thao tác giữ chỗ mới trả lỗi 500.

`TICKET_TOKEN_SECRET` cũng được kiểm tra khi khởi động: thiếu hoặc ngắn hơn 32 byte
sẽ ghi `ticket.configuration.invalid` với mã `TICKET_TOKEN_SECRET_INVALID`. Giữ
khóa này ổn định giữa các lần chạy để QR đã tải vẫn xác thực được; không tạo lại
khóa mỗi lần mở ứng dụng. Sau khi bổ sung khóa còn thiếu, có thể mở lại QR của vé
đã mua mà không cần thanh toán hay cấp vé lại.

## Chạy hằng ngày

```powershell
docker compose up -d
pnpm dev
```

`pnpm dev` chạy trực tiếp hai workspace bằng pnpm với log có tiền tố `backend` / `frontend`. Lệnh dev không phụ thuộc vào binary Turbo trên Windows; Turbo vẫn dùng cho build/lint/test.

Nếu gặp mã thoát `3221226505` (`0xC0000409`) ngay sau dòng `turbo`, đó là tiến trình native dừng kiểu fail-fast, không phải bằng chứng migration hay seed bị lỗi. Bản hiện tại đã chuyển lệnh dev sang pnpm để tránh lớp khởi động này. Không cần xóa database, cài lại dependencies hoặc nâng Turbo để chạy dev.

Cảnh báo Compose về các container `postgres-e2e`, `postgres-integration`, `redis-security` là do các file Compose kiểm thử cùng tồn tại với file Compose dev; không cần dùng `--remove-orphans` để chạy ứng dụng.

Nếu Next báo một dev server khác đang chạy trong cùng repository, dừng terminal Next cũ bằng `Ctrl+C` trước.

Hoặc mở hai terminal riêng ở thư mục gốc:

```powershell
# Terminal 1
pnpm dev:backend
```

```powershell
# Terminal 2
pnpm dev:frontend
```

| Thành phần | Địa chỉ |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/docs |
| Health | http://localhost:3001/api/v1/health |

Sau khi cập nhật code có migration mới, chạy lại `pnpm --filter backend exec prisma migrate deploy`. Dừng ứng dụng bằng `Ctrl+C`; `docker compose stop` dừng PostgreSQL/Redis mà giữ dữ liệu.

## Thanh toán, hình ảnh và dữ liệu ban đầu

Giao diện và đăng ký/đăng nhập local không cần khóa của nhà cung cấp bên ngoài. Để dùng đầy đủ:

- Thanh toán: cấu hình SePay sandbox (`SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_IPN_SECRET`) và ba URL kết quả theo `.env.example`. Webhook từ nhà cung cấp cần một địa chỉ backend mà nhà cung cấp truy cập được; `localhost` chỉ dùng trên máy bạn.
- Upload ảnh dịch vụ: cấu hình các khóa Cloudinary trong backend `.env`.
- Tài liệu xét duyệt đối tác dùng luồng lưu trữ riêng của backend; không đặt khóa bí mật vào biến `NEXT_PUBLIC_*`.

Seed tạo các role hệ thống và danh mục; **không tạo tài khoản Admin/Vendor hoặc dịch vụ mẫu**. Danh sách trải nghiệm có thể rỗng cho đến khi đối tác được duyệt, xuất bản dịch vụ và mở lịch. Không có tài khoản/mật khẩu mặc định để đăng nhập Admin.

## Thử thanh toán SePay sandbox trên máy local

Sandbox vẫn gửi IPN thật để xác nhận booking và cấp vé. Trang SePay báo thành công
hoặc URL có `return=success` chưa đủ để GoBookNow xác nhận thanh toán.

1. Chạy `pnpm dev`; backend cần `SEPAY_ENV=sandbox` và các khóa sandbox trong `.env`.
2. Ở terminal thứ hai, chạy proxy chỉ nhận IPN có xác thực:

   ```powershell
   pnpm --filter backend payments:ipn-proxy
   ```

3. Ở terminal thứ ba, mở ngrok tới proxy (cần ngrok đã đăng nhập/cấu hình trên máy):

   ```powershell
   ngrok http http://127.0.0.1:3010 --inspect=false
   ```

4. Trong SePay **sandbox → Cổng thanh toán → Cấu hình → IPN**, đặt URL:
   `https://TEN-MIEN-NGROK/api/v1/webhooks/sepay/ipn`. Chọn xác thực `SECRET_KEY`
   và dùng cùng giá trị `SEPAY_IPN_SECRET` của backend. Không dùng `localhost` làm IPN URL.
5. Khởi động lại backend sau khi đổi `.env`, tạo một lần giữ chỗ mới và thanh toán
   trong thời hạn giữ chỗ. Backend nhận IPN hợp lệ sẽ xác nhận booking và cấp vé;
   trang `/payment/result` đọc trạng thái này và hiện nút xem vé.

Ba callback `SEPAY_SUCCESS_URL`, `SEPAY_ERROR_URL`, `SEPAY_CANCEL_URL` mặc định về
`FRONTEND_ORIGIN/payment/result`, có thêm `paymentId` và thông tin kết quả trả về.
Trên cùng máy local có thể dùng `http://localhost:3000/payment/result`; IPN dùng
HTTPS công khai riêng. Các checkout SePay đã mở trước khi sửa callback không tự
đổi URL: cần khởi tạo checkout mới. IPN đến sau khi hold hết hạn được xử lý theo
luồng đối soát/hoàn tiền, không tự cấp vé cho hold đã hết hạn.

Giữ terminal proxy và ngrok chạy khi thử thanh toán; cập nhật IPN trong SePay nếu
URL ngrok thay đổi. Proxy chỉ mở đúng `POST /api/v1/webhooks/sepay/ipn`, giới hạn
payload 32 KiB và không mở các API quản trị/Swagger. Dừng cả hai bằng `Ctrl+C` khi
kết thúc. Test proxy bằng `pnpm --filter backend test:ipn-proxy`.

## Kiểm tra

```powershell
pnpm --filter frontend typecheck
pnpm --filter frontend lint
pnpm --filter frontend test
pnpm --filter backend typecheck
```

Kiểm thử tích hợp và browser E2E cần database kiểm thử riêng. Xem tài liệu trong `docs/`; không trỏ các runner dọn dữ liệu kiểm thử vào database local đang dùng để phát triển.

Thiết kế và bằng chứng kiểm chứng: [Design system](docs/FRONTEND_DESIGN_SYSTEM.md), [Route audit](docs/FRONTEND_REDESIGN_AUDIT.md), [Delivery report](docs/FRONTEND_REDESIGN_REPORT.md).
