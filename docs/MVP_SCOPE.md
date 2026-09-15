# GoBook — MVP Scope

> Version: `v1.0.0-MVP`  
> Project type: Booking + Ticketing Platform  
> Development model: Solo developer  
> Development period: 60 days  
> Primary market: Vietnam  
> Payment gateway in MVP: VNPay Sandbox / VNPay  
> Repository workflow: Issue → Feature Branch → Pull Request → CI → `develop` → Release → `production`

---

# 1. Product Overview

GoBook là nền tảng trung gian cho phép các nhà cung cấp dịch vụ hoặc đơn vị tổ chức sự kiện:

- Đăng dịch vụ hoặc sự kiện.
- Tạo các khung giờ có thể đặt.
- Cấu hình số lượng chỗ.
- Thiết lập giá.
- Nhận booking từ khách hàng.
- Nhận thanh toán trực tuyến.
- Phát hành vé QR.
- Check-in khách hàng.
- Theo dõi booking và doanh thu.

Khách hàng có thể:

- Tìm kiếm dịch vụ.
- Chọn thời gian.
- Giữ chỗ tạm thời.
- Thanh toán.
- Nhận vé.
- Hủy booking theo chính sách.
- Theo dõi trạng thái hoàn tiền.
- Đánh giá dịch vụ sau khi hoàn tất.

Admin chịu trách nhiệm:

- Duyệt vendor.
- Giám sát booking.
- Giám sát payment.
- Xử lý các trường hợp bất thường.
- Quản lý danh mục.

---

# 2. Product Vision

GoBook hướng tới việc xây dựng một booking engine dùng chung cho nhiều loại hình dịch vụ.

Thay vì xây dựng hệ thống riêng cho từng ngành:

```text
Spa Booking
Gym Booking
Workshop Ticketing
Football Field Booking
Class Booking
Clinic Booking
```

GoBook sử dụng một abstraction chung:

```text
Vendor
   ↓
Service / Event
   ↓
Slot
   ↓
Reservation
   ↓
Booking
   ↓
Payment
   ↓
Ticket
```

MVP tập trung chứng minh kiến trúc này hoạt động ổn định.

---

# 3. MVP Goal

Mục tiêu lớn nhất của MVP:

> Một khách hàng có thể tìm một dịch vụ, giữ một slot còn chỗ, thanh toán bằng VNPay, nhận vé QR và check-in mà không xảy ra overselling hoặc double-booking.

MVP phải chứng minh được các vấn đề kỹ thuật quan trọng:

- Authentication.
- Authorization.
- Transaction.
- Concurrency.
- Reservation timeout.
- Payment.
- Payment callback.
- Idempotency.
- Ticketing.
- Cancellation.
- Refund domain.
- Voucher.
- Commission.
- Logging.
- CI/CD.
- Deployment.

---

# 4. MVP Success Criteria

MVP được xem là hoàn thành khi tất cả các điều kiện sau đạt được.

## Functional

Customer có thể hoàn thành:

```text
Register
→ Login
→ Search
→ View Service
→ Select Slot
→ Hold Reservation
→ Pay VNPay
→ Booking Confirmed
→ Receive Ticket
→ Check-in
```

Vendor có thể:

```text
Register
→ Apply Vendor
→ Approved
→ Create Service
→ Create Slot
→ Receive Booking
→ Check-in Customer
→ View Revenue
```

Admin có thể:

```text
Login
→ Approve Vendor
→ View Transactions
→ View Bookings
→ Inspect Payment
```

## Technical

Hệ thống phải đảm bảo:

```text
Overselling = 0
Duplicate payment processing = 0
Duplicate ticket check-in = 0
Unauthorized resource access = 0
```

trong các test case đã định nghĩa.

---

# 5. Personas

## 5.1 Customer

Người dùng cuối muốn đặt một dịch vụ hoặc vé sự kiện.

Customer cần:

- Tìm dịch vụ.
- Kiểm tra thời gian trống.
- Đặt chỗ.
- Thanh toán.
- Quản lý booking.
- Nhận vé.
- Hủy booking.
- Đánh giá.

---

## 5.2 Vendor

Vendor là:

- Cá nhân.
- Tổ chức.
- Doanh nghiệp.
- Nhà tổ chức.

Vendor cần:

- Quản lý profile.
- Quản lý service.
- Quản lý slot.
- Quản lý khách đặt.
- Check-in.
- Theo dõi doanh thu.

---

## 5.3 Admin

Admin vận hành nền tảng.

Admin cần:

- Duyệt vendor.
- Kiểm tra booking.
- Kiểm tra payment.
- Theo dõi transaction.
- Quản lý category.
- Điều tra lỗi.

---

# 6. Roles

MVP có ba role.

```text
CUSTOMER
VENDOR
ADMIN
```

Một user mặc định:

```text
CUSTOMER
```

Vendor application được duyệt:

```text
CUSTOMER
+
VENDOR
```

Admin được seed hoặc cấu hình trực tiếp.

---

# 7. Authentication Scope

## Included

MVP hỗ trợ:

- Register.
- Login.
- Logout.
- Access Token.
- Refresh Token.
- Password hashing.
- Refresh token revoke.
- Role validation.
- Ownership validation.

Optional nếu còn thời gian:

- Google OAuth.

## Out of Scope

Không triển khai trong MVP:

- Facebook OAuth.
- Apple Login.
- Passwordless.
- MFA.
- Enterprise SSO.

---

# 8. Vendor Scope

## Vendor Profile

Vendor có:

```text
id
owner_user_id
business_name
description
phone
email
address
status
created_at
updated_at
```

Vendor Status:

```text
PENDING
APPROVED
REJECTED
SUSPENDED
```

---

# 9. Vendor Application

User muốn trở thành vendor phải gửi application.

Application gồm:

```text
businessName
businessType
description
phone
email
address
identityDocument
businessDocument
```

MVP không xác minh KYC qua bên thứ ba.

Admin chỉ thực hiện manual review.

Flow:

```text
User
 ↓
Submit Application
 ↓
PENDING
 ↓
Admin Review
 ├── APPROVED
 └── REJECTED
```

---

# 10. Category Scope

Admin quản lý category.

Ví dụ:

```text
EVENT
WORKSHOP
SPA
SPORT
CLASS
GYM
OTHER
```

Category hỗ trợ:

- Create.
- Update.
- Hide.
- List.

Không cần nested category trong MVP.

---

# 11. Service / Event Model

MVP sử dụng entity chung:

```text
Service
```

Service có thể đại diện:

- Event.
- Workshop.
- Spa service.
- Sport field.
- Training class.
- Appointment.

Service gồm:

```text
id
vendor_id
category_id
name
slug
short_description
description
address
location_text
status
created_at
updated_at
```

Status:

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

---

# 12. Service Images

Vendor có thể upload nhiều ảnh.

Ảnh được lưu ngoài application server:

```text
Cloudinary
hoặc
S3-compatible storage
```

Database chỉ lưu:

```text
url
public_id / storage_key
position
```

Không lưu binary trực tiếp trong PostgreSQL.

---

# 13. Slot Model

Slot là một khoảng thời gian có thể được đặt.

Ví dụ:

```text
Service:
Sân bóng A

Slot:
18:00 - 20:00

Capacity:
1
```

hoặc:

```text
Workshop Python

Slot:
08:00 - 11:00

Capacity:
50
```

Slot gồm:

```text
id
service_id
start_time
end_time
capacity
reserved_quantity
confirmed_quantity
price
status
```

Slot status:

```text
AVAILABLE
DISABLED
CLOSED
```

---

# 14. Slot Rules

Một slot phải đảm bảo:

```text
start_time < end_time
capacity > 0
price >= 0
```

Vendor không được:

- Quản lý slot của vendor khác.
- Giảm capacity thấp hơn số chỗ đã confirmed.
- Xóa slot đã có booking confirmed.

Nếu slot đã có lịch sử booking:

```text
soft delete / disabled
```

thay vì physical delete.

---

# 15. Money Representation

Không sử dụng floating point cho tiền.

Sai:

```text
199.99
```

Đúng:

```text
199000
```

VND được lưu bằng:

```text
BIGINT
```

Các field tài chính:

```text
unit_price
subtotal
discount_amount
gross_amount
platform_fee
vendor_amount
refund_amount
```

---

# 16. Price Snapshot

Giá phải được snapshot tại thời điểm booking.

Ví dụ:

```text
Slot price hiện tại:
200,000 VND
```

Customer booking:

```text
unit_price_snapshot = 200000
```

Vendor đổi giá sau đó:

```text
250000
```

Booking cũ vẫn:

```text
200000
```

---

# 17. Booking Domain

Booking gồm:

```text
Booking
BookingItem
Reservation
```

Không gộp cả ba thành một table.

---

# 18. Booking Model

Booking gồm:

```text
id
code
customer_id
vendor_id
status
subtotal
discount_amount
gross_amount
platform_fee
vendor_amount
currency
expires_at
confirmed_at
cancelled_at
created_at
updated_at
```

MVP currency:

```text
VND
```

---

# 19. Booking State Machine

Booking state:

```text
DRAFT
HELD
PENDING_PAYMENT
CONFIRMED
COMPLETED
CANCELLED
EXPIRED
```

Flow chính:

```text
DRAFT
 ↓
HELD
 ↓
PENDING_PAYMENT
 ↓
CONFIRMED
 ↓
COMPLETED
```

Timeout:

```text
HELD
 ↓
EXPIRED
```

Payment timeout:

```text
PENDING_PAYMENT
 ↓
EXPIRED
```

Cancellation:

```text
CONFIRMED
 ↓
CANCELLED
```

---

# 20. Reservation

Reservation là tài nguyên giữ chỗ tạm thời.

Ví dụ:

```text
Slot capacity = 10
Confirmed = 5
Held = 3

Available = 2
```

Công thức:

```text
available
=
capacity
-
confirmed
-
active_reservation
```

---

# 21. Reservation TTL

Reservation có TTL.

MVP mặc định:

```text
10 minutes
```

Có thể config bằng environment variable:

```text
BOOKING_HOLD_MINUTES=10
```

Flow:

```text
Create Reservation
 ↓
expires_at = now + 10m
 ↓
Customer payment
```

Nếu hết thời gian:

```text
Reservation → EXPIRED
Booking → EXPIRED
Capacity released
```

---

# 22. Source of Truth

PostgreSQL là nguồn dữ liệu chính.

Redis không phải source of truth.

Redis có thể dùng để:

- Queue.
- Delay jobs.
- TTL assistance.
- Cache.
- Distributed coordination.

Nếu Redis mất dữ liệu:

```text
PostgreSQL
```

vẫn phải xác định được trạng thái booking chính xác.

---

# 23. Concurrency Requirement

Đây là requirement bắt buộc.

Ví dụ:

```text
capacity = 1
```

hai request đồng thời:

```text
Customer A
Customer B
```

Kết quả đúng:

```text
1 SUCCESS
1 SOLD_OUT
```

Không bao giờ:

```text
2 SUCCESS
```

---

# 24. Booking Transaction Requirement

Khi tạo reservation:

```text
BEGIN TRANSACTION

Lock slot / atomic update

Check available capacity

IF enough capacity:
    create reservation
    create booking
ELSE:
    reject

COMMIT
```

Có thể triển khai bằng:

```text
SELECT ... FOR UPDATE
```

hoặc conditional atomic update.

---

# 25. Concurrency Test Requirement

Phải có automated test.

Scenario:

```text
capacity = 10
requests = 100
quantity/request = 1
```

Expected:

```text
successful reservations = 10
failed reservations = 90
oversold = 0
```

---

# 26. Payment Scope

MVP chỉ tích hợp:

```text
VNPay
```

Không tích hợp:

- MoMo.
- ZaloPay.
- Stripe.
- PayPal.

---

# 27. Payment Model

Payment tách khỏi Booking.

Một Booking có thể có nhiều PaymentAttempt.

Ví dụ:

```text
Booking
 ├── Attempt #1 FAILED
 ├── Attempt #2 FAILED
 └── Attempt #3 SUCCESS
```

---

# 28. Payment Status

Payment status:

```text
INITIATED
PENDING
SUCCESS
FAILED
EXPIRED
REFUND_PENDING
PARTIAL_REFUNDED
REFUNDED
```

---

# 29. Payment Attempt

PaymentAttempt lưu:

```text
id
payment_id
gateway
gateway_transaction_id
request_reference
amount
status
requested_at
completed_at
failure_reason
```

---

# 30. Payment Flow

Flow:

```text
Customer
 ↓
Booking HELD
 ↓
Create Payment
 ↓
Booking PENDING_PAYMENT
 ↓
Create VNPay URL
 ↓
Redirect VNPay
 ↓
Customer Payment
 ↓
VNPay Return URL
+
VNPay IPN
```

---

# 31. Return URL

Return URL chỉ dùng để hiển thị UI.

Không được dùng:

```text
Return URL
→ mark payment SUCCESS
```

Browser có thể bị:

- Refresh.
- Modify URL.
- Close.
- Replay.

Frontend sau Return URL nên:

```text
GET /payments/{id}
```

để lấy trạng thái backend.

---

# 32. VNPay IPN

IPN là nguồn xác nhận payment.

Backend phải kiểm tra:

```text
signature
transaction reference
amount
payment status
booking existence
existing payment status
```

Sau khi verify thành công:

```text
Payment → SUCCESS
Booking → CONFIRMED
Reservation → CONSUMED
```

---

# 33. Payment Idempotency

VNPay có thể gửi callback nhiều lần.

Ví dụ:

```text
Callback 1
Callback 2
Callback 3
```

Backend chỉ được xử lý business side-effect một lần.

Unique constraint nên có trên:

```text
gateway_transaction_id
```

hoặc transaction reference phù hợp.

---

# 34. Payment Webhook Log

Tất cả callback phải được lưu.

```text
payment_webhook_logs
```

Lưu:

```text
provider
transaction_ref
payload
signature_valid
processing_status
received_at
processed_at
error_message
```

Mục đích:

- Audit.
- Debug.
- Reconciliation.
- Incident investigation.

---

# 35. Payment Late Success

Case:

```text
Booking expired
↓
Payment success callback tới muộn
```

Backend không được tự động confirm một slot đã được bán cho người khác.

MVP phải:

```text
mark transaction as NEEDS_REVIEW
```

hoặc một trạng thái exception tương đương.

Không recreate booking tự động.

---

# 36. Payment Failure

Khi payment failed:

Booking có thể vẫn giữ reservation cho đến:

```text
expires_at
```

Customer có thể thử thanh toán lại nếu reservation còn hiệu lực.

---

# 37. Ticket Scope

Sau khi booking `CONFIRMED`:

```text
Ticket
```

được tạo.

Ticket gồm:

```text
id
booking_id
booking_item_id
token
status
checked_in_at
created_at
```

---

# 38. Ticket Status

```text
ACTIVE
CHECKED_IN
CANCELLED
EXPIRED
```

---

# 39. QR Ticket

QR không chứa dữ liệu nhạy cảm.

Không nên:

```text
{
  userId,
  phone,
  email,
  paymentId
}
```

QR chỉ chứa:

```text
opaque random token
```

hoặc URL chứa token.

Ví dụ:

```text
https://gobook.app/ticket/verify/{token}
```

---

# 40. Check-in

Vendor hoặc staff có thể scan QR.

Backend kiểm tra:

```text
ticket exists
ticket belongs to vendor
ticket ACTIVE
event/slot valid
booking CONFIRMED
```

Nếu hợp lệ:

```text
ACTIVE
 ↓
CHECKED_IN
```

---

# 41. Duplicate Check-in

Nếu cùng QR được scan đồng thời:

```text
Request A
Request B
```

chỉ một request được transition ticket:

```text
ACTIVE → CHECKED_IN
```

Request còn lại trả:

```text
ALREADY_CHECKED_IN
```

---

# 42. Cancellation Policy

Vendor cấu hình cancellation policy.

MVP hỗ trợ ví dụ:

```text
>= 24h:
100%

< 24h:
50%

After start time:
0%
```

Policy phải được snapshot khi booking confirm.

---

# 43. Cancellation Request

Customer chỉ có thể cancel:

```text
CONFIRMED
```

và trước thời gian cho phép.

Flow:

```text
Customer Cancel
 ↓
Evaluate Policy
 ↓
Calculate Refund
 ↓
Booking CANCELLED
 ↓
Ticket CANCELLED
 ↓
Refund Record
```

---

# 44. Refund Scope

MVP xây dựng đầy đủ refund domain.

Hỗ trợ:

```text
FULL
PARTIAL
```

Refund gồm:

```text
id
payment_id
booking_id
amount
reason
status
gateway_ref
created_at
completed_at
```

Status:

```text
PENDING
PROCESSING
SUCCESS
FAILED
```

Việc gọi refund API thật phụ thuộc capability sandbox của VNPay.

Nếu sandbox không hỗ trợ đầy đủ:

```text
mock gateway adapter
```

được phép dùng để chứng minh workflow.

---

# 45. Voucher

MVP hỗ trợ hai loại:

```text
FIXED
PERCENTAGE
```

Ví dụ:

```text
FIXED:
50,000 VND

PERCENTAGE:
10%
```

---

# 46. Voucher Fields

Voucher:

```text
code
type
value
max_discount
min_order_value
usage_limit
per_user_limit
start_at
end_at
status
vendor_id nullable
```

---

# 47. Voucher Validation

Validate:

```text
exists
active
not expired
started
usage available
user limit
minimum order
vendor/service eligibility
```

---

# 48. Voucher Concurrency

Nếu:

```text
remaining_usage = 1
```

và hai user dùng đồng thời:

```text
User A
User B
```

chỉ một người được consume voucher.

---

# 49. Commission

MVP tính:

```text
platform_fee
vendor_amount
```

Ví dụ:

```text
Gross:
1,000,000

Commission:
10%

Platform:
100,000

Vendor:
900,000
```

---

# 50. Commission Snapshot

Booking lưu:

```text
commission_rate
platform_fee
vendor_amount
```

Không tính lại từ config hiện tại.

---

# 51. Search

Customer có thể filter theo:

```text
keyword
category
date
minPrice
maxPrice
locationText
```

Có:

```text
pagination
sorting
```

Sorting MVP:

```text
newest
price_asc
price_desc
```

---

# 52. Search Out of Scope

Không làm MVP:

- Elasticsearch.
- Full GIS search.
- Geo radius query.
- AI recommendation.
- Semantic search.
- Personalized ranking.

---

# 53. Review

Customer chỉ được review khi:

```text
Booking = COMPLETED
```

Một booking:

```text
maximum 1 review
```

Review:

```text
rating: 1..5
comment
created_at
```

Vendor được xem review.

Vendor reply có thể để phase sau.

---

# 54. Vendor Dashboard

MVP dashboard gồm:

```text
total bookings
confirmed bookings
cancelled bookings
gross revenue
platform fee
vendor revenue
occupancy
cancellation rate
```

Không cần real-time WebSocket.

---

# 55. Admin Transaction Dashboard

Admin xem:

```text
paymentId
bookingCode
customer
vendor
gateway
gatewayTransactionId
amount
paymentStatus
createdAt
```

Filter:

```text
transaction
booking code
status
date
```

---

# 56. Admin Booking Dashboard

Admin có thể:

- Search booking.
- Xem booking status.
- Xem reservation.
- Xem payment.
- Xem ticket.
- Xem refund.

Admin không được trực tiếp chỉnh số tiền tùy ý.

---

# 57. Notification Scope

MVP ưu tiên:

```text
Email
```

Notification events:

```text
vendor approved
booking confirmed
payment failed
booking cancelled
refund completed
booking reminder optional
```

---

# 58. Async Processing

BullMQ + Redis dùng cho:

```text
reservation expiration
email sending
payment-related retry jobs
scheduled cleanup
```

Không sử dụng Kafka trong MVP.

---

# 59. Audit Log

Các action quan trọng cần audit:

```text
vendor approved
vendor rejected
booking cancelled
refund created
ticket checked in
admin action
```

AuditLog:

```text
actor_id
action
entity_type
entity_id
metadata
created_at
```

---

# 60. Logging

Backend log dạng structured.

Context quan trọng:

```text
requestId
userId
bookingId
paymentId
transactionId
ticketId
```

Không log:

```text
password
refresh token
payment secret
full sensitive callback credentials
```

---

# 61. API Documentation

NestJS Swagger bắt buộc.

Swagger cần mô tả:

```text
request
response
validation errors
authorization
status codes
```

Endpoint quan trọng phải có example.

---

# 62. Validation

Backend không được tin frontend.

Validation bắt buộc cho:

```text
body
params
query
pagination
money
date/time
enum
UUID
```

---

# 63. Authorization

Phải test ownership.

Ví dụ:

```text
Vendor A
```

không được:

```text
update Service Vendor B
```

Customer A không được:

```text
GET Booking Customer B
```

Vendor không được:

```text
call Admin API
```

---

# 64. Security MVP

Bao gồm:

```text
Helmet
CORS
Rate Limit
JWT Validation
Input Validation
Password Hashing
Secret via Environment
Webhook Signature Validation
Ownership Validation
```

---

# 65. Rate Limiting

Ưu tiên rate-limit:

```text
/login
/register
/payment
/voucher/validate
/webhook exception based on provider
```

Webhook endpoint không được dùng cùng rate rule với browser API nếu gây block provider.

---

# 66. Database

Database:

```text
PostgreSQL
```

ORM:

```text
Prisma
```

Core tables:

```text
users
refresh_tokens

vendors
vendor_applications

categories
services
service_images
slots

bookings
booking_items
reservations

payments
payment_attempts
payment_webhook_logs

tickets
checkins

vouchers
voucher_usages

refunds

reviews

notifications

audit_logs
```

---

# 67. Soft Delete

Không hard delete các entity đã có transaction history.

Áp dụng cho:

```text
Service
Slot
Vendor
```

Ưu tiên:

```text
status
deleted_at
```

---

# 68. Database Indexes

Ít nhất cần index cho:

```text
users.email

services.vendor_id
services.category_id
services.status

slots.service_id
slots.start_time

bookings.customer_id
bookings.vendor_id
bookings.status
bookings.code

payments.booking_id
payments.status

payment_attempts.gateway_transaction_id

tickets.token

vouchers.code

reviews.service_id
```

---

# 69. Database Constraints

Database phải hỗ trợ bảo vệ cuối cùng.

Ví dụ:

```text
users.email UNIQUE

bookings.code UNIQUE

tickets.token UNIQUE

vouchers.code UNIQUE

gateway_transaction_id UNIQUE when applicable
```

---

# 70. API Architecture

Backend modular:

```text
src/
├── auth/
├── users/
├── vendors/
├── categories/
├── services/
├── slots/
├── bookings/
├── payments/
├── tickets/
├── vouchers/
├── refunds/
├── reviews/
├── notifications/
├── admin/
├── audit/
└── common/
```

---

# 71. Payment Adapter

Không gọi VNPay khắp business layer.

Tạo interface:

```text
PaymentGateway
```

Ví dụ:

```text
createPayment()
verifyCallback()
queryPayment()
refund()
```

Implementation:

```text
VNPayGateway
```

Điều này giúp thêm MoMo sau MVP mà không sửa toàn bộ BookingService.

---

# 72. Storage Adapter

Tương tự:

```text
FileStorage
```

Implementation:

```text
CloudinaryStorage
```

hoặc:

```text
S3Storage
```

---

# 73. Frontend Main Pages

Customer:

```text
/
 /services
 /services/[slug]
 /checkout/[bookingId]
 /payment/result
 /my-bookings
 /tickets/[id]
```

Vendor:

```text
/vendor
/vendor/services
/vendor/services/new
/vendor/services/[id]
/vendor/slots
/vendor/bookings
/vendor/checkin
/vendor/dashboard
```

Admin:

```text
/admin
/admin/vendors
/admin/bookings
/admin/transactions
/admin/categories
```

---

# 74. UI Priorities

Ưu tiên:

```text
correct
clear
responsive
usable
```

trước:

```text
animation
complex visual effects
perfect branding
```

---

# 75. Responsive Scope

MVP phải dùng được trên:

```text
desktop
tablet
mobile browser
```

Không phát triển native mobile app.

---

# 76. Testing Scope

Bắt buộc:

## Unit Test

Ưu tiên:

```text
pricing
voucher
commission
cancellation policy
state transition
refund calculation
```

## Integration Test

Ưu tiên:

```text
reservation transaction
booking
payment
expiration
voucher usage
```

## Concurrency Test

Bắt buộc:

```text
slot booking
voucher usage
ticket check-in
```

## E2E Test

Critical flow:

```text
register
login
search
select slot
hold
payment
confirm
ticket
```

---

# 77. Payment Edge Cases

MVP phải test:

```text
payment success
payment failed
duplicate IPN
invalid signature
wrong amount
wrong order
booking expired before callback
late callback
duplicate transaction ID
customer closes payment page
payment retry
```

---

# 78. Reservation Edge Cases

Phải test:

```text
capacity = 0
quantity > available
reservation timeout
concurrent reservation
slot disabled
slot expired
service hidden
booking retry
```

---

# 79. Ticket Edge Cases

Phải test:

```text
invalid token
cancelled ticket
already checked-in
wrong vendor
expired slot
concurrent scans
```

---

# 80. Voucher Edge Cases

Phải test:

```text
expired
not started
usage exhausted
per-user limit
minimum order fail
maximum discount
concurrent final usage
```

---

# 81. CI Pipeline

Pull Request phải chạy:

```text
install
lint
typecheck
unit tests
build
```

Khi test infrastructure ổn định:

```text
integration tests
```

---

# 82. Branch Strategy

Permanent branches:

```text
production
develop
```

Temporary branches:

```text
feat/*
fix/*
refactor/*
test/*
docs/*
chore/*
hotfix/*
release/*
```

---

# 83. Merge Rules

Không push trực tiếp:

```text
production
develop
```

Mọi thay đổi feature:

```text
Issue
 ↓
Branch
 ↓
Commit
 ↓
PR
 ↓
CI
 ↓
Self Review
 ↓
Merge
```

---

# 84. Commit Convention

Sử dụng Conventional Commits:

```text
feat:
fix:
test:
docs:
refactor:
chore:
perf:
ci:
```

Ví dụ:

```text
feat(booking): implement reservation expiration

fix(payment): prevent duplicate IPN processing

test(booking): add concurrent booking test
```

---

# 85. Definition of Ready

Một issue chỉ bắt đầu code khi có:

```text
problem
expected behavior
acceptance criteria
dependencies
business rules
edge cases
```

---

# 86. Definition of Done

Feature chỉ Done khi:

```text
Implementation completed
Validation completed
Authorization checked
Error handling added
Tests added
Migration reviewed
Swagger updated
Logs added if required
CI passed
PR reviewed
Merged into develop
```

---

# 87. Environment

Ba môi trường:

```text
local
staging
production
```

---

# 88. Staging

Branch:

```text
develop
```

deploy đến staging.

Staging dùng để:

- Test migration.
- Test payment sandbox.
- E2E.
- Smoke test.
- Demo.

---

# 89. Production

Branch:

```text
production
```

Chỉ merge từ:

```text
release/*
hotfix/*
```

---

# 90. Release

Release flow:

```text
develop
 ↓
release/v1.0.0
 ↓
staging verification
 ↓
PR → production
 ↓
CI
 ↓
deploy
 ↓
tag v1.0.0
```

---

# 91. Deployment Scope

Recommended:

Frontend:

```text
Vercel
```

Backend:

```text
VPS
hoặc
Render/Railway
```

Database:

```text
Managed PostgreSQL
```

Redis:

```text
Managed Redis
```

---

# 92. Docker

Backend phải có production Dockerfile.

Yêu cầu:

```text
multi-stage build
non-development dependencies
healthcheck
environment-based config
```

---

# 93. Health Check

Endpoint:

```text
GET /health
```

Kiểm tra tối thiểu:

```text
API
Database
```

Optional:

```text
Redis
```

---

# 94. Monitoring

Sentry:

```text
Frontend
Backend
```

Logs phải đủ để trace:

```text
HTTP Request
→ Booking
→ Payment
→ Ticket
```

---

# 95. Backup

Trước production phải có plan cho:

```text
PostgreSQL backup
restore
migration rollback
```

Không cần tự xây backup engine.

Sử dụng provider-managed backup nếu khả dụng.

---

# 96. Performance Goals

Không đặt mục tiêu hyperscale.

MVP target:

```text
100 concurrent booking requests test
```

Booking critical section không được oversell.

API thông thường nên phản hồi trong thời gian hợp lý ở staging.

Không yêu cầu SLA production enterprise.

---

# 97. Observability Goal

Khi một payment lỗi, developer phải xác định được:

```text
customer
booking
payment
attempt
gateway transaction
webhook
status transition
error
```

không cần trực tiếp query thủ công nhiều bảng rời rạc.

---

# 98. Explicitly Out of Scope

Không nằm trong MVP:

```text
Multi-payment gateway
MoMo
ZaloPay
Stripe

Internal wallet
Wallet top-up

Automatic bank payout

Electronic invoice integration

Real KYC provider

SMS

Push notification

Native mobile app

Multi-currency

Multiple language UI

AI recommendation

AI fraud detection

Advanced dispute system

Escrow system

Affiliate

Subscription billing

Seat map

Dynamic pricing AI

Kafka

Microservices

Kubernetes

Elasticsearch

Advanced GIS

Realtime WebSocket analytics
```

---

# 99. Deferred to v1.1

Có thể đưa vào v1.1:

```text
MoMo
Wallet
Automatic Refund Adapter
Vendor Payout
Vendor Review Reply
Advanced Notification
Google OAuth
Favorite Service
Ticket Transfer
```

---

# 100. Deferred to v2

```text
Multi Gateway
Multi Currency
Payout automation
Dispute
Escrow
Fraud engine
Subscription
Advanced analytics
Mobile app
Recommendation system
```

---

# 101. MVP Non-Goals

MVP không nhằm:

- Thay thế Booking.com.
- Xử lý hàng triệu concurrent users.
- Hỗ trợ mọi loại booking.
- Hoàn thiện toàn bộ tài chính marketplace.
- Đạt PCI certification riêng.
- Tự lưu card data.

Mục tiêu:

> Chứng minh một booking/payment architecture đúng và có thể mở rộng.

---

# 102. Core Engineering Priorities

Thứ tự ưu tiên:

```text
1. Data correctness
2. Payment correctness
3. Concurrency safety
4. Authorization
5. Error handling
6. Testing
7. Observability
8. UX
9. Visual polish
```

Không đảo thứ tự này chỉ để UI đẹp hơn.

---

# 103. MVP Completion Checklist

## Product

- [ ] Customer booking flow hoàn chỉnh
- [ ] Vendor flow hoàn chỉnh
- [ ] Admin flow cơ bản hoàn chỉnh

## Booking

- [ ] Hold
- [ ] TTL
- [ ] Expiration
- [ ] Capacity
- [ ] Concurrency
- [ ] No overselling

## Payment

- [ ] VNPay create URL
- [ ] Return page
- [ ] IPN
- [ ] Signature verification
- [ ] Idempotency
- [ ] Failure
- [ ] Timeout
- [ ] Late callback handling

## Ticket

- [ ] Ticket created
- [ ] QR generated
- [ ] QR verify
- [ ] Check-in
- [ ] Duplicate prevention

## Finance

- [ ] Price snapshot
- [ ] Voucher
- [ ] Commission
- [ ] Cancellation
- [ ] Refund domain

## Engineering

- [ ] CI
- [ ] Unit test
- [ ] Integration test
- [ ] E2E
- [ ] Security
- [ ] Logs
- [ ] Sentry

## Deployment

- [ ] Docker
- [ ] Staging
- [ ] Production
- [ ] Backup plan
- [ ] Rollback plan
- [ ] Release `v1.0.0`

---

# 104. Final MVP Definition

GoBook MVP được xem là hoàn thành khi một tình huống thật có thể diễn ra như sau:

```text
Vendor A
↓
được Admin approve
↓
tạo Workshop Python
↓
tạo Slot 20 chỗ
↓
Customer A tìm Workshop
↓
chọn 2 vé
↓
GoBook giữ 2 chỗ
↓
Customer thanh toán VNPay
↓
VNPay gửi IPN
↓
GoBook xác nhận payment
↓
Booking CONFIRMED
↓
2 Ticket được phát hành
↓
Customer nhận QR
↓
Vendor scan QR
↓
Ticket CHECKED_IN
↓
Dashboard cập nhật doanh thu
```

Trong toàn bộ flow:

```text
No duplicate booking
No overselling
No duplicate payment processing
No unauthorized access
No duplicate check-in
```

Đây là ranh giới chính thức của **GoBook MVP v1.0.0**.