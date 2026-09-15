# GoBook — MVP Backlog

> Release target: `v1.0.0`  
> Duration: 60 days  
> Development model: Solo  
> Integration branch: `develop`  
> Production branch: `production`

---

# 1. Priority Convention

```text
P0 = Critical
Không có feature này thì MVP không hoạt động.

P1 = High
Cần có cho MVP production.

P2 = Medium
Quan trọng nhưng có thể đơn giản hóa.

P3 = Low
Optional nếu còn thời gian.
```

---

# 2. Story Point Convention

```text
1 SP = < 2h
2 SP = 2–4h
3 SP = 4–6h
5 SP = khoảng 1 ngày
8 SP = cần chia nhỏ nếu có thể
```

Vì đây là solo project:

> Issue trên 8 SP nên được tách.

---

# EPIC-00 — Project Foundation

## GB-001 — Define MVP Scope

Priority:

```text
P0
```

Branch:

```text
docs/mvp-scope
```

Goal:

Khóa phạm vi v1.0.0.

Deliverables:

```text
docs/MVP_SCOPE.md
```

Acceptance Criteria:

- Scope In được định nghĩa.
- Scope Out được định nghĩa.
- Payment gateway MVP = VNPay.
- Roles được xác định.
- Definition of Done được xác định.
- Release criteria được xác định.

Dependencies:

```text
None
```

---

## GB-002 — Create Product Backlog

Priority:

```text
P0
```

Branch:

```text
docs/mvp-backlog
```

Deliverable:

```text
docs/BACKLOG_MVP.md
```

Acceptance Criteria:

- Có Epic.
- Có Story ID.
- Có Priority.
- Có Acceptance Criteria.
- Có Dependencies.
- Có branch suggestion.

---

## GB-003 — Document Customer Flow

Branch:

```text
docs/customer-flow
```

Acceptance Criteria:

Có diagram:

```text
Search
→ Service Detail
→ Select Slot
→ Hold
→ Payment
→ Ticket
→ Check-in
```

Có error path:

```text
sold out
expired hold
payment failed
late payment
cancel
```

Priority:

```text
P0
```

---

## GB-004 — Document Vendor Flow

Flow:

```text
Register
→ Apply Vendor
→ Approval
→ Create Service
→ Create Slot
→ Receive Booking
→ Check-in
→ Dashboard
```

Priority:

```text
P1
```

---

## GB-005 — Document Admin Flow

Flow:

```text
Vendor Application
→ Review
→ Approve / Reject

Payment
→ Inspect

Booking
→ Inspect
```

Priority:

```text
P1
```

---

# EPIC-01 — Repository & Development Environment

## GB-010 — Initialize Monorepo

Branch:

```text
chore/init-monorepo
```

Acceptance Criteria:

Repository có:

```text
apps/web
apps/api
packages/*
docs
.github
```

Commands chạy:

```text
dev
build
lint
test
```

Priority:

```text
P0
```

---

## GB-011 — Configure TypeScript

Acceptance Criteria:

- Strict mode bật.
- Shared tsconfig.
- Không có TS compile error.
- Aliases hoạt động.

Priority:

```text
P1
```

---

## GB-012 — Configure ESLint

Acceptance Criteria:

```text
npm run lint
```

pass.

CI fail nếu lint fail.

Priority:

```text
P1
```

---

## GB-013 — Configure Prettier

Acceptance Criteria:

- Format command tồn tại.
- Project sử dụng format thống nhất.

Priority:

```text
P2
```

---

## GB-014 — Docker PostgreSQL

Branch:

```text
chore/docker-postgres
```

Acceptance Criteria:

```text
docker compose up
```

khởi tạo PostgreSQL.

API connect thành công.

Priority:

```text
P0
```

---

## GB-015 — Docker Redis

Acceptance Criteria:

Redis chạy local.

API có thể:

```text
PING → PONG
```

Priority:

```text
P0
```

---

## GB-016 — Environment Configuration

Files:

```text
.env.example
```

Acceptance Criteria:

Không commit secret.

Config validate startup.

Thiếu env bắt buộc:

```text
app startup fail rõ lỗi
```

Priority:

```text
P0
```

---

# EPIC-02 — GitHub Engineering Workflow

## GB-020 — GitHub Issue Templates

Templates:

```text
Feature
Bug
Technical Task
```

Priority:

```text
P1
```

---

## GB-021 — Pull Request Template

Template gồm:

```text
What
Why
Changes
How to Test
Screenshots
Checklist
Issue
```

Priority:

```text
P1
```

---

## GB-022 — Protect Develop Branch

Không direct push.

Merge qua PR.

Priority:

```text
P1
```

---

## GB-023 — Protect Production Branch

Không direct push.

Chỉ release/hotfix.

Priority:

```text
P0
```

---

## GB-024 — CI Lint

Trigger:

```text
pull_request
```

Priority:

```text
P1
```

---

## GB-025 — CI Typecheck

Priority:

```text
P1
```

---

## GB-026 — CI Unit Test

Priority:

```text
P1
```

---

## GB-027 — CI Build

Web và API đều phải build.

Priority:

```text
P0
```

---

# EPIC-03 — Database Foundation

## GB-030 — Prisma Setup

Acceptance Criteria:

```text
prisma generate
prisma migrate
```

chạy được.

Priority:

```text
P0
```

---

## GB-031 — Base Entity Convention

Định nghĩa:

```text
id
created_at
updated_at
deleted_at
```

Rules thống nhất.

Priority:

```text
P1
```

---

## GB-032 — Audit Log Model

Fields:

```text
actor_id
action
entity_type
entity_id
metadata
created_at
```

Priority:

```text
P2
```

---

# EPIC-04 — Authentication

## GB-040 — User Model

Branch:

```text
feat/user-model
```

Fields:

```text
id
email
password_hash
full_name
phone
status
created_at
updated_at
```

Acceptance Criteria:

- Email unique.
- Password không lưu plain text.
- Migration pass.

Priority:

```text
P0
```

---

## GB-041 — Register

Endpoint:

```text
POST /auth/register
```

Validate:

```text
email
password
fullName
```

Acceptance Criteria:

- Duplicate email → 409.
- Invalid email → 400.
- Weak/invalid password → 400.
- Password hashed.

Priority:

```text
P0
```

---

## GB-042 — Login

Endpoint:

```text
POST /auth/login
```

Output:

```text
accessToken
refreshToken
user
```

Acceptance Criteria:

- Invalid credentials không tiết lộ email có tồn tại.
- Successful login trả token hợp lệ.

Priority:

```text
P0
```

---

## GB-043 — Refresh Token Model

Fields:

```text
token_hash
user_id
expires_at
revoked_at
```

Priority:

```text
P0
```

---

## GB-044 — Refresh Access Token

Endpoint:

```text
POST /auth/refresh
```

Acceptance Criteria:

- Revoked token reject.
- Expired token reject.
- Valid token tạo access token mới.

Priority:

```text
P0
```

---

## GB-045 — Logout

Endpoint:

```text
POST /auth/logout
```

Refresh token bị revoke.

Priority:

```text
P1
```

---

## GB-046 — Current User Endpoint

```text
GET /auth/me
```

Priority:

```text
P1
```

---

# EPIC-05 — Authorization & RBAC

## GB-050 — Role Model

Roles:

```text
CUSTOMER
VENDOR
ADMIN
```

Priority:

```text
P0
```

---

## GB-051 — Role Guard

Decorator:

```text
@Roles(...)
```

Acceptance Criteria:

Unauthorized role:

```text
403
```

Priority:

```text
P0
```

---

## GB-052 — Ownership Guard

Rule:

Vendor chỉ sửa resource thuộc vendor.

Customer chỉ xem booking của mình.

Priority:

```text
P0
```

---

## GB-053 — Authorization Tests

Cases:

```text
Customer → Admin endpoint = 403
Vendor A → Vendor B service = 403
Customer A → Customer B booking = 403
```

Priority:

```text
P0
```

---

# EPIC-06 — Vendor

## GB-060 — Vendor Model

Fields:

```text
owner_id
business_name
description
email
phone
address
status
```

Priority:

```text
P0
```

---

## GB-061 — Vendor Application Model

Status:

```text
PENDING
APPROVED
REJECTED
```

Priority:

```text
P1
```

---

## GB-062 — Submit Vendor Application

```text
POST /vendor-applications
```

Acceptance Criteria:

User có application pending thì không tạo tiếp.

Priority:

```text
P1
```

---

## GB-063 — Upload Vendor Document

Priority:

```text
P2
```

Có thể dùng generic storage adapter.

---

## GB-064 — Admin List Vendor Applications

```text
GET /admin/vendor-applications
```

Priority:

```text
P1
```

---

## GB-065 — Approve Vendor

```text
PATCH /admin/vendor-applications/:id/approve
```

Effects:

```text
Application APPROVED
Vendor APPROVED
User gains VENDOR role
Audit log
```

Priority:

```text
P0
```

---

## GB-066 — Reject Vendor

Phải có:

```text
reason
```

Priority:

```text
P1
```

---

# EPIC-07 — Categories & Services

## GB-070 — Category Model

Priority:

```text
P1
```

---

## GB-071 — Admin Create Category

Priority:

```text
P1
```

---

## GB-072 — Public Category List

Priority:

```text
P1
```

---

## GB-073 — Service Model

Fields:

```text
vendor_id
category_id
name
slug
description
address
status
```

Priority:

```text
P0
```

---

## GB-074 — Vendor Create Service

Acceptance Criteria:

Only approved vendor.

Initial status:

```text
DRAFT
```

Priority:

```text
P0
```

---

## GB-075 — Vendor Update Service

Ownership bắt buộc.

Priority:

```text
P0
```

---

## GB-076 — Publish Service

Rules:

Service phải có:

```text
name
description
category
address
at least one slot
```

Priority:

```text
P1
```

---

## GB-077 — Hide Service

Không hard delete nếu có booking history.

Priority:

```text
P1
```

---

## GB-078 — Upload Service Image

Priority:

```text
P1
```

---

## GB-079 — Service Detail Public API

```text
GET /services/:slug
```

Priority:

```text
P0
```

---

# EPIC-08 — Slot & Pricing

## GB-080 — Slot Model

Fields:

```text
service_id
start_time
end_time
capacity
price
status
```

Priority:

```text
P0
```

---

## GB-081 — Create Slot

Validation:

```text
start < end
capacity > 0
price >= 0
```

Priority:

```text
P0
```

---

## GB-082 — Detect Slot Overlap

Vendor được cảnh báo hoặc chặn theo rule đã định nghĩa.

Priority:

```text
P1
```

---

## GB-083 — Update Slot

Không giảm capacity dưới confirmed quantity.

Priority:

```text
P0
```

---

## GB-084 — Disable Slot

Priority:

```text
P1
```

---

## GB-085 — Public Available Slot API

```text
GET /services/:id/slots
```

Chỉ trả slot future + available.

Priority:

```text
P0
```

---

## GB-086 — Price Snapshot Logic

Priority:

```text
P0
```

Unit test bắt buộc.

---

# EPIC-09 — Search

## GB-090 — Search Services

```text
GET /services
```

Filters:

```text
q
category
date
minPrice
maxPrice
location
```

Priority:

```text
P1
```

---

## GB-091 — Pagination

Priority:

```text
P1
```

---

## GB-092 — Sorting

```text
newest
price_asc
price_desc
```

Priority:

```text
P2
```

---

## GB-093 — Search UI

Priority:

```text
P1
```

---

# EPIC-10 — Booking Engine

## GB-100 — Booking Model

Priority:

```text
P0
```

Fields gồm:

```text
customer_id
vendor_id
status
subtotal
discount
gross
platform_fee
vendor_amount
expires_at
```

---

## GB-101 — Booking Item Model

Snapshot:

```text
service_name
slot_start
slot_end
unit_price
quantity
```

Priority:

```text
P0
```

---

## GB-102 — Reservation Model

Fields:

```text
booking_id
slot_id
quantity
status
expires_at
```

Status:

```text
ACTIVE
CONSUMED
EXPIRED
RELEASED
```

Priority:

```text
P0
```

---

## GB-103 — Hold Reservation

Endpoint:

```text
POST /bookings/hold
```

Input:

```text
slotId
quantity
voucherCode?
```

Acceptance Criteria:

- Slot tồn tại.
- Service published.
- Slot future.
- Capacity đủ.
- Booking created.
- Reservation created.
- Expiration assigned.
- Money snapshot created.

Priority:

```text
P0
```

---

## GB-104 — Booking Capacity Calculation

Formula:

```text
available
=
capacity
-
confirmed
-
active_hold
```

Priority:

```text
P0
```

---

## GB-105 — Reservation Database Lock

Implement:

```text
SELECT FOR UPDATE
```

hoặc equivalent atomic solution.

Priority:

```text
P0
```

---

## GB-106 — Concurrent Booking Test

Scenario:

```text
capacity 10
100 requests
```

Expected:

```text
10 success
90 rejected
0 oversold
```

Priority:

```text
P0
```

---

## GB-107 — Reservation Expiration Job

Branch:

```text
feat/reservation-expiration
```

Priority:

```text
P0
```

---

## GB-108 — Release Capacity

Khi reservation expire:

```text
Reservation EXPIRED
Booking EXPIRED
```

Priority:

```text
P0
```

---

## GB-109 — Redis BullMQ Setup

Queue:

```text
reservation-expiration
notification
```

Priority:

```text
P1
```

---

## GB-110 — Booking Detail

Customer:

```text
GET /bookings/:id
```

Ownership required.

Priority:

```text
P0
```

---

## GB-111 — My Bookings

```text
GET /me/bookings
```

Priority:

```text
P1
```

---

## GB-112 — Booking Countdown UI

Hiển thị:

```text
09:58
09:57
...
```

Hết thời gian:

```text
Booking expired
```

Priority:

```text
P1
```

---

# EPIC-11 — Payment VNPay

## GB-120 — Payment Model

Priority:

```text
P0
```

---

## GB-121 — Payment Attempt Model

Priority:

```text
P0
```

---

## GB-122 — Payment Webhook Log Model

Priority:

```text
P0
```

---

## GB-123 — Payment Gateway Interface

Methods:

```text
createPayment
verifyCallback
queryPayment
refund
```

Priority:

```text
P1
```

---

## GB-124 — VNPay Adapter

Priority:

```text
P0
```

---

## GB-125 — Create Payment URL

Endpoint:

```text
POST /payments/vnpay
```

Acceptance Criteria:

- Booking belongs to current user.
- Booking not expired.
- Amount từ DB, không lấy từ frontend.
- Signature đúng.
- Payment attempt created.

Priority:

```text
P0
```

---

## GB-126 — VNPay Return Handler

Route frontend:

```text
/payment/result
```

Không update payment trực tiếp.

Priority:

```text
P1
```

---

## GB-127 — VNPay IPN Endpoint

Endpoint:

```text
GET/POST /payments/vnpay/ipn
```

theo integration requirement.

Priority:

```text
P0
```

---

## GB-128 — Verify VNPay Signature

Invalid:

```text
reject
log callback
no state change
```

Priority:

```text
P0
```

---

## GB-129 — Verify Payment Amount

Nếu gateway amount != DB amount:

```text
do not confirm
mark exception
log
```

Priority:

```text
P0
```

---

## GB-130 — Payment Idempotency

Acceptance Criteria:

Duplicate callback không:

```text
generate ticket twice
confirm booking twice
change amount twice
```

Priority:

```text
P0
```

---

## GB-131 — Confirm Booking on Payment Success

Transaction:

```text
Payment SUCCESS
Reservation CONSUMED
Booking CONFIRMED
Ticket generation requested
```

Priority:

```text
P0
```

---

## GB-132 — Handle Payment Failure

Priority:

```text
P0
```

---

## GB-133 — Payment Retry

Nếu reservation vẫn ACTIVE:

Customer có thể tạo attempt mới.

Priority:

```text
P1
```

---

## GB-134 — Payment Timeout

Priority:

```text
P0
```

---

## GB-135 — Late Payment Callback

Scenario:

```text
booking expired
payment success arrives
```

Expected:

```text
do not confirm sold slot
flag NEEDS_REVIEW
```

Priority:

```text
P0
```

---

## GB-136 — Duplicate Callback Test

Priority:

```text
P0
```

---

## GB-137 — Wrong Amount Test

Priority:

```text
P0
```

---

## GB-138 — Invalid Signature Test

Priority:

```text
P0
```

---

# EPIC-12 — Ticket

## GB-140 — Ticket Model

Priority:

```text
P0
```

---

## GB-141 — Ticket Token Generator

Token phải:

```text
random
unguessable
unique
```

Priority:

```text
P0
```

---

## GB-142 — Generate Ticket after Confirmation

Priority:

```text
P0
```

---

## GB-143 — Generate QR

Priority:

```text
P0
```

---

## GB-144 — Customer Ticket Page

Hiển thị:

```text
service
time
booking code
ticket status
QR
```

Priority:

```text
P1
```

---

## GB-145 — Validate Ticket

Endpoint:

```text
POST /tickets/verify
```

Priority:

```text
P0
```

---

## GB-146 — Vendor Check-in

Priority:

```text
P0
```

---

## GB-147 — Check-in Ownership

Vendor chỉ scan ticket service của mình.

Priority:

```text
P0
```

---

## GB-148 — Duplicate Check-in Protection

Priority:

```text
P0
```

---

## GB-149 — Concurrent Scan Test

Priority:

```text
P1
```

---

# EPIC-13 — Voucher

## GB-150 — Voucher Model

Priority:

```text
P1
```

---

## GB-151 — Vendor Create Voucher

Priority:

```text
P1
```

---

## GB-152 — Validate Voucher

Checks:

```text
code
status
time
min order
usage
user usage
eligibility
```

Priority:

```text
P1
```

---

## GB-153 — Percentage Voucher

Priority:

```text
P1
```

---

## GB-154 — Fixed Voucher

Priority:

```text
P1
```

---

## GB-155 — Maximum Discount

Priority:

```text
P1
```

---

## GB-156 — Voucher Usage Model

Priority:

```text
P1
```

---

## GB-157 — Voucher Concurrent Usage Protection

Scenario:

```text
remaining = 1
2 customers
```

Expected:

```text
1 success
```

Priority:

```text
P0
```

---

# EPIC-14 — Cancellation & Refund

## GB-160 — Cancellation Policy Model

Priority:

```text
P1
```

---

## GB-161 — Cancellation Policy Snapshot

Priority:

```text
P0
```

---

## GB-162 — Refund Calculation Service

Input:

```text
booking
current time
policy snapshot
```

Output:

```text
refund rate
refund amount
reason
```

Priority:

```text
P0
```

---

## GB-163 — Refund Calculation Unit Tests

Cases:

```text
100%
50%
0%
boundary exactly 24h
```

Priority:

```text
P0
```

---

## GB-164 — Customer Cancel Booking

Priority:

```text
P1
```

---

## GB-165 — Cancel Ticket

Booking cancel:

```text
Ticket → CANCELLED
```

Priority:

```text
P0
```

---

## GB-166 — Refund Model

Priority:

```text
P0
```

---

## GB-167 — Full Refund Flow

Priority:

```text
P1
```

---

## GB-168 — Partial Refund Flow

Priority:

```text
P1
```

---

## GB-169 — Refund Adapter

Nếu VNPay sandbox limitation:

```text
MockRefundGateway
```

được phép dùng trong staging demo.

Priority:

```text
P2
```

---

# EPIC-15 — Commission

## GB-170 — Platform Commission Config

MVP có thể config:

```text
DEFAULT_COMMISSION_PERCENT=10
```

Priority:

```text
P1
```

---

## GB-171 — Commission Calculator

Priority:

```text
P0
```

---

## GB-172 — Commission Snapshot

Booking lưu:

```text
commission_rate
platform_fee
vendor_amount
```

Priority:

```text
P0
```

---

## GB-173 — Commission Unit Tests

Priority:

```text
P0
```

---

# EPIC-16 — Reviews

## GB-180 — Review Model

Priority:

```text
P2
```

---

## GB-181 — Create Review

Eligibility:

```text
booking COMPLETED
```

Priority:

```text
P2
```

---

## GB-182 — Prevent Duplicate Review

Priority:

```text
P2
```

---

## GB-183 — Public Reviews

Priority:

```text
P2
```

---

# EPIC-17 — Vendor Operations

## GB-190 — Vendor Booking List

Filters:

```text
UPCOMING
COMPLETED
CANCELLED
```

Priority:

```text
P1
```

---

## GB-191 — Vendor Booking Detail

Priority:

```text
P1
```

---

## GB-192 — Revenue Aggregation API

Metrics:

```text
gross
platform_fee
vendor_amount
```

Priority:

```text
P1
```

---

## GB-193 — Occupancy Calculation

Formula:

```text
confirmed seats / total capacity
```

Priority:

```text
P2
```

---

## GB-194 — Cancellation Rate

Priority:

```text
P2
```

---

## GB-195 — Vendor Dashboard UI

Priority:

```text
P1
```

---

# EPIC-18 — Admin Operations

## GB-200 — Admin Booking List

Priority:

```text
P1
```

---

## GB-201 — Admin Booking Detail

Display:

```text
booking
reservation
payment
ticket
refund
```

Priority:

```text
P1
```

---

## GB-202 — Admin Transaction List

Priority:

```text
P0
```

---

## GB-203 — Search by Gateway Transaction

Priority:

```text
P1
```

---

## GB-204 — Search by Booking Code

Priority:

```text
P1
```

---

## GB-205 — Filter Payment Status

Priority:

```text
P1
```

---

## GB-206 — Webhook Log Viewer

Priority:

```text
P2
```

---

# EPIC-19 — Notification

## GB-210 — Notification Model

Priority:

```text
P2
```

---

## GB-211 — Email Provider Adapter

Interface:

```text
send()
```

Priority:

```text
P2
```

---

## GB-212 — Booking Confirmation Email

Priority:

```text
P1
```

---

## GB-213 — Vendor Approval Email

Priority:

```text
P2
```

---

## GB-214 — Booking Cancellation Email

Priority:

```text
P2
```

---

## GB-215 — Async Email Queue

Priority:

```text
P2
```

---

# EPIC-20 — Observability

## GB-220 — Request ID Middleware

Priority:

```text
P1
```

---

## GB-221 — Structured Logger

Context:

```text
requestId
userId
bookingId
paymentId
```

Priority:

```text
P1
```

---

## GB-222 — Payment Logs

Priority:

```text
P0
```

---

## GB-223 — Sentry Backend

Priority:

```text
P2
```

---

## GB-224 — Sentry Frontend

Priority:

```text
P2
```

---

# EPIC-21 — Security

## GB-230 — Helmet

Priority:

```text
P1
```

---

## GB-231 — CORS Policy

Priority:

```text
P1
```

---

## GB-232 — Global Validation Pipe

Priority:

```text
P0
```

---

## GB-233 — Rate Limiting

Priority:

```text
P1
```

---

## GB-234 — Secret Audit

Kiểm tra repository không có:

```text
password
API secret
VNPay secret
production DB URL
JWT secret
```

Priority:

```text
P0
```

---

## GB-235 — Dependency Audit

Priority:

```text
P2
```

---

## GB-236 — Authorization Security Test

Priority:

```text
P0
```

---

# EPIC-22 — API Documentation

## GB-240 — Swagger Setup

Priority:

```text
P1
```

---

## GB-241 — Auth Swagger

Priority:

```text
P2
```

---

## GB-242 — Booking Swagger

Priority:

```text
P1
```

---

## GB-243 — Payment Swagger

Priority:

```text
P0
```

---

## GB-244 — Ticket Swagger

Priority:

```text
P1
```

---

# EPIC-23 — Testing

## GB-250 — Pricing Unit Tests

Priority:

```text
P0
```

---

## GB-251 — Voucher Unit Tests

Priority:

```text
P1
```

---

## GB-252 — Cancellation Unit Tests

Priority:

```text
P0
```

---

## GB-253 — Commission Unit Tests

Priority:

```text
P0
```

---

## GB-254 — Booking Integration Tests

Priority:

```text
P0
```

---

## GB-255 — Reservation Expiration Integration Test

Priority:

```text
P0
```

---

## GB-256 — Payment Integration Tests

Priority:

```text
P0
```

---

## GB-257 — Ticket Integration Test

Priority:

```text
P1
```

---

## GB-258 — Playwright Setup

Priority:

```text
P1
```

---

## GB-259 — Customer Critical E2E

Flow:

```text
Register
→ Login
→ Search
→ Select Slot
→ Hold
→ Payment
→ Confirm
→ Ticket
```

Priority:

```text
P0
```

---

# EPIC-24 — Performance

## GB-260 — k6 Setup

Priority:

```text
P1
```

---

## GB-261 — Booking Load Test

Scenario:

```text
100 concurrent requests
capacity 10
```

Metrics:

```text
success
failure
oversell
latency
```

Priority:

```text
P0
```

---

## GB-262 — General API Load Test

Priority:

```text
P2
```

---

## GB-263 — Database Pool Review

Priority:

```text
P1
```

---

# EPIC-25 — Docker & Deployment

## GB-270 — Backend Production Dockerfile

Requirements:

```text
multi-stage
production dependencies
non-root if practical
healthcheck
```

Priority:

```text
P0
```

---

## GB-271 — Frontend Production Build

Priority:

```text
P0
```

---

## GB-272 — API Health Endpoint

```text
GET /health
```

Priority:

```text
P0
```

---

## GB-273 — Deploy Staging Database

Priority:

```text
P0
```

---

## GB-274 — Deploy Staging Redis

Priority:

```text
P1
```

---

## GB-275 — Deploy Backend Staging

Priority:

```text
P0
```

---

## GB-276 — Deploy Frontend Staging

Priority:

```text
P0
```

---

## GB-277 — Staging Environment Variables

Priority:

```text
P0
```

---

## GB-278 — Staging Smoke Test

Test:

```text
health
auth
service
booking
payment
ticket
```

Priority:

```text
P0
```

---

# EPIC-26 — Production Readiness

## GB-280 — Deployment Documentation

```text
docs/DEPLOYMENT.md
```

Priority:

```text
P1
```

---

## GB-281 — Database Migration Procedure

Document:

```text
how to migrate
when to migrate
what if migration fails
```

Priority:

```text
P0
```

---

## GB-282 — Backup Procedure

```text
docs/BACKUP.md
```

Priority:

```text
P1
```

---

## GB-283 — Restore Procedure

Priority:

```text
P1
```

---

## GB-284 — Rollback Procedure

Priority:

```text
P0
```

---

## GB-285 — Incident Runbook

```text
docs/INCIDENT_RUNBOOK.md
```

Cases:

```text
API down
DB connection fail
Redis down
payment mismatch
duplicate callback
overselling incident
```

Priority:

```text
P1
```

---

## GB-286 — Payment Flow Documentation

```text
docs/PAYMENT_FLOW.md
```

Priority:

```text
P0
```

---

# EPIC-27 — Production Release

## GB-290 — Create Release Branch

```text
release/v1.0.0
```

Priority:

```text
P0
```

---

## GB-291 — Run Full CI

Must pass:

```text
lint
typecheck
unit
integration
build
```

Priority:

```text
P0
```

---

## GB-292 — Run Staging E2E

Priority:

```text
P0
```

---

## GB-293 — Run Payment Sandbox Test

Priority:

```text
P0
```

---

## GB-294 — Run Concurrency Test

Required:

```text
oversold = 0
```

Priority:

```text
P0
```

---

## GB-295 — Security Smoke Test

Priority:

```text
P0
```

---

## GB-296 — Production PR

```text
release/v1.0.0
→
production
```

Priority:

```text
P0
```

---

## GB-297 — Deploy Production

Priority:

```text
P0
```

---

## GB-298 — Production Smoke Test

Verify:

```text
health
login
search
booking
payment configuration
ticket
```

Priority:

```text
P0
```

---

## GB-299 — Tag Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

Priority:

```text
P0
```

---

# 3. Critical Path

Các issue sau tạo thành Critical Path:

```text
GB-010 Monorepo
↓
GB-030 Prisma
↓
GB-040 User
↓
GB-041 Register
↓
GB-042 Login
↓
GB-050 RBAC
↓
GB-060 Vendor
↓
GB-073 Service
↓
GB-080 Slot
↓
GB-100 Booking
↓
GB-102 Reservation
↓
GB-103 Hold
↓
GB-105 Concurrency
↓
GB-107 Expiration
↓
GB-120 Payment
↓
GB-124 VNPay
↓
GB-125 Create Payment
↓
GB-127 IPN
↓
GB-130 Idempotency
↓
GB-131 Confirm Booking
↓
GB-140 Ticket
↓
GB-146 Check-in
↓
GB-259 E2E
↓
GB-275 Staging
↓
GB-296 Production PR
↓
GB-297 Production
```

Nếu bị chậm tiến độ:

> Không được cắt các issue trên.

---

# 4. First Features to Cut if Behind Schedule

Nếu chậm timeline, cắt theo thứ tự:

```text
1. Review
2. Sentry frontend
3. Advanced vendor dashboard
4. Email notification phụ
5. Search sorting
6. Upload KYC document
7. Partial refund UI
```

Không cắt:

```text
Booking concurrency
Reservation timeout
Payment signature
Payment idempotency
Payment validation
Authorization
Ticket check-in protection
Critical tests
```

---

# 5. Milestones

## Milestone M1 — Foundation

Target:

```text
Day 7
```

Done when:

```text
Repository
Docker
DB
Redis
CI
Git Workflow
```

---

## Milestone M2 — Identity

Target:

```text
Day 14
```

Done when:

```text
Auth
RBAC
Vendor Application
Admin Approval
```

---

## Milestone M3 — Catalog

Target:

```text
Day 21
```

Done when:

```text
Service
Image
Slot
Price
Search
```

---

## Milestone M4 — Booking Engine

Target:

```text
Day 28
```

Done when:

```text
Hold
TTL
Release
Concurrency
No Oversell
```

---

## Milestone M5 — Payment

Target:

```text
Day 35
```

Done when:

```text
VNPay
IPN
Signature
Idempotency
Booking Confirmation
Payment Timeout
```

---

## Milestone M6 — Ticket & Cancellation

Target:

```text
Day 42
```

Done when:

```text
QR
Verify
Check-in
Cancellation
Refund Domain
```

---

## Milestone M7 — Business

Target:

```text
Day 49
```

Done when:

```text
Voucher
Commission
Vendor Dashboard
Admin Transaction
```

---

## Milestone M8 — Production Candidate

Target:

```text
Day 56
```

Done when:

```text
Tests
Security
Logs
Docker
```

---

## Milestone M9 — Production

Target:

```text
Day 60
```

Done when:

```text
Staging
Load Test
Backup
Rollback
Production
v1.0.0
```

---

# 6. Pull Request Rule

Một PR nên giải quyết:

```text
1 issue
```

hoặc một nhóm issue rất liên quan.

Target size:

```text
small enough to review in 10–20 minutes
```

Không tạo PR:

```text
"Implement Booking and Payment System"
```

Nên tạo:

```text
PR #1 Booking schema
PR #2 Reservation creation
PR #3 Reservation expiration
PR #4 Concurrency lock
PR #5 Concurrency tests
PR #6 Payment model
PR #7 VNPay create payment
PR #8 VNPay IPN
PR #9 Payment idempotency
```

---

# 7. Standard GitHub Issue Template

```text
Title:
[Booking] Implement reservation expiration

Problem:
Reservation currently remains active forever.

Goal:
Automatically expire reservations after configured TTL.

Business Rules:
- Default hold time = 10 minutes.
- PostgreSQL is source of truth.
- Redis/BullMQ triggers expiration.
- Expired reservation releases capacity.

Acceptance Criteria:
- Reservation has expiresAt.
- Expiration job runs.
- ACTIVE becomes EXPIRED.
- Booking becomes EXPIRED.
- Capacity becomes available.
- Confirmed reservation cannot expire.
- Tests included.

Dependencies:
GB-102 Reservation Model
GB-109 BullMQ

Priority:
P0

Suggested Branch:
feat/reservation-expiration
```

---

# 8. Standard PR Checklist

```text
[ ] Linked issue
[ ] Correct branch
[ ] Scope matches issue
[ ] Validation added
[ ] Authorization checked
[ ] Error handling added
[ ] Migration reviewed
[ ] Unit tests added
[ ] Integration tests added if needed
[ ] Swagger updated
[ ] No secrets committed
[ ] Lint passed
[ ] Typecheck passed
[ ] Tests passed
[ ] Build passed
[ ] Self review completed
```

---

# 9. MVP Backlog Exit Condition

Backlog MVP được xem là hoàn thành khi:

```text
All P0 = DONE
All required P1 = DONE
Critical E2E = PASS
Concurrency test = PASS
Payment tests = PASS
Security tests = PASS
Staging smoke test = PASS
Production deployment = PASS
```

P2/P3 không phải lý do trì hoãn release nếu Core MVP đã đạt.

---

# 10. Final Release Gate

Không release nếu bất kỳ điều kiện nào sau tồn tại:

```text
Overselling detected

Payment callback can be processed twice

Payment amount taken from frontend

Webhook signature not validated

Customer can access another customer's booking

Vendor can edit another vendor's resource

Ticket can check-in twice

Migration untested

No rollback plan

Production secret committed to repository
```

Release chỉ được phép khi:

```text
Core Business Correctness
+
Payment Correctness
+
Authorization Correctness
+
Operational Readiness
```

đều đạt.

Đây là backlog chính thức cho **GoBook MVP v1.0.0**.