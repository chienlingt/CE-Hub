# Testing Report

Project: FYP Delivery Scheduling System
Date: 2026-01-19
Scope: Authentication, Scheduling, Task View, Manual Control and Monitoring, Dashboard and Analytics, Security (QR-01), Usability (QR-02), Overall System (UAT)

## 1. Test Approach

This report maps the required testing techniques to implemented features and functional requirements. Test cases reflect current behavior observed in the application and API design.

### 1.1 Testing Techniques by Module

| Module | Techniques |
| --- | --- |
| Authentication | Equivalence Partitioning, Boundary Value Analysis, State Transition Testing, Authentication and Authorization Testing, Error Guessing |
| Scheduling | Decision Table Testing, Equivalence Partitioning, Boundary Value Analysis, State Transition Testing, API Testing, Error Guessing |
| Task View | Use Case Testing, GUI Testing, Authorization Testing, Error Guessing |
| Manual Control and Monitoring | Use Case Testing, State Transition Testing, Authorization Testing, Error Guessing |
| Dashboard and Analytics | Use Case Testing, GUI Testing, Equivalence Partitioning, Error Guessing |
| Security (QR-01) | Authentication and Authorization Testing, Basic Penetration Testing |
| Usability (QR-02) | Usability Testing (PSSUQ) |
| Overall System | User Acceptance Testing (UAT) |

### 1.2 Test Environment

- Client: React application (admin, teams, warehouse views)
- Server: Node.js API with scheduler services
- Database: Project-configured DB (existing roles, users, orders, schedules)
- Browser: Chrome (latest)

### 1.3 Test Data

- Roles: Admin, Delivery, Installer, Warehouse, Employee
- Orders: Pending and scheduled orders with varied durations, sizes, and zones
- Time slots: Overlapping and non-overlapping slots across dates
- Trucks: 1-ton and 3-ton with capacity limits
- Buildings: Access windows and noise restrictions

## 2. Functional Requirements Test Cases

### 2.1 Authentication Module (Table 4.1)

#### FR-01-001 Register Account (UC-01)
Techniques: Equivalence Partitioning, Boundary Value Analysis, Error Guessing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| AUTH-01 | Valid registration | Submit valid email, strong password, required fields | Account created, success message | Not Run |
| AUTH-02 | Invalid email | Submit malformed email | Validation error shown | Not Run |
| AUTH-03 | Weak password boundary | Submit password at minimum length and below minimum | Accept minimum; reject below minimum | Not Run |
| AUTH-04 | Duplicate email | Register with existing email | Error shown, no account created | Not Run |

#### FR-01-002 Sign In (UC-02)
Techniques: Equivalence Partitioning, State Transition Testing, Authentication and Authorization Testing, Error Guessing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| AUTH-05 | Valid login | Login with valid credentials | Session created and redirect to first permitted section | Not Run |
| AUTH-06 | Invalid password | Login with wrong password | Error message shown | Not Run |
| AUTH-07 | Session restore | Refresh after login | Session restored from sessionStorage | Not Run |
| AUTH-08 | Access control | Navigate to unauthorized route | Redirect to first permitted section | Not Run |

#### FR-01-003 Reset Password (UC-03)
Techniques: Equivalence Partitioning, Boundary Value Analysis, State Transition Testing, Error Guessing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| AUTH-09 | Valid reset flow | Request reset, open link, set new password | Password updated, redirect to login | Not Run |
| AUTH-10 | Unknown email | Submit unregistered email | Generic success message | Not Run |
| AUTH-11 | Expired token | Use expired reset link | Error shown, no reset | Not Run |
| AUTH-12 | Invalid token format | Use malformed token | Error shown | Not Run |

#### FR-01-004 Logout (UC-04)
Techniques: State Transition Testing, Error Guessing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| AUTH-13 | Logout | Click Logout | Session cleared and redirected to login | Not Run |
| AUTH-14 | Back navigation | Logout then browser Back | Protected routes blocked | Not Run |

### 2.2 Scheduling Module (Table 4.2)

#### FR-02-001 Calculate estimated installation time (UC-17)
Techniques: Equivalence Partitioning, Boundary Value Analysis, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-01 | Normal order size | Create order with typical quantities | Estimated time equals sum of item durations | Not Run |
| SCH-02 | Zero quantity boundary | Order with 0 quantity item | Item ignored or validation error | Not Run |
| SCH-03 | Large quantity boundary | Order with large quantity | Estimated time scales correctly | Not Run |

#### FR-02-002 Filter time slots by access constraints (UC-17)
Techniques: Decision Table Testing, Boundary Value Analysis, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-04 | Allowed window | Use time slot within building access hours | Slot accepted | Not Run |
| SCH-05 | Outside window | Use time slot outside access hours | Error: ACCESS_WINDOW | Not Run |
| SCH-06 | Boundary start time | Slot starts at permitted boundary | Accepted | Not Run |
| SCH-07 | Boundary end time | Slot ends at permitted boundary | Accepted | Not Run |

#### FR-02-003 Optimize sequence of deliveries (UC-17)
Techniques: Decision Table Testing, State Transition Testing, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-08 | Multiple orders same window | Run scheduler with several orders | Optimized order sequence returned | Not Run |
| SCH-09 | No orders | Run scheduler with none pending | Empty results, no errors | Not Run |

#### FR-02-004 Assess truck space availability (UC-17)
Techniques: Decision Table Testing, Boundary Value Analysis, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-10 | Capacity within limit | Assign orders within capacity | Accepted | Not Run |
| SCH-11 | Capacity exceeded | Assign orders exceeding capacity | Error or truck upgrade prompt | Not Run |
| SCH-12 | Exact capacity boundary | Assign orders at limit | Accepted | Not Run |

#### FR-02-005 Select most suitable time window (UC-17)
Techniques: Decision Table Testing, Equivalence Partitioning, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-13 | Multiple viable slots | Run scheduler | Best slot selected per constraints | Not Run |
| SCH-14 | No viable slot | Run scheduler with conflicting constraints | Order listed as unscheduled with reason | Not Run |

#### FR-02-006 Reassign when slot rejected/unavailable (UC-17)
Techniques: State Transition Testing, Error Guessing, API Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SCH-15 | Manual reassign success | Reassign order to valid slot | Order updated with new slot | Not Run |
| SCH-16 | Reassign fails constraint | Reassign to invalid slot | Error shown, no change | Not Run |
| SCH-17 | Auto reassign after rejection | Reject initial slot | New slot assigned automatically | Not Run |

### 2.3 Task View Module (Table 4.3)

#### FR-03-001 Warehouse loading schedule (UC-24)
Techniques: Use Case Testing, GUI Testing, Authorization Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| TV-01 | View loading schedule | Login as warehouse, open loading view | Schedule and items shown | Not Run |
| TV-02 | Unauthorized access | Non-warehouse visits loading view | Access denied or redirect | Not Run |

#### FR-03-002 Delivery schedules (UC-17)
Techniques: Use Case Testing, GUI Testing, Authorization Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| TV-03 | Delivery view | Login as delivery, open schedule | Orders grouped by time slot | Not Run |
| TV-04 | Filter by date/team | Change date/team | List updates | Not Run |

#### FR-03-003 Delivery route recommendations (UC-22)
Techniques: Use Case Testing, GUI Testing, Error Guessing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| TV-05 | Open optimal route | Click "Optimal Route" | External map opens with addresses | Not Run |
| TV-06 | Missing addresses | Order with missing address | Error or route excluded | Not Run |

#### FR-03-004 Installation schedules (UC-23)
Techniques: Use Case Testing, GUI Testing, Authorization Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| TV-07 | Installer view | Login as installer | Installation cards shown | Not Run |
| TV-08 | Unauthorized access | Non-installer visits installer view | Access denied or redirect | Not Run |

### 2.4 Manual Control and Monitoring Module (Table 4.4)

#### FR-03-001 Admin schedule edit (UC-25)
Techniques: Use Case Testing, State Transition Testing, Authorization Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| MCM-01 | Edit time slot | Admin edits slot and saves | Updated slot visible | Not Run |
| MCM-02 | Delete slot | Admin deletes slot | Slot removed after confirmation | Not Run |
| MCM-03 | Non-admin access | Non-admin tries to edit | Access denied | Not Run |

#### FR-03-002 Resolve reports (UC-26)
Techniques: Use Case Testing, State Transition Testing, Authorization Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| MCM-04 | Resolve report | Admin marks case resolved | Status updates to resolved | Not Run |
| MCM-05 | Invalid status change | Attempt invalid state change | Error or no change | Not Run |

### 2.5 Dashboard and Analytics Module (Table 4.5)

#### FR-04-001 Employee performance (UC-27)
Techniques: Use Case Testing, GUI Testing, Equivalence Partitioning

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| DA-01 | View performance | Admin opens analytics | Metrics and charts shown | Not Run |
| DA-02 | Month filter | Change month | Metrics update | Not Run |

#### FR-04-002 Order delivery performance (UC-28)
Techniques: Use Case Testing, GUI Testing, Equivalence Partitioning

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| DA-03 | View delivery performance | Admin opens order analytics | Counts and table shown | Not Run |
| DA-04 | Empty month | Select month with no orders | Empty state shown | Not Run |

## 3. Quality Requirements Testing

### 3.1 QR-01 Security
Techniques: Authentication and Authorization Testing, Basic Penetration Testing

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | Password storage | Inspect user records | Passwords stored hashed/encrypted | Not Run |
| SEC-02 | Password policy | Register with weak password | Rejected per policy | Not Run |
| SEC-03 | Access control | Attempt protected API without token | 401/403 response | Not Run |
| SEC-04 | IDOR check | Access another user's order | Access denied or filtered | Not Run |
| SEC-05 | Basic injection | Submit SQL/NoSQL payloads | No data leakage or crash | Not Run |

### 3.2 QR-02 Usability (PSSUQ)
Technique: PSSUQ Survey

| ID | Test Case | Steps | Expected Result | Status |
| --- | --- | --- | --- | --- |
| USA-01 | PSSUQ evaluation | Users complete PSSUQ after tasks | Average score >= 5.0/7.0 | Not Run |

## 4. Overall System UAT

UAT cases are aligned with current behavior documented in `UAT_Functional_Testing.md` and should be executed by role.

| ID | Role | Area | Expected Result | Status |
| --- | --- | --- | --- | --- |
| UAT-01 | All | Authentication | All authentication flows pass per current behavior | Not Run |
| UAT-02 | Admin | Scheduling | Manual and auto scheduler flows pass | Not Run |
| UAT-03 | Admin | Info/Cases/Access | CRUD operations and case resolution pass | Not Run |
| UAT-04 | Admin | Dashboard | Summary and analytics views render | Not Run |
| UAT-05 | Delivery | Task View | Schedule and route viewing pass | Not Run |
| UAT-06 | Installer | Task View | Installation schedule view pass | Not Run |
| UAT-07 | Warehouse | Task View | Loading schedule and optimization view pass | Not Run |

## 5. Test Results Summary

Status: Not executed in this report. Use the Status column to record Pass/Fail and notes during execution.

