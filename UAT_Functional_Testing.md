# UAT Functional Testing (Updated to Match Current Behavior)

Prerequisite: App running and accessible at login page. User accounts and roles exist in database.

## Role: All Employees
### Authentication Module

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | Employee logs in using assigned email and password. | Login succeeds and redirects to the first permitted section/top tab based on role permissions (not always Dashboard). | TBD | Uses sessionStorage for session state. |
| 2 | Employee visits `/login` while already logged in (refresh/revisit login). | Login page is still accessible; submitting credentials re-creates session and redirects to first permitted section. | TBD | No auto-redirect away from `/login`. |
| 3 | Employee enters invalid credentials. | Error message shown (e.g., "Invalid credentials" or "Incorrect Password"). | TBD | Message comes from API or AuthContext. |
| 4 | Employee clicks "Forgot Password". | Navigates to reset request page with email input. | TBD | Route: `/forgot-password`. |
| 5 | Employee submits unregistered email in Forgot Password. | Generic success message shown (no "Email Not Found" for security). | TBD | Backend always returns success message. |
| 6 | Employee resets password via verification email and logs in again. | Valid token resets password, shows success message, then redirects to login. | TBD | Token expires after 1 hour. |
| 7 | Employee uses invalid/expired reset link. | Error shown ("Invalid reset link" or "Reset link has expired"). | TBD | `/reset-password?token=...` required. |
| 8 | Employee clicks "Logout". | Session storage cleared; redirected to login page. | TBD | Logout is client-side. |
| 9 | Employee logs out then presses browser Back. | Protected routes redirect to `/login`; no access to protected pages. | TBD | Enforced by ProtectedRoute. |
| 10 | Employee refreshes page while logged in. | Session restores from sessionStorage; user stays logged in. | TBD | Permissions restored on load. |

### Role-Based Access (All Roles)

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | User navigates to root `/` after login. | Redirects to first permitted section + first top tab. | TBD | Based on permissions list. |
| 2 | User navigates to a route without permission. | Redirects to first permitted section. | TBD | Admin has full access. |
| 3 | User has no permissions assigned. | "No access" message shown with Logout option. | TBD | Layout blocks all sections. |
| 4 | Any logged-in user clicks "Report Issue" in header. | Opens Report Issue page (accessible to all). | TBD | Route: `/cases`. |

## Role: Administrator
### Scheduling Module (Manual TimeSlot Management + Order Reassign)

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | Administrator views schedule (daily/weekly/monthly). | Time slots and orders render per view; daily view shows orders by time slot. | TBD | Views: daily, weekly, monthly. |
| 2 | Administrator changes date / view mode. | Schedule updates to selected date range. | TBD | Uses date picker and view toggle. |
| 3 | Administrator creates a new time slot. | Add TimeSlot modal opens, saves on submit, and list refreshes. | TBD | Fields: date, start/end, available, teams, truck. |
| 4 | Administrator creates time slot with missing fields. | No required-field validation; may save empty values if API accepts. | TBD | No UI validation in modal. |
| 5 | Administrator creates overlapping time slot. | No conflict detection in UI/API; overlapping slots can be saved. | TBD | No conflict checks in `time-slots` API. |
| 6 | Administrator edits an existing time slot. | Updated slot appears after save. | TBD | Refreshes from API. |
| 7 | Administrator deletes a time slot. | Confirmation shown; on confirm, slot removed. | TBD | Uses `window.confirm`. |
| 8 | Administrator reassigns an order to a time slot. | Order reassigns if time and access constraints pass; schedule times recalculated. | TBD | Validations below. |
| 9 | Reassign order to timeslot outside building access window. | Error returned ("Timeslot exceeds building access window"). | TBD | API returns 409 with code `ACCESS_WINDOW`. |
| 10 | Reassign order when timeslot time is insufficient. | Error returned ("Not enough time in selected timeslot"). | TBD | API returns 409 with code `TIME_WINDOW`. |
| 11 | Reassign order with truck capacity conflict. | Prompt to upgrade to 3-ton truck; if confirmed, truck updated and reassign succeeds. | TBD | API returns `TRUCK_UPGRADE_REQUIRED`. |
| 12 | Unassign order from time slot. | Order time slot cleared; status becomes `Pending`. | TBD | Uses PATCH with `time_slot_id: null`. |

### Scheduling Module (Auto Scheduler)

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | Administrator opens Auto Scheduler page. | Configuration panel loads from API; scheduler controls visible. | TBD | Route: `/schedule/auto-scheduler`. |
| 2 | Administrator runs scheduler. | Scheduler processes pending orders and returns scheduled + unscheduled lists. | TBD | Uses `/api/scheduler/run`. |
| 3 | Administrator saves scheduler configuration. | Config saved via API and success alert shown. | TBD | `/api/scheduler/config` PUT. |
| 4 | Scheduler produces unscheduled orders. | Unscheduled list shows reason for each order. | TBD | Reasons from scheduler service. |

### Manual Control & Monitoring Module (Information + Cases + Access)

#### Information Management

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View info lists (employees, teams, customers, buildings, products, trucks, zones, truck-zone assignments). | Tables load and display data. | TBD | Sections under `/info`. |
| 2 | Add new record in any info table. | Modal appears; required fields validated when defined; save refreshes table. | TBD | Example: employee add enforces required fields + email format. |
| 3 | Edit existing record. | Updates saved and reflected in table. | TBD | Uses API `update*` calls. |
| 4 | Delete record. | Confirmation shown; record removed on confirm. | TBD | Uses `window.confirm`. |
| 5 | Manage zones within TruckZone page. | Zone add/edit/delete available in "Manage Zones" panel. | TBD | Zones used for truck-zone assignment. |

#### Cases (Admin View)

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View cases list. | Cases load with employee, status, and date. | TBD | Filters: All/Pending/Resolved. |
| 2 | Filter cases by status. | Table updates to matching status. | TBD | Filter tabs. |
| 3 | View case details. | Modal shows full content, employee, status, and date. | TBD | "View" action. |
| 4 | Mark case as resolved. | Status updates to "resolved" and UI refreshes. | TBD | Uses update API. |

#### Access Control

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View roles and permissions. | Role list loads; permissions grid shown for selected role. | TBD | Roles fetched from `/api/roles`. |
| 2 | Toggle permission and save changes. | Save Changes button appears; updates are persisted. | TBD | Users must log out/in to refresh permissions. |
| 3 | Add a new role. | Role created and appears in list. | TBD | Permissions default empty. |
| 4 | Delete a non-admin role. | Confirmation; role deleted from list. | TBD | Admin role cannot be deleted. |

### Dashboard & Analytics

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View monthly system summary (Overview). | Displays order metrics, ratings, reports, charts; supports month navigation. | TBD | Uses selected month scope. |
| 2 | Export dashboard to PDF. | Generates a PDF for selected month. | TBD | Uses `html2canvas` + `jsPDF`. |
| 3 | View employee performance analytics. | Shows top performers, employee cards, and order details table. | TBD | Scope month + search. |
| 4 | Adjust incentive per order. | Incentive recalculates totals in UI only; no persistence. | TBD | No backend save. |
| 5 | View order performance analytics. | Displays created/completed/open counts and order details table. | TBD | Scope month supported. |

## Role: Delivery Team
### Task View Module

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View delivery schedules. | Orders grouped by time slot for selected date/team. | TBD | Team auto-selected if assignment exists. |
| 2 | Filter schedule by date/team. | List updates for selected date/team. | TBD | Date + team filters. |
| 3 | View optimized delivery route. | "Optimal Route" opens Google Maps directions for listed addresses. | TBD | External link only. |
| 4 | Mark delivery task as completed. | Status updates in UI only; no API persistence. | TBD | Local state change only. |
| 5 | Report an issue. | Report submitted and listed under "My Reports". | TBD | Accessible via header "Report Issue". |

## Role: Installer
### Task View Module

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View installation schedule. | Shows installation cards based on schedules or installer-required products. | TBD | Uses `/api/scheduler/installation-schedules` if available. |
| 2 | Filter by date/team. | List updates for selected date/team. | TBD | Team auto-selected if assignment exists. |
| 3 | Mark installation as completed. | Not supported in UI (read-only). | TBD | No action buttons. |
| 4 | View installation details. | Shows customer/building/products/estimated durations and access info. | TBD | Details on card. |
| 5 | Report an issue. | Report submitted and listed under "My Reports". | TBD | Accessible via header "Report Issue". |

## Role: Warehouse Staff
### Task View Module

| No. | Test Item | Expected Result (Current Behavior) | Actual Result (Pass/Fail) | Comment |
| --- | --- | --- | --- | --- |
| 1 | View products to be loaded per truck/date. | Schedule view lists trips, orders, and item details. | TBD | Filters by date, team, truck. |
| 2 | View optimization suggestions. | Optimization view shows utilization and loading sequence. | TBD | Computed in UI. |
| 3 | Mark loading as completed. | Not supported in UI (read-only). | TBD | No status update action. |
| 4 | Report issues in loading or product condition. | Report submitted and listed under "My Reports". | TBD | Accessible via header "Report Issue". |

