# Auto-Scheduler Workflow Storyboard

> **Visual Guide for Understanding the TBM Delivery Auto-Scheduler System**
>
> This document explains how the automatic order scheduling system works from the user's perspective.

---

## 📖 Table of Contents

1. [What is the Auto-Scheduler?](#what-is-the-auto-scheduler)
2. [The Complete User Journey](#the-complete-user-journey)
3. [Step-by-Step Workflow](#step-by-step-workflow)
4. [Behind the Scenes: How It Works](#behind-the-scenes-how-it-works)
5. [Understanding the Results](#understanding-the-results)
6. [Common Scenarios](#common-scenarios)

---

## What is the Auto-Scheduler?

The Auto-Scheduler is an **intelligent system** that automatically assigns delivery orders to optimal time slots. Instead of manually scheduling each order, the system:

✅ **Groups orders** by location (postal code)
✅ **Optimizes routes** to minimize travel time
✅ **Respects constraints** like building access hours and customer preferences
✅ **Assigns trucks** based on capacity and zone coverage
✅ **Creates installation schedules** for orders that need installation service
✅ **Ensures feasibility** by validating return trips to warehouse

---

## The Complete User Journey

### 🎯 Scenario: Sarah (Admin) Needs to Schedule 20 New Orders

**Morning (9:00 AM):**
- 20 new orders arrived overnight from salespersons
- All orders are in "Pending" status
- Sarah needs to schedule them for delivery

**What Sarah Does:**

```
1. Login to TBM Delivery System
   ↓
2. Navigate to: Schedule → Auto Scheduler
   ↓
3. Click "Run Scheduler Now"
   ↓
4. Wait 15-30 seconds (system is optimizing routes)
   ↓
5. Review Results:
   ✅ 18 orders successfully scheduled
   ⚠️ 2 orders unscheduled (see reasons)
   ↓
6. Expand order details to verify assignments
   ↓
7. Check Schedule page to see timeslot assignments
   ↓
8. Manually schedule the 2 unscheduled orders (if needed)
```

---

## Step-by-Step Workflow

### Step 1️⃣: Salesperson Creates Orders

**Page:** Customer Management → Place Order

```
┌─────────────────────────────────┐
│  Place Order Form               │
├─────────────────────────────────┤
│ Customer: John Tan              │
│ Phone: 012-3456789              │
│ Address: 123 Jalan Utama,       │
│          Petaling Jaya, 47800   │
│                                 │
│ Products:                       │
│ • Sofa Set (Qty: 2)             │
│   Service: Delivery + Install   │
│   Installation Time: 60-90 min  │
│                                 │
│ • Coffee Table (Qty: 1)         │
│   Service: Delivery Only        │
│                                 │
│ Special Equipment: Lift needed  │
│                                 │
│ [Submit Order] ←────────────────│
└─────────────────────────────────┘
              ↓
    Order Status: Pending
    Waiting for scheduling...
```

**Result:** Order is created with status "Pending"

---

### Step 2️⃣: Admin Runs Auto-Scheduler

**Page:** Schedule → Auto Scheduler

```
┌──────────────────────────────────────────┐
│  🤖 Auto Scheduler                       │
├──────────────────────────────────────────┤
│                                          │
│  ⚙️ Configuration                        │
│  Warehouse: University of Malaya, KL     │
│  Postal Code: 50603                      │
│  Schedule: Daily at midnight             │
│  Status: ✅ Enabled                      │
│                                          │
│  ┌────────────────────┐                 │
│  │ Run Scheduler Now  │ ←── CLICK HERE  │
│  └────────────────────┘                 │
│                                          │
│  Last run: Today at 12:00 AM             │
└──────────────────────────────────────────┘
```

**What Happens:**
1. Admin clicks "Run Scheduler Now"
2. Loading spinner appears
3. System processes all pending orders
4. Results appear in 15-30 seconds

---

### Step 3️⃣: System Processes Orders

**Behind the Scenes (User sees loading indicator):**

```
🔄 Processing...

Step 1: Found 20 pending orders
Step 2: Grouped by location (5 groups)
        • Group 1: Postal 478xx (8 orders)
        • Group 2: Postal 506xx (5 orders)
        • Group 3: Postal 520xx (4 orders)
        • Group 4: Postal 430xx (2 orders)
        • Group 5: Postal 415xx (1 order)

Step 3: Calculating delivery times...
        ✓ Order #001: 45 min delivery + 30 min installation
        ✓ Order #002: 20 min delivery only
        ✓ Order #003: 60 min delivery + 90 min installation
        ...

Step 4: Finding available timeslots...
        ✓ Found 15 available slots (tomorrow to 2 weeks)

Step 5: Optimizing routes...
        🗺️ Using OSRM to calculate travel times
        ✓ Route 1: Warehouse → Building A → Building B → Building C
        ✓ Total travel time: 45 min

Step 6: Assigning to timeslots...
        ✓ Slot: 2025-11-27, 08:00-12:00
          - Order #001 (Load Seq: 3)
          - Order #002 (Load Seq: 2)
          - Order #003 (Load Seq: 1)

Step 7: Validating constraints...
        ✓ Building access windows respected
        ✓ Customer preferences considered
        ✓ Return trip to warehouse fits in slot

Step 8: Creating installation schedules...
        ✓ Order #001: Installation team assigned
```

---

### Step 4️⃣: Review Results

**Results Screen:**

```
┌────────────────────────────────────────────────┐
│  📊 Scheduling Results                         │
├────────────────────────────────────────────────┤
│                                                │
│  ✅ Successfully Scheduled                     │
│  ┌──────────────┐                             │
│  │      18      │  orders assigned             │
│  └──────────────┘                             │
│                                                │
│  ⚠️ Unscheduled                               │
│  ┌──────────────┐                             │
│  │       2      │  orders could not be         │
│  └──────────────┘  scheduled                  │
│                                                │
└────────────────────────────────────────────────┘

📋 Scheduled Orders (18)
┌───────────┬─────────────┬──────────┬───────────────┬────────┐
│ Order ID  │ Customer    │ Products │ Scheduled Time│ Seq    │
├───────────┼─────────────┼──────────┼───────────────┼────────┤
│ 3f2a1...  │ John Tan    │ 3 items  │ 08:30-10:00  │ #3     │
│           │ 012-3456789 │          │ Nov 27, 2025  │        │
│           │ [Expand ▼] ←─── Click to see details  │        │
├───────────┼─────────────┼──────────┼───────────────┼────────┤
│ 7b8c2...  │ Mary Lim    │ 2 items  │ 10:15-11:00  │ #2     │
│           │ 016-7890123 │          │ Nov 27, 2025  │        │
│           │ [Expand ▼]                             │        │
├───────────┼─────────────┼──────────┼───────────────┼────────┤
│ ...       │ ...         │ ...      │ ...           │ ...    │
└───────────┴─────────────┴──────────┴───────────────┴────────┘

⚠️ Unscheduled Orders (2)
┌───────────┬─────────────┬────────────────────────┐
│ Order ID  │ Customer    │ Reason                 │
├───────────┼─────────────┼────────────────────────┤
│ a5d3f...  │ Peter Wong  │ No suitable timeslot   │
│           │             │ (building access       │
│           │             │  window too narrow)    │
├───────────┼─────────────┼────────────────────────┤
│ c9e7b...  │ Lisa Chen   │ Customer preferred     │
│           │             │ time not available     │
│           │             │ (2nd attempt)          │
└───────────┴─────────────┴────────────────────────┘
```

---

### Step 5️⃣: View Expanded Order Details

**Click on [Expand ▼] for Order #3f2a1...**

```
┌──────────────────────────────────────────────────────┐
│  Order Details: 3f2a1b4c...                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  👤 Customer Information                             │
│  Name: John Tan                                      │
│  Email: john.tan@email.com                           │
│  Phone: 012-3456789                                  │
│  Address: 123 Jalan Utama, Petaling Jaya            │
│  Postcode: 47800                                     │
│                                                      │
│  🏢 Building Information                             │
│  Building: Sri Petalig Apartments                    │
│  Type: Condominium                                   │
│  Postal Code: 47800                                  │
│  Access Time: 08:00 - 20:00                          │
│                                                      │
│  🕐 Timeslot Assignment                              │
│  Date: Wednesday, November 27, 2025                  │
│  Time Window: 08:00 - 12:00                          │
│  Truck: WKL 1234 (3-ton)                             │
│                                                      │
│  🚚 Logistics Metrics                                │
│  Work Time: 135 min                                  │
│  Travel Time: 22 min (OSRM)                          │
│  Travel Distance: 15.3 km                            │
│  Loading Sequence: #3 (load first, deliver last)    │
│                                                      │
│  📦 Products (3)                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │ Sofa Set                       Qty: 2          │ │
│  │ Service: Delivery + Installation               │ │
│  │ Installation Time: 60-90 min                   │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ Coffee Table                   Qty: 1          │ │
│  │ Service: Delivery Only                         │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ⚠️ Special Equipment                               │
│  Lift needed for access to 15th floor               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

### Step 6️⃣: Verify in Schedule Page

**Page:** Schedule

```
┌────────────────────────────────────────────────┐
│  📅 Schedule - Weekly View                     │
├────────────────────────────────────────────────┤
│  November 27, 2025 (Wednesday)                 │
│                                                │
│  ┌──────────────────────────────┐             │
│  │ 08:00 - 12:00                │             │
│  │ 🚚 Truck: WKL 1234           │             │
│  │ 👥 Team: Delivery Team A     │             │
│  │ 📦 Orders: 3                 │             │
│  │                              │             │
│  │ • John Tan (47800) - Seq #3  │             │
│  │ • Mary Lim (47900) - Seq #2  │             │
│  │ • Ali Ahmad (47850) - Seq #1 │             │
│  │                              │             │
│  │ Status: ✅ Scheduled         │             │
│  └──────────────────────────────┘             │
│                                                │
│  ┌──────────────────────────────┐             │
│  │ 13:00 - 19:00                │             │
│  │ 🚚 Truck: WKL 5678           │             │
│  │ 👥 Team: Delivery Team B     │             │
│  │ 📦 Orders: 5                 │             │
│  │                              │             │
│  │ Status: ✅ Scheduled         │             │
│  └──────────────────────────────┘             │
└────────────────────────────────────────────────┘
```

---

## Behind the Scenes: How It Works

### 🧠 The Scheduling Intelligence

```
┌─────────────────────────────────────────────┐
│                                             │
│  INPUT                                      │
│  • 20 pending orders                        │
│  • Customer addresses & preferences         │
│  • Product delivery/installation times      │
│  • Building access constraints              │
│  • Available timeslots                      │
│  • Truck capacities & zones                 │
│                                             │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 1: LOCATION GROUPING                  │
│  ───────────────────────────                │
│  Group orders by postal code (first 2)      │
│  • 478xx → 8 orders (Petaling Jaya)         │
│  • 506xx → 5 orders (KL City)               │
│  • 520xx → 4 orders (Ampang)                │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 2: CALCULATE WORK TIMES               │
│  ───────────────────────────                │
│  For each order:                            │
│  1. Get product installation times          │
│  2. Use custom times if set                 │
│  3. Add dismantle time if needed            │
│  4. Sum up total work minutes               │
│                                             │
│  Example:                                   │
│  Order #001:                                │
│  • Sofa (60 min install) × 2 = 120 min      │
│  • Coffee table (no install) = 0 min        │
│  • Total work time = 120 min                │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 3: ROUTE OPTIMIZATION                 │
│  ───────────────────────────                │
│  Using OSRM (OpenStreetMap Routing):        │
│  1. Geocode building addresses              │
│  2. Build distance matrix                   │
│  3. Find optimal delivery sequence          │
│  4. Calculate travel times                  │
│                                             │
│  Example Route:                             │
│  Warehouse (50603)                          │
│      ↓ 12 min                               │
│  Building A (47800)                         │
│      ↓ 8 min                                │
│  Building B (47850)                         │
│      ↓ 6 min                                │
│  Building C (47900)                         │
│      ↓ 15 min                               │
│  Warehouse (return)                         │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 4: TIMESLOT ASSIGNMENT                │
│  ───────────────────────────                │
│  For each group:                            │
│  1. Find available timeslots (future only)  │
│  2. Validate constraints:                   │
│     ✓ Building access window                │
│     ✓ Customer preferred time               │
│     ✓ Total time fits in slot               │
│     ✓ Return trip before slot ends          │
│  3. Assign orders to best slot              │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 5: TRUCK LOADING SEQUENCE             │
│  ───────────────────────────                │
│  Reverse delivery order (LIFO):             │
│                                             │
│  Delivery Order:  A → B → C                 │
│  Loading Order:   C → B → A                 │
│                                             │
│  Sequences:                                 │
│  • Building C: #3 (load first)              │
│  • Building B: #2 (load second)             │
│  • Building A: #1 (load last)               │
│                                             │
│  This ensures the truck is loaded in        │
│  reverse delivery order for efficiency.     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  STEP 6: DATABASE UPDATE                    │
│  ───────────────────────────                │
│  For each scheduled order:                  │
│  • Set time_slot_id                         │
│  • Set scheduled_start_date_time            │
│  • Set scheduled_end_date_time              │
│  • Set truck_loading_sequence               │
│  • Update order_status → 'Scheduled'        │
│                                             │
│  Create installation schedules:             │
│  • If product needs installation            │
│  • Assign installation team                │
│  • Set estimated_arrival_time               │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  OUTPUT                                     │
│  ───────                                    │
│  ✅ 18 orders scheduled                     │
│  ⚠️ 2 orders unscheduled (with reasons)    │
│                                             │
│  All data ready for UI display              │
└─────────────────────────────────────────────┘
```

---

## Understanding the Results

### ✅ Successfully Scheduled Orders

Orders appear in the **Scheduled Orders** table with:

| Field | Meaning | Example |
|-------|---------|---------|
| **Order ID** | Unique identifier (first 8 chars) | `3f2a1b4c...` |
| **Customer** | Customer name & phone | `John Tan`<br>`012-3456789` |
| **Products** | Number of items | `3 items` |
| **Scheduled Time** | Delivery window | `08:30-10:00`<br>`Nov 27, 2025` |
| **Loading Seq** | Truck loading order | `#3` (load first) |

**Expandable Details Include:**
- 👤 Customer information (name, email, phone, address, postcode)
- 🏢 Building details (name, type, postal code, access hours)
- 🕐 Timeslot assignment (date, time window, assigned truck)
- 🚚 Logistics metrics (work time, travel time, distance, sequence)
- 📦 Product list (name, quantity, service type, installation time)
- ⚠️ Special equipment notes

---

### ⚠️ Unscheduled Orders

Orders that couldn't be scheduled show:

| Order ID | Customer | Reason |
|----------|----------|--------|
| `a5d3f...` | Peter Wong | **No suitable timeslot found**<br>(Building access window 10:00-11:00 too narrow; delivery needs 2 hours) |
| `c9e7b...` | Lisa Chen | **Customer preferred time not available**<br>(2nd delivery attempt requires preferred time 14:00-16:00; no slots available) |

**Common Reasons:**

1. **"No available timeslots"**
   - All future timeslots are full
   - Solution: Create more timeslots or wait for daily generation

2. **"No suitable timeslot found (access window conflict or insufficient time)"**
   - Building access window too restrictive
   - Order work time exceeds all available windows
   - Solution: Manually schedule or adjust building access hours

3. **"Customer preferred time not satisfied"**
   - On 2nd+ delivery attempt (hard constraint)
   - No timeslot matches customer's preferred delivery time
   - Solution: Contact customer to adjust preference or manually schedule

---

## Common Scenarios

### Scenario 1: Customer Prefers Morning Delivery

**Setup:**
- Customer: John Tan
- Preferred Time: 08:00 - 10:00 (morning person)
- Delivery Attempt: 1st (soft constraint)

**Scheduling Behavior:**

```
✓ 1st Attempt: Scheduler TRIES to satisfy preference
  - If 08:00-10:00 slot available → Assign
  - If not available → Assign to next available slot anyway

✓ If delivery fails and re-scheduled (2nd attempt):
  - Preference becomes HARD constraint
  - MUST find 08:00-10:00 slot
  - If no slot → Order remains unscheduled
```

**Why?** We want to be flexible on first attempt but strict on retries (customer already inconvenienced once).

---

### Scenario 2: Building Has Strict Access Hours

**Setup:**
- Building: Luxury Condominiums
- Access Hours: 10:00 - 17:00 (security policy)
- Order work time: 2 hours delivery

**Scheduling Behavior:**

```
Available Timeslots:
┌─────────────┬──────────────┬─────────┐
│ Date        │ Time Window  │ Status  │
├─────────────┼──────────────┼─────────┤
│ Nov 27      │ 08:00-12:00  │ ❌ Skip │ ← Starts before 10:00
│ Nov 27      │ 13:00-19:00  │ ✅ Use  │ ← Within 10:00-17:00
│ Nov 27      │ 19:00-21:00  │ ❌ Skip │ ← Ends after 17:00
└─────────────┴──────────────┴─────────┘

Scheduler assigns to 13:00-19:00 slot
Delivery scheduled: 13:00-15:00 (within access hours)
```

---

### Scenario 3: Multiple Orders to Same Building

**Setup:**
- Building: Sri Petalig Apartments
- Orders: 3 orders for different units
- All pending

**Scheduling Behavior:**

```
Scheduler groups orders by location:
┌─────────────────────────────────────┐
│ Location Group: 47800               │
├─────────────────────────────────────┤
│ Order #1: Unit 15-A (2 hours work)  │
│ Order #2: Unit 18-C (1 hour work)   │
│ Order #3: Unit 22-B (1.5 hours)     │
├─────────────────────────────────────┤
│ Total work time: 4.5 hours          │
│ Travel time: 0 min (same building)  │
│ Required slot: ~5 hours             │
└─────────────────────────────────────┘

✓ Finds 13:00-19:00 slot (6 hours)
✓ Assigns all 3 orders to same slot
✓ Optimizes unit visit order:
  - Visit 15-A first (lower floor)
  - Visit 18-C second
  - Visit 22-B last (highest floor)
✓ Truck loading sequence:
  - Unit 22-B: Seq #3 (load first)
  - Unit 18-C: Seq #2
  - Unit 15-A: Seq #1 (load last)
```

**Benefit:** Efficient routing, one trip to building, proper truck loading.

---

### Scenario 4: Automated Daily Scheduling

**Setup:**
- Cron Schedule: Daily at midnight (00:00)
- Enabled: Yes
- Warehouse: University of Malaya, KL

**Daily Workflow:**

```
11:00 PM (Nov 26):
├─ 5 new orders from salespersons
└─ All status: Pending

12:00 AM (Nov 27) - Cron job runs:
├─ Fetches 5 pending orders
├─ Groups by location
├─ Optimizes routes
├─ Assigns to timeslots (Nov 28+)
├─ Updates database
└─ Logs results to console

12:01 AM (Nov 27):
├─ 4 orders scheduled ✅
├─ 1 order unscheduled ⚠️
└─ Admin notified via system

9:00 AM (Nov 27) - Admin reviews:
├─ Checks AutoScheduleReview page
├─ Sees 4 scheduled, 1 unscheduled
└─ Manually schedules remaining order

Result: Automated scheduling saves admin time
```

---

### Scenario 5: Truck Capacity Exceeded

**Setup:**
- Available Truck: WKL 1234 (3-ton, 12 m³ capacity)
- Orders for same timeslot:
  - Order #1: 8 m³ volume
  - Order #2: 6 m³ volume
  - Total: 14 m³ (exceeds 12 m³)

**Scheduling Behavior:**

```
Scheduler calculation:
┌─────────────────────────────┐
│ Order #1: 8 m³              │
│ Order #2: 6 m³              │
│ ────────────────            │
│ Total: 14 m³                │
│                             │
│ Available truck: 12 m³      │
│ Status: ❌ Exceeds capacity │
└─────────────────────────────┘

✓ Scheduler splits orders:
  - Timeslot 1 (08:00-12:00):
    • Order #1 only (8 m³)
    • Truck: WKL 1234

  - Timeslot 2 (13:00-19:00):
    • Order #2 only (6 m³)
    • Truck: WKL 5678 (different truck)

Result: Orders scheduled to separate slots
```

---

## 🎓 Key Takeaways

### For Admins

1. **Trust the System**: The scheduler considers many constraints you might forget
2. **Review Results**: Always check unscheduled orders and understand why
3. **Configure Properly**: Ensure warehouse address and cron schedule are correct
4. **Monitor Performance**: Check scheduler execution time (should be < 30 seconds)
5. **Manual Intervention**: Some orders need manual scheduling (it's normal)

### For Salespersons

1. **Complete Information**: Provide accurate customer address and preferences
2. **Realistic Times**: Set realistic installation times for products
3. **Special Equipment**: Note any special equipment needed (lifts, cranes)
4. **Building Access**: Know building access hours before creating order

### For Delivery Teams

1. **Loading Sequence**: Follow the truck loading sequence numbers
2. **Route Optimization**: Routes are optimized; follow the order
3. **Time Windows**: Respect the scheduled start/end times
4. **Building Access**: Verify access hours before departure

---

## 📞 Need Help?

**Common Questions:**

**Q: Why was my order not scheduled?**
A: Check the "Unscheduled Orders" section for the specific reason. Common causes: building access window too narrow, customer preferred time unavailable (2nd attempt), no future timeslots available.

**Q: Can I change the scheduled time?**
A: Yes, but only before the edit deadline (default: 24 hours before delivery). After deadline, contact admin for manual rescheduling.

**Q: How do I create more timeslots?**
A: Navigate to Schedule page and click "Add Time Slot" button. Or use the auto-generate endpoint to create 2 weeks of timeslots.

**Q: What if the scheduler is too slow?**
A: Typical scheduling time is 15-30 seconds for 50-100 orders. If slower, check OSRM availability or consider self-hosting OSRM server.

**Q: Can I disable automated scheduling?**
A: Yes, in AutoScheduleReview page, uncheck "Enabled" in the configuration panel.

---

## 🔗 Related Documentation

- [CLAUDE.md](CLAUDE.md) - Complete technical documentation
- [Auto-Scheduler System Section](CLAUDE.md#auto-scheduler-system) - Developer reference
- [Order Management System](CLAUDE.md#order-management-system) - Order creation workflow

---

**Last Updated:** November 26, 2025
**Version:** 1.0
**Maintained By:** TBM Delivery Development Team
