# Salesperson Order Management System - Storyboard Documentation

## Overview
This document describes the complete workflow for salespersons to create, view, search, and edit customer orders in the TBM Delivery system.

---

## Table of Contents
1. [User Personas](#user-personas)
2. [Access Control](#access-control)
3. [Scenario 1: Creating a New Order](#scenario-1-creating-a-new-order)
4. [Scenario 2: Viewing and Searching Orders](#scenario-2-viewing-and-searching-orders)
5. [Scenario 3: Editing an Existing Order](#scenario-3-editing-an-existing-order)
6. [Scenario 4: Assigning Orders to Timeslots](#scenario-4-assigning-orders-to-timeslots)
7. [Scenario 5: Order Edit Deadline Management](#scenario-5-order-edit-deadline-management)
8. [System Rules and Constraints](#system-rules-and-constraints)
9. [Functional Requirements Summary](#functional-requirements-summary)

---

## User Personas

### Salesperson (Primary User)
- **Role**: Customer service representative responsible for order intake and management
- **Permissions Required**: `customer` permission in role settings
- **Primary Goals**:
  - Record new customer orders accurately
  - Modify orders before they are scheduled/delivered
  - Track order status and history
  - Provide customer service for order changes

### Admin (Secondary User)
- **Role**: System administrator
- **Additional Capabilities**:
  - Configure system-wide edit deadline (default: 24 hours before scheduled delivery)
  - Assign orders to delivery time slots
  - Override system restrictions if needed

---

## Access Control

### Navigation Path
1. User logs in with salesperson credentials
2. System loads permissions from database based on user's role
3. If user has `customer` permission, they see "Customer Management" in sidebar
4. Customer Management section contains two tabs:
   - **Place Order** - For creating new orders
   - **Manage Orders** - For viewing and editing existing orders

---

## Scenario 1: Creating a New Order

### Starting Point
**Navigation**: Customer Management → Place Order

### Step-by-Step Workflow

#### Step 1.1: Select or Add Customer
**What Salesperson Sees**: Two-column layout with customer section on the left

**Actions Available**:
- **Option A: Select Existing Customer**
  1. Click "Select Existing Customer" button
  2. Search bar appears
  3. Type customer name, email, or phone number
  4. Filtered customer list appears in real-time
  5. Click on customer from list
  6. Customer details auto-populate in fields
  7. Customer information displays: Name, Email, Phone, Address, City, State, Postcode

- **Option B: Create New Customer**
  1. Click "Add New Customer" button
  2. Empty form appears with required fields marked with asterisks (*)
  3. Fill in required fields:
     - Full Name *
     - Email *
     - Phone *
  4. Fill in optional fields:
     - Address (recommended for building detection)
     - City
     - State
     - Postcode

**System Behavior**:
- If customer address is entered, system automatically:
  - Extracts building name from address
  - Searches for existing building in database
  - Loads building's default special equipment (if exists)
  - Pre-fills "Special Equipment" field with building defaults

**Validation Rules**:
- Email must be valid format
- Phone number required
- Full name required

---

#### Step 1.2: Add Products to Order
**What Salesperson Sees**: Product search section on the right

**Actions Available**:
1. **Search for Products**
   - Type product name in search box
   - Real-time filtered product list appears
   - Click product to add to cart

2. **View Product in Cart**
   - Product appears in bottom section
   - Default service type: "Delivery Only"
   - Default quantity: 1

3. **Configure Each Product** (for each item in cart):

   **A. Set Quantity**
   - Use number input to set quantity
   - Minimum: 1
   - No maximum limit

   **B. Choose Service Type** (for each product):
   - **Delivery Only**: Standard delivery service
   - **Delivery + Installation**: Delivery with installation service
   - **Stock Transfer to Outlet**: Customer will pick up from outlet

   **C. Dismantling Requirement** (if product supports it):
   - Checkbox appears only if product has `dismantle_required_flag = true`
   - Salesperson checks if customer needs old furniture dismantled
   - Example: Customer buying new bed, old bed needs to be dismantled first

   **D. Installation Time** (only for "Delivery + Installation"):
   - System shows product's default installation time range (e.g., "30-60 min")
   - Salesperson can either:
     - **Use Default**: Click nothing, system uses product default
     - **Set Custom Time**:
       - Click "Set custom time"
       - Enter minimum minutes (e.g., 45)
       - Enter maximum minutes (e.g., 90)
       - Reason: This specific customer needs longer installation time due to special requirements
   - If product has no default time:
     - System prompts: "No default time set"
     - Salesperson must set custom installation time
     - Enter min and max in minutes

4. **Remove Products**
   - Click X button on product card to remove from cart

**Business Logic**:
- Can add multiple products to same order
- Each product can have different service type
- Each product can have different installation time (if installation service selected)
- Products already in cart won't appear in search results

---

#### Step 1.3: Specify Special Equipment
**What Salesperson Sees**: Text area below cart section labeled "Special Equipment Needed (for entire order)"

**Actions Available**:
- Type any special equipment required for the entire order
- Examples:
  - "Crane needed - high floor delivery"
  - "Narrow doorways, need disassembly tools"
  - "Stairs only, no lift available"

**System Behavior**:
- If building was detected from customer address:
  - Pre-fills with building's default special equipment
  - Salesperson can edit/add to this text
  - Placeholder shows: "Building default: [equipment]"
- If no building detected:
  - Empty field with placeholder: "Enter special equipment needed..."

**Important Notes**:
- This field is at ORDER level (not product level)
- Applies to the entire delivery/installation job
- Admin will see this when scheduling the order

---

#### Step 1.4: Review and Submit Order
**What Salesperson Sees**:
- Cart summary with all products
- Total product count
- Green "Submit Order" button

**Pre-Submit Validation**:
System checks:
- ✓ Customer selected OR new customer info complete
- ✓ At least one product in cart
- ✓ All products have valid quantities (≥1)
- ✓ Products with "Delivery + Installation" have installation times

**Submit Actions**:
1. Click "Submit Order" button
2. Button shows "Submitting..." with disabled state
3. System processes:
   - Creates customer (if new) OR uses existing customer ID
   - Extracts building name from address
   - Finds existing building OR creates new building entry
   - Creates order with status: "Pending"
   - Creates order_products records for each cart item
   - Saves special equipment at order level

**Success State**:
- Green success message appears
- Shows order number (first 8 characters of order ID)
- "View Orders" button appears
- Cart clears automatically
- Form resets for next order

**Error Handling**:
- If error occurs, red error message shows
- Form data preserved (not cleared)
- Salesperson can fix issue and retry
- Common errors:
  - "Customer email already exists" - use existing customer instead
  - "Failed to create order" - check network connection
  - "At least one product is required" - cart is empty

---

## Scenario 2: Viewing and Searching Orders

### Starting Point
**Navigation**: Customer Management → Manage Orders

### Step 2.1: View Dashboard Overview
**What Salesperson Sees**:
Four statistics cards at the top:

1. **Pending Orders** (Yellow badge)
   - Count of orders with status "Pending"
   - Orders waiting to be scheduled by admin

2. **Scheduled Orders** (Blue badge)
   - Count of orders with status "Scheduled"
   - Orders assigned to delivery time slots

3. **Delivered Orders** (Green badge)
   - Count of orders with status "Delivered"
   - Completed orders

4. **Orders Today** (Purple badge)
   - Count of orders created today
   - Quick metric for daily performance

**System Behavior**:
- Stats update in real-time as orders are created/modified
- Each card shows icon and number
- Visual color coding for quick scanning

---

### Step 2.2: Filter Orders
**What Salesperson Sees**: Filter bar with 4 dropdown menus

#### Filter Options:

**1. Search Box** (leftmost)
- Searches across:
  - Order ID (partial match)
  - Customer name (case-insensitive)
  - Customer phone number
  - Building name
- Real-time filtering as user types
- Clear X button to reset search

**2. Status Filter**
- Options:
  - All Status (default)
  - Pending
  - Scheduled
  - Delivered
  - Cancelled
- Changes take effect immediately

**3. Date Range Filter**
- Options:
  - All Time (default)
  - Today
  - This Week (Sunday to Saturday)
  - This Month
  - Custom Range
- If "Custom Range" selected:
  - Two date pickers appear below
  - Start Date field
  - End Date field
  - Filter applies after both dates selected

**4. Sort Order**
- Options:
  - Latest First (default) - newest orders at top
  - Oldest First - oldest orders at top
  - Scheduled (Latest) - by scheduled delivery date, newest first
  - Scheduled (Earliest) - by scheduled delivery date, soonest first
  - Customer Name - alphabetical by customer name

**Combined Filtering**:
- All filters work together
- Example: "Search for 'John' + Status 'Pending' + This Week"
- Result count shows in table
- "No orders found" message if no results

---

### Step 2.3: View Orders Table
**What Salesperson Sees**: Table with 7 columns

#### Table Columns:

| Column | Description |
|--------|-------------|
| **Order #** | First 8 characters of order ID (e.g., "a3f7b2c1...") |
| **Customer** | Full name (bold) + phone number (gray, smaller) |
| **Products** | Count (e.g., "3 items") |
| **Status** | Colored badge (Yellow=Pending, Blue=Scheduled, Green=Delivered) |
| **Created** | Date order was created (e.g., "Jan 15, 2025") |
| **Scheduled** | Scheduled delivery date/time OR "-" if not scheduled yet |
| **Actions** | Expand button (↓/↑) and Edit button (pencil icon) |

**Interaction**:
- Hover over row: Background changes to light gray
- Rows are clickable for quick viewing

---

### Step 2.4: Expand Order Details
**What Salesperson Sees**: Expanded row shows full order details

**Actions Available**:
1. Click down arrow (↓) or anywhere on row
2. Row expands below to show:

#### Expanded View Sections:

**A. Customer Information**
- Icon: User icon
- Fields displayed:
  - Name: [Full name]
  - Email: [Email address]
  - Phone: [Phone number]
  - Address: [Full address]

**B. Building Information**
- Icon: Map pin icon
- Fields displayed:
  - Building: [Building name]
  - Type: [Housing type - Residential/Commercial]
  - Postal Code: [Postcode]

**C. Products List** (expandable section)
- Icon: Package icon
- Header: "Products (X)" where X is count
- Each product shows:
  - Product name (bold)
  - Quantity
  - Service type label
  - "Dismantle Required" tag (orange, if applicable)
  - Installation time range (if applicable)
  - Example display:
    ```
    King Size Bed Frame                    Qty: 2
    Service: Delivery + Installation       Dismantle Required
    Installation Time: 45-90 min
    ```

**D. Special Equipment** (if specified)
- Header: "Special Equipment"
- Shows full text of special equipment notes
- Example: "Crane needed - high floor delivery, building has narrow lift"

**E. Edit Deadline Information** (if order is scheduled)
- Icon: Clock icon
- Shows one of:
  - "Can edit for Xh Ym" (green text) - countdown timer
  - "Edit deadline has passed" (red text)
  - "Order is editable" (green text) - for pending orders

**Collapse**:
- Click up arrow (↑) to collapse row
- Click on another row to auto-collapse current and expand new one

---

## Scenario 3: Editing an Existing Order

### Starting Point
**Prerequisites**:
- Order must not be "Delivered"
- If scheduled, must be before edit deadline (default: 24 hours before delivery)

### Step 3.1: Initiate Edit
**What Salesperson Sees**: Edit button (pencil icon) in Actions column

**Actions Available**:
1. Click Edit button (pencil icon)
2. System checks editability:
   - ✓ Order status is not "Delivered"
   - ✓ If scheduled, current time is before edit deadline
   - ✗ If checks fail, alert shows: "Cannot edit order: [reason]"

**Validation Messages**:
- "Cannot edit order: Order has been delivered"
- "Cannot edit order: Edit deadline has passed (Jan 24, 2025 9:00 AM)"

**If Editable**:
- Modal window opens (full screen overlay)
- Loading state shows briefly while fetching data

---

### Step 3.2: Edit Modal Interface
**What Salesperson Sees**: Large modal (5-column width) with scrollable content

#### Modal Header:
- Title: "Edit Order"
- Order ID: First 8 characters displayed
- Countdown timer (if scheduled): "Time remaining: 23h 45m" (green text)
- X close button (top-right)

#### Modal Layout: Two-Column Grid

---

### Step 3.3: Edit Customer Information
**Location**: Left column of modal

**What Salesperson Sees**:
- Section header: "Customer Information" with user icon
- Form fields with current customer data pre-filled

**Actions Available**:
1. **Edit Full Name** *
   - Text input field
   - Current name displayed
   - Can type to change
   - Required field (asterisk shown)

2. **Edit Email** *
   - Email input field
   - Current email displayed
   - Format validation on input
   - Required field

3. **Edit Phone** *
   - Text input field
   - Current phone displayed
   - Required field

4. **Edit Address**
   - Multiline text area (2 rows)
   - Current address displayed
   - Optional field

5. **Edit City and Postcode**
   - Two-column grid
   - City on left
   - Postcode on right
   - Both optional

6. **Edit State**
   - Text input field
   - Optional

**System Behavior**:
- All fields editable
- Changes highlighted on input
- Validation errors show in real-time
- Changes only saved when "Save Changes" clicked

**Important Notes**:
- Editing customer info updates the customer record (affects all their orders)
- Building association will NOT change based on address edits in edit mode
- To change building, user would need to create new order

---

### Step 3.4: Add/Remove Products
**Location**: Right column of modal (top section)

**What Salesperson Sees**:
- Section header: "Add Products" with package icon
- Search box with magnifying glass icon
- Scrollable product list (max 10 shown)

#### Adding New Products:

**Actions Available**:
1. **Search for Products**
   - Type product name in search box
   - Filtered list appears in real-time
   - Products already in order are hidden from search
   - Shows max 10 results

2. **Add Product to Order**
   - Click on product in search list
   - Product immediately added to cart below
   - Added with default values:
     - Quantity: 1
     - Service Type: Delivery Only
     - Dismantle: Not required
     - Installation Time: Product default (if applicable)
   - Search box clears automatically

**Visual Feedback**:
- Added product appears in "Products in Order" section below
- Product count updates in section header
- Search list refreshes (removes added product)

---

### Step 3.5: Modify Products in Order
**Location**: Full width below the two-column section

**What Salesperson Sees**:
- Section header: "Products in Order (X)" where X is current count
- Grid layout (2 columns on desktop, 1 on mobile)
- Each product in a card with gray background

#### For Each Product Card:

**Display Information**:
- Product name (bold, at top)
- X remove button (top-right corner, red)

**Editable Fields**:

**1. Quantity**
- Number input
- Current quantity displayed
- Up/down arrows or type number
- Minimum value: 1
- Label: "Quantity"

**2. Service Type**
- Dropdown select
- Options:
  - Delivery Only
  - Delivery + Installation
  - Stock Transfer
- Current selection shown
- Label: "Service Type"

**3. Dismantling Required** (conditional)
- Only shows if product supports dismantling
- Checkbox with label "Dismantling Required"
- Current state: checked or unchecked
- Can toggle on/off

**4. Installation Time** (conditional)
- Only shows if Service Type = "Delivery + Installation"
- Light blue background box
- Two states:

   **State A: Using Product Default**
   - Shows: "Default: X-Y min"
   - Button: "Set custom time" (blue link)
   - Click button → switches to State B

   **State B: Custom Time Set**
   - Two number inputs (side by side)
   - Left input: "Min (min)" - minimum minutes
   - Right input: "Max (min)" - maximum minutes
   - Button: "Use product default" (blue link)
   - Click button → switches back to State A
   - If product has no default: Shows "No default time set"

**Remove Product**:
- Click X button (top-right of card)
- Product immediately removed from order
- Card disappears with animation
- Product count updates
- Product becomes available in search again
- **Validation**: Cannot remove last product (minimum 1 required)

---

### Step 3.6: Edit Special Equipment
**Location**: Full width section below products

**What Salesperson Sees**:
- Label: "Special Equipment Needed (for entire order)"
- Large text area (3 rows)
- Current special equipment text displayed (if any)
- Placeholder: "Enter any special equipment needed for this order..."

**Actions Available**:
- Click in text area to edit
- Type, delete, or modify text
- No character limit
- Optional field (can be empty)

**Examples of Changes**:
- Original: "Crane needed"
- Modified: "Crane needed - high floor delivery, building has narrow lift"
- Or cleared: "" (empty)

---

### Step 3.7: Review and Save Changes
**Location**: Bottom of modal (fixed position)

**What Salesperson Sees**:
- Border line separating from content
- Two buttons (right-aligned):
  - "Cancel" button (gray, outlined)
  - "Save Changes" button (blue, solid)

#### Pre-Save Validation:
System checks before allowing save:
- ✓ Customer name, email, phone are filled (required fields)
- ✓ At least one product in cart
- ✓ All products have quantity ≥ 1
- ✗ If any check fails, red error message shows at top of modal

**Error Messages**:
- "Customer name, email, and phone are required"
- "At least one product is required"
- Form scrolls to first error
- Save button remains enabled (allows retry)

#### Save Process:

**Actions Available**:

**Option A: Cancel Changes**
1. Click "Cancel" button
2. Confirmation dialog: "Discard changes?" (optional - immediate close)
3. Modal closes
4. No changes saved
5. Returns to orders table

**Option B: Save Changes**
1. Click "Save Changes" button
2. Button shows "Saving..." (disabled state)
3. System processes in sequence:

   **Step 1: Update Customer**
   - PUT request to `/api/customers/:id`
   - Updates customer record with new information
   - This affects the customer record globally

   **Step 2: Update Order**
   - PUT request to `/api/orders/:id`
   - Backend validates edit deadline again (server-side check)
   - Backend checks order status (not delivered)
   - Updates order with:
     - Updated products array (deletes old, creates new)
     - Updated special equipment
   - Each product saved with:
     - product_id
     - quantity
     - service_type
     - dismantle_required
     - custom_installation_time_min (if set)
     - custom_installation_time_max (if set)

**Success State**:
- Modal closes automatically
- Success alert: "Order updated successfully!" (green)
- Orders table refreshes with new data
- Updated order shows with new information
- If was expanded, re-expands to show changes

**Error Handling**:
- If customer update fails:
  - Error message shows in modal: "Failed to update customer: [reason]"
  - Order not updated (transaction not started)
  - Modal stays open, data preserved
  - Can retry

- If order update fails:
  - Error message shows in modal: "Failed to update order: [reason]"
  - Customer changes already saved (cannot rollback)
  - Modal stays open, data preserved
  - Common errors:
    - "Edit deadline has passed" - someone else modified or time expired during editing
    - "Cannot edit delivered orders" - order was delivered while editing
    - "Order not found" - order was deleted

**Backend Validation (Double-Check)**:
- Even if frontend allowed edit, backend validates again:
  - Order must exist
  - Order status must not be "Delivered"
  - If scheduled, must be before deadline
  - All required fields present
- Prevents race conditions and malicious edits

---

## Scenario 4: Assigning Orders to Timeslots

### Overview
Salespersons can now directly assign pending orders to available delivery timeslots without requiring admin intervention. This streamlines the order fulfillment process and allows faster customer service.

### Starting Point
**Navigation**: Customer Management → Manage Orders

### Prerequisites
- Order must have status "Pending"
- Available timeslots must exist in the system

---

### Step 4.1: Identify Assignable Orders

**What Salesperson Sees**: Orders table with action buttons

**Visual Indicators for Pending Orders**:
- Status badge: Yellow "Pending"
- Calendar icon button visible in Actions column (purple color)
- Edit button visible (green, if editable)
- View details button (blue)

**Visual Indicators for Other Statuses**:
- Scheduled orders: Calendar button NOT visible
- Delivered orders: Calendar button NOT visible
- Only pending orders show the assignment button

---

### Step 4.2: Initiate Timeslot Assignment

**What Salesperson Sees**: Calendar icon button in Actions column

**Actions Available**:
1. Click calendar icon button (purple)
2. System validates:
   - ✓ Order status is "Pending"
   - ✗ If not pending, alert shows: "Only pending orders can be assigned to timeslots"

**Button Behavior**:
- Hover: Shows tooltip "Assign to Timeslot"
- Disabled for non-pending orders
- Enabled only for pending orders (purple, clickable)

**Success**:
- Assignment modal opens
- Loading state shows briefly while fetching timeslots

**Error Handling**:
- If timeslots fail to load: Alert "Failed to load timeslots: [error message]"
- Modal does not open
- Can retry by clicking button again

---

### Step 4.3: Assign to Timeslot Modal Interface

**What Salesperson Sees**: Large modal overlay (3-column width) with scrollable content

#### Modal Header:
- Title: "Assign Order to Timeslot"
- Order summary line: "Order ID: a3f7b2c1... • Customer: John Doe"
- X close button (top-right)

#### Modal Layout:

**Section 1: Order Summary** (Blue background box)
Displays key order information for verification:

| Field | Display |
|-------|---------|
| **Customer** | Full name (e.g., "John Doe") |
| **Building** | Building name (e.g., "Sunny Apartments") |
| **Products** | Product count (e.g., "3 items") |
| **Status** | Current status (e.g., "Pending") |

**Purpose**: Allows salesperson to verify they're assigning the correct order

---

**Section 2: Select Delivery Timeslot**

**What Salesperson Sees**: Grouped timeslot cards organized by date

#### Timeslot Display Structure:

**If No Timeslots Available**:
- Empty state message
- Calendar icon (gray, large)
- Text: "No timeslots available"
- Instructions: Contact admin to create timeslots

**If Timeslots Available**:
- Timeslots grouped by date (collapsible sections)
- Each date group shows:
  - Date header with calendar icon (e.g., "Monday, January 27, 2025")
  - Grid of timeslot cards (2 columns on desktop, 1 on mobile)

#### Individual Timeslot Card:

**Available Timeslot** (White background, gray border):
- Clock icon
- Time window (e.g., "08:00 AM - 12:00 PM")
- Clickable
- Hover effect: Purple border

**Selected Timeslot** (Purple background, purple border):
- Clock icon
- Time window
- Checkmark icon (white, in circle)
- Purple highlight

**Unavailable Timeslot** (Gray background, disabled):
- Clock icon (gray)
- Time window (gray text)
- "Not available" label (red, small)
- Cannot be clicked
- Cursor shows "not-allowed" on hover

**Selection Behavior**:
1. Click any available timeslot card
2. Previous selection clears automatically (single selection only)
3. Selected card highlights in purple
4. Checkmark appears
5. "Assign to Timeslot" button enables

---

### Step 4.4: Confirm Assignment

**What Salesperson Sees**: Action buttons at bottom of modal

**Button Layout**:
- **Cancel** button (left, gray outlined)
  - Always enabled
  - Closes modal without saving
  - Returns to orders table

- **Assign to Timeslot** button (right, purple solid)
  - Disabled if no timeslot selected (gray, unclickable)
  - Enabled when timeslot selected (purple, clickable)
  - Shows calendar icon + text

**Actions Available**:

**Option A: Cancel Assignment**
1. Click "Cancel" button
2. Modal closes immediately
3. No changes made to order
4. Returns to orders table
5. Order remains "Pending"

**Option B: Confirm Assignment**
1. Select a timeslot (card highlights purple)
2. "Assign to Timeslot" button becomes enabled
3. Click "Assign to Timeslot" button
4. Button shows loading state:
   - Spinner icon
   - Text: "Assigning..."
   - Button disabled
5. System processes assignment:
   - Updates order with timeslot ID
   - Changes order status to "Scheduled"
   - Sets scheduled start/end times
   - Updates timestamp

**Success State**:
- Modal closes automatically
- Success alert: "Order assigned to timeslot successfully!" (green)
- Orders table refreshes automatically
- Order now shows:
  - Status badge: Blue "Scheduled"
  - Scheduled column: Shows assigned date/time
  - Calendar button: No longer visible (cannot reassign)

**Error Handling**:
- If assignment fails:
  - Error message shows at top of modal (red background)
  - Message examples:
    - "Failed to assign order to timeslot"
    - "Timeslot not found"
    - "Cannot reassign delivered orders"
  - Modal stays open
  - Selection preserved
  - Can retry or select different timeslot
  - Can cancel to abort

---

### Step 4.5: View Assigned Order

**What Salesperson Sees After Assignment**:

**In Orders Table**:
- Status badge: Changes from Yellow "Pending" to Blue "Scheduled"
- Scheduled column: Now shows date/time (e.g., "Jan 27, 2025 9:00 AM")
- Actions column: Calendar button disappears (already scheduled)
- Edit button: May be enabled or disabled depending on edit deadline

**In Expanded View**:
- Order status shows "Scheduled"
- Timeslot information appears
- Scheduled start/end times visible
- Edit deadline countdown begins (if applicable)

---

### Business Rules for Timeslot Assignment

**Assignment Eligibility**:
- ✓ Order must be in "Pending" status
- ✗ Cannot assign if order is "Scheduled" (already assigned)
- ✗ Cannot assign if order is "Delivered" (completed)
- ✗ Cannot assign if order is "Cancelled"

**Timeslot Availability**:
- System shows only future timeslots (tomorrow or later)
- Timeslots with `available_flag = false` are disabled
- Full timeslots may still be shown but disabled (configurable)

**Status Changes**:
- Assigning updates order status from "Pending" → "Scheduled"
- Scheduled orders can be reassigned by admin if needed
- Salesperson cannot reassign once assigned (admin-only)

**Benefits of Salesperson Assignment**:
1. **Faster Service**: No waiting for admin to schedule
2. **Customer Satisfaction**: Can confirm delivery time immediately during order call
3. **Reduced Workload**: Admin focuses on complex scheduling only
4. **Transparency**: Salesperson sees exact timeslot availability
5. **Error Reduction**: Real-time validation prevents double-booking

---

## Scenario 5: Order Edit Deadline Management

### Understanding Edit Deadlines

**Business Rule**:
Orders can only be edited until **X hours before scheduled delivery time**, where X is configurable by admin (default: 24 hours).

#### Example Timeline:
```
Order Created          Edit Deadline               Scheduled Delivery
Jan 15, 9:00 AM -----> Jan 24, 9:00 AM ----------> Jan 25, 9:00 AM
                       ↑                            ↑
                       24 hours before              Delivery time
```

### Step 4.1: Understanding Order States

#### State 1: Pending Order (Not Scheduled)
**Status**: Pending
**Scheduled Time**: None
**Editability**: ✓ Fully editable
**Visual Indicator**:
- Edit button: Enabled (green)
- Expanded view: "Order is editable" (green text)
- No countdown timer shown

**Salesperson Actions**:
- Can edit all fields freely
- No time pressure
- No deadline restrictions

---

#### State 2: Scheduled Order (Before Deadline)
**Status**: Scheduled
**Scheduled Time**: Set (e.g., Jan 25, 9:00 AM)
**Current Time**: Before deadline (e.g., Jan 23, 10:00 AM)
**Editability**: ✓ Editable with time limit

**Visual Indicators**:
- Edit button: Enabled (green)
- Expanded view: "Can edit for 22h 59m" (green text, countdown)
- Edit modal header: "Time remaining: 22h 59m" (green text)

**Countdown Timer Behavior**:
- Updates every minute
- Changes color as deadline approaches:
  - Green: More than 12 hours remaining
  - Yellow: 3-12 hours remaining (warning)
  - Red: Less than 3 hours remaining (urgent)
- Shows format: "Xh Ym" (e.g., "23h 15m", "2h 30m", "0h 45m")

**Salesperson Actions**:
- Can still edit order
- Should complete edits before timer expires
- Timer visible during editing (modal header)
- System warns if trying to edit when < 1 hour remaining (optional)

---

#### State 3: Scheduled Order (Past Deadline)
**Status**: Scheduled
**Scheduled Time**: Set (e.g., Jan 25, 9:00 AM)
**Current Time**: After deadline (e.g., Jan 24, 10:00 AM)
**Editability**: ✗ Not editable

**Visual Indicators**:
- Edit button: Disabled (gray, with hover tooltip)
- Button hover tooltip: "Edit deadline has passed (Jan 24, 9:00 AM)"
- Expanded view: "Edit deadline has passed" (red text)

**Salesperson Actions**:
- Cannot click edit button
- If trying to edit (bypassing UI), backend rejects with error:
  - "Edit deadline has passed. Orders cannot be edited within 24 hours of scheduled delivery."
- Must contact admin if changes are urgent
- Can only view order details

**Rationale**:
- Delivery team may have already prepared truck
- Installation team may have scheduled workers
- Customer has been notified of delivery time
- Changes would disrupt logistics

---

#### State 4: Delivered Order
**Status**: Delivered
**Editability**: ✗ Never editable

**Visual Indicators**:
- Edit button: Disabled (gray)
- Button hover tooltip: "Cannot edit delivered orders"
- Status badge: Green "Delivered"

**Salesperson Actions**:
- Cannot edit order at all
- Order is completed and archived
- Can only view historical data
- Any changes would require new order

---

### Step 4.2: Edit Deadline Configuration (Admin Only)

**Navigation**: Settings → System Settings (Admin only)

**What Admin Sees**:
- Setting: "Order Edit Deadline Hours"
- Current value: 24 (default)
- Description: "Hours before scheduled delivery that orders can no longer be edited"

**Admin Actions**:
1. Change value (e.g., 48 for 2 days, 12 for half day)
2. Save settings
3. New value applies to ALL future deadline checks
4. Does not affect existing deadlines (calculated at time of scheduling)

**Business Implications**:
- Lower value (e.g., 12 hours): More flexibility for salespersons, but riskier for operations
- Higher value (e.g., 48 hours): More preparation time for delivery, but less flexibility
- Typical range: 12-48 hours

---

## System Rules and Constraints

### Order Status Flow
```
Pending → Scheduled → Delivered
           ↓
       Cancelled (any time before delivery)
```

**Status Definitions**:
- **Pending**: Order created, awaiting admin to assign to time slot
- **Scheduled**: Admin assigned order to specific delivery time slot
- **Delivered**: Delivery/installation completed, proof of delivery uploaded
- **Cancelled**: Order cancelled by customer or salesperson

### Editing Rules Matrix

| Order Status | Scheduled Time | Can Edit? | Reason |
|--------------|----------------|-----------|--------|
| Pending | None | ✓ Yes | Not scheduled yet |
| Scheduled | Before deadline | ✓ Yes | Within edit window |
| Scheduled | After deadline | ✗ No | Too close to delivery |
| Delivered | N/A | ✗ No | Order completed |
| Cancelled | N/A | ✗ No | Order cancelled |

### Validation Rules

#### Customer Fields:
- **Full Name**: Required, min 2 characters
- **Email**: Required, valid email format
- **Phone**: Required, min 8 characters
- **Address**: Optional but recommended
- **City, State, Postcode**: Optional

#### Product Rules:
- **Minimum products**: 1 per order
- **Quantity**: Must be ≥ 1 per product
- **Service Type**: Required, must be one of: delivery, delivery_installation, stock_transfer
- **Installation Time**: Required if service_type = delivery_installation
  - Min must be ≥ 0
  - Max must be ≥ Min
  - If product has no default, must set custom time

#### Special Equipment:
- Optional field
- No character limit
- Stored at order level (not per product)

### Data Persistence

**What Gets Saved**:
- Customer information (customers table)
- Building information (buildings table) - auto-created from address
- Order information (orders table):
  - customer_id (FK)
  - building_id (FK)
  - order_status
  - special_equipment_needed
  - created_at, updated_at
  - scheduled_start_date_time (set by admin)
- Product associations (order_products table):
  - order_id (FK)
  - product_id (FK)
  - quantity
  - service_type
  - dismantle_required
  - custom_installation_time_min
  - custom_installation_time_max

**What Gets Updated on Edit**:
- Customer record (affects all orders for that customer)
- Order's special_equipment_needed
- Order's updated_at timestamp
- All order_products records (deleted and recreated)

**What Does NOT Change**:
- Order ID (immutable)
- Customer ID (immutable)
- Building ID (immutable)
- Created timestamp
- Order status (only admin can change)
- Scheduled delivery time (only admin can change)

---

## Functional Requirements Summary

This section provides a consolidated view of functional requirements for the Salesperson Order Management System, suitable for inclusion in project reports and technical documentation.

### FR-1: Order Creation and Management

**FR-1.1: Create New Orders**
- **Description**: Salesperson shall be able to create new customer orders with complete product and service details
- **Inputs**: Customer information, product list, service types, special equipment
- **Outputs**: Order confirmation with unique order ID, status "Pending"
- **Validations**:
  - Customer name, email, and phone are required
  - At least one product must be added to order
  - Service type must be selected for each product
  - Installation times required for delivery+installation service
- **Success Criteria**: Order is created in database with all related records

**FR-1.2: Customer Management During Order Creation**
- **Description**: System shall support both new customer creation and existing customer selection
- **Features**:
  - Search existing customers by name, email, or phone
  - Create new customer with inline form
  - Prevent duplicate customers via email validation
  - Auto-populate customer fields when selected
- **Success Criteria**: Customer record is created or selected correctly

**FR-1.3: Building Auto-Detection**
- **Description**: System shall automatically detect building from customer address
- **Process**:
  - Extract building name from address field
  - Search for existing building in database
  - Create new building if not found
  - Pre-fill special equipment from building defaults
- **Success Criteria**: Building is correctly identified or created

---

### FR-2: Order Viewing and Filtering

**FR-2.1: Dashboard Statistics**
- **Description**: System shall display real-time order statistics on dashboard
- **Metrics Displayed**:
  - Total pending orders
  - Total scheduled orders
  - Total delivered orders
  - Orders created today
- **Update Frequency**: Real-time (on page load and after order changes)
- **Success Criteria**: Statistics match actual database counts

**FR-2.2: Advanced Order Filtering**
- **Description**: Salesperson shall be able to filter orders using multiple criteria
- **Filter Options**:
  - **Search**: By order ID, customer name, phone number, building name
  - **Status**: All, Pending, Scheduled, Delivered, Cancelled
  - **Date Range**: All Time, Today, This Week, This Month, Custom Range
  - **Sort Order**: Latest first, Oldest first, Scheduled (earliest/latest), Customer name
- **Behavior**: Filters work in combination (AND logic)
- **Success Criteria**: Filtered results match all applied criteria

**FR-2.3: Order Details Expansion**
- **Description**: System shall display complete order details in expandable view
- **Information Shown**:
  - Customer information (name, email, phone, address)
  - Building information (name, type, postal code)
  - Product list (name, quantity, service type, installation time)
  - Special equipment notes
  - Edit deadline status (if scheduled)
- **Success Criteria**: All order details are accurately displayed

---

### FR-3: Order Editing and Modification

**FR-3.1: Edit Eligibility Check**
- **Description**: System shall validate order editability before allowing modifications
- **Edit Allowed If**:
  - Order status is NOT "Delivered"
  - AND (Order is "Pending" OR current time is before edit deadline)
- **Edit Denied If**:
  - Order status is "Delivered"
  - OR (Order is "Scheduled" AND current time > edit deadline)
- **Success Criteria**: Edit button enabled/disabled correctly based on eligibility

**FR-3.2: Customer Information Updates**
- **Description**: Salesperson shall be able to update customer information within order
- **Editable Fields**: Full name, email, phone, address, city, state, postcode
- **Impact**: Changes affect customer record globally (all orders for that customer)
- **Validations**: Required fields (name, email, phone) must be filled
- **Success Criteria**: Customer record is updated in database

**FR-3.3: Product Modification**
- **Description**: Salesperson shall be able to add, remove, and modify products in order
- **Operations**:
  - Add new products via search
  - Remove existing products
  - Change quantities (minimum 1)
  - Change service types
  - Toggle dismantling requirement
  - Set custom installation times
- **Constraints**: Minimum 1 product required in order
- **Success Criteria**: Order products are updated correctly

**FR-3.4: Edit Deadline Enforcement**
- **Description**: System shall enforce edit deadline for scheduled orders
- **Backend Validation**:
  - Fetch deadline hours from system_settings table
  - Calculate deadline: scheduled_time - deadline_hours
  - Reject edit if current_time > deadline
- **Error Messages**: Clear explanation of why edit was denied
- **Success Criteria**: Edits prevented after deadline, API returns 400 error

---

### FR-4: Timeslot Assignment

**FR-4.1: Assign Pending Orders to Timeslots**
- **Description**: Salesperson shall be able to assign pending orders to available delivery timeslots
- **Preconditions**:
  - Order status must be "Pending"
  - Available timeslots must exist in system
- **Process**:
  - Display available timeslots grouped by date
  - Allow single timeslot selection
  - Update order status to "Scheduled" on assignment
  - Set scheduled start/end times
- **Success Criteria**: Order is successfully assigned and status updated

**FR-4.2: Timeslot Display and Filtering**
- **Description**: System shall display only appropriate timeslots for assignment
- **Display Rules**:
  - Show only future timeslots (tomorrow or later)
  - Group by date with clear headers
  - Show time windows (e.g., 08:00 AM - 12:00 PM)
  - Disable unavailable timeslots
- **Visual Indicators**:
  - Available: White background, clickable
  - Selected: Purple background, checkmark
  - Unavailable: Gray background, disabled
- **Success Criteria**: Timeslots are correctly filtered and displayed

**FR-4.3: Assignment Validation**
- **Description**: System shall validate timeslot assignment before saving
- **Backend Checks**:
  - Order must exist
  - Order status must be "Pending"
  - Timeslot must exist
  - Timeslot must be available
- **Error Handling**: Display clear error messages on validation failure
- **Success Criteria**: Invalid assignments are prevented

**FR-4.4: Post-Assignment Status Update**
- **Description**: System shall update order status and display after timeslot assignment
- **Changes Applied**:
  - Order status: "Pending" → "Scheduled"
  - Scheduled column: Shows assigned date/time
  - Calendar button: Hidden (cannot reassign)
  - Edit deadline: Countdown begins
- **Success Criteria**: UI reflects new order status immediately

---

### FR-5: Edit Deadline Management

**FR-5.1: Countdown Timer Display**
- **Description**: System shall display countdown timer for scheduled orders
- **Timer Behavior**:
  - Updates every minute
  - Shows format "Xh Ym" (e.g., "23h 15m")
  - Color coding: Green (>12h), Yellow (3-12h), Red (<3h)
- **Display Locations**:
  - Expanded order details
  - Edit modal header (if editing)
- **Success Criteria**: Timer displays accurate time remaining

**FR-5.2: Edit Deadline Configuration**
- **Description**: Admin shall be able to configure system-wide edit deadline
- **Configuration**:
  - Setting: order_edit_deadline_hours
  - Default value: 24 hours
  - Typical range: 12-48 hours
- **Application**: Applies to all future deadline calculations
- **Success Criteria**: New deadline value is used for all subsequent edits

---

### FR-6: Data Validation and Integrity

**FR-6.1: Customer Data Validation**
- **Required Fields**: Full name, email, phone
- **Email Format**: Must be valid email format
- **Phone Number**: Minimum 8 characters
- **Duplicate Prevention**: Email must be unique per customer

**FR-6.2: Product Validation**
- **Minimum Products**: At least 1 product per order
- **Quantity Range**: Must be ≥ 1 per product
- **Service Type**: Must be one of: delivery, delivery_installation, stock_transfer
- **Installation Time**: Required if service_type = delivery_installation
  - Minimum ≥ 0
  - Maximum ≥ Minimum

**FR-6.3: Order Status Validation**
- **Status Flow**: Pending → Scheduled → Delivered (linear progression)
- **Edit Restrictions**: Based on current status and deadline
- **Backend Enforcement**: Server validates all state transitions

---

### FR-7: User Feedback and Notifications

**FR-7.1: Success Notifications**
- **Order Created**: "Order created successfully!" (green alert)
- **Order Updated**: "Order updated successfully!" (green alert)
- **Timeslot Assigned**: "Order assigned to timeslot successfully!" (green alert)

**FR-7.2: Error Messages**
- **Validation Errors**: Field-specific error messages with clear instructions
- **Permission Errors**: "Cannot edit order: [reason]"
- **Deadline Errors**: "Edit deadline has passed. Orders cannot be edited within X hours of scheduled delivery."

**FR-7.3: Loading States**
- **Form Submission**: Button shows "Submitting..." with disabled state
- **Data Loading**: Spinner or loading message while fetching data
- **Modal Loading**: "Loading..." state while fetching related data

---

### Summary of Salesperson Capabilities

### ✅ What Salesperson CAN Do:

1. **Order Creation**:
   - Select existing customers or create new ones
   - Add multiple products with different service types
   - Set custom installation times per product
   - Specify special equipment for entire order
   - Submit orders with immediate validation

2. **Order Viewing**:
   - View dashboard statistics (Pending, Scheduled, Delivered, Today)
   - Filter by status, date range, and custom dates
   - Search by order ID, customer name, phone, building
   - Sort by creation date, scheduled date, or customer name
   - Expand rows to see full order details

3. **Order Editing** (with constraints):
   - Edit customer information (name, email, phone, address)
   - Add new products to existing order
   - Remove products from order
   - Change product quantities
   - Change service types per product
   - Modify dismantling requirements
   - Update installation times
   - Edit special equipment notes
   - **Only if**: Order not delivered AND before edit deadline

4. **Timeslot Assignment**:
   - Assign pending orders to available delivery timeslots
   - View available timeslots grouped by date
   - Select timeslot with visual confirmation
   - Change order status from Pending to Scheduled

5. **Deadline Monitoring**:
   - View countdown timer for scheduled orders
   - Know exactly when edit deadline expires
   - Receive clear feedback on editability

### ❌ What Salesperson CANNOT Do:

1. **Cannot Edit**:
   - Delivered orders (completed)
   - Scheduled orders past edit deadline
   - Order ID (immutable)
   - Order status manually (auto-updated)
   - Building association after creation

2. **Cannot Reassign**:
   - Scheduled orders to different timeslots (admin only)
   - Timeslot once assigned (admin can reassign)

3. **Cannot Configure**:
   - System-wide edit deadline (admin only)
   - Timeslot availability (admin only)
   - Order status workflow (admin only)

---

## Best Practices for Salespersons

### Creating Orders:
1. ✓ Always verify customer details before submitting
2. ✓ Double-check product quantities and service types
3. ✓ Set custom installation times if customer has special needs
4. ✓ Include detailed special equipment notes
5. ✓ Use existing customers when possible (avoid duplicates)

### Editing Orders:
1. ✓ Edit orders as soon as customer requests changes
2. ✓ Watch the countdown timer for scheduled orders
3. ✓ Verify all changes before clicking "Save"
4. ✓ Communicate with admin if past deadline and urgent
5. ✓ Remember: customer edits affect all their orders

### Managing Orders:
1. ✓ Use filters to focus on relevant orders (e.g., Pending orders)
2. ✓ Check "Orders Today" regularly for daily performance
3. ✓ Expand order details to verify before calling customers
4. ✓ Keep special equipment notes updated and detailed
5. ✓ Contact admin to schedule pending orders

---

## Conclusion

This storyboard documents the complete salesperson workflow for order management in the TBM Delivery system. The system provides:

- **Flexibility**: Create and edit orders with detailed customization
- **Safety**: Edit deadlines prevent last-minute changes that disrupt logistics
- **Efficiency**: Advanced search and filtering for quick order access
- **Transparency**: Clear visual indicators for order status and editability
- **User-Friendly**: Intuitive interface with validation and helpful feedback

The system balances customer service flexibility (allowing edits) with operational efficiency (enforcing deadlines), ensuring smooth delivery operations while maintaining high customer satisfaction.

---

**Document Version**: 1.0
**Last Updated**: January 2025
**System Version**: TBM Delivery Management System v2.0
**Related Documents**:
- [CLAUDE.md](CLAUDE.md) - Technical implementation guide
- Database schema in [server/prisma/schema.prisma](server/prisma/schema.prisma)
