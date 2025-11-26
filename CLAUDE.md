# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a delivery management system (TBMDelivery) with role-based access control for managing employees, schedules, orders, trucks, zones, and buildings. The application is currently in migration from Firebase to a PostgreSQL-backed architecture using Prisma ORM.

**Tech Stack:**
- Frontend: React 18 with React Router v6, TailwindCSS
- Backend: Express.js (Node.js)
- Database: PostgreSQL via Prisma ORM
- Authentication: Session-based (transitioning from Firebase Auth)
- Legacy: Some components still reference Firebase (being phased out)

## Development Commands

### Client (React App)
```bash
cd client
npm start              # Start development server (port 3000)
npm run build          # Build for production
npm test               # Run tests
```

### Server (Express API)
```bash
cd server
npm run dev            # Start with nodemon (hot reload)
npm start              # Start production server (port 4000)
```

### Database (Prisma)
```bash
cd server
npx prisma migrate dev              # Create and apply migration
npx prisma generate                 # Generate Prisma Client
npx prisma studio                   # Open Prisma Studio GUI
npx prisma db push                  # Push schema changes without migration
npx prisma migrate reset            # Reset database and re-run all migrations
```

## Architecture

### Monorepo Structure
- `client/` - React frontend application (separate package.json with dependencies)
- `server/` - Express backend API (separate package.json with dependencies)
- Root `package.json` exists but is minimal; **always install dependencies in client/ or server/ directories**
- Each subdirectory runs independently; no workspace setup

### Backend Architecture

**Entry Point:** `server/index.js`
- Sets up Express with CORS, Helmet for security headers
- Mounts route modules under `/api/*`
- Health check endpoint: `GET /api/health` (tests DB connection with raw query)
- Initializes auto-scheduler cron job on startup via `schedulerCron.js`
- Graceful shutdown on SIGINT (disconnects Prisma)

**Database Layer:**
- Prisma schema: `server/prisma/schema.prisma`
- Connection: PostgreSQL (URL from `DATABASE_URL` env var)
- Prisma Client: Import via `server/prismaClient.js` singleton: `const prisma = require('../prismaClient');`
- **Important:** Always use the shared prismaClient.js to avoid multiple instance issues
- Model naming: Uses snake_case table names (e.g., `employees`, `roles`) with camelCase in JS via `@map()` attributes

**API Routes:** All mounted under `/api/`:
- `/api/auth` - Authentication (login, password reset, session verification)
- `/api/employees` - Employee CRUD
- `/api/roles` - Role management
- `/api/trucks` - Truck information
- `/api/zones` - Delivery zones
- `/api/truck-zones` - Truck-zone assignments (junction table operations)
- `/api/buildings` - Building details with access constraints
- `/api/products` - Product catalog
- `/api/teams` - Team assignments
- `/api/customers` - Customer data
- `/api/orders` - Order management and tracking (with advanced filtering and edit deadline validation)
- `/api/time-slots` - Delivery time slots
- `/api/lorry-trips` - Lorry/truck trip scheduling
- `/api/assignments` - Employee-team assignments
- `/api/order-products` - Order-product junction table operations
- `/api/reports` - Reporting
- `/api/scheduler` - Auto-scheduler configuration and triggers
- `/api/settings` - System-wide settings (order edit deadline, etc.)

**Authentication:**
- Uses bcrypt for password hashing
- Session-based authentication via `sessionStorage` on client
- `server/middleware/auth.js` provides JWT middleware (partially implemented)
- Login endpoint: `POST /api/auth/login` validates credentials and returns employee data
- Session verification: `POST /api/auth/verify-session`
- Password reset flow: `/api/auth/reset-request` → `/api/auth/reset-confirm`

### Frontend Architecture

**Entry Point:** `client/src/index.js` → `App.js`

**Route Structure:**
- `/login` - Public login page
- `/*` - Protected routes wrapped in `<Layout />` component

**Authentication Context:** `client/src/contexts/AuthContext.js`
- **Main entry point for authentication** - handles all auth logic
- Exported functions: `login(email, password)`, `logout()`, `hasPermission()`, `hasRole()`, `isAuthenticated()`
- `login()` function: Calls `/api/auth/login`, validates credentials, fetches permissions, sets up session
- Internal `signIn()` function: Sets up session after successful backend authentication (not exported)
- Internal `fetchPermissionsForRole()`: Fetches permissions from `/api/roles` based on employee's role
- Stores session in `sessionStorage` (keys: `employeeData`, `isAuthenticated`, `employeePermissions`, `employeeRole`)
- Session restore on mount: Checks sessionStorage and refetches permissions if needed
- State: `currentUser`, `employeeData`, `permissions`, `loading`, `loadingPermissions`

**Layout Component:** `client/src/components/Layout.js`
- Renders sidebar navigation based on user permissions
- Navigation sections: dashboard, schedule, info, cases, access, delivery, installation, warehouse, customer
- Permission-based filtering: Only shows nav items that match user's role permissions
- **Admin role** gets full access to all sections

**Navigation Keys** (must match between Layout.js and Role.permissions in DB):
- `dashboard` - Overview, Employee Performance, Orders
- `schedule` - Schedule, Auto Scheduler
- `info` - Employee, Team, Building, Product, Truck, TruckZone
- `cases` - Cases management
- `access` - Role and permission management
- `delivery` - Delivery schedule view
- `installation` - Installation schedule view
- `warehouse` - Warehouse loading schedule
- `customer` - Customer Management (Place Order, Manage Orders)

**Component Organization:**
- `client/src/components/admin/` - Admin pages (dashboard, info, schedule, cases, access)
- `client/src/components/delivery/` - Delivery team views
- `client/src/components/installer/` - Installation team views
- `client/src/components/warehouse/` - Warehouse team views
- `client/src/components/order/` - Order management (PlaceOrder, ManageOrders)
- `client/src/components/auth/` - Login and authentication UI
- `client/src/utils/` - Utility functions (orderHelpers.js)

**Access Control:** `client/src/components/admin/access/accessControl.js`
- Uses PostgreSQL via `/api/roles` endpoints for all role management
- Manages role permissions stored in PostgreSQL `roles` table
- Provides UI for creating, editing, and deleting roles
- Updates role permissions which take effect after user re-login

### Order Management System

**Overview:**
The order management system allows salespersons to create, view, search, filter, and edit customer orders. It includes edit deadline enforcement to prevent last-minute changes that could disrupt logistics.

#### Frontend Components

**1. PlaceOrder.js** (`client/src/components/order/PlaceOrder.js`)
- **Purpose**: Create new orders for customers
- **Access**: Requires `customer` permission
- **Key Features**:
  - Customer selection/creation with inline editing
  - Product search and cart management
  - Per-product service type selection (Delivery, Delivery+Installation, Stock Transfer)
  - Custom installation times per order item (overrides product defaults)
  - Order-level special equipment field
  - Building auto-detection from customer address
  - Form validation and error handling
- **Navigation**: Customer Management → Place Order

**2. ManageOrders.js** (`client/src/components/order/ManageOrders.js`)
- **Purpose**: View, search, filter, and edit existing orders
- **Access**: Requires `customer` permission
- **Key Features**:
  - Statistics dashboard (Pending, Scheduled, Delivered, Today)
  - Advanced filtering: search, status, date range, sort
  - Expandable order rows with full details
  - Edit modal with full CRUD capabilities
  - Edit deadline validation and countdown timer
  - Real-time editability checks
- **Navigation**: Customer Management → Manage Orders
- **Sub-components**:
  - `StatCard` - Statistics display
  - `OrderRow` - Table row with expand/collapse
  - `ExpandedOrderDetails` - Detailed order view
  - `EditOrderModal` - Full edit interface

**3. orderHelpers.js** (`client/src/utils/orderHelpers.js`)
- **Purpose**: Utility functions for order management
- **Exported Functions**:
  - `isOrderEditable(order, deadlineHours)` - Validates if order can be edited
  - `calculateEditDeadline(scheduledDateTime, deadlineHours)` - Computes deadline timestamp
  - `getRemainingEditTime(scheduledDateTime, deadlineHours)` - Countdown timer calculation
  - `getOrderStatusBadge(status)` - Status badge styling
  - `formatDateTime(dateTime)`, `formatDate(dateTime)` - Date formatters
  - `getTotalProductCount(orderProducts)` - Sum product quantities
  - `getServiceTypeLabel(serviceType)` - Human-readable service type labels
  - `filterOrdersByDateRange(orders, range, start, end)` - Date filtering
  - `searchOrders(orders, keyword)` - Search implementation

#### Backend API Endpoints

**GET /api/orders** - Enhanced with query parameters
- **Query Parameters**:
  - `status` - Filter by order status (Pending, Scheduled, Delivered, Cancelled, all)
  - `search` - Search by order ID, customer name, phone, building name
  - `date_from`, `date_to` - Date range filter (ISO format)
  - `sort` - Sort order (created_desc, created_asc, scheduled_desc, scheduled_asc, customer)
- **Response**: Array of orders with relations (customers, buildings, order_products, products)
- **Implementation**: Uses Prisma `where` clauses for filtering, `orderBy` for sorting

**PUT /api/orders/:id** - Enhanced with edit deadline validation
- **Purpose**: Update existing order
- **Request Body**:
  ```json
  {
    "customer": { "id": "uuid", "full_name": "...", "email": "...", ... },
    "products": [
      {
        "product_id": "uuid",
        "quantity": 2,
        "service_type": "delivery_installation",
        "dismantle_required": true,
        "custom_installation_time_min": 45,
        "custom_installation_time_max": 90
      }
    ],
    "special_equipment_needed": "Crane needed"
  }
  ```
- **Validation**:
  1. Order must exist
  2. Order status must not be "Delivered"
  3. If scheduled, must be before edit deadline (scheduled_time - deadline_hours)
- **Error Responses**:
  - 404: Order not found
  - 400: Cannot edit delivered orders
  - 400: Edit deadline has passed
- **Process**: Deletes all order_products, creates new ones, updates special_equipment_needed

**GET /api/settings/:key** - System settings management
- **Purpose**: Fetch system configuration (e.g., order_edit_deadline_hours)
- **Response**: `{ success: true, data: { key, value, description } }`

**PUT /api/settings/:key** - Update system settings (admin only)
- **Purpose**: Update system-wide configuration
- **Request Body**: `{ value: "24" }`

**PUT /api/customers/:id** - Update customer information
- **Purpose**: Update customer details (affects all orders for that customer)
- **Request Body**: Customer fields (full_name, email, phone, address, etc.)

#### Database Schema Updates

**orders table** - Enhanced fields:
- `special_equipment_needed` (TEXT) - Order-level special equipment notes

**order_products table** - Enhanced fields:
- `service_type` (VARCHAR(50)) - Per-product service type (delivery, delivery_installation, stock_transfer)
- `custom_installation_time_min` (INTEGER) - Custom installation time minimum (minutes)
- `custom_installation_time_max` (INTEGER) - Custom installation time maximum (minutes)

**system_settings table** - New table:
```sql
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('order_edit_deadline_hours', '24', 'Hours before scheduled delivery that orders can no longer be edited');
```

#### Order Edit Deadline System

**Business Rule**: Orders can only be edited until X hours before scheduled delivery time (default: 24 hours).

**Order States for Editability**:
1. **Pending** (not scheduled): ✓ Fully editable
2. **Scheduled** (before deadline): ✓ Editable with countdown
3. **Scheduled** (past deadline): ✗ Not editable
4. **Delivered**: ✗ Never editable

**Implementation**:
- Deadline stored in `system_settings` table (configurable by admin)
- Frontend checks editability before showing edit button
- Backend validates deadline on every PUT request (double-check)
- Countdown timer shown in edit modal header
- Visual indicators: Green (editable), Red (past deadline), Gray (delivered)

**Validation Flow**:
1. User clicks edit button
2. Frontend: `isOrderEditable()` checks status and deadline
3. If editable, modal opens with countdown timer
4. User makes changes and saves
5. Backend: Re-validates deadline before applying changes
6. If deadline passed during editing, returns 400 error

#### Service Types

**Three service types available per product**:
1. **delivery** - Delivery Only: Standard delivery service
2. **delivery_installation** - Delivery + Installation: Includes installation service
3. **stock_transfer** - Stock Transfer to Outlet: Customer picks up from outlet

**Installation Time Handling**:
- If service_type = "delivery_installation", installation time required
- Can use product's default installation time (estimated_installation_time_min/max)
- Can set custom installation time per order item (custom_installation_time_min/max)
- Stored at order_products level (not product level)
- If product has no default, salesperson must provide custom time

#### Data Flow: Creating an Order

1. Salesperson navigates to Customer Management → Place Order
2. Selects existing customer OR creates new customer
3. If customer has address, system auto-detects building and pre-fills special equipment
4. Searches and adds products to cart
5. For each product:
   - Sets quantity
   - Chooses service type
   - Toggles dismantle requirement (if applicable)
   - Sets custom installation time (if delivery+installation and needed)
6. Enters order-level special equipment notes
7. Clicks "Submit Order"
8. Frontend validates: customer info complete, at least 1 product, installation times set
9. Backend creates/fetches customer → finds/creates building → creates order (status: Pending) → creates order_products
10. Returns order ID, frontend shows success message

#### Data Flow: Editing an Order

1. Salesperson navigates to Customer Management → Manage Orders
2. Uses filters/search to find order
3. Clicks edit button on order row
4. Frontend checks: `isOrderEditable(order, deadlineHours)`
   - If not editable, shows alert with reason
   - If editable, opens modal
5. Modal loads customer data, products, and initializes cart
6. Salesperson can:
   - Edit customer info (name, email, phone, address)
   - Add new products to order
   - Remove products from order
   - Change quantities, service types, dismantle flags
   - Update installation times
   - Edit special equipment
7. Clicks "Save Changes"
8. Frontend validates: required fields, at least 1 product
9. Backend validates: order exists, not delivered, before deadline
10. Updates customer record → deletes old order_products → creates new order_products → updates order
11. Returns updated order, frontend refreshes list

#### Important Notes

**Edit Deadline Enforcement**:
- Always validated on backend (frontend check is for UX only)
- Prevents race conditions by re-checking on save
- Admin can configure deadline system-wide (applies to all orders)
- Countdown timer updates every minute in edit modal

**Customer Information Updates**:
- Editing customer in order edit modal updates the customer record globally
- This affects ALL orders for that customer (not just current order)
- Be careful when editing customer email (must remain unique)

**Special Equipment**:
- Stored at ORDER level (not per product)
- Applies to entire delivery/installation job
- Pre-filled from building's default equipment if available
- Can be edited by salesperson for each order

**Service Types and Installation Times**:
- Service type stored per product (order_products.service_type)
- Installation time stored per product (order_products.custom_installation_time_min/max)
- Each product in order can have different service type
- Custom installation times override product defaults but don't change product records

**Order Status Flow**:
```
Pending → Scheduled → Delivered
           ↓
       Cancelled (any time before delivery)
```

**Known Limitations**:
- Cannot change building association after order creation
- Cannot edit order ID (immutable)
- Cannot change order status from salesperson interface (admin only)
- Cannot edit delivered orders (completed)
- Cannot edit scheduled orders past deadline (logistics already prepared)

### Database Schema (Key Models)

**roles** (`roles` table)
- `id`: UUID primary key
- `name`: Role name (e.g., "admin", "delivery")
- `permissions`: String array - navigation keys (e.g., `['dashboard', 'warehouse']`)
- Timestamps: `createdAt`, `updatedAt`

**employees** (`employees` table)
- `id`: UUID primary key
- `roleId`: Foreign key to `roles`
- `activeFlag`: Boolean for account status
- `password`: bcrypt hashed password
- Fields: `name`, `displayName`, `email` (unique), `contactNumber`, `bio`
- Relation: `role` (belongs to Role), `teamAssignments` (many EmployeeTeamAssignment), `orders`
- Timestamps: `createdAt`, `updatedAt`

**orders** (`orders` table)
- `id`: UUID primary key
- Foreign keys: `customer_id`, `building_id`, `employee_id`, `time_slot_id`
- Status: `order_status`, `number_of_attempts`
- `special_equipment_needed`: TEXT - Order-level special equipment notes
- Timestamps: `scheduled_start_date_time`, `scheduled_end_date_time`, `actual_start_date_time`, `actual_end_date_time`, `actual_arrival_date_time`
- Feedback: `customer_rating`, `customer_feedback`, `proof_of_delivery_url`
- Relations: `order_products`, `buildings`, `customers`, `employees`

**buildings** (`buildings` table)
- `id`: UUID primary key
- `zoneId`: Foreign key to `zones`
- Access constraints: `vehicleSizeLimit`, `vehicleLengthLimit`, `vehicleWidthLimit`, `accessTimeWindowStart`, `accessTimeWindowEnd`
- Facilities: `loadingBayAvailable`, `liftAvailable`, `liftDimensions`, `preRegistrationRequired`
- Additional: `parkingDistance`, `narrowDoorways`, `specialEquipmentNeeded`, `notes`
- Fields: `buildingName`, `housingType`, `postalCode`

**teams** (`teams` table)
- `id`: UUID primary key
- `teamType`: String (e.g., "delivery", "installation", "warehouse")
- Relation: `assignments` (many EmployeeTeamAssignment)

**employee_team_assignments** (junction table)
- `id`: Auto-increment integer primary key
- `employeeId`, `teamId`: Foreign keys
- `assignedAt`: Timestamp
- Unique constraint: `[employeeId, teamId]`

**trucks** (`trucks` table)
- `id`: UUID primary key
- Dimensions in CM: `length_cm`, `width_cm`, `height_cm`
- Fields: `plate_no`, `tone`
- Relations: `lorry_trips`, `truck_zones`

**truck_zones** (junction table)
- `id`: UUID primary key
- `truck_id`, `zone_id`: Foreign keys
- `is_primary_zone`: Boolean flag

**lorry_trips** (`lorry_trips` table)
- `id`: UUID primary key
- `truck_id`, `delivery_team_id`, `warehouse_team_id`: Foreign keys (strings)
- Timestamps: `created_at`, `updated_at`

**time_slots** (`time_slots` table)
- `id`: UUID primary key
- `date`, `time_window_start`, `time_window_end`: Strings
- `available_flag`: Boolean
- `created_at`: Timestamp

**order_products** (junction table)
- `id`: Auto-increment integer primary key
- `order_id`, `product_id`: Foreign keys (cascade delete)
- `quantity`: Integer
- `service_type`: VARCHAR(50) - delivery, delivery_installation, or stock_transfer
- `dismantle_required`: Boolean
- `custom_installation_time_min`, `custom_installation_time_max`: Integer (minutes) - overrides product defaults
- `dismantle_time_min`, `dismantle_time_max`: Integer (minutes)

**products** (`products` table)
- `id`: UUID primary key
- `product_name`: String
- Package dimensions in CM: `package_length_cm`, `package_height_cm`, `package_width_cm`
- Flags: `fragile_flag`, `installer_team_required_flag`
- Time estimates: `estimated_installation_time_min`, `estimated_installation_time_max`, `dismantle_time_min`, `dismantle_time_max`

**customers** (`customers` table)
- `id`: UUID primary key
- Fields: `full_name`, `email`, `phone`, `address`, `city`, `postcode`, `state`
- `created_at`: Timestamp

**zones** (`zones` table)
- `id`: UUID primary key
- `zoneName`: String
- Relations: `buildings`, `truck_zones`

**reports** (`reports` table)
- `id`: UUID primary key
- `content`: String
- `status`: String
- `created_at`: Timestamp

**chats** (`chats` table)
- `id`: UUID primary key
- `order_number`: String
- `members`, `names`: JSON fields
- Timestamps: `created_at`, `last_message_at`

**access_logs** (`access_logs` table)
- `id`: UUID primary key
- `changed_at`: Timestamp
- `changes`: JSON field for audit trail

**installation_schedules** (`installation_schedules` table)
- `id`: UUID primary key (generated via `gen_random_uuid()`)
- `order_id`: Unique foreign key to `orders` (one-to-one)
- `installation_team_id`: Foreign key to `teams`
- `estimated_arrival_time`: Timestamp
- `status`: String (default: "Scheduled")
- Timestamps: `created_at`, `updated_at`

**scheduler_config** (`scheduler_config` table)
- `id`: UUID primary key (generated via `gen_random_uuid()`)
- `warehouse_address`, `warehouse_postal`: Warehouse location details
- `cron_expression`: Cron schedule (default: "0 0 * * *" - daily at midnight)
- `enabled`: Boolean flag (default: true)
- `last_run_at`: Timestamp of last scheduler execution
- Timestamps: `created_at`, `updated_at`

**system_settings** (`system_settings` table)
- `id`: UUID primary key (generated via `gen_random_uuid()`)
- `setting_key`: VARCHAR(100) UNIQUE - Configuration key (e.g., "order_edit_deadline_hours")
- `setting_value`: TEXT - Configuration value
- `description`: TEXT - Human-readable description
- Timestamps: `created_at`, `updated_at`
- **Default Entry**: order_edit_deadline_hours = 24 (hours before scheduled delivery that orders cannot be edited)

## Data Flow

**Authentication Flow:**
1. User submits credentials via `/login` (Login.js)
2. POST to `/api/auth/login` validates against Prisma Employee table
3. Backend returns employee object with role and permissions
4. AuthContext stores in sessionStorage and sets currentEmployee state
5. ProtectedRoute checks authentication before rendering Layout
6. Layout filters navigation based on role permissions

**Permission Checking:**
1. Employee.role.permissions contains array of permission keys (e.g., `['dashboard', 'warehouse']`)
2. Layout.js filters navigationData entries where key matches a permission
3. Special case: `'admin'` permission or role name = 'admin' grants access to all sections
4. Each navigation section maps to a permission key that must match exactly

**API Call Pattern:**
1. Component calls `fetch()` to backend endpoint (e.g., `/api/employees`)
2. Backend route handler uses `prisma` client to query PostgreSQL
3. Response formatted as JSON with `{ success: true, data }` or `{ error: 'message' }`
4. Component updates state with response data and handles loading/error states

## Important Notes for Development

### Migration Status
- **Migration Complete:** Successfully migrated from Firebase to PostgreSQL/Prisma
- `AuthContext.js` now fetches permissions from PostgreSQL via `/api/roles` endpoint
- `accessControl.js` now uses PostgreSQL via `/api/roles` endpoints for all role management
- Authentication login/verification uses backend API with PostgreSQL
- All role and permission management now uses Prisma-backed `/api/roles` endpoints

### Permission System
- Permissions are stored as string arrays in `Role.permissions`
- Permission keys must match navigation section keys in `Layout.js`
- The string `"admin"` grants full access to all sections
- When creating/modifying roles, ensure permission keys align with available navigation sections

### Database Changes
- Always create Prisma migrations: `npx prisma migrate dev --name description`
- After schema changes, run `npx prisma generate` to update client
- Primary keys: Use UUID (`@default(uuid())`) for most tables; auto-increment integers for junction tables
- Naming: Use snake_case for table/column names, map to camelCase in Prisma with `@map()` attribute
- Foreign key actions: Use `onDelete: Cascade` for dependent data, `onUpdate: NoAction` to prevent accidental cascades

### API Development
- Import Prisma client: `const prisma = require('../prismaClient');` (uses singleton pattern)
- **Important:** Use lowercase model names in Prisma queries: `prisma.employees`, `prisma.roles`, etc. (matches schema table names)
- Route pattern: Export Express router with `module.exports = router;`
- Always include error handling and proper HTTP status codes
- For employee data, exclude password field from responses (use helper like `safeEmployee()`)
- Password handling: `await bcrypt.compare(password, hash)` for verification, `await bcrypt.hash(password, salt)` with `bcrypt.genSalt(10)` for hashing
- Use Prisma `include` to fetch related data (e.g., `include: { role: true }` to fetch employee's role)

### Frontend API Calls
- Base URL: `REACT_APP_API_BASE_URL` env variable (defaults to `http://localhost:4000`)
- Most components use direct `fetch()` calls
- Service layer: `client/src/services/` contains reusable API functions
  - `informationService.js`: Comprehensive service for all CRUD operations (employees, products, trucks, etc.)
  - `api.js`, `scheduler.js`, `profile.js`: Specialized services
- `informationService.js` provides generic helpers: `getAllDocs()`, `getDocById()`, `addDocGeneric()`, `updateDocGeneric()`, `deleteDocGeneric()`
- Collection endpoint mapping in `endpointMap` (e.g., "Employee" → "employees", "TruckZone" → "truck-zones")
- Always handle loading and error states
- API responses typically follow format: `{ success: true, data: {...} }` or `{ error: 'message' }`

### Route Organization
- Route files should export Express router: `const router = express.Router(); ... module.exports = router;`
- Keep route handlers focused; extract complex logic to service functions if needed
- Follow REST conventions for endpoint naming

### Common Development Workflows

**Adding a New API Endpoint:**
1. Add route handler in appropriate file under `server/routes/` (or create new route file)
2. Import and mount in `server/index.js` if new route file: `app.use('/api/resource', require('./routes/resource'));`
3. Use Prisma client for database operations: `const result = await prisma.modelName.findMany();`
4. Return consistent response format: `res.json({ success: true, data: result })` or `res.status(400).json({ error: 'message' })`
5. Test endpoint with client or API tool

**Adding a New Frontend Component:**
1. Create component in appropriate directory under `client/src/components/`
2. If it's a new navigation section, add to `navigationData` in `Layout.js`
3. Add corresponding permission key to role's `permissions` array in database
4. Use `informationService.js` functions for API calls or create new service function
5. Handle loading/error states with useState

**Modifying Prisma Schema:**
1. Edit `server/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name` (creates migration + applies it)
3. Run `npx prisma generate` (updates Prisma Client)
4. Update backend route handlers if model changes affect queries
5. Update frontend service functions if API response structure changes

**Debugging Permission Issues:**
1. Check role's `permissions` array in database (currently in Firebase Firestore `Roles` collection)
2. Verify permission key matches navigation section key in `Layout.js` `navigationData`
3. Check `AuthContext.js` state: `permissions`, `employeeData.role`
4. Ensure `loadingPermissions` completes before Layout renders
5. Admin role or 'admin' permission string grants access to all sections

### Testing After Changes
1. Start server: `cd server && npm run dev`
2. Start client: `cd client && npm start`
3. Verify database connection and migrations are applied
4. Test authentication flow: login → session persistence → permission-based navigation
5. Check console for errors in both server and browser

### Known Issues
- JWT middleware defined (`server/middleware/auth.js`) but not actively used (app uses session-based auth for general authentication)
- **Important:** Users must log out and log back in after permission changes for changes to take effect

## Password Reset System

### Overview
The system implements a secure password reset flow using JWT tokens and email delivery (no database table required).

### Implementation Details
- **JWT-based tokens**: Password reset tokens are signed JWTs with 1-hour expiration
- **Email service**: Uses Nodemailer with SMTP for email delivery
- **Security features**: Email enumeration protection, active account verification, bcrypt password hashing

### Email Configuration (Required for Password Reset)

For Gmail (recommended for development):

1. **Enable 2FA** on your Google Account
2. **Generate App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" → "Other (Custom name)"
   - Name it "TBM Delivery System"
   - Copy the 16-character password
3. **Configure** `server/.env`:

```bash
# Email Configuration (for password reset)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="abcd efgh ijkl mnop"  # App password from step 2
EMAIL_FROM="TBM Delivery <your-email@gmail.com>"
```

**Alternative providers:**
- **Outlook**: `smtp-mail.outlook.com:587`
- **Custom SMTP**: Configure your own SMTP server

### Password Reset Flow

1. **Request Reset** (`/forgot-password`):
   - Employee enters email
   - POST to `/api/auth/reset-request`
   - Backend generates JWT token (1-hour expiration)
   - Email sent with reset link: `http://localhost:3000/reset-password?token=...`

2. **Reset Password** (`/reset-password?token=...`):
   - Employee clicks email link
   - Enters new password (min 6 characters)
   - POST to `/api/auth/reset-confirm`
   - Backend verifies JWT token, updates password
   - Redirect to login

### Development Mode (No Email Configured)

If `EMAIL_USER` or `EMAIL_PASSWORD` is not set:
- System shows warning in console
- Reset link is logged to console for testing
- User still sees success message (for security)

Example console output:
```
⚠️  Email service not configured
🔗 Password reset link for admin@example.com:
   http://localhost:3000/reset-password?token=eyJhbGc...
```

### API Endpoints

**POST /api/auth/reset-request**
- Body: `{ email: string }`
- Always returns success (prevents email enumeration)
- Sends email if account exists and is active

**POST /api/auth/reset-confirm**
- Body: `{ token: string, newPassword: string }`
- Verifies JWT token (checks expiration, signature, type)
- Updates password with bcrypt hashing
- Returns error if token expired/invalid

### Security Features

✅ JWT-based (stateless, no database table)
✅ 1-hour expiration on reset links
✅ Email enumeration protection
✅ Active account verification
✅ Bcrypt password hashing
✅ Token type verification

### Frontend Components

- **ForgotPassword** (`/forgot-password`): Request password reset
- **ResetPassword** (`/reset-password`): Complete password reset
- **Login** (`/login`): Includes "Forgot your password?" link

## Environment Variables

### Server (.env in server/)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Server
PORT=4000
CLIENT_URL="http://localhost:3000"

# JWT Secret (used for password reset tokens)
JWT_SECRET="your-secret-key-change-in-production"

# Email Configuration (for password reset)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-gmail-app-password"  # 16-char app password
EMAIL_FROM="TBM Delivery <your-email@gmail.com>"

# Optional: Google Maps API
GOOGLE_MAPS_API_KEY="your-api-key"
```

### Client (.env in client/)
```bash
REACT_APP_API_BASE_URL="http://localhost:4000"
```

## Auto-Scheduler System

### Overview
The Auto-Scheduler is an intelligent delivery scheduling system that automatically assigns pending orders to optimal time slots based on location clustering, route optimization, and various constraints (building access windows, truck capacity, team availability, customer preferences).

### Architecture

**Two Scheduler Implementations:**

1. **Server-Side Scheduler** (`server/services/scheduler.js`)
   - Production-ready, Prisma-based scheduler
   - Runs via API endpoint `/api/scheduler/run` (POST)
   - Supports cron-based automated scheduling
   - Returns full order objects with all Prisma relations for UI display
   - Uses OSRM (Open Source Routing Machine) for real-world routing

2. **Client-Side Scheduler** (`client/src/services/scheduler.js`)
   - Legacy/experimental OSRM-based scheduler
   - Direct browser-based scheduling
   - Useful for testing and development

**Recommended:** Use server-side scheduler for production.

### Server-Side Scheduler Architecture

**Entry Point:** `POST /api/scheduler/run`

**Scheduling Algorithm Steps:**

1. **Fetch Pending Orders**: Queries `orders` table for orders with `order_status = 'Pending'`
2. **Location Grouping**: Groups orders by postal code (first 2 digits) for geographic clustering
3. **Calculate Work Times**: Computes delivery/installation time per order from `order_products` and `products` tables
4. **Fetch Available Timeslots**: Only fetches future timeslots (tomorrow or later) with `available_flag = true`
5. **Route Optimization**: For each location group, calculates optimal delivery sequence using OSRM distance matrix
6. **Timeslot Assignment**:
   - Validates building access windows
   - Validates customer preferred delivery times (soft constraint on 1st attempt, hard on 2nd+ attempts)
   - Ensures truck return trip to warehouse fits within timeslot
   - Assigns truck loading sequence (LIFO - Last In, First Out)
7. **Installation Scheduling**: Creates `installation_schedules` records for orders requiring installation
8. **Database Update**: Updates orders with `scheduled_start_date_time`, `scheduled_end_date_time`, `time_slot_id`, `order_status = 'Scheduled'`

### Key Components

#### 1. Scheduler Configuration (`scheduler_config` table)

Stores system-wide scheduler settings:

```javascript
{
  warehouse_address: "University of Malaya, Kuala Lumpur",
  warehouse_postal: "50603",
  cron_expression: "0 0 * * *",  // Daily at midnight
  enabled: true,
  last_run_at: timestamp
}
```

**API Endpoints:**
- `GET /api/scheduler/config` - Fetch current configuration
- `PUT /api/scheduler/config` - Update configuration (admin only)

#### 2. AutoScheduleReview Component (`client/src/components/admin/schedule/AutoScheduleReview.js`)

**Purpose**: Admin interface for running scheduler and reviewing results

**Features:**
- **Manual Trigger**: "Run Scheduler Now" button
- **Configuration Panel**: Edit warehouse address, postal code, cron schedule
- **Results Display**:
  - Statistics: Scheduled count, Unscheduled count
  - Scheduled Orders Table: Expandable rows with full order details
  - Unscheduled Orders List: Shows reason for each unscheduled order
- **Expandable Details**: Customer info, building info, products, timeslot assignment, logistics metrics

**Navigation:** Schedule → Auto Scheduler

#### 3. Scheduler Service (`server/services/scheduler.js`)

**Main Function:** `scheduleOrders()`

**Returns:**
```javascript
{
  success: true,
  results: {
    scheduled: 15,  // Count of scheduled orders
    unscheduled: 3  // Count of unscheduled orders
  },
  details: {
    scheduledOrders: [  // Full order objects with relations
      {
        id, customer_id, building_id, time_slot_id,
        scheduled_start_date_time, scheduled_end_date_time,
        truck_loading_sequence, order_status: 'Scheduled',
        customers: { full_name, email, phone, address, postcode },
        buildings: { building_name, postal_code, zone: {...} },
        order_products: [{ quantity, service_type, products: {...} }],
        time_slots: { date, time_window_start, time_window_end }
      }
    ],
    unscheduledOrders: [  // Orders that couldn't be scheduled
      {
        ...order,
        unscheduled_reason: "No suitable timeslot found (access window conflict or insufficient time)"
      }
    ]
  }
}
```

### Scheduling Constraints

**Hard Constraints (Must be satisfied):**
1. **Future Timeslots Only**: Orders created today are scheduled for tomorrow or later
2. **Timeslot Availability**: Only use timeslots with `available_flag = true`
3. **Building Access Windows**: Delivery must occur within building's `access_time_window_start` to `access_time_window_end`
4. **Customer Preferred Time (2nd+ attempts)**: If `number_of_attempts > 1`, delivery MUST satisfy customer's `preferred_delivery_time_start/end`
5. **Return Trip Validation**: Truck must return to warehouse before timeslot ends
6. **Work Time Fit**: Order's work time + travel time must fit within available window

**Soft Constraints (Preferred but not required):**
1. **Customer Preferred Time (1st attempt)**: Try to satisfy customer preference, but not mandatory on first delivery attempt
2. **Zone-based Truck Assignment**: Prefer trucks with `is_primary_zone = true` for the delivery zone
3. **Route Optimization**: Minimize total travel time using OSRM distance matrix

### Time Slot Management

**Timeslot Generation:**
- Auto-generates timeslots for next 14 days (2 weeks)
- Skips weekends (Saturday, Sunday)
- Default time windows:
  - Morning: 08:00 - 12:00
  - Afternoon: 13:00 - 19:00
  - Evening: 19:00 - 21:00

**Direct Team/Truck Assignment:**
- `time_slots` table has direct FK columns: `truck_id`, `delivery_team_id`, `warehouse_team_id`
- Admin can assign teams/trucks via Schedule component (no lorry_trips table needed)
- Scheduler can auto-assign trucks based on zone and capacity

### OSRM Integration (Open Source Routing Machine)

**Purpose**: Calculate real-world travel times and distances

**Configuration:**
```javascript
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";  // Geocoding
```

**Features:**
- Geocodes building addresses to lat/lng coordinates (Nominatim)
- Calculates driving routes with traffic consideration
- Fallback to Haversine formula if OSRM unavailable
- Rate limiting (100ms delay between requests to public server)

**Usage in Scheduler:**
1. Build distance matrix between all order locations
2. Calculate travel time from warehouse to first delivery
3. Calculate travel time between consecutive deliveries
4. Calculate return trip time to warehouse

### Truck Loading Sequence

**Algorithm:** Last-In-First-Out (LIFO)

Orders are assigned a `truck_loading_sequence` number:
- Highest sequence number = First delivery (loaded last, unloaded first)
- Sequence decreases for each subsequent delivery
- Ensures proper truck loading order at warehouse

**Example:**
```
Route: Warehouse → Building A → Building B → Building C → Warehouse
Truck Loading Sequence:
- Order for Building C: sequence = 3 (loaded first, delivered last)
- Order for Building B: sequence = 2 (loaded second, delivered second)
- Order for Building A: sequence = 1 (loaded last, delivered first)
```

### Unscheduled Orders

**Common Reasons:**
1. **"No available timeslots"** - All timeslots are full or no future timeslots exist
2. **"No suitable timeslot found (access window conflict or insufficient time)"** - Building access window too restrictive or order work time exceeds all available windows
3. **"Customer preferred time not satisfied"** - On 2nd+ delivery attempt, no timeslot matches customer preference

**Handling:**
- Orders remain in `Pending` status
- Admin can manually schedule via Schedule component
- Will be retried on next scheduler run

### Automated Scheduling (Cron)

**Setup:** `server/schedulerCron.js`

**Default Schedule:** Daily at midnight (`0 0 * * *`)

**How it works:**
1. Server starts cron job on startup if `scheduler_config.enabled = true`
2. Cron expression configurable via AutoScheduleReview UI
3. Each run updates `scheduler_config.last_run_at`
4. Logs all scheduling results to console

**Enable/Disable:**
- Via AutoScheduleReview UI (toggle "Enabled" checkbox)
- Via API: `PUT /api/scheduler/config` with `{ enabled: false }`

### Installation Scheduling

**Automatic Creation:**
- If order has products with `installer_team_required_flag = true`
- Creates record in `installation_schedules` table
- Sets `estimated_arrival_time` = delivery end time + 30 min buffer
- Round-robin team assignment across available installation teams

**Schema:**
```javascript
installation_schedules {
  id, order_id (unique),
  installation_team_id,
  estimated_arrival_time,
  status: "Scheduled"
}
```

### API Endpoints

**POST /api/scheduler/run** - Run scheduler immediately
- Request: Empty body
- Response: `{ success, results: { scheduled, unscheduled }, details: { scheduledOrders, unscheduledOrders } }`

**GET /api/scheduler/config** - Get scheduler configuration
- Response: `{ success: true, data: { warehouse_address, warehouse_postal, cron_expression, enabled, last_run_at } }`

**PUT /api/scheduler/config** - Update scheduler configuration
- Request: `{ warehouse_address?, warehouse_postal?, cron_expression?, enabled? }`
- Response: `{ success: true, message: "Configuration updated" }`

**POST /api/scheduler/generate-timeslots** - Generate timeslots for next 2 weeks
- Request: Empty body
- Response: `{ success: true, message: "Timeslots generated", created: 42 }`

### Important Implementation Details

**Date Filtering (Critical):**
```javascript
// Server-side: Only fetch future timeslots
const tomorrow = dayjs().startOf('day').add(1, 'day').format('YYYY-MM-DD');
const timeslots = await prisma.time_slots.findMany({
  where: {
    available_flag: true,
    date: { gte: tomorrow }  // Tomorrow or later
  }
});

// Client-side: Same filtering logic
const availableSlots = allSlots.filter(s => {
  const slotDate = dayjs(s.Date);
  return s.AvailableFlag && slotDate.isSameOrAfter(tomorrow, 'day');
});
```

**Full Object Returns (Critical):**
```javascript
// Server scheduler MUST return full objects with Prisma relations
const fullOrder = await prisma.orders.findUnique({
  where: { id: order.id },
  include: {
    customers: true,
    buildings: { include: { zone: true } },
    order_products: { include: { products: true } },
    time_slots: true
  }
});
```

**Work Time Calculation Priority:**
```javascript
// Priority 1: Custom installation time from order_products
if (orderProduct.custom_installation_time_min) {
  totalMinutes += orderProduct.custom_installation_time_min;
}
// Priority 2: Dismantle time if required
else if (orderProduct.dismantle_required) {
  totalMinutes += (orderProduct.dismantle_time_min || product.dismantle_time_min || 0);
}
// Priority 3: Product default installation time
else {
  totalMinutes += (product.estimated_installation_time_min || 0);
}
```

### Performance Considerations

**OSRM Rate Limiting:**
- 100ms delay between requests to public OSRM server
- Fallback to Haversine if OSRM unavailable
- Consider self-hosting OSRM for production

**Database Queries:**
- Uses Prisma `include` to fetch all relations in single query
- Minimizes N+1 query problems
- Consider caching building/product data for large order volumes

**Scheduling Time:**
- Typical: 50-100 orders scheduled in 10-30 seconds
- Depends on: Number of orders, OSRM response time, database connection speed

### Testing the Scheduler

**Manual Test:**
1. Create pending orders via Customer Management → Place Order
2. Navigate to Schedule → Auto Scheduler
3. Click "Run Scheduler Now"
4. Review results in Scheduled/Unscheduled sections
5. Check Schedule page to verify timeslot assignments

**Automated Test:**
1. Configure cron schedule in AutoScheduleReview
2. Set `enabled = true`
3. Monitor server console for cron execution logs
4. Check `scheduler_config.last_run_at` timestamp

### Troubleshooting

**Orders not being scheduled:**
- Check if timeslots exist for future dates (`GET /api/time-slots`)
- Verify building has correct `access_time_window_start/end`
- Check if order work time exceeds all available windows
- Review unscheduled_reason in API response

**Past timeslots being used:**
- Verify `fetchAvailableTimeslots()` filters with `date: { gte: tomorrow }`
- Check server timezone configuration
- Ensure dayjs is parsing dates correctly

**NULL data in AutoScheduleReview:**
- Verify server scheduler returns full order objects with `include`
- Check Prisma relations are defined correctly in schema
- Ensure frontend maps field names correctly (snake_case vs camelCase)

### Files Reference

**Backend:**
- `server/services/scheduler.js` - Main scheduler logic
- `server/routes/scheduler.js` - API endpoints
- `server/schedulerCron.js` - Cron job setup
- `server/index.js` - Initializes cron on startup

**Frontend:**
- `client/src/components/admin/schedule/AutoScheduleReview.js` - UI for running scheduler
- `client/src/components/admin/schedule/Schedule.js` - Timeslot management UI
- `client/src/services/scheduler.js` - Client-side scheduler (legacy)

**Database:**
- `server/prisma/schema.prisma` - Schema definitions for orders, time_slots, scheduler_config, installation_schedules
