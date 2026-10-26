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
- `PORT=3001`, `FRONTEND_ORIGIN=http://localhost:3000`, `CORS_ORIGINS=http://localhost:3000`.

Có thể tạo từng khóa bằng lệnh dưới đây rồi lưu vào `.env` (không đưa khóa vào Git):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Frontend dùng `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` trong `apps/frontend/.env.local`. Dùng cùng hostname `localhost` cho trình duyệt và API để cookie đăng nhập hoạt động nhất quán.

## Chạy hằng ngày

```powershell
docker compose up -d
pnpm dev
```

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

## Kiểm tra

```powershell
pnpm --filter frontend typecheck
pnpm --filter frontend lint
pnpm --filter frontend test
pnpm --filter backend typecheck
```

Kiểm thử tích hợp và browser E2E cần database kiểm thử riêng. Xem tài liệu trong `docs/`; không trỏ các runner dọn dữ liệu kiểm thử vào database local đang dùng để phát triển.

Thiết kế và bằng chứng kiểm chứng: [Design system](docs/FRONTEND_DESIGN_SYSTEM.md), [Route audit](docs/FRONTEND_REDESIGN_AUDIT.md), [Delivery report](docs/FRONTEND_REDESIGN_REPORT.md).
