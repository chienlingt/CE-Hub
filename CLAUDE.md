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
- `/api/orders` - Order management and tracking
- `/api/time-slots` - Delivery time slots
- `/api/lorry-trips` - Lorry/truck trip scheduling
- `/api/assignments` - Employee-team assignments
- `/api/order-products` - Order-product junction table operations
- `/api/reports` - Reporting
- `/api/scheduler` - Auto-scheduler configuration and triggers

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
- `customer` - Customer order placement (PlaceOrder page)

**Component Organization:**
- `client/src/components/admin/` - Admin pages (dashboard, info, schedule, cases, access)
- `client/src/components/delivery/` - Delivery team views
- `client/src/components/installer/` - Installation team views
- `client/src/components/warehouse/` - Warehouse team views
- `client/src/components/customer/` - Customer views (PlaceOrder page)
- `client/src/components/auth/` - Login and authentication UI

**Access Control:** `client/src/components/admin/access/accessControl.js`
- Uses PostgreSQL via `/api/roles` endpoints for all role management
- Manages role permissions stored in PostgreSQL `roles` table
- Provides UI for creating, editing, and deleting roles
- Updates role permissions which take effect after user re-login

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
- `dismantle_required`: Boolean
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
