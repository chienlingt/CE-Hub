# Chapter 7 – System Evaluation: Test Cases

> **How to use:** Status is "Not run" for every case. Run each test, then set Status to Pass / Fail and (for UAT) fill in Actual Result.
> Cases marked **⚠** are expected to FAIL until the noted gap is fixed – either fix the gap or move the case to Limitations.
> IDs: `TC-<MODULE>-<LEVEL>-<NNN>` where LEVEL = UT (unit), IT (integration), ST (system).
> Modules: SYN = A.1 Order Synchronisation, LOD = A.2 Truck Loading, TRK = A.3 Delivery Tracking, CMP = A.4 Delivery Completion, FAL = A.5 Failed Delivery, NTF = A.6 Notification, SCH = B.1 Scheduling, RTE = B.2 Route Optimisation, MST = B.3 Master Data & Orders (incl. AUTH), INC = B.4 Incentives.

---

## 7.2 Unit Testing

### 7.2.1 A.1 Order Synchronisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SYN-UT-001 | Reject webhook without secret | 1. Send POST to `/api/webhooks/odoo/order-readiness`.<br>2. Omit `x-odoo-secret`.<br>3. Check response. | Header: none | HTTP 401 `Unauthorized`; no order is created. | Not run |
| TC-SYN-UT-002 | Reject wrong secret | 1. Send POST with an incorrect secret.<br>2. Check response. | `x-odoo-secret: wrong` | HTTP 401 `Unauthorized`. | Not run |
| TC-SYN-UT-003 | Payload must include id and name | 1. Send POST to `/odoo/order` with valid secret.<br>2. Omit `name`. | `{ "id": 101 }` | HTTP 400 `Payload must include id and name`. | Not run |
| TC-SYN-UT-004 | Payload must be a JSON object | 1. Send POST with a JSON array body. | `[ {…} ]` | HTTP 400 `Payload must be a JSON object`. | Not run |
| TC-SYN-UT-005 | Line identity validation | 1. Call `assertIncomingLineIdentity`.<br>2. Pass a line with a mismatched `order_line_id`. | Line ID ≠ stored stock.move ID | Function throws; the line is not merged. | Not run |
| TC-SYN-UT-006 | Duplicate webhook is idempotent | 1. Send the same DO payload twice. | Same payload ×2 | First returns 202 `created`; second returns 200 `previously_received`; only one order exists. | Not run |

### 7.2.2 A.2 Truck Loading Enforcement

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-LOD-UT-001 | Loading sequence is reverse of delivery sequence | 1. Provide 3 stops with delivery order 1, 2, 3.<br>2. Compute loading sequence. | Stops A, B, C | Loading sequence is C=1, B=2, A=3 (last delivered is loaded first). | Not run |
| TC-LOD-UT-002 | Reject unknown unit scan | 1. Scan a code not in the system. | Code: `UNKNOWN-123` | Scan rejected with an error; progress unchanged. | Not run |
| TC-LOD-UT-003 | Reject duplicate scan | 1. Scan unit U1.<br>2. Scan U1 again. | Unit U1 | Second scan rejected as duplicate; scanned count stays 1. | Not run |
| TC-LOD-UT-004 | Reject wrong-order unit | 1. Scan a unit that belongs to order B while loading order A. | Unit of order B | Scan rejected as wrong order. | Not run |
| TC-LOD-UT-005 | Loading progress calculation | 1. Order has 4 units, 3 scanned.<br>2. Call `computeOrderLoadingStats`. | 4 units, 3 scanned | Progress = 75 %; order not marked fully loaded. | Not run |

### 7.2.3 A.3 Real-Time Delivery Tracking

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-TRK-UT-001 | Stale location is not used as route origin | 1. Save driver location with `updated_at` 10 min ago.<br>2. Request route origin. | Age = 10 min | Origin is `null`; the warehouse is used instead. | Not run |
| TC-TRK-UT-002 | Fresh location is used | 1. Save location updated 1 min ago. | Age = 1 min | Origin equals the saved latitude and longitude. | Not run |
| TC-TRK-UT-003 | Invalid coordinates rejected | 1. Call `validCoords`. | lat 91, lon 101 / lat NaN | Returns false for both. | Not run |
| TC-TRK-UT-004 | Date key uses Malaysia time | 1. Call `toAppDateKey`.<br>2. Pass 2026-11-12T17:30:00Z. | UTC instant | Returns `2026-11-13` (UTC+8). | Not run |

### 7.2.4 A.4 Delivery Completion Processing

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-CMP-UT-001 | Block delivery with unscanned units | 1. Order has unscanned units.<br>2. Call the delivery completion service. | 1 of 3 units unscanned | Request rejected; status stays Delivering. | Not run |
| TC-CMP-UT-002 | Reject non-image evidence | 1. Upload a PDF as evidence. | `evidence.pdf` | Error `Only image files are allowed`. | Not run |
| TC-CMP-UT-003 | Reject oversized evidence | 1. Upload a 12 MB image. | 12 MB JPEG | Upload rejected (limit 10 MB). | Not run |
| TC-CMP-UT-004 | Partial delivery quantity | 1. Complete delivery with delivered qty 2 of 3.<br>2. Build Odoo payload. | qty 2/3 | Payload line shows delivered qty 2. | Not run |
| TC-CMP-UT-005 | Slot auto-closes when all orders terminal | 1. Mark the last order Delivered.<br>2. Check `isEndTripTerminal`. | All orders Delivered/Failed | Returns true; the trip is closed. | Not run |

### 7.2.5 A.5 Failed Delivery Handling

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-FAL-UT-001 | Valid failure reasons | 1. Submit each of the 5 reasons. | Customer Unreachable, Access Blocked, Customer Rejected, Incorrect Address, Other (with text) | All are accepted. | Not run |
| TC-FAL-UT-002 | Invalid reason | 1. Submit an unlisted reason. | `Bad weather` | Rejected with a validation error. | Not run |
| TC-FAL-UT-003 | "Other" requires description | 1. Submit reason Other with no description. | Reason: Other, text empty | Rejected; description required. | Not run |
| TC-FAL-UT-004 | Ineligible order status | 1. Confirm failure on an order in Scheduled status. | Status: Scheduled | Rejected; only Delivering or In Progress allowed. | Not run |
| TC-FAL-UT-005 | Wrong driver | 1. Confirm failure using another driver's `employee_id`. | Driver ≠ assigned | Rejected as not the assigned driver. | Not run |
| TC-FAL-UT-006 | Duplicate failure | 1. Confirm failure twice on the same order. | Same order | Second call returns 409. | Not run |
| TC-FAL-UT-007 | Unresolved line items | 1. Confirm failure while one line has no outcome. | 1 line pending | Rejected; every line must be delivered or failed. | Not run |

### 7.2.6 A.6 Notification

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-NTF-UT-001 | Template placeholder substitution | 1. Render a template with data. | `{customer}`=Ali, `{ref}`=DO123 | Placeholders replaced; no raw `{}` remain. | Not run |
| TC-NTF-UT-002 | Disabled channel not used | 1. Disable WhatsApp in settings.<br>2. Trigger a notification. | WhatsApp = off | No WhatsApp message is sent; in-app still created. | Not run |
| TC-NTF-UT-003 | Failure notification content | 1. Build the failure notification. | A failed order | Contains DO reference, customer name, address, failure reason and time (FR-06-003). | Not run |
| TC-NTF-UT-004 | Mark notification read | 1. Mark an unread notification as read. | Notification N1 | Read flag set; unread count decreases by 1. | Not run |

### 7.2.7 B.1 Intelligent Scheduling

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SCH-UT-001 | Order longer than slot is not assigned | 1. Slot = 120 min.<br>2. Order service time + grace = 150 min. | 150 min vs 120 min | Order is skipped and listed as unscheduled with a reason. | Not run |
| TC-SCH-UT-002 | Truck capacity exceeded | 1. Order volume exceeds truck capacity. | Volume > truck volume | Not assigned to that truck. | Not run |
| TC-SCH-UT-003 | Grace buffer between orders | 1. Schedule two orders back to back. | Order 1 ends 10:00 | Order 2 starts no earlier than 10:00 + `ORDER_GRACE_SECONDS`. | Not run |
| TC-SCH-UT-004 | Building access window | 1. Order's building allows 09:00–17:00.<br>2. Try a slot at 18:00. | Slot 18:00 | Slot rejected for the building access constraint. | Not run |
| TC-SCH-UT-005 | Unavailable team excluded | 1. Set team `available_flag` false.<br>2. Run the scheduler. | Team off | No orders are assigned to that team. | Not run |

### 7.2.8 B.2 Route Optimisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-RTE-UT-001 | ETA and service end per stop | 1. Optimise a slot with 3 stops. | 3 stops | Each stop has ETA, service end time and road leg. | Pass (run 2026-11-13) |
| TC-RTE-UT-002 | Fallback when road service fails | 1. Make the Google call fail.<br>2. Optimise. | Google unavailable | Route computed with straight-line estimates; `used_fallback` = true. | Pass (run 2026-11-13) |
| TC-RTE-UT-003 | Address cache key normalisation | 1. Generate keys for "No 1,  Jalan A" and "no 1, jalan a". | Two spellings | Both produce the same cache key. | Pass (run 2026-11-13) |
| TC-RTE-UT-004 | Manual order violates access window | 1. Reorder stops so one arrives after its window. | Late stop | Response lists the violation with `minutes_late`. | Pass (run 2026-11-13) |
| TC-RTE-UT-005 | Delivered/failed stops excluded | 1. Optimise a slot with one Delivered order. | 1 Delivered + 2 pending | Only the 2 pending stops are routed. | Partial – algorithm part passed; Delivered-stop exclusion needs the database |
| TC-RTE-UT-006 | Sequencing 75 stops (algorithm only) | 1. Build a 76 × 76 duration and distance matrix (origin + 75 stops) from random Klang Valley points.<br>2. Call `selectBestSequence`.<br>3. Record the time over several runs. | 75 orders, synthetic matrix, no Google or database | Returns a sequence of 75 stops with ETAs. Record min, median and max time. This isolates the algorithm from API and database time. | Pass – min 34.2 s, median 36.1 s, max 38.6 s over 7 runs (synthetic matrix) |
| TC-RTE-UT-007 | Gap between stops comes from the admin setting | 1. Call `graceSecondsFrom` with `grace_minutes` 30, 0, 60 and with null, -1, 61, 7.5, "abc".<br>2. Evaluate a 2-stop route with gap 0 and gap 30 min. | Setting values as listed | Valid values (0–60) are used as minutes; missing or invalid values fall back to 15 min. A 30-minute gap makes stop 2 start exactly 30 minutes later than a 0-minute gap; stop 1 is unaffected. | Pass (run 2026-11-14, `graceSetting.test.js`) |

### 7.2.9 B.3 Master Data, Orders and Authentication

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-MST-UT-001 | Hash password | 1. Call `bcrypt.hash`. | `Password123` | Returns a hash different from, and longer than, the input. | Not run |
| TC-MST-UT-002 | Compare password | 1. Call `bcrypt.compare` with the correct and a wrong password. | `Password123` / `Wrong` | true for correct; false for wrong. | Not run |
| TC-MST-UT-003 | Login missing fields | 1. POST `/api/auth/login` without a password. | email only | HTTP 400 `Email and password are required`. | Not run |
| TC-MST-UT-004 | Login unknown email / wrong password | 1. POST with bad credentials. | wrong password | HTTP 401 `Invalid credentials`. | Not run |
| TC-MST-UT-005 | Deactivated account | 1. Login as an inactive employee. | `active_flag` false | HTTP 403 account deactivated. | Not run |
| TC-MST-UT-006 | Reset token content | 1. Request a reset.<br>2. Decode the JWT. | Valid email | Token has `employeeId`, `type: password-reset`, expiry 1 hour. | Not run |
| TC-MST-UT-007 | Installation time validation | 1. Save a product with min 60, max 30. | min > max | Rejected with a validation error. | Not run |
| TC-MST-UT-008 | Duplicate truck plate **⚠** | 1. Create two trucks with plate `WXY1234`. | Same plate | Second is rejected. *(Needs implementing – see FR-B3-04.)* | Not run |

### 7.2.10 B.4 Employee Performance and Incentives *(after the module is built)*

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-INC-UT-001 | Base incentive | 1. Employee with 20 delivered orders, rate RM5. | 20 × RM5 | Incentive = RM100.00. | Not run |
| TC-INC-UT-002 | On-time bonus | 1. On-time rate above the bonus threshold. | 95 % on time | Bonus added per the active rule. | Not run |
| TC-INC-UT-003 | Failed-delivery deduction | 1. Employee has 2 failures. | 2 failed | Deduction applied per the active rule. | Not run |
| TC-INC-UT-004 | Finalised month is read-only | 1. Finalise November.<br>2. Try to edit it. | Finalised summary | Edit rejected; stored amounts unchanged. | Not run |

---

## 7.3 Integration Testing

### 7.3.1 A.1 Order Synchronisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SYN-IT-001 | Webhook creates order with lines | 1. POST a valid DO to `/odoo/order` with the secret.<br>2. Open Manage Orders. | Valid DO with 2 lines | HTTP 202; the order and its 2 lines appear; the address is queued for geocoding. | Not run |
| TC-SYN-IT-002 | Webhook run is logged | 1. Send a webhook.<br>2. Open Sync Run History. | Valid DO | A run entry exists with status code and time. | Not run |
| TC-SYN-IT-003 | Remarks parsed by LLM | 1. Send a DO with free-text remarks.<br>2. Open the order. | Remarks containing an address and phone | Address and primary contact are extracted and shown. | Not run |
| TC-SYN-IT-004 | Admin overrides parsed values | 1. Open the order.<br>2. Edit the address and contact.<br>3. Save. | Corrected address | The edited values are saved and used for scheduling and geocoding. | Not run |
| TC-SYN-IT-005 | Change to an in-motion order needs approval | 1. Send an update for a Scheduled order.<br>2. Open Odoo Change Review. | Changed quantity | A change request is created; the order is unchanged until approved. | Not run |
| TC-SYN-IT-006 | Polling fallback imports missed order | 1. Remove an order locally.<br>2. Run the 5 PM fallback. | Missed DO | The order is imported and the run is logged. | Not run |
| TC-SYN-IT-007 | Sync failure alerts admin | 1. Make the Odoo call fail.<br>2. Run the fallback. | Odoo down | The run is marked failed and the admin sees an alert. | Not run |

### 7.3.2 A.2 Truck Loading Enforcement

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-LOD-IT-001 | Search loading list | 1. Open the loading list.<br>2. Search by date, customer, item and order number. | Order O1 | Matching orders are shown for each filter. | Not run |
| TC-LOD-IT-002 | Scan updates progress | 1. Open the scan station.<br>2. Scan 2 of 3 units. | Order O1 | Progress shows 2/3 in the UI and API. | Not run |
| TC-LOD-IT-003 | Rejected scan is not counted | 1. Scan an unknown, a duplicate and a wrong-order unit. | 3 bad scans | Each is rejected; the progress count is unchanged. | Not run |
| TC-LOD-IT-004 | Slot cannot depart until loaded | 1. Leave one unit unscanned.<br>2. Driver taps Depart. | 1 unit missing | Departure is blocked with a message. | Not run |
| TC-LOD-IT-005 | Route change recalculates loading sequence | 1. Admin reorders two stops.<br>2. Open the loading list. | Swap stop 1 and 2 | Loading sequence matches the new delivery order. | Not run |

### 7.3.3 A.3 Real-Time Delivery Tracking

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-TRK-IT-001 | Depart starts the trip | 1. Driver departs the slot. | Slot with 3 orders | Orders move to Delivering and a lorry trip is created. | Not run |
| TC-TRK-IT-002 | Depart notifies customers | 1. Driver departs the slot.<br>2. Check notifications. | Slot with 3 orders | "On the way" notifications are queued for each customer. | Not run |
| TC-TRK-IT-003 | Location is saved | 1. Driver app sends GPS.<br>2. Query `employee_locations`. | GPS point | The latest position is stored with a fresh `updated_at`. | Not run |
| TC-TRK-IT-004 | Admin sees live status | 1. Driver sends location.<br>2. Admin opens Live Ops. | GPS point | The team's slot, order status and position appear. | Not run |
| TC-TRK-IT-005 | Stranded orders are recovered | 1. Leave an order on a departed slot.<br>2. Run the recovery routine. | Departed slot | The order is corrected or flagged. | Not run |

### 7.3.4 A.4 Delivery Completion Processing

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-CMP-IT-001 | Delivery with POD | 1. Driver completes a delivery with 2 photos and a signature. | 2 JPEG files | Status becomes Delivered; files are saved; an Odoo outbox row is queued. | Not run |
| TC-CMP-IT-002 | Delivery blocked by unscanned items | 1. Leave a unit unscanned.<br>2. Driver taps Delivered. | 1 unit unscanned | The request is rejected and the status is unchanged. | Not run |
| TC-CMP-IT-003 | Partial delivery | 1. Deliver 2 of 3 units. | qty 2/3 | The outcome is recorded and the Odoo payload shows qty 2. | Not run |
| TC-CMP-IT-004 | Outbox retry | 1. Make Odoo fail once.<br>2. Let the outbox cron run again. | Odoo recovers | The event is retried and then marked sent. | Not run |
| TC-CMP-IT-005 | Slot auto-closes | 1. Complete the last order of a slot. | Last order | The trip is closed automatically. | Not run |
| TC-CMP-IT-006 | Admin views evidence | 1. Admin opens Completed Deliveries.<br>2. Open the order. | Delivered order | Photos and signature are visible. | Not run |

### 7.3.5 A.5 Failed Delivery Handling and Recovery

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-FAL-IT-001 | Failure with reason and evidence | 1. Driver submits a failure with a reason, line outcomes and a photo. | Reason: Access Blocked | A failure event is stored and the order status is Failed. | Not run |
| TC-FAL-IT-002 | Failure appears in Exceptions | 1. Admin opens Exceptions. | Failed order | The order is listed with its evidence. | Not run |
| TC-FAL-IT-003 | Duplicate submission blocked | 1. Submit the same failure twice. | Same order | The second call returns 409; only one event exists. | Not run |
| TC-FAL-IT-004 | Driver escalates to admin | 1. Driver taps Escalate. | Order O1 | The admin receives the escalation. | Not run |
| TC-FAL-IT-005 | Admin reschedules failed order | 1. Admin picks the order.<br>2. Reschedule to a new slot. | Failed order | The order returns to the schedule with a new slot. | Not run |
| TC-FAL-IT-006 | Cancellation needs approval | 1. Request cancellation of a failed order. | Failed order | The order stays until an approver confirms; Odoo is then notified. | Not run |
| TC-FAL-IT-007 | Complaint handling | 1. Submit a complaint.<br>2. Admin marks it Resolved. | Complaint C1 | Status moves to Resolved and shows in the case list. | Not run |

### 7.3.6 A.6 Notification

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-NTF-IT-001 | Failure notification reaches admins | 1. Confirm a failure.<br>2. Admin checks the bell. | Failed order | An unread notification shows DO reference, customer, address, reason and time. | Not run |
| TC-NTF-IT-002 | Salesperson is notified | 1. Confirm a failure.<br>2. Salesperson checks the bell. | Order with a salesperson | The responsible salesperson sees the notification. | Not run |
| TC-NTF-IT-003 | Open failure details | 1. Click the notification. | Notification N1 | The failure details open with remarks, evidence and affected items. | Not run |
| TC-NTF-IT-004 | Mark as read | 1. Open the bell.<br>2. Mark one read. | Notification N1 | The unread count decreases. | Not run |
| TC-NTF-IT-005 | No notification when save fails | 1. Force the failure save to fail. | DB error | No notification is created. | Not run |
| TC-NTF-IT-006 | Template and channel settings apply | 1. Edit a template.<br>2. Disable WhatsApp.<br>3. Trigger the event. | New text | The new text is used; WhatsApp is not sent; in-app is sent. | Not run |
| TC-NTF-IT-007 | D-1 reminder | 1. Run the reminder cron for tomorrow's orders. | 3 orders tomorrow | Reminders are created once per order. | Not run |

### 7.3.7 B.1 Intelligent Delivery Scheduling

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SCH-IT-001 | Auto scheduler end to end | 1. Seed 10 approved orders.<br>2. Run the scheduler. | Seed data | Orders get a slot, team and truck; the unscheduled list has reasons. | Not run |
| TC-SCH-IT-002 | Scheduler respects constraints | 1. Include an oversized order and a closed-building order.<br>2. Run the scheduler. | Constraint-violating orders | Both are left unscheduled with the correct reasons. | Not run |
| TC-SCH-IT-003 | Scheduler triggers route optimisation | 1. Run the scheduler.<br>2. Open a slot. | Scheduled slot | Stops have sequence, ETA and loading sequence. | Not run |
| TC-SCH-IT-004 | Manual reschedule | 1. Admin moves an order to another slot. | Valid slot | The move succeeds; an invalid move shows an error. | Not run |
| TC-SCH-IT-005 | Scheduler configuration | 1. Change the config.<br>2. Run the scheduler. | New working hours | The new settings are applied. | Not run |
| TC-SCH-IT-006 | Missed-run catch-up | 1. Skip a scheduled run.<br>2. Start the server. | Missed run | The run is caught up and an admin alert is created. | Not run |

### 7.3.8 B.2 Route Optimisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-RTE-IT-001 | Route view shows stops | 1. Open a slot's route. | Slot with 5 stops | Stops show sequence, ETA, service end and road legs. | Pass (run 2026-11-14) |
| TC-RTE-IT-002 | Re-optimise from driver position | 1. Driver sends GPS.<br>2. Tap Re-optimise. | Fresh GPS | The route updates from the driver position, or reports "unchanged" with a reason. | Pass (run 2026-11-14) |
| TC-RTE-IT-003 | Stale position uses warehouse | 1. Use a GPS older than 5 minutes.<br>2. Re-optimise. | Old GPS | The stale position is rejected. A slot that has not departed uses the warehouse; a departed slot returns `CURRENT_LOCATION_REQUIRED` and asks for a current location (no warehouse fallback). | Pass (run 2026-11-14) – see note |
| TC-RTE-IT-004 | Manual reorder recalculates | 1. Reorder 2 stops and save. | Swap stop 1 and 2 | ETAs, legs and loading sequence are recalculated. | Pass (run 2026-11-14) |
| TC-RTE-IT-005 | Violation warning | 1. Save a reorder that breaks an access window. | Late stop | A confirmation lists the violation; saving anyway applies it. | Pass (run 2026-11-14) |
| TC-RTE-IT-006 | Google failure fallback | 1. Block Google.<br>2. Open the route. | No road service | Straight-line estimates are used and the notice is shown. | Pass (run 2026-11-14) |
| TC-RTE-IT-007 | Geocode queue worker | 1. Create an order with a new address.<br>2. Wait for the worker. | New address | The cache row is filled with coordinates and an expiry. | Pass (run 2026-11-14) |
| TC-RTE-IT-008 | Cached address is reused | 1. Create a second order with the same address. | Same address | No second Google geocode request is made. | Pass (run 2026-11-14) |

### 7.3.9 B.3 Master Data and Order Management (including Authentication)

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-MST-IT-001 | Admin creates employee | 1. Log in as admin.<br>2. Employee Info → Create. | Name John Doe, Role Installer | A success message shows; the employee appears in the list; the password is stored hashed. | Not run |
| TC-MST-IT-002 | Login updates interface | 1. Log in with valid credentials. | Valid user | Redirect to the first permitted section; the profile icon shows. | Not run |
| TC-MST-IT-003 | Invalid login | 1. Log in with a wrong password. | Wrong password | An error message shows below the form. | Not run |
| TC-MST-IT-004 | Password reset request | 1. Forgot Password → submit a registered email. | Valid email | A generic confirmation shows and the reset email is sent. | Not run |
| TC-MST-IT-005 | Create product, truck and team | 1. Create each record with valid data. | Valid data | Each is saved and listed; invalid data shows validation errors. | Not run |
| TC-MST-IT-006 | Team setup feeds scheduling | 1. Create a team with a truck and drivers.<br>2. Run the scheduler. | New team | The team can receive slots. | Not run |
| TC-MST-IT-007 | Deactivate record in use | 1. Deactivate a truck that has open slots. | Truck T1 | A warning shows; history is kept. | Not run |
| TC-MST-IT-008 | Order search and filters | 1. Search and filter on Manage Orders. | Customer, status, date | The list matches each filter. | Not run |
| TC-MST-IT-009 | Role permissions | 1. Change a role's permissions.<br>2. Log in again as that role. | Role: Installer | Menus match the new permissions. | Not run |

### 7.3.10 B.4 Employee Performance and Incentives *(after the module is built)*

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-INC-IT-001 | Save incentive rules | 1. Admin sets the rate, bonus and deduction. | Rate RM5 | The rules are stored with an effective date. | Not run |
| TC-INC-IT-002 | Performance from real data | 1. Complete and fail some orders.<br>2. Open Employee Performance. | Mixed orders | Counts, on-time rate and incentive match the database. | Not run |
| TC-INC-IT-003 | Filters and ranking | 1. Filter by team, role and month. | November, Team A | The ranking updates correctly. | Not run |
| TC-INC-IT-004 | Finalise month | 1. Finalise November.<br>2. Try to edit. | November | The month is locked; edits are rejected. | Not run |
| TC-INC-IT-005 | Export | 1. Export to PDF and CSV. | November | The files match the screen. | Not run |
| TC-INC-IT-006 | Employee sees own data only | 1. Log in as an employee.<br>2. Open performance. | Employee E1 | Only E1's figures are shown. | Not run |

---

## 7.4 System Testing

### 7.4.1 A.1 Order Synchronisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SYN-ST-001 | End to end: Odoo order to approved appointment | 1. Odoo sends a DO.<br>2. Admin opens the order.<br>3. Admin approves the appointment. | One DO, 2 lines | The order is approved and Odoo receives the appointment decision. | Not run |
| TC-SYN-ST-002 | Odoo outage and recovery | 1. Block Odoo.<br>2. Perform actions that sync back.<br>3. Restore Odoo. | Odoo down, then up | Events queue, then sync automatically with no loss or duplicates. | Not run |
| TC-SYN-ST-003 | Missed webhook caught by fallback | 1. Skip a webhook.<br>2. Wait for the 5 PM fallback. | One missed DO | The order is imported; the run history shows the fallback. | Not run |
| TC-SYN-ST-004 | Security: webhook without secret | 1. Send a POST without `x-odoo-secret`. | No header | Rejected with 401; nothing is created. | Not run |

### 7.4.2 A.2 Truck Loading Enforcement

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-LOD-ST-001 | End to end: load a full truck | 1. Scheduler assigns a slot.<br>2. Warehouse scans every unit.<br>3. Driver departs. | Slot with 5 orders | Every order is Loaded and departure is allowed. | Not run |
| TC-LOD-ST-002 | Loading blocked by missing items | 1. Skip one unit.<br>2. Try to depart. | 1 unit missing | Departure is blocked with a clear message. | Not run |
| TC-LOD-ST-003 | Route change keeps loading in sync | 1. Admin reorders stops.<br>2. Warehouse opens the loading list. | Reordered slot | Loading sequence matches the new delivery order. | Not run |
| TC-LOD-ST-004 | Two scanners on one slot | 1. Two staff scan different orders at the same time. | 2 sessions | No scan is lost or double-counted. | Not run |

### 7.4.3 A.3 Real-Time Delivery Tracking

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-TRK-ST-001 | End to end: depart to live monitoring | 1. Driver departs.<br>2. Driver app sends GPS for 5 minutes.<br>3. Admin watches Live Ops. | One trip | The admin sees status and position updating; customers get "on the way". | Not run |
| TC-TRK-ST-002 | GPS signal lost | 1. Turn off the driver's GPS for over 5 minutes. | Stale position | The position is treated as stale and is not used for re-routing. | Not run |
| TC-TRK-ST-003 | Concurrent drivers | 1. Two drivers update different slots at once. | 2 sessions | No cross-slot interference. | Not run |
| TC-TRK-ST-004 | Mobile usability | 1. Open the driver app on a 400 px phone. | Phone | Controls are usable and there is no horizontal scrolling. | Not run |

### 7.4.4 A.4 Delivery Completion Processing

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-CMP-ST-001 | End to end: Odoo order to delivered | 1. Odoo sends a DO.<br>2. Admin approves.<br>3. Scheduler assigns a slot.<br>4. Warehouse scans.<br>5. Driver departs and delivers with POD. | One DO, 2 lines | The order is Delivered, Odoo receives the completion event, and the customer received "on the way". | Not run |
| TC-CMP-ST-002 | Odoo outage during completion | 1. Block Odoo.<br>2. Complete deliveries.<br>3. Restore Odoo. | Odoo down, then up | Completion events sync later without duplicates. | Not run |
| TC-CMP-ST-003 | Evidence upload on a weak network | 1. Upload 5 photos on a slow connection. | 5 photos | Upload completes or fails with a retry message; no partial delivery. | Not run |
| TC-CMP-ST-004 | Slot closes after the last delivery | 1. Deliver every order in the slot. | Slot with 4 orders | The trip closes and the slot shows as completed. | Not run |

### 7.4.5 A.5 Failed Delivery Handling and Recovery

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-FAL-ST-001 | End to end: failed delivery to reschedule | 1. Driver reaches the stop and reports failure.<br>2. Admin sees the notification.<br>3. Admin reschedules. | Reason: Customer Unreachable | Failure is notified once; the order returns to the schedule; Odoo is informed. | Not run |
| TC-FAL-ST-002 | Failure with an item delivered and an item failed | 1. Report a mixed outcome. | 2 lines: 1 delivered, 1 failed | Each line is recorded correctly; the Odoo payload matches. | Not run |
| TC-FAL-ST-003 | Failure then cancellation approval | 1. Request cancellation.<br>2. Approver confirms. | Failed order | The order is cancelled only after approval; Odoo is notified. | Not run |
| TC-FAL-ST-004 | Security: another driver submits a failure | 1. Use a different driver's ID. | Wrong driver | Rejected. | Not run |

### 7.4.6 A.6 Notification

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-NTF-ST-001 | End to end: order lifecycle notifications | 1. Approve an appointment.<br>2. Wait for the D-1 reminder.<br>3. Depart.<br>4. Deliver. | One order | Each event sends the right message on the enabled channels. | Not run |
| TC-NTF-ST-002 | WhatsApp or email provider down | 1. Block the provider.<br>2. Trigger a notification. | Provider down | The in-app notification is still created and the failure is logged. | Not run |
| TC-NTF-ST-003 | No duplicate notifications | 1. Retry the same failure confirmation. | Same order | Only one notification is sent. | Not run |
| TC-NTF-ST-004 | Many notifications | 1. Create 200 notifications.<br>2. Open the bell. | 200 items | The bell loads promptly and unread counts are correct. | Not run |

### 7.4.7 B.1 Intelligent Delivery Scheduling

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-SCH-ST-001 | End to end: scheduling cycle | 1. Import 20 orders.<br>2. Approve them.<br>3. Run the scheduler.<br>4. Review the schedule. | 20 orders | Orders are assigned within constraints; unscheduled orders have reasons. | Not run |
| TC-SCH-ST-002 | Scheduler performance with 75 orders | 1. Seed 75 approved orders.<br>2. Run the scheduler.<br>3. Record the time. | 75 orders | Completes without error. Record the total time (proposed target ≤ 60 s). | Not run |
| TC-SCH-ST-003 | Capacity pressure | 1. Seed more orders than the slots can hold. | Orders above capacity | The excess is left unscheduled with the reason, with no overbooking. | Not run |
| TC-SCH-ST-004 | Security: scheduler API without login **⚠** | 1. Call `POST /api/scheduler/run` without a token. | No token | Rejected with 401. *(Fails today – the route is not authenticated.)* | Not run |

### 7.4.8 B.2 Route Optimisation

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-RTE-ST-001 | End to end: schedule to optimised route | 1. Scheduler assigns a slot.<br>2. Open the route as the driver.<br>3. Re-optimise.<br>4. Reorder manually. | Slot with 8 stops | The route, ETAs and loading sequence stay consistent after each step. | Pass (run 2026-11-14) |
| TC-RTE-ST-002 | **Routing performance with 75 orders in one slot** | 1. Seed 75 orders with distinct Klang Valley addresses (about one in five has a building access window).<br>2. Assign all to one time slot.<br>3. Optimise the slot.<br>4. Record the time for: matrix build, sequencing, total. | 75 orders, 1 slot | A route of 75 stops is produced with ETA, service end and loading sequence for every stop. Record the matrix, sequencing and total times (proposed target: total ≤ 60 s). | Pass (run 2026-11-14) |
| TC-RTE-ST-003 | Routing performance with 75 orders, road service unavailable | 1. Repeat TC-RTE-ST-002 with Google blocked. | Same data | Completes with straight-line estimates, `used_fallback` = true, and a user notice. Record the total time. | Pass (run 2026-11-14) |
| TC-RTE-ST-004 | Routing performance by size | 1. Optimise slots of 15, 30 and 75 stops.<br>2. Record each time. | 15 / 30 / 75 stops | A table of stops against time shows how the time grows. | Pass (run 2026-11-14) |
| TC-RTE-ST-005 | Google outage | 1. Block the Google API.<br>2. Run the scheduler and open the route. | No road service | Straight-line ETAs are used and a notice is shown. | Partial (run 2026-11-14) – scheduler run not included |
| TC-RTE-ST-006 | Manual route with a violation | 1. Reorder so a stop is outside its window.<br>2. Confirm saving. | Late stop | The warning is shown, the route is saved and marked for review. | Pass (run 2026-11-14) |
| TC-RTE-ST-007 | Geocoding for new addresses | 1. Import 20 orders with new addresses.<br>2. Wait for the worker. | 20 addresses | All are geocoded and cached; failed ones retry up to the limit. | Pass (run 2026-11-14) |
| TC-RTE-ST-008 | **Routing performance: 75 orders over 12 trucks (realistic)** | 1. Seed 75 orders in 12 time slots, one truck each (3 slots of 7 stops and 9 of 6), 09:00–18:00, consecutive addresses per truck so each truck serves one area; every fifth order has a 09:00–17:00 access window.<br>2. Optimise the 12 slots one after another, as the scheduler does after assignment.<br>3. Record total and per-slot time. | 75 orders, 12 slots, gap = 15 min from `scheduler_config.grace_minutes` | All 12 routes are produced, feasible, with ETA and loading sequence for all 75 stops. Record total time. | Pass (run 2026-11-14) |

#### B.2 realistic load: 75 orders over 12 trucks (TC-RTE-ST-008, run 2026-11-14, `logistics_sandbox`, real Google APIs)

This is the case to quote for the 75-order requirement. The gap after each stop was read from the admin setting `scheduler_config.grace_minutes` (15 min).

| Measure | Real Google | Google blocked (straight-line fallback) |
|---|---|---|
| **Total time, 12 slots one after another** | **24.7 s** | 16.1 s |
| Per slot (6–7 stops) | 1.5 s to 4.1 s (first slot slowest), about 2.1 s on average | 1.1 s to 1.9 s |
| Slots applied and feasible | 12 of 12 | 12 of 12 |
| Stops with ETA, service end and loading sequence | 75 of 75 | 75 of 75 |
| Access-window or session violations | none | none |
| Google Distance Matrix | 12 requests, 633 elements, 5.7 s | denied |
| Google Routes (per leg) | 130 requests, 11.3 s | denied |
| Own computation and database time | about 7.7 s | about 10.5 s (plus 5.6 s of denied Google round trips) |

Planned travel per truck ranged from 82 to 206 minutes (43 to 142 km); the busiest truck finished its last stop at about 15:11 (slot ends 18:00).

Compared with the single-slot stress test below (105 s, ending as "needs review"), splitting the same 75 orders across 12 trucks is about 4× faster and costs about 9× fewer matrix elements (633 against 5,776).

#### B.2 stress test: 75 orders in one slot, and slot-size growth (run 2026-11-14, `logistics_sandbox`, real Google APIs)

Test data: 134 tagged `B2TEST` orders with 75 distinct Klang Valley landmark addresses, in 5 slots (75, 30, 15, 8 and 6 stops). Every address geocoded successfully. Times are wall-clock for the whole optimisation call.

| Slot size | Total time | Google Distance Matrix | Google Routes (per-leg) | Own computation (sequencing etc.) | Outcome |
|---|---|---|---|---|---|
| 8 stops | 3.9 s | 1 request, 81 elements, 0.8 s | not counted in this run | – | Applied, feasible |
| 15 stops | 6.0 s | 4 requests, 256 elements, 2.5 s | 31 requests, 2.1 s | ≈ 1.4 s | Applied, feasible |
| 30 stops | 16.2 s | 16 requests, 961 elements, 9.1 s | 60 requests, 3.3 s | ≈ 3.8 s | Needs review (`NO_FEASIBLE_SEQUENCE`) |
| **75 stops** | **105.2 s** | **64 requests, 5,776 elements, 56.2 s** | **150 requests, 8.8 s** | **≈ 40.2 s** | Needs review (`NO_FEASIBLE_SEQUENCE`) |
| 75 stops, saving the route manually (matrix reused) | 6.5 s | reused | 75 requests, 2.6 s | – | Applied: 75 stops with ETA, service end and loading sequence; marked needs review |
| 75 stops, Google blocked (invalid key) | 51.8 s (+ 6.1 s to save) | denied | denied | ≈ 40 s | Straight-line fallback; 75 stops with ETAs; `used_fallback` = true |

Algorithm only (no Google, no database): 15 stops 0.2 s, 30 stops 2.0 s, 75 stops 34.3 s (median 36.1 s over 7 runs).

Notes for the report:
- **Why 30 and 75 stops end as "needs review":** this is caused by the test data, not by a fault. These are stress tests that put far more orders in one slot than a truck can serve. Each stop needs 15 minutes of service plus the configured gap (15 minutes), so 75 stops need about 37.5 hours, which cannot fit in one day. In real use the orders are spread across trucks (see the 12-truck result above). The 30-stop slot starts at 00:01 and every fifth order has a 09:00–17:00 access window that cannot all be met. The 8- and 15-stop slots are feasible and were applied.
- **Where the time goes at 75 stops:** about 53 % on 64 sequential Google matrix requests, about 38 % on the app's own sequencing, about 8 % on 150 per-leg route requests.
- **Own computation grows steeply** (about 17× slower from 30 to 75 stops) and runs synchronously, so the server cannot answer other requests while it runs.
- **Google usage in this session:** 75 geocode requests; 7,496 Distance Matrix elements (503 + 1,217 + 5,776); about 316 Routes requests counted (the 8-stop and 6-stop runs were not counted). Requests made with the deliberately invalid key were denied and are not billable.
- **IT-003 note:** the original expected result (warehouse used) was wrong for a slot that has already departed. Actual behaviour: a stale position is rejected and the system returns `CURRENT_LOCATION_REQUIRED`. A fresh saved position (under 5 minutes) is used as the origin ("Current position").
- **ST-005 is partial:** the Google outage was simulated on a single slot; the B.1 scheduler run was not included.
- **ST-007** used 75 addresses (more than the 20 in the case), all geocoded and cached. The retry-limit part (5 attempts) was not triggered because nothing failed.

### 7.4.9 B.3 Master Data and Order Management (including Authentication)

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-MST-ST-001 | End to end: admin creates employee and employee logs in | 1. Admin creates an account.<br>2. Admin logs out.<br>3. The new employee logs in. | New user staff@test.com | The employee logs in and is redirected to their dashboard. | Not run |
| TC-MST-ST-002 | End to end: password reset | 1. Request a reset.<br>2. Open the link.<br>3. Set a new password.<br>4. Log in. | New password | The new password works and the old one is rejected. | Not run |
| TC-MST-ST-003 | Role access in the UI | 1. Log in as Driver.<br>2. Type an admin URL. | `/admin/...` | Redirected or Access Denied. | Not run |
| TC-MST-ST-004 | **⚠** Role access on the API | 1. Log in as Driver.<br>2. Call `PUT /api/employees/:id` directly. | Driver or no token | Rejected with 401 or 403. *(Fails today – see review.)* | Not run |
| TC-MST-ST-005 | Logout and Back button | 1. Log out.<br>2. Press Back. | N/A | Redirected to login; protected content hidden. | Not run |
| TC-MST-ST-006 | Master data changes flow to scheduling | 1. Mark a truck unavailable.<br>2. Run the scheduler. | Truck T1 off | No orders are assigned to T1. | Not run |
| TC-MST-ST-007 | Large order list | 1. Load 1,000 orders.<br>2. Search and filter. | 1,000 orders | The list loads and filters in acceptable time (record it). | Not run |

### 7.4.10 B.4 Employee Performance and Incentives *(after the module is built)*

| Test Case ID | Test Scenario | Test Steps | Test Data | Expected Result | Status |
|---|---|---|---|---|---|
| TC-INC-ST-001 | End to end: deliveries to monthly incentive | 1. Complete and fail orders across a month.<br>2. Admin opens the ranking.<br>3. Admin finalises the month.<br>4. Export. | One month of data | The incentive matches a manual calculation; the finalised month is locked. | Not run |
| TC-INC-ST-002 | Late change after finalising | 1. Finalise November.<br>2. Change an old order's status. | Corrected order | The finalised amount is unchanged. | Not run |
| TC-INC-ST-003 | Rule change mid-year | 1. Change the rate on 1 December. | New rate | November uses the old rate; December uses the new one. | Not run |
| TC-INC-ST-004 | Security: employee views another's incentive | 1. As employee E1, request E2's data. | E2 id | Rejected. | Not run |

---

## 7.5 User Acceptance Testing (UAT)

*Record Actual Result and Status during the session with real users. Add a participant list, role and date.*

### 7.5.1 General User

| ID | Test Item | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| UAT-GEN-01 | Employee log in | Login succeeds and redirects to the first permitted section for the role. | | Not run |
| UAT-GEN-02 | Login with invalid credentials | An error message states the login details are invalid. | | Not run |
| UAT-GEN-03 | Forgot password navigation | The link opens the reset request page. | | Not run |
| UAT-GEN-04 | Reset request (unregistered email) | A generic confirmation is shown, with no account hint. | | Not run |
| UAT-GEN-05 | Reset with valid token | Password changes; the user is sent to login. | | Not run |
| UAT-GEN-06 | Reset with expired token | An error says the token is invalid or expired. | | Not run |
| UAT-GEN-07 | Logout | Session is cleared; redirected to login. | | Not run |
| UAT-GEN-08 | Access protected page after logout | Redirected to login. | | Not run |
| UAT-GEN-09 | Refresh while logged in | The session is restored and the user stays logged in. | | Not run |
| UAT-GEN-10 | Notification bell | Unread count shows; opening an item marks it read. | | Not run |

### 7.5.2 Administrator

| ID | Module | Test Item | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| UAT-ADM-01 | Orders | Search and filter orders | The list updates by customer, DO number, status and date. | | Not run |
| UAT-ADM-02 | Orders | View order details | Products, address, appointment and history are shown. | | Not run |
| UAT-ADM-03 | Orders | Approve appointment | Order status moves to approved; Odoo is notified. | | Not run |
| UAT-ADM-04 | Orders | Reject appointment | Order is rejected with a reason; Odoo is notified. | | Not run |
| UAT-ADM-05 | Orders | Override parsed address and contact | Edited values are saved and shown. | | Not run |
| UAT-ADM-06 | Odoo sync | View sync monitor and run history | Each DO's sync status and run log are visible. | | Not run |
| UAT-ADM-07 | Odoo sync | Review a change request | Approve and reject both work, with the order updated or unchanged. | | Not run |
| UAT-ADM-08 | Scheduling | View delivery schedule | Slots and assigned orders display correctly. | | Not run |
| UAT-ADM-09 | Scheduling | Create slot (missing fields) | A validation error appears. | | Not run |
| UAT-ADM-10 | Scheduling | Edit and delete slot | Changes are saved; deletion asks for confirmation. | | Not run |
| UAT-ADM-11 | Scheduling | Reassign order | Succeeds if constraints are met. | | Not run |
| UAT-ADM-12 | Scheduling | Reassign (insufficient time / building access / truck capacity) | An error explains the failed constraint. | | Not run |
| UAT-ADM-13 | Scheduling | Run auto scheduler | Scheduled and unscheduled lists are returned with reasons. | | Not run |
| UAT-ADM-14 | Routing | View and re-optimise route | Stops, ETAs and road legs update. | | Not run |
| UAT-ADM-15 | Routing | Manual reorder with violation | A warning lists the violation; saving anyway applies it. | | Not run |
| UAT-ADM-16 | Master data | View, add, edit, deactivate products, trucks and teams | Tables load; forms validate; changes save. | | Not run |
| UAT-ADM-17 | Master data | Manage zones and buildings | Records can be added, edited and removed. | | Not run |
| UAT-ADM-18 | Access | Update role permissions | Changes save and apply after re-login. | | Not run |
| UAT-ADM-19 | Exceptions | Filter and resolve failed deliveries and complaints | Status updates to Resolved. | | Not run |
| UAT-ADM-20 | Notification | Edit a message template and channel settings | Changes apply to the next notification. | | Not run |
| UAT-ADM-21 | Dashboard | View monthly summary and live operations | Metrics, charts and team status display. | | Not run |
| UAT-ADM-22 | Dashboard | Export dashboard | A PDF of the current view is generated. | | Not run |
| UAT-ADM-23 | Incentives | View ranking, finalise a month, export | The ranking is correct; the finalised month is read-only. | | Not run |

### 7.5.3 Operational Teams

| Role | ID | Test Item | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| Warehouse | UAT-WAR-01 | Search the loading list by date, customer, item, order number | The matching orders are shown. | | Not run |
| Warehouse | UAT-WAR-02 | Scan a correct unit | Unit is marked loaded; progress updates. | | Not run |
| Warehouse | UAT-WAR-03 | Scan unknown, duplicate and wrong-order units | Each is rejected with a clear message. | | Not run |
| Warehouse | UAT-WAR-04 | View loading order and truck utilisation | Sequence and utilisation are shown. | | Not run |
| Driver | UAT-DRV-01 | View jobs for the day | Orders are grouped by time slot. | | Not run |
| Driver | UAT-DRV-02 | Depart slot | Orders become Delivering; blocked if items are unscanned. | | Not run |
| Driver | UAT-DRV-03 | View route and reorder | ETAs and sequence update. | | Not run |
| Driver | UAT-DRV-04 | Complete delivery with photo and signature | Order becomes Delivered. | | Not run |
| Driver | UAT-DRV-05 | Report a failed delivery | Reason, line outcomes and photo are saved. | | Not run |
| Driver | UAT-DRV-06 | Report an issue or contact attempt | The report is submitted and visible to the admin. | | Not run |
| Installer | UAT-INS-01 | View installation schedule | Cards show customer details. | | Not run |
| Installer | UAT-INS-02 | View installation details | Products and complexity are shown. | | Not run |
| Installer | UAT-INS-03 | Mark installation completed | Status updates. | | Not run |
| Employee | UAT-EMP-01 | View own performance and incentive *(B.4)* | Own figures are shown, and nobody else's. | | Not run |

---

## 7.6 Requirement Traceability *(complete after testing)*

| Requirement | Use Case | Unit | Integration | System | UAT |
|---|---|---|---|---|---|
| FR-01-001 | UC-01 | TC-SYN-UT-001/002 | TC-SYN-IT-001 | TC-SYS-ST-001 | UAT-ADM-06 |
| FR-02-001 | UC-04 | TC-LOD-UT-001 | TC-LOD-IT-001 | TC-SYS-ST-003 | UAT-WAR-04 |
| FR-02-004 | UC-04 | TC-LOD-UT-002/003/004 | TC-LOD-IT-002 | TC-SYS-ST-001 | UAT-WAR-03 |
| FR-06-003 | UC-14 | TC-NTF-UT-003 | TC-NTF-IT-001 | TC-SYS-ST-002 | UAT-DRV-05 |
| FR-08-003 | – | TC-RTE-UT-002 | – | TC-SYS-ST-004 | UAT-ADM-14 |
| FR-08-004 | – | TC-RTE-UT-004 | TC-RTE-IT-001/002 | TC-SYS-ST-003 | UAT-ADM-15 |
| FR-08-005 | – | TC-RTE-UT-003 | TC-RTE-IT-003 | – | – |
