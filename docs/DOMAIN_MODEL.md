# GoBook — Domain Model

> Version: `v1.0.0-MVP`  
> Document type: Domain Model + ERD v1  
> Database: PostgreSQL  
> ORM: Prisma  
> Currency MVP: VND  
> Money storage: BIGINT  
> Primary key recommendation: UUID

---

# 1. Mục tiêu tài liệu

Tài liệu này xác định:

- Entity của hệ thống.
- Trách nhiệm của từng Entity.
- Ownership.
- Relationship.
- Cardinality.
- Aggregate boundary.
- Database constraints.
- Index.
- Snapshot strategy.
- Soft delete strategy.
- Financial invariants.
- ERD v1.

Mục tiêu cuối cùng:

> Sau tài liệu này có thể bắt đầu viết `schema.prisma` mà không cần thay đổi lớn về cấu trúc domain.

---

# 2. Domain tổng thể

GoBook MVP được chia thành các domain chính:

```text
Identity
Vendor
Catalog
Scheduling
Booking
Payment
Ticketing
Promotion
Cancellation / Refund
Review
Notification
Administration / Audit
```

Quan hệ tổng quát:

```text
User
 ├── Vendor
 │     └── Service
 │           └── Slot
 │
 └── Booking
       ├── BookingItem
       ├── Reservation
       ├── Payment
       │     ├── PaymentAttempt
       │     └── Refund
       └── Ticket
```

---

# 3. Aggregate Boundary

Không nên xem toàn bộ hệ thống là một aggregate lớn.

Đề xuất:

```text
User Aggregate

Vendor Aggregate

Service Aggregate
 └── Slot

Booking Aggregate
 ├── BookingItem
 └── Reservation

Payment Aggregate
 ├── PaymentAttempt
 └── PaymentWebhookLog

Ticket Aggregate

Voucher Aggregate
 └── VoucherUsage

Refund Aggregate

Review Aggregate

Audit Aggregate
```

---

# 4. Quy tắc ID

Khuyên dùng:

```text
UUID
```

cho tất cả entity chính.

Ví dụ:

```text
550e8400-e29b-41d4-a716-446655440000
```

Không expose auto-increment ID tuần tự ra public API nếu không cần.

---

# 5. Quy tắc thời gian

Tất cả timestamp lưu:

```text
UTC
```

Frontend convert sang timezone người dùng.

Các field phổ biến:

```text
created_at
updated_at
deleted_at
```

---

# 6. Quy tắc tiền

Tất cả tiền VND lưu:

```text
BIGINT
```

Ví dụ:

```text
199000
```

nghĩa là:

```text
199,000 VND
```

Không dùng:

```text
FLOAT
DOUBLE
```

cho monetary value.

---

# 7. Entity List

ERD v1 gồm các bảng:

```text
users
refresh_tokens

vendors
vendor_applications

categories
services
service_images
slots
cancellation_policies

bookings
booking_items
reservations

payments
payment_attempts
payment_webhook_logs
refunds

tickets
checkins

vouchers
voucher_usages

reviews

notifications

audit_logs
```

---

# 8. User Entity

## Table

```text
users
```

## Responsibility

Đại diện tài khoản đăng nhập.

## Fields

```text
id UUID PK

email VARCHAR UNIQUE NOT NULL

password_hash VARCHAR NOT NULL

full_name VARCHAR NOT NULL

phone VARCHAR NULL

status USER_STATUS NOT NULL

created_at TIMESTAMP NOT NULL

updated_at TIMESTAMP NOT NULL

deleted_at TIMESTAMP NULL
```

## User Status

```text
ACTIVE
SUSPENDED
DISABLED
```

---

# 9. User Role Design

MVP có:

```text
CUSTOMER
VENDOR
ADMIN
```

Có hai hướng:

### Option A

```text
role ENUM
```

trực tiếp trong `users`.

### Option B

```text
roles
user_roles
```

Đề xuất MVP:

```text
users.role
```

nếu mỗi user chỉ có một role chính.

Tuy nhiên GoBook có trường hợp:

```text
Customer
+
Vendor
```

nên khuyên dùng:

```text
user_roles
```

để tránh giới hạn về sau.

---

# 10. Recommended Role Schema

```text
roles

id
name
```

Values:

```text
CUSTOMER
VENDOR
ADMIN
```

Join table:

```text
user_roles

user_id
role_id
```

Unique:

```text
(user_id, role_id)
```

---

# 11. User Ownership

User sở hữu:

```text
RefreshTokens
Bookings
Reviews
VendorApplication
```

Nếu user là Vendor owner:

```text
User 1 ─── 0..1 Vendor
```

---

# 12. RefreshToken Entity

## Table

```text
refresh_tokens
```

## Purpose

Quản lý login session.

Fields:

```text
id UUID PK

user_id UUID FK

token_hash VARCHAR NOT NULL

expires_at TIMESTAMP NOT NULL

revoked_at TIMESTAMP NULL

created_at TIMESTAMP NOT NULL
```

Relation:

```text
User 1
 └── N RefreshTokens
```

Ownership:

```text
User
```

---

# 13. Vendor Entity

## Table

```text
vendors
```

## Purpose

Đại diện đơn vị kinh doanh.

Fields:

```text
id UUID PK

owner_user_id UUID FK UNIQUE

business_name VARCHAR NOT NULL

description TEXT NULL

email VARCHAR NOT NULL

phone VARCHAR NULL

address TEXT NULL

status VENDOR_STATUS NOT NULL

approved_at TIMESTAMP NULL

created_at TIMESTAMP NOT NULL

updated_at TIMESTAMP NOT NULL

deleted_at TIMESTAMP NULL
```

---

# 14. Vendor Status

```text
PENDING
APPROVED
REJECTED
SUSPENDED
```

---

# 15. Vendor Cardinality

```text
User 1
 └── 0..1 Vendor
```

Trong MVP:

> Một User chỉ sở hữu tối đa một Vendor.

Sau này có thể mở rộng:

```text
Organization
OrganizationMember
```

nếu nhiều nhân viên cùng quản lý Vendor.

---

# 16. Vendor Ownership

Vendor sở hữu:

```text
Services
Slots indirectly
Vouchers
CancellationPolicies
Bookings indirectly
```

---

# 17. VendorApplication Entity

## Table

```text
vendor_applications
```

Fields:

```text
id UUID PK

user_id UUID FK

business_name VARCHAR NOT NULL

business_type VARCHAR NULL

description TEXT NULL

email VARCHAR NOT NULL

phone VARCHAR NULL

address TEXT NULL

identity_document_url TEXT NULL

business_document_url TEXT NULL

status APPLICATION_STATUS NOT NULL

rejection_reason TEXT NULL

reviewed_by UUID FK users.id NULL

reviewed_at TIMESTAMP NULL

created_at TIMESTAMP NOT NULL

updated_at TIMESTAMP NOT NULL
```

---

# 18. VendorApplication Cardinality

```text
User 1
 └── N VendorApplications
```

Một user có thể từng bị reject và apply lại.

Business constraint:

```text
Maximum 1 PENDING application per User
```

---

# 19. Category Entity

## Table

```text
categories
```

Fields:

```text
id UUID PK

name VARCHAR UNIQUE NOT NULL

slug VARCHAR UNIQUE NOT NULL

status CATEGORY_STATUS NOT NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

Status:

```text
ACTIVE
HIDDEN
```

---

# 20. Category Cardinality

```text
Category 1
 └── N Services
```

Một Service:

```text
belongs to exactly 1 Category
```

trong MVP.

---

# 21. Service Entity

## Table

```text
services
```

## Responsibility

Đại diện service hoặc event mà Vendor cung cấp.

Fields:

```text
id UUID PK

vendor_id UUID FK NOT NULL

category_id UUID FK NOT NULL

name VARCHAR NOT NULL

slug VARCHAR UNIQUE NOT NULL

short_description VARCHAR NULL

description TEXT NULL

address TEXT NULL

location_text VARCHAR NULL

status SERVICE_STATUS NOT NULL

published_at TIMESTAMP NULL

created_at TIMESTAMP NOT NULL

updated_at TIMESTAMP NOT NULL

deleted_at TIMESTAMP NULL
```

---

# 22. Service Status

```text
DRAFT
PUBLISHED
HIDDEN
ARCHIVED
```

---

# 23. Service Cardinality

```text
Vendor 1
 └── N Services

Category 1
 └── N Services

Service 1
 ├── N ServiceImages
 ├── N Slots
 ├── N Reviews
 └── 0..N CancellationPolicies
```

---

# 24. Service Ownership

Owner:

```text
Service.vendor_id
```

Vendor A chỉ được mutate:

```text
Service.vendor_id = VendorA.id
```

---

# 25. ServiceImage Entity

## Table

```text
service_images
```

Fields:

```text
id UUID PK

service_id UUID FK

url TEXT NOT NULL

storage_key VARCHAR NULL

position INT NOT NULL DEFAULT 0

created_at TIMESTAMP
```

Cardinality:

```text
Service 1
 └── N Images
```

Nếu Service bị soft delete:

không cần xóa ngay ảnh nếu còn lịch sử.

---

# 26. Slot Entity

## Table

```text
slots
```

## Responsibility

Đại diện tài nguyên có thể đặt trong một khoảng thời gian.

Fields:

```text
id UUID PK

service_id UUID FK NOT NULL

start_time TIMESTAMP NOT NULL

end_time TIMESTAMP NOT NULL

capacity INT NOT NULL

price BIGINT NOT NULL

status SLOT_STATUS NOT NULL

created_at TIMESTAMP

updated_at TIMESTAMP

deleted_at TIMESTAMP NULL
```

---

# 27. Slot Status

```text
AVAILABLE
DISABLED
CLOSED
```

---

# 28. Slot Constraints

Database/application constraint:

```text
start_time < end_time

capacity > 0

price >= 0
```

---

# 29. Slot Cardinality

```text
Service 1
 └── N Slots

Slot 1
 ├── N BookingItems
 └── N Reservations
```

---

# 30. Slot Capacity Design

Không nhất thiết lưu:

```text
available_capacity
```

vì dễ bị lệch dữ liệu.

Khuyên tính:

```text
available
=
capacity
-
confirmed quantity
-
active reservation quantity
```

Nếu cần optimization sau này mới denormalize.

---

# 31. CancellationPolicy Entity

## Table

```text
cancellation_policies
```

MVP có thể thiết kế policy ở cấp:

```text
Service
```

Fields:

```text
id UUID PK

service_id UUID FK

name VARCHAR

is_active BOOLEAN

created_at

updated_at
```

Các rule có thể dùng JSON:

```text
rules JSONB
```

Ví dụ:

```json
[
  {
    "beforeHours": 24,
    "refundPercent": 100
  },
  {
    "beforeHours": 0,
    "refundPercent": 50
  }
]
```

---

# 32. Cancellation Snapshot

Không reference policy live từ Booking.

Booking phải snapshot:

```text
cancellation_policy_snapshot JSONB
```

khi confirm.

Lý do:

Vendor thay policy không được ảnh hưởng booking cũ.

---

# 33. Booking Entity

## Table

```text
bookings
```

Đây là một trong các bảng quan trọng nhất.

Fields:

```text
id UUID PK

code VARCHAR UNIQUE NOT NULL

customer_id UUID FK NOT NULL

vendor_id UUID FK NOT NULL

status BOOKING_STATUS NOT NULL

currency VARCHAR NOT NULL DEFAULT 'VND'

subtotal BIGINT NOT NULL

discount_amount BIGINT NOT NULL DEFAULT 0

gross_amount BIGINT NOT NULL

commission_rate DECIMAL NOT NULL

platform_fee BIGINT NOT NULL

vendor_amount BIGINT NOT NULL

voucher_id UUID FK NULL

expires_at TIMESTAMP NULL

confirmed_at TIMESTAMP NULL

completed_at TIMESTAMP NULL

cancelled_at TIMESTAMP NULL

cancellation_policy_snapshot JSONB NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 34. Booking Status

```text
HELD
PENDING_PAYMENT
CONFIRMED
COMPLETED
CANCELLED
EXPIRED
```

Không cần:

```text
PAID
```

vì đó là Payment state.

---

# 35. Booking Ownership

Customer owner:

```text
booking.customer_id
```

Vendor relation:

```text
booking.vendor_id
```

Admin không sở hữu booking.

Admin chỉ có management permission.

---

# 36. Booking Cardinality

```text
User 1
 └── N Bookings

Vendor 1
 └── N Bookings

Booking 1
 ├── N BookingItems
 ├── 1..N Reservations
 ├── 1 Payment
 ├── N Tickets
 └── 0..N Refunds
```

---

# 37. Booking Vendor Constraint

Trong MVP khuyên một Booking chỉ chứa item của:

```text
one Vendor
```

Không cho cart chứa nhiều Vendor.

Lý do:

đơn giản hóa:

```text
payment
commission
refund
cancellation policy
vendor settlement
```

Multi-vendor cart để v2.

---

# 38. BookingItem Entity

## Table

```text
booking_items
```

Fields:

```text
id UUID PK

booking_id UUID FK NOT NULL

service_id UUID FK NOT NULL

slot_id UUID FK NOT NULL

service_name_snapshot VARCHAR NOT NULL

slot_start_snapshot TIMESTAMP NOT NULL

slot_end_snapshot TIMESTAMP NOT NULL

unit_price BIGINT NOT NULL

quantity INT NOT NULL

subtotal BIGINT NOT NULL

created_at TIMESTAMP
```

---

# 39. BookingItem Snapshot

BookingItem phải snapshot:

```text
service name
slot time
unit price
```

Không chỉ reference live data.

Nếu Vendor đổi Service sau đó:

Booking history vẫn chính xác.

---

# 40. BookingItem Cardinality

```text
Booking 1
 └── N BookingItems
```

MVP thực tế có thể ban đầu:

```text
1 Booking
=
1 BookingItem
```

nhưng schema vẫn nên hỗ trợ nhiều item.

---

# 41. Reservation Entity

## Table

```text
reservations
```

Fields:

```text
id UUID PK

booking_id UUID FK NOT NULL

slot_id UUID FK NOT NULL

quantity INT NOT NULL

status RESERVATION_STATUS NOT NULL

expires_at TIMESTAMP NOT NULL

consumed_at TIMESTAMP NULL

released_at TIMESTAMP NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 42. Reservation Status

```text
ACTIVE
CONSUMED
EXPIRED
RELEASED
```

---

# 43. Reservation Ownership

Reservation không trực tiếp thuộc Customer.

Ownership được suy ra:

```text
Reservation
→ Booking
→ Customer
```

---

# 44. Reservation Cardinality

```text
Booking 1
 └── N Reservations

Slot 1
 └── N Reservations
```

---

# 45. Reservation Invariant

Bắt buộc:

```text
confirmed quantity
+
ACTIVE reservation quantity
<=
Slot.capacity
```

Đây là invariant quan trọng nhất của Booking Engine.

---

# 46. Payment Entity

## Table

```text
payments
```

Fields:

```text
id UUID PK

booking_id UUID FK UNIQUE NOT NULL

provider PAYMENT_PROVIDER NOT NULL

status PAYMENT_STATUS NOT NULL

amount BIGINT NOT NULL

currency VARCHAR NOT NULL

successful_attempt_id UUID NULL

paid_at TIMESTAMP NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 47. Payment Provider

MVP:

```text
VNPAY
```

Schema vẫn dùng enum để sau này mở rộng:

```text
MOMO
ZALOPAY
STRIPE
```

---

# 48. Payment Status

```text
INITIATED
PENDING
SUCCESS
FAILED
EXPIRED
NEEDS_REVIEW
REFUND_PENDING
PARTIAL_REFUNDED
REFUNDED
```

---

# 49. Booking ↔ Payment Cardinality

MVP:

```text
Booking 1
 └── 0..1 Payment
```

Payment:

```text
Payment 1
 └── N PaymentAttempts
```

Điều này tốt hơn tạo một Payment mới mỗi lần retry.

---

# 50. PaymentAttempt Entity

## Table

```text
payment_attempts
```

Fields:

```text
id UUID PK

payment_id UUID FK NOT NULL

provider VARCHAR NOT NULL

request_reference VARCHAR UNIQUE NOT NULL

gateway_transaction_id VARCHAR NULL

amount BIGINT NOT NULL

status PAYMENT_ATTEMPT_STATUS NOT NULL

payment_url TEXT NULL

failure_code VARCHAR NULL

failure_message TEXT NULL

requested_at TIMESTAMP NOT NULL

completed_at TIMESTAMP NULL

created_at TIMESTAMP
```

---

# 51. PaymentAttempt Status

```text
CREATED
PENDING
SUCCESS
FAILED
EXPIRED
NEEDS_REVIEW
```

---

# 52. PaymentAttempt Cardinality

```text
Payment 1
 └── N PaymentAttempts
```

Ví dụ:

```text
Payment
 ├── Attempt #1 FAILED
 ├── Attempt #2 FAILED
 └── Attempt #3 SUCCESS
```

---

# 53. Payment Gateway Idempotency

Index/constraint:

```text
gateway_transaction_id UNIQUE
```

nếu non-null.

Mục tiêu:

không process cùng gateway transaction hai lần.

---

# 54. PaymentWebhookLog Entity

## Table

```text
payment_webhook_logs
```

Fields:

```text
id UUID PK

provider VARCHAR NOT NULL

payment_id UUID FK NULL

payment_attempt_id UUID FK NULL

transaction_reference VARCHAR NULL

gateway_transaction_id VARCHAR NULL

payload JSONB NOT NULL

signature_valid BOOLEAN NOT NULL

processing_status WEBHOOK_STATUS NOT NULL

error_code VARCHAR NULL

error_message TEXT NULL

received_at TIMESTAMP NOT NULL

processed_at TIMESTAMP NULL
```

---

# 55. Webhook Status

```text
RECEIVED
PROCESSED
IGNORED_DUPLICATE
REJECTED
FAILED
```

---

# 56. Webhook Cardinality

```text
PaymentAttempt 1
 └── N WebhookLogs
```

Duplicate webhook được phép tồn tại trong log.

Business side-effect mới phải idempotent.

---

# 57. Refund Entity

## Table

```text
refunds
```

Fields:

```text
id UUID PK

booking_id UUID FK NOT NULL

payment_id UUID FK NOT NULL

amount BIGINT NOT NULL

type REFUND_TYPE NOT NULL

status REFUND_STATUS NOT NULL

reason TEXT NULL

gateway_ref VARCHAR NULL

requested_by UUID FK users.id NULL

processed_at TIMESTAMP NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 58. Refund Type

```text
FULL
PARTIAL
```

---

# 59. Refund Status

```text
PENDING
PROCESSING
SUCCESS
FAILED
```

---

# 60. Refund Cardinality

```text
Booking 1
 └── N Refunds

Payment 1
 └── N Refunds
```

Không assume chỉ có một refund.

Có thể có:

```text
partial refund #1
partial refund #2
```

trong tương lai.

---

# 61. Refund Invariant

Tổng refund thành công:

```text
SUM(successful refunds)
<=
Payment.amount
```

Không refund vượt số đã thanh toán.

---

# 62. Ticket Entity

## Table

```text
tickets
```

Fields:

```text
id UUID PK

booking_id UUID FK NOT NULL

booking_item_id UUID FK NOT NULL

token VARCHAR UNIQUE NOT NULL

status TICKET_STATUS NOT NULL

checked_in_at TIMESTAMP NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 63. Ticket Status

```text
ACTIVE
CHECKED_IN
CANCELLED
EXPIRED
```

---

# 64. Ticket Cardinality

```text
Booking 1
 └── N Tickets

BookingItem 1
 └── N Tickets
```

Nếu:

```text
quantity = 3
```

khuyên tạo:

```text
3 Tickets
```

---

# 65. Ticket Ownership

Ticket owner suy ra:

```text
Ticket
→ Booking
→ Customer
```

Vendor được check-in nếu:

```text
Booking.vendor_id = authenticated Vendor.id
```

---

# 66. Checkin Entity

Có thể chỉ lưu:

```text
tickets.checked_in_at
```

nhưng khuyên tạo bảng:

```text
checkins
```

để audit tốt hơn.

Fields:

```text
id UUID PK

ticket_id UUID FK UNIQUE NOT NULL

vendor_id UUID FK NOT NULL

checked_in_by UUID FK users.id NOT NULL

checked_in_at TIMESTAMP NOT NULL

metadata JSONB NULL
```

---

# 67. Checkin Cardinality

```text
Ticket 1
 └── 0..1 Checkin
```

Unique:

```text
ticket_id
```

giúp chống duplicate check-in ở DB level.

---

# 68. Voucher Entity

## Table

```text
vouchers
```

Fields:

```text
id UUID PK

vendor_id UUID FK NULL

code VARCHAR UNIQUE NOT NULL

type VOUCHER_TYPE NOT NULL

value BIGINT / DECIMAL NOT NULL

max_discount BIGINT NULL

min_order_value BIGINT NOT NULL DEFAULT 0

usage_limit INT NULL

per_user_limit INT NULL

start_at TIMESTAMP NOT NULL

end_at TIMESTAMP NOT NULL

status VOUCHER_STATUS NOT NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 69. Voucher Ownership

Nếu:

```text
vendor_id != null
```

thì voucher thuộc Vendor.

Nếu:

```text
vendor_id = null
```

có thể đại diện platform voucher.

MVP có thể chỉ cho:

```text
Vendor Voucher
```

nếu muốn đơn giản hơn.

---

# 70. Voucher Type

```text
FIXED
PERCENTAGE
```

---

# 71. Voucher Status

```text
ACTIVE
INACTIVE
EXPIRED
```

Expired có thể suy ra bằng time thay vì persist.

---

# 72. VoucherUsage Entity

## Table

```text
voucher_usages
```

Fields:

```text
id UUID PK

voucher_id UUID FK

user_id UUID FK

booking_id UUID FK UNIQUE

discount_amount BIGINT NOT NULL

created_at TIMESTAMP
```

---

# 73. VoucherUsage Cardinality

```text
Voucher 1
 └── N VoucherUsages

User 1
 └── N VoucherUsages

Booking 1
 └── 0..1 VoucherUsage
```

MVP:

```text
one voucher per booking
```

---

# 74. Voucher Concurrency

`usage_limit` không được chỉ:

```text
COUNT then INSERT
```

không lock.

Phải concurrency-safe.

Có thể dùng:

```text
transaction
+
row lock voucher
+
count usage
+
insert usage
```

hoặc atomic counter strategy.

---

# 75. Review Entity

## Table

```text
reviews
```

Fields:

```text
id UUID PK

booking_id UUID FK UNIQUE NOT NULL

service_id UUID FK NOT NULL

user_id UUID FK NOT NULL

rating SMALLINT NOT NULL

comment TEXT NULL

status REVIEW_STATUS NOT NULL

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

# 76. Review Constraints

```text
rating >= 1
rating <= 5
```

Unique:

```text
booking_id
```

Business rule:

```text
Booking.status = COMPLETED
```

---

# 77. Review Cardinality

```text
Service 1
 └── N Reviews

User 1
 └── N Reviews

Booking 1
 └── 0..1 Review
```

---

# 78. Notification Entity

## Table

```text
notifications
```

Fields:

```text
id UUID PK

user_id UUID FK

type NOTIFICATION_TYPE

channel NOTIFICATION_CHANNEL

title VARCHAR

content TEXT

status NOTIFICATION_STATUS

sent_at TIMESTAMP NULL

created_at TIMESTAMP
```

---

# 79. Notification Channel

MVP:

```text
EMAIL
```

Có thể chuẩn bị enum:

```text
EMAIL
SMS
PUSH
IN_APP
```

---

# 80. AuditLog Entity

## Table

```text
audit_logs
```

Fields:

```text
id UUID PK

actor_user_id UUID FK NULL

action VARCHAR NOT NULL

entity_type VARCHAR NOT NULL

entity_id UUID NULL

metadata JSONB NULL

ip_address VARCHAR NULL

created_at TIMESTAMP NOT NULL
```

---

# 81. Audit Cardinality

Audit log không nhất thiết FK cứng tới mọi entity.

Dùng:

```text
entity_type
entity_id
```

để generic.

Ví dụ:

```text
entity_type = "VENDOR_APPLICATION"
entity_id = "..."
```

---

# 82. Main Ownership Matrix

| Entity | Owner |
|---|---|
| User | Self |
| RefreshToken | User |
| Vendor | owner_user_id |
| VendorApplication | User |
| Service | Vendor |
| ServiceImage | Service → Vendor |
| Slot | Service → Vendor |
| CancellationPolicy | Service → Vendor |
| Booking | Customer |
| BookingItem | Booking |
| Reservation | Booking |
| Payment | Booking |
| PaymentAttempt | Payment |
| WebhookLog | System |
| Refund | Booking / System |
| Ticket | Booking Customer |
| Checkin | Vendor |
| Voucher | Vendor / Platform |
| VoucherUsage | User + Booking |
| Review | Customer |
| Notification | User |
| AuditLog | System |

---

# 83. Main Relationship Matrix

| Parent | Relation | Child | Cardinality |
|---|---|---|---|
| User | has | RefreshToken | 1:N |
| User | owns | Vendor | 1:0..1 |
| User | submits | VendorApplication | 1:N |
| Vendor | owns | Service | 1:N |
| Category | classifies | Service | 1:N |
| Service | has | ServiceImage | 1:N |
| Service | has | Slot | 1:N |
| Service | has | CancellationPolicy | 1:N |
| User | creates | Booking | 1:N |
| Vendor | receives | Booking | 1:N |
| Booking | has | BookingItem | 1:N |
| Slot | referenced by | BookingItem | 1:N |
| Booking | has | Reservation | 1:N |
| Slot | receives | Reservation | 1:N |
| Booking | has | Payment | 1:0..1 |
| Payment | has | PaymentAttempt | 1:N |
| PaymentAttempt | has | WebhookLog | 1:N |
| Booking | has | Ticket | 1:N |
| Ticket | has | Checkin | 1:0..1 |
| Booking | has | Refund | 1:N |
| Payment | has | Refund | 1:N |
| Vendor | owns | Voucher | 1:N |
| Voucher | has | VoucherUsage | 1:N |
| User | has | VoucherUsage | 1:N |
| Booking | uses | VoucherUsage | 1:0..1 |
| Service | has | Review | 1:N |
| Booking | produces | Review | 1:0..1 |

---

# 84. ERD v1

```mermaid
erDiagram

    USERS ||--o{ REFRESH_TOKENS : has
    USERS ||--o{ USER_ROLES : assigned
    ROLES ||--o{ USER_ROLES : contains

    USERS ||--o| VENDORS : owns
    USERS ||--o{ VENDOR_APPLICATIONS : submits

    VENDORS ||--o{ SERVICES : owns
    CATEGORIES ||--o{ SERVICES : classifies

    SERVICES ||--o{ SERVICE_IMAGES : has
    SERVICES ||--o{ SLOTS : has
    SERVICES ||--o{ CANCELLATION_POLICIES : configures

    USERS ||--o{ BOOKINGS : creates
    VENDORS ||--o{ BOOKINGS : receives

    BOOKINGS ||--|{ BOOKING_ITEMS : contains
    SERVICES ||--o{ BOOKING_ITEMS : referenced_by
    SLOTS ||--o{ BOOKING_ITEMS : referenced_by

    BOOKINGS ||--|{ RESERVATIONS : has
    SLOTS ||--o{ RESERVATIONS : reserved_by

    BOOKINGS ||--o| PAYMENTS : has
    PAYMENTS ||--|{ PAYMENT_ATTEMPTS : has
    PAYMENT_ATTEMPTS ||--o{ PAYMENT_WEBHOOK_LOGS : receives

    BOOKINGS ||--o{ TICKETS : issues
    BOOKING_ITEMS ||--o{ TICKETS : produces
    TICKETS ||--o| CHECKINS : has

    BOOKINGS ||--o{ REFUNDS : has
    PAYMENTS ||--o{ REFUNDS : refunded_by

    VENDORS ||--o{ VOUCHERS : owns
    VOUCHERS ||--o{ VOUCHER_USAGES : consumed
    USERS ||--o{ VOUCHER_USAGES : uses
    BOOKINGS ||--o| VOUCHER_USAGES : applies

    SERVICES ||--o{ REVIEWS : receives
    USERS ||--o{ REVIEWS : writes
    BOOKINGS ||--o| REVIEWS : produces

    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_LOGS : acts
```

---

# 85. Simplified Core ERD

Phần quan trọng nhất cần hiểu trước khi code:

```text
User
 │
 │ 1:N
 ▼
Booking
 │
 ├──────────────┐
 │              │
 ▼              ▼
BookingItem   Reservation
 │              │
 │              ▼
 ▼             Slot
Slot
 │
 ▼
Service
 │
 ▼
Vendor


Booking
 │
 │ 1:1
 ▼
Payment
 │
 │ 1:N
 ▼
PaymentAttempt
 │
 ▼
WebhookLog


Booking
 │
 │ 1:N
 ▼
Ticket
 │
 │ 1:0..1
 ▼
Checkin
```

---

# 86. Booking Aggregate

Booking Aggregate:

```text
Booking
 ├── BookingItem
 └── Reservation
```

BookingService chịu trách nhiệm:

```text
create hold
price snapshot
voucher application
capacity reservation
expiration
booking transitions
```

Payment không nên bị nhét toàn bộ logic vào BookingService.

---

# 87. Payment Aggregate

```text
Payment
 └── PaymentAttempt
```

PaymentService chịu trách nhiệm:

```text
create payment
create attempt
verify callback
idempotency
payment transition
```

Khi Payment success:

Payment domain phát signal / gọi application service để:

```text
confirm Booking
consume Reservation
generate Ticket
```

---

# 88. Ticket Aggregate

```text
Ticket
 └── Checkin
```

TicketService xử lý:

```text
generate ticket
verify token
check ownership
check-in
duplicate check-in prevention
```

---

# 89. Cross Aggregate Transaction

Một số thao tác bắt buộc transaction.

## Create Reservation

```text
Lock Slot
↓
Check Capacity
↓
Create Booking
↓
Create BookingItem
↓
Create Reservation
↓
Commit
```

---

# 90. Payment Confirmation Transaction

```text
Verify callback outside / before critical transaction

BEGIN

Lock Payment

Check already processed

Payment SUCCESS

Booking CONFIRMED

Reservation CONSUMED

Create Ticket(s)

COMMIT
```

---

# 91. Cancellation Transaction

```text
BEGIN

Lock Booking

Validate state

Calculate refund

Booking CANCELLED

Tickets CANCELLED

Create Refund

COMMIT
```

Gateway refund call không nên giữ DB transaction mở quá lâu.

Khuyên:

```text
DB transaction
↓
Refund PENDING
↓
Commit
↓
Async gateway refund
```

---

# 92. Database Foreign Key Strategy

Nên dùng FK thật cho các relation quan trọng.

Ví dụ:

```text
service.vendor_id
→ vendors.id

slot.service_id
→ services.id

booking.customer_id
→ users.id

payment.booking_id
→ bookings.id
```

---

# 93. Delete Strategy

Không `ON DELETE CASCADE` tùy tiện với financial/history tables.

Đặc biệt:

```text
Bookings
Payments
Tickets
Refunds
AuditLogs
```

không được bị mất vì User/Service bị xóa.

Khuyên:

```text
RESTRICT
```

hoặc soft delete.

---

# 94. Safe Cascade Cases

Có thể cascade:

```text
RefreshTokens
```

khi xóa thật User trong dev/test.

Có thể cascade:

```text
ServiceImages
```

nếu Service chưa có history và bị xóa vật lý.

Production vẫn ưu tiên soft delete.

---

# 95. Soft Delete Entities

Khuyên dùng `deleted_at` cho:

```text
users
vendors
services
slots
```

Không cần soft delete cho:

```text
payment_webhook_logs
audit_logs
```

vì chúng là immutable history.

---

# 96. Immutable / Append-only Data

Nên gần như immutable:

```text
payment_webhook_logs
audit_logs
payment_attempts after completion
voucher_usages
checkins
```

Không nên cho admin edit trực tiếp.

---

# 97. Important Unique Constraints

```text
users.email UNIQUE

roles.name UNIQUE

vendors.owner_user_id UNIQUE

categories.slug UNIQUE

services.slug UNIQUE

bookings.code UNIQUE

payment_attempts.request_reference UNIQUE

payment_attempts.gateway_transaction_id UNIQUE WHERE NOT NULL

tickets.token UNIQUE

checkins.ticket_id UNIQUE

vouchers.code UNIQUE

voucher_usages.booking_id UNIQUE

reviews.booking_id UNIQUE
```

---

# 98. Important Indexes

## Users

```text
users(email)
```

## Services

```text
services(vendor_id)
services(category_id)
services(status)
services(slug)
```

## Slots

```text
slots(service_id)
slots(start_time)
slots(service_id, start_time)
slots(status)
```

## Bookings

```text
bookings(customer_id)
bookings(vendor_id)
bookings(status)
bookings(code)
bookings(created_at)
```

## Reservations

```text
reservations(slot_id)
reservations(status)
reservations(expires_at)
reservations(slot_id, status)
```

## Payments

```text
payments(booking_id)
payments(status)
```

## Attempts

```text
payment_attempts(payment_id)
payment_attempts(gateway_transaction_id)
payment_attempts(request_reference)
```

## Tickets

```text
tickets(token)
tickets(booking_id)
tickets(status)
```

## Vouchers

```text
vouchers(code)
vouchers(vendor_id)
```

---

# 99. Reservation Query Requirement

Capacity calculation phải tìm nhanh:

```text
slot_id
+
status = ACTIVE
+
expires_at > now
```

Nên index:

```text
(slot_id, status, expires_at)
```

---

# 100. Financial Snapshot

Booking phải snapshot ít nhất:

```text
subtotal
discount_amount
gross_amount
commission_rate
platform_fee
vendor_amount
```

BookingItem:

```text
unit_price
subtotal
service_name
slot_start
slot_end
```

---

# 101. Financial Invariant

Luôn đúng:

```text
gross_amount
=
subtotal
-
discount_amount
```

và:

```text
vendor_amount
=
gross_amount
-
platform_fee
```

---

# 102. Non-negative Money Constraint

Phải đảm bảo:

```text
subtotal >= 0
discount_amount >= 0
gross_amount >= 0
platform_fee >= 0
vendor_amount >= 0
refund.amount >= 0
```

---

# 103. Discount Invariant

```text
discount_amount
<=
subtotal
```

Không cho:

```text
gross_amount < 0
```

---

# 104. Booking Code

Không dùng UUID trực tiếp cho UI nếu muốn UX tốt.

Tạo code:

```text
GB-20260916-AB12CD
```

hoặc:

```text
GB-X92K31
```

`id` vẫn là UUID.

---

# 105. Public Token vs Internal ID

Ticket QR dùng:

```text
token
```

không dùng:

```text
ticket.id
```

trực tiếp nếu token dễ đoán.

---

# 106. PII Consideration

PII chính:

```text
email
phone
full_name
address
vendor documents
```

Không duplicate PII quá nhiều vào:

```text
payment
ticket
webhook
```

trừ snapshot thực sự cần.

---

# 107. Webhook Payload

Payload gateway có thể chứa sensitive metadata.

Nên lưu:

```text
JSONB
```

nhưng mask field nếu cần trước logging.

Webhook raw data:

không được trả public API cho Customer/Vendor.

---

# 108. Domain Rule — Vendor

```text
Vendor.status = APPROVED
```

mới được:

```text
publish Service
create public Slots
receive new bookings
```

---

# 109. Domain Rule — Service

Service public khi:

```text
status = PUBLISHED
```

và:

```text
vendor.status = APPROVED
```

---

# 110. Domain Rule — Slot

Slot bookable khi:

```text
status = AVAILABLE

start_time > now

Service = PUBLISHED

Vendor = APPROVED
```

---

# 111. Domain Rule — Booking

Booking confirm khi:

```text
verified Payment SUCCESS
```

Không confirm từ:

```text
browser return URL
```

---

# 112. Domain Rule — Reservation

Reservation ACTIVE chỉ hợp lệ khi:

```text
expires_at > now
```

Nếu job bị trễ nhưng:

```text
expires_at <= now
```

thì availability calculation phải coi reservation đó là expired.

Không phụ thuộc hoàn toàn BullMQ.

---

# 113. Domain Rule — Payment

Một Payment chỉ có:

```text
at most one successful attempt
```

Nếu có attempt success sau khi một attempt khác đã success:

```text
NEEDS_REVIEW
```

---

# 114. Domain Rule — Ticket

Ticket chỉ tạo nếu:

```text
Booking.status = CONFIRMED
```

---

# 115. Domain Rule — Review

Review chỉ tạo nếu:

```text
Booking.status = COMPLETED
```

và:

```text
Booking.customer_id = User.id
```

---

# 116. Entity Lifecycle Summary

```text
User
ACTIVE
↓
can become Vendor


VendorApplication
PENDING
↓
APPROVED / REJECTED


Vendor
PENDING
↓
APPROVED
↓
SUSPENDED


Service
DRAFT
↓
PUBLISHED
↓
HIDDEN / ARCHIVED


Reservation
ACTIVE
↓
CONSUMED / EXPIRED / RELEASED


Booking
HELD
↓
PENDING_PAYMENT
↓
CONFIRMED
↓
COMPLETED

or

EXPIRED

or

CANCELLED


Payment
INITIATED
↓
PENDING
↓
SUCCESS

or

FAILED / EXPIRED / NEEDS_REVIEW


Ticket
ACTIVE
↓
CHECKED_IN

or

CANCELLED


Refund
PENDING
↓
PROCESSING
↓
SUCCESS / FAILED
```

---

# 117. Core Entity Dependency

Thứ tự migration hợp lý:

```text
users
roles
user_roles

refresh_tokens

vendors
vendor_applications

categories

services
service_images

slots
cancellation_policies

vouchers

bookings
booking_items
reservations
voucher_usages

payments
payment_attempts
payment_webhook_logs

tickets
checkins

refunds

reviews
notifications
audit_logs
```

---

# 118. Suggested Prisma Modules

Có thể chia schema logical theo module:

```text
Identity

User
Role
UserRole
RefreshToken


Vendor

Vendor
VendorApplication


Catalog

Category
Service
ServiceImage
Slot
CancellationPolicy


Booking

Booking
BookingItem
Reservation


Payment

Payment
PaymentAttempt
PaymentWebhookLog
Refund


Ticket

Ticket
Checkin


Promotion

Voucher
VoucherUsage


Engagement

Review
Notification


System

AuditLog
```

---

# 119. Tables quan trọng nhất

Nếu cần ưu tiên review schema kỹ nhất:

```text
slots

bookings

booking_items

reservations

payments

payment_attempts

payment_webhook_logs

tickets

refunds
```

Đây là các bảng ảnh hưởng trực tiếp đến:

```text
capacity
money
payment
ticket
```

---

# 120. Không nên gộp

Không nên gộp:

```text
Booking + Payment
```

vì lifecycle khác nhau.

Không nên gộp:

```text
Booking + Reservation
```

vì Reservation là temporary resource lock.

Không nên gộp:

```text
Payment + PaymentAttempt
```

vì một booking có thể retry nhiều lần.

Không nên gộp:

```text
Ticket + Checkin
```

nếu muốn audit rõ.

---

# 121. Không cần tách quá mức

Không cần tạo riêng:

```text
ServiceAddress
CustomerAddress
TicketQr
SlotPrice
```

trong MVP nếu chưa có requirement rõ.

Tránh over-engineering.

---

# 122. Main Domain Invariants

## INV-01

```text
active reservations
+
confirmed bookings
<= slot capacity
```

## INV-02

Một gateway transaction chỉ có một business effect.

## INV-03

Booking CONFIRMED phải có Payment SUCCESS.

## INV-04

Payment amount = Booking gross amount.

## INV-05

Ticket chỉ thuộc confirmed/completed booking.

## INV-06

Ticket chỉ có tối đa một Checkin.

## INV-07

Refund successful total <= Payment amount.

## INV-08

Voucher usage không vượt usage limit.

## INV-09

Customer chỉ sở hữu booking của chính họ.

## INV-10

Vendor chỉ mutate resource thuộc Vendor đó.

---

# 123. ERD v1 Completion Criteria

ERD v1 được xem là hoàn thành khi:

- [x] User model rõ.
- [x] Role model rõ.
- [x] Vendor model rõ.
- [x] Service model rõ.
- [x] Slot model rõ.
- [x] Booking model rõ.
- [x] Reservation model rõ.
- [x] Payment model rõ.
- [x] PaymentAttempt model rõ.
- [x] Ticket model rõ.
- [x] Refund model rõ.
- [x] Voucher model rõ.
- [x] Review model rõ.
- [x] Ownership xác định.
- [x] Cardinality xác định.
- [x] Snapshot strategy xác định.
- [x] Unique constraints xác định.
- [x] Index strategy cơ bản xác định.
- [x] Soft delete strategy xác định.
- [x] Financial invariant xác định.

---

# 124. Final Core Model

Mô hình cốt lõi của GoBook v1:

```text
USER
 │
 ├───────────────┐
 │               │
 ▼               ▼
VENDOR         BOOKING
 │               │
 ▼               ├───────────────┐
SERVICE           │               │
 │                ▼               ▼
 ▼           BOOKING_ITEM    RESERVATION
SLOT               │               │
 ▲                 └──────┬────────┘
 │                        │
 └────────────────────────┘


BOOKING
   │
   ▼
PAYMENT
   │
   ▼
PAYMENT_ATTEMPT
   │
   ▼
WEBHOOK_LOG


BOOKING
   │
   ▼
TICKET
   │
   ▼
CHECKIN


BOOKING
   │
   ▼
REFUND
```

---

# 125. Final Design Principle

Domain model của GoBook phải bảo vệ ba loại dữ liệu quan trọng nhất:

```text
CAPACITY
MONEY
HISTORY
```

Capacity không được oversell.

Money không được tính sai hoặc xử lý hai lần.

History không được thay đổi chỉ vì Vendor chỉnh dữ liệu hiện tại.

Nếu ba nguyên tắc này được giữ đúng thì ERD v1 đủ ổn định để bắt đầu triển khai database và Booking Engine.