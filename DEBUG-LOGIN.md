# Login Debug Checklist

## What to Check When You Log In

### 1. Server Console (Backend)
You should see these logs when you log in:

```
🔐 Login attempt for email: testerAdmin@gmail.com
Attempting to find employee in database...
Employee found: YES
Employee data: {
  id: '...',
  email: 'testerAdmin@gmail.com',
  roleId: 'SOME-UUID-HERE',          // ← Should be a UUID
  roleObject: { id: '...', name: 'admin', permissions: [...] },  // ← Should be an object, not just a string!
  roleObjectType: 'object'            // ← Should be 'object', not 'string'
}
Returning employee data: {
  id: '...',
  email: 'testerAdmin@gmail.com',
  roleId: 'SOME-UUID',
  role: { id: '...', name: 'admin', permissions: [...] },
  ...
}
```

**⚠️ CRITICAL:** If `roleObject` is `null` or `roleObjectType` is `'object'` but the object is empty, then the `include: { role: true }` isn't working!

### 2. Browser Console (Frontend)

You should see these logs:

```
[Login] Backend response: {
  success: true,
  hasEmployee: true,
  employeeData: {...}
}

[Login] Employee object received: {
  id: '...',
  email: 'testerAdmin@gmail.com',
  roleId: 'SOME-UUID',
  role: { id: 'SOME-UUID', name: 'admin', permissions: ['dashboard', 'schedule', ...] },  // ← Should be an object with permissions!
  roleType: 'object'  // ← Should be 'object', not 'string'
}

[AuthContext] signIn called with employee data: {...}
[AuthContext] Role to fetch permissions for: admin  // ← Should show the role name or ID
[AuthContext] fetchPermissionsForRole: looking for role {roleRaw: 'admin', normalized: 'admin'}
[AuthContext] Fetched roles from API: [{id: '...', name: 'admin', permissionsCount: 9}]
[AuthContext] Role match found: {roleId: '...', roleName: 'admin', permissions: ['dashboard', 'schedule', ...]}
[AuthContext] Returning permissions for role: admin → ['dashboard', 'schedule', 'info', ...]
[AuthContext] Fetched permissions: ['dashboard', 'schedule', 'info', ...]

[Login] signIn completed; sessionStorage: {
  isAuthenticated: 'true',
  permissions: '["dashboard","schedule","info",...]',  // ← Should NOT be empty!
  employeeRole: 'admin'
}
```

## Common Issues and Fixes

### Issue 1: `roleObject: null` in server logs
**Problem:** The `include: { role: true }` isn't working
**Cause:** The employee's `roleId` doesn't match any role in the `roles` table
**Fix:**
```bash
cd server
node check-and-fix-roles.js --fix
```

### Issue 2: `role: "SOME-UUID"` (string) instead of object
**Problem:** Backend is returning roleId as the role field
**Cause:** The `safeEmployee()` function is not preserving the included `role` object
**Fix:** Check that Prisma is properly mapping the relation

### Issue 3: Permissions array is empty `[]`
**Problem:** No permissions found for the role
**Causes:**
1. Role doesn't exist in roles table
2. Role exists but has empty permissions array
3. Role name/ID mismatch

**Fix:**
```bash
# Check roles table
cd server
npx prisma studio
# Go to 'roles' table and ensure admin role has permissions like:
# ['dashboard', 'schedule', 'info', 'cases', 'access', 'delivery', 'installation', 'warehouse', 'customer']
```

## Quick Test

Run this to verify your admin role has permissions:

```bash
cd server
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.roles.findMany().then(roles => {
  console.log('All roles:');
  roles.forEach(r => console.log(\`  - \${r.name}: \${r.permissions.join(', ')}\`));
  prisma.\$disconnect();
});
"
```

## Expected Result

After successful login, you should see in Layout.js:
```
=== DEBUG: Current User Permissions ===
Raw permissions from context: ['dashboard', 'schedule', 'info', 'cases', 'access', 'delivery', 'installation', 'warehouse', 'customer']
Normalized effectivePermissions: ['dashboard', 'schedule', 'info', 'cases', 'access', 'delivery', 'installation', 'warehouse', 'customer']
Employee role: admin
Loading permissions: false
```

And the sidebar should show all navigation items including "Customer Management".
