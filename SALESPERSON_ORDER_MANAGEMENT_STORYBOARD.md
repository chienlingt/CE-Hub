# Order Management System - User Guide & Functional Requirements

## Overview
This document describes the complete order lifecycle workflow in the TBM Delivery system, from order creation through delivery completion.



## Table of Contents
1. [User Personas](#user-personas)
2. [Order Lifecycle Workflow](#order-lifecycle-workflow)
3. [Step-by-Step Instructions](#step-by-step-instructions)
4. [Functional Requirements](#functional-requirements)



## User Personas

**Salesperson** - Order intake and management (`customer` permission)
- Access: Order Management → Place Order / Manage Orders

**Warehouse Staff** - Prepare and load orders (`warehouse` permission)
- Access: Warehouse → Loading Schedule

**Delivery Team** - Deliver orders to customers (`delivery` permission)
- Access: Delivery → Delivery Schedule

**Admin** - System configuration and oversight (`admin` permission, full access)
- Capabilities: Configure settings, reassign orders, run auto-scheduler



## Order Lifecycle Workflow

```
STEP 1: ORDER CREATION (Salesperson)
├─ Create order via "Place Order"
├─ Select/add customer, add products, specify requirements
└─ Status: "Pending"
         ↓
STEP 2: ORDER SCHEDULING (Salesperson OR Auto-Scheduler)
├─ Option A: Manual assignment → Calendar icon → Select timeslot
├─ Option B: Auto-Scheduler → Admin runs scheduler
└─ Status: "Pending" → "Scheduled"
         ↓
STEP 3: ORDER LOADING (Warehouse Staff)
├─ View "Loading Schedule"
├─ Load products by LIFO sequence (Last In, First Out)
└─ Status: "Scheduled" (ready for delivery)
         ↓
STEP 4: ORDER DELIVERY (Delivery Team)
├─ View "Delivery Schedule"
├─ Deliver orders in route sequence
└─ Status: "Scheduled" → "Delivered"
```

**Supporting Operations**: View/search/edit orders (subject to edit deadline constraints)



## Step-by-Step Instructions

### STEP 1: Creating Orders (Salesperson)

**Navigation**: Order Management → Place Order

**1.1 Select or Add Customer**
- **Existing**: Click "Select Existing Customer" → Search → Select
- **New**: Click "Add New Customer" → Fill Name*, Email*, Phone* → Optional: Address, City, State, Postcode
- **Auto-detection**: If address entered, system extracts building name and pre-fills special equipment

**1.2 Add Products**
1. Search product name → Click to add
2. Configure each product:
   - Quantity (min 1)
   - Service Type: Delivery Only / Delivery + Installation / Stock Transfer
   - Dismantling checkbox (if applicable)
   - Installation Time: Use default OR set custom min/max (required for Delivery + Installation)
3. Remove: Click X button

**1.3 Special Equipment**
- Optional text area for order-level notes (pre-filled from building defaults if available)

**1.4 Submit**
- **Validation**: Customer info complete, ≥1 product, valid quantities, installation times set
- **Processing**: Creates/uses customer → finds/creates building → creates order (Pending)
- **Success**: Green message + order number, form resets



### STEP 2: Scheduling Orders

**Option A: Manual Assignment (Salesperson)**

**Navigation**: Order Management → Manage Orders

1. **Identify**: Pending orders show purple calendar icon
2. **Initiate**: Click calendar icon → Modal opens
3. **Select Timeslot**:
   - Modal shows: Order ID, customer, building, product count
   - Timeslots grouped by date
   - Card states: Available (white), Selected (purple), Unavailable (gray)
4. **Confirm**: Click timeslot → "Assign to Timeslot" button → Submit
5. **Result**: Status changes Pending → Scheduled, calendar icon disappears

**Business Rules**:
- Only Pending orders assignable
- Shows future timeslots only (tomorrow+)
- Admin can reassign, salesperson cannot

**Option B: Auto-Scheduler (Admin)**

**Navigation**: Schedule → Auto Scheduler

1. **Run**: Click "Run Scheduler Now" → System processes all pending orders
2. **Algorithm**:
   - Groups orders by location (postal code)
   - Calculates work time (delivery + installation)
   - Optimizes routes using OSRM
   - Assigns based on: building access windows, customer preferences, truck capacity
3. **Results**: Shows scheduled/unscheduled orders with reasons
4. **Installation**: Auto-creates installation_schedules for orders requiring installation



### STEP 3: Loading Orders (Warehouse Staff)

**Navigation**: Warehouse → Loading Schedule

**3.1 View Schedule**
- Displays schedule for selected date (defaults to today)
- Orders grouped by truck (plate number, capacity)

**3.2 Loading Sequence (LIFO)**
- **Highest sequence** = First delivery (load LAST)
- **Lowest sequence** = Last delivery (load FIRST)

Example:
```
Truck ABC-1234:
├─ Order #3 (Seq: 3) ← Load FIRST (bottom) - Last delivery
├─ Order #2 (Seq: 2) ← Load SECOND (middle)
└─ Order #1 (Seq: 1) ← Load LAST (top) - First delivery
```

**3.3 Load Products**
1. Expand order → View: product name, quantity, dimensions, fragile flag, special equipment
2. Locate products in warehouse
3. Load in correct sequence
4. Mark as loaded

**3.4 Complete**: ✓ All orders loaded, ✓ Sequence followed, ✓ Equipment included, ✓ Truck secured



### STEP 4: Delivering Orders (Delivery Team)

**Navigation**: Delivery → Delivery Schedule

**4.1 View Schedule**
- Shows assigned team's deliveries for selected date
- Orders sorted by delivery sequence
- Route information and estimated times

**4.2 Review Route**
- Order number, customer contact, address
- Building access requirements, special instructions
- Products, estimated delivery/installation time

**4.3 Execute Deliveries (At Each Stop)**
1. **Arrival**: Navigate to address, follow access requirements, record arrival time
2. **Delivery**: Unload (LIFO ensures correct order), verify with customer, handle installation/dismantling
3. **Completion**: Customer signs, optional rating/feedback, take photo (proof), record completion time
4. **Update**: Mark as "Delivered", upload proof, record feedback

**4.4 Installation (If Required)**
- Installation team arrives (delivery end time + 30 min)
- Follow time estimates, use special equipment
- Update installation_schedules to "Completed"

**4.5 End of Day**
- Return truck, submit reports, upload proof of delivery



### Managing Orders: View & Search (Salesperson)

**Navigation**: Order Management → Manage Orders

**Dashboard Statistics**: Pending (Yellow), Scheduled (Blue), Delivered (Green), Orders Today (Purple)

**Filters**:
- **Search**: Order ID, customer name/phone, building name
- **Status**: All / Pending / Scheduled / Delivered / Cancelled
- **Date Range**: All Time / Today / Week / Month / Custom
- **Sort**: Latest/Oldest/Scheduled/Customer Name

**Orders Table**: Order #, Customer, Products, Status, Created, Scheduled, Actions (Edit/Assign)

**Expanded Details** (click row): Customer info, building info, products list, special equipment, edit deadline countdown



### Managing Orders: Edit Orders (Salesperson)

**Prerequisites**: Order not Delivered AND (if scheduled) before edit deadline

**When Can Edit?**
| Status | Scheduled Time | Can Edit? | Reason |
|--|-|--|--|
| Pending | None | ✓ | Not scheduled |
| Scheduled | Before deadline | ✓ | Within edit window |
| Scheduled | After deadline | ✗ | Too close to delivery |
| Delivered | N/A | ✗ | Completed |

**Edit Workflow**:
1. **Initiate**: Find order → Click edit → System validates → Modal opens
2. **Edit Customer**: Name*, Email*, Phone*, Address, City, State, Postcode
   - ⚠️ **Warning**: Changes affect ALL customer's orders
3. **Modify Products**: Add/remove, change quantity/service type/dismantling/installation time (min 1 product)
4. **Edit Special Equipment**: Optional text area
5. **Save**:
   - Validation: Required fields, ≥1 product, installation times
   - Backend re-validates: exists, not delivered, before deadline
   - Success: Modal closes, alert shown, table refreshes



### Managing Orders: Edit Deadline System

**Business Rule**: Orders editable until X hours before scheduled delivery (default: 24h)

**Purpose**: Prevent disruptions to warehouse prep, route planning, installation scheduling, customer notifications

**Order States**:

| State | Status | Editability | Visual | Actions |
|-|--|-|--||
| Pending | Pending | ✓ Fully editable | Edit enabled (green) | Edit freely |
| Scheduled (Before) | Scheduled | ✓ With timer | Countdown (green/yellow/red) | Edit before deadline |
| Scheduled (After) | Scheduled | ✗ Not editable | Edit disabled (gray) | Contact admin if urgent |
| Delivered | Delivered | ✗ Never editable | "Cannot edit delivered" | View only |

**Timer Color**: Green (>12h), Yellow (3-12h), Red (<3h)

**Admin Config**: Settings → System Settings → "Order Edit Deadline Hours" (default: 24, range: 12-48)
- Lower (12h): More flexibility, higher risk
- Higher (48h): More prep time, less flexibility

**Validation**:
- **Frontend**: Check editability before opening modal
- **Backend**: Double-check on save (prevents race conditions)



## System Rules

### Order Status Flow
```
Pending → Scheduled → Delivered
           ↓
       Cancelled (before delivery)
```

### Validation Rules

**Customer**: Name (required, min 2 chars), Email (required, valid, unique), Phone (required, min 8 chars)

**Products**: ≥1 per order, Quantity ≥1, Service Type required, Installation Time required if delivery_installation

**Special Equipment**: Optional, no limit, order-level

**Timeslot Assignment**: Only Pending, future dates only, available_flag = true

**Order Editing**: Cannot edit if Delivered OR (Scheduled AND past deadline), email unique, min 1 product



## Functional Requirements

### Salesperson Module
| Req# | Requirement |
||-|
| FR-1.1 | Allow salesperson to create orders with complete product/service details |
| FR-1.2 | Support new customer creation and existing customer selection |
| FR-1.3 | Auto-detect building from customer address |
| FR-2.1 | Display real-time order statistics (Pending, Scheduled, Delivered, Today) |
| FR-2.2 | Allow filtering by search, status, date range, sort order |
| FR-2.3 | Display complete order details in expandable view |
| FR-3.1 | Validate order editability (status check, deadline check) |
| FR-3.2 | Allow salesperson to update customer information |
| FR-3.3 | Allow salesperson to add/remove/modify products |
| FR-3.4 | Enforce edit deadline for scheduled orders |
| FR-4.1 | Allow salesperson to assign pending orders to timeslots |
| FR-4.2 | Display only appropriate timeslots (future, available) |
| FR-4.3 | Validate timeslot assignment before saving |
| FR-4.4 | Update order status Pending → Scheduled after assignment |
| FR-5.1 | Display countdown timer for scheduled orders |
| FR-5.2 | Allow admin to configure edit deadline hours |

### Auto-Scheduler Module
| Req# | Requirement |
||-|
| FR-6.1 | Automatically assign pending orders to optimal timeslots (location clustering) |
| FR-6.2 | Optimize delivery routes using OSRM routing |
| FR-6.3 | Validate building access windows before assignment |
| FR-6.4 | Calculate truck loading sequence (LIFO principle) |
| FR-6.5 | Auto-create installation schedules for orders requiring installation |

### Warehouse Module
| Req# | Requirement |
||-|
| FR-7.1 | Display loading schedule grouped by truck, sorted by sequence |
| FR-7.2 | Show product details (dimensions, fragile flag, special equipment) |
| FR-7.3 | Enforce LIFO loading sequence to optimize delivery route |

### Delivery Module
| Req# | Requirement |
||-|
| FR-8.1 | Display delivery schedule sorted by delivery sequence |
| FR-8.2 | Show building access requirements and special instructions |
| FR-8.3 | Allow delivery team to mark orders delivered with proof |
| FR-8.4 | Record actual arrival and completion times |

### Validation & Feedback
| Req# | Requirement |
||-|
| FR-9.1 | Validate customer data (required fields, formats) |
| FR-9.2 | Validate product data (min products, quantities, service types, times) |
| FR-9.3 | Validate order status transitions |
| FR-9.4 | Display success notifications |
| FR-9.5 | Display error messages with clear explanations |
| FR-9.6 | Show loading states during operations |



## Salesperson Capabilities

### ✅ CAN Do
- **Create**: Select/create customers, add products, set service types/installation times, specify equipment
- **View**: Statistics, filter, sort, expand details
- **Edit**: Customer info, products, quantities, service types, times, equipment (if not Delivered AND before deadline)
- **Assign**: Assign pending orders to available timeslots
- **Monitor**: View countdown timer, deadline status

### ❌ CANNOT Do
- **Edit**: Delivered orders, scheduled orders past deadline, Order ID, Order Status, building association
- **Reassign**: Scheduled orders to different timeslots (admin only)
- **Configure**: Edit deadline, timeslots, auto-scheduler, workflow (admin only)



## Best Practices

**Creating Orders**:
- Verify customer details, use "Select Existing Customer" to avoid duplicates
- Double-check quantities/service types, set custom installation times if needed
- Include detailed special equipment notes

**Editing Orders**:
- Edit immediately when customer requests, watch countdown timer
- Verify changes before saving, contact admin if past deadline
- Remember: Customer edits are global (affect all their orders)

**Managing Orders**:
- Use filters effectively, check "Orders Today" regularly
- Expand details before contacting customers
- Assign timeslots promptly, monitor orders approaching deadline

**Communication**:
- Inform customers of scheduled delivery time immediately
- Explain edit deadline policy when creating orders
- Notify customers of special equipment/access restrictions
- Coordinate with admin for late changes



## Conclusion

This system supports end-to-end order management with role-based access control. Key features: flexibility (customization, multiple scheduling options), safety (edit deadlines), efficiency (search/filtering, auto-scheduling, routing), transparency (status indicators, timers), user-friendly interfaces, and seamless integration from salesperson → scheduler → warehouse → delivery.



**Document Version**: 3.0 | **Last Updated**: January 2025 | **System**: TBM Delivery Management System
