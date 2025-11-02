# Deploy to Render - Step by Step

This guide will deploy your TBM Delivery System to Render (100% FREE).

## What You'll Deploy

- **Frontend**: React app (Static Site)
- **Backend**: Express API (Web Service)
- **Database**: PostgreSQL

## Prerequisites

✅ Code pushed to GitHub: https://github.com/jiaaahui/FYP.git
✅ Render account (sign up at https://render.com)

---

## Step 1: Create PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in:
   - **Name**: `tbm-delivery-db`
   - **Database**: `tbm_delivery`
   - **User**: (leave default)
   - **Region**: Singapore
   - **PostgreSQL Version**: 16
   - **Datadog API Key**: (leave empty)
   - **Instance Type**: Free
4. Click **"Create Database"**
5. Wait ~1 minute for database to be ready
6. **IMPORTANT**: Click on database name → Copy the **"Internal Database URL"**
   - Looks like: `postgresql://tbm_user:xxx@dpg-xxx.singapore-postgres.render.com/tbm_delivery`
   - Save this! You'll need it next.

---

## Step 2: Deploy Backend (Express API)

1. Click **"New +"** → **"Web Service"**
2. Click **"Build and deploy from a Git repository"** → **"Next"**
3. If not connected, click **"Connect GitHub"** and authorize Render
4. Find and select your repository: `jiaaahui/FYP`
5. Fill in configuration:

   **Basic Settings:**
   - **Name**: `tbm-delivery-api`
   - **Region**: Singapore (same as database)
   - **Branch**: `master`
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm install && npx prisma generate && npx prisma migrate deploy
     ```
   - **Start Command**:
     ```
     npm start
     ```

6. Scroll down to **"Instance Type"**: Select **Free**

7. Click **"Advanced"** → **"Add Environment Variable"**

   Add these variables one by one:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Paste the Internal Database URL from Step 1 |
   | `PORT` | `4000` |
   | `CLIENT_URL` | `https://tbm-delivery.onrender.com` (we'll update this later) |
   | `JWT_SECRET` | Click "Generate" button OR paste any random long string |
   | `NODE_ENV` | `production` |

8. Click **"Create Web Service"**

9. Wait 5-10 minutes for deployment
   - You'll see logs building your app
   - When done, you'll see "Live" with a green dot

10. **Copy your backend URL** from the top of the page
    - Will look like: `https://tbm-delivery-api.onrender.com`
    - Save this for the next step!

---

## Step 3: Deploy Frontend (React App)

1. Click **"New +"** → **"Static Site"**
2. Click **"Build and deploy from a Git repository"** → **"Next"**
3. Select your repository: `jiaaahui/FYP`
4. Fill in configuration:

   **Basic Settings:**
   - **Name**: `tbm-delivery`
   - **Branch**: `master`
   - **Root Directory**: `client`
   - **Build Command**:
     ```
     npm install && npm run build
     ```
   - **Publish Directory**:
     ```
     build
     ```

5. Click **"Advanced"** → **"Add Environment Variable"**

   Add this variable:

   | Key | Value |
   |-----|-------|
   | `REACT_APP_API_BASE_URL` | Paste your backend URL from Step 2 (e.g., `https://tbm-delivery-api.onrender.com`) |

6. Click **"Create Static Site"**

7. Wait 3-5 minutes for deployment

8. **Your frontend URL** will be shown at the top
   - Will look like: `https://tbm-delivery.onrender.com`

---

## Step 4: Update Backend CORS

Now update the backend to allow your frontend URL:

1. Go back to your **backend service** (`tbm-delivery-api`)
2. Click **"Environment"** in the left sidebar
3. Find `CLIENT_URL` variable
4. Click **"Edit"** (pencil icon)
5. Update the value to your frontend URL: `https://tbm-delivery.onrender.com`
6. Click **"Save Changes"**
7. Service will automatically redeploy (~2 minutes)

---

## Step 5: Create Admin User

You need to create an admin account to login:

### Option A: Use Render Shell (Easiest)

1. Go to your **backend service** (`tbm-delivery-api`)
2. Click **"Shell"** tab at the top
3. Wait for shell to connect
4. Run the seed command:
   ```bash
   npm run seed
   ```
5. You'll see output confirming admin user created
6. **Admin credentials:**
   - Email: `admin@tbm.com`
   - Password: `Admin123!`

### Option B: Use Prisma Studio from Local Machine

1. On your computer, open terminal:
   ```bash
   cd C:\Users\New\Documents\fyp\server

   # Set DATABASE_URL to your production database
   set DATABASE_URL=postgresql://tbm_user:xxx@dpg-xxx.singapore-postgres.render.com/tbm_delivery

   # Run seed
   npm run seed
   ```

---

## Step 6: Test Your Deployment

1. **Open your frontend URL** in browser (e.g., `https://tbm-delivery.onrender.com`)
2. You should see the login page
3. **Login with admin:**
   - Email: `admin@tbm.com`
   - Password: `Admin123!`
4. **Test features:**
   - ✅ Navigate through different sections
   - ✅ Create a test employee
   - ✅ Check dashboard
5. **Share the URL** with your users!

---

## Your Deployment URLs

After completion, you'll have:

- **Frontend (User Access)**: `https://tbm-delivery.onrender.com`
- **Backend API**: `https://tbm-delivery-api.onrender.com`
- **Database**: Internal connection only

**Share the frontend URL** with users - they can access from anywhere!

---

## Important: Free Tier Limitations

⚠️ **Render Free Tier services "sleep" after 15 minutes of inactivity**

What this means:
- After 15 min with no visitors, the service stops
- First visitor after sleep: takes ~30 seconds to wake up
- Database stays awake 24/7 (90 days free, then $7/month)

**To keep services awake:**
- Upgrade to paid plan ($7/month per service)
- OR use uptime monitor (uptimerobot.com - free pings every 5 min)

---

## Updating Your Deployed App

When you make code changes:

```bash
# Commit and push
git add .
git commit -m "Your changes"
git push origin master
```

Render automatically:
- ✅ Detects the push
- ✅ Rebuilds your services
- ✅ Deploys new version

No manual work needed!

---

## Troubleshooting

### "Cannot connect to backend"
- Check `REACT_APP_API_BASE_URL` in frontend environment variables
- Make sure it points to backend URL (ends with `.onrender.com`)
- Visit `https://your-backend-url.onrender.com/api/health` - should return `{"ok":true}`

### "Database connection error"
- Check `DATABASE_URL` in backend environment variables
- Make sure you copied the **Internal Database URL** (not External)
- Check database service is running

### "Service Unavailable" / First load is slow
- Free tier service is sleeping
- Wait 30 seconds for it to wake up
- Consider upgrading to paid plan or using uptime monitor

### Login not working
- Make sure you ran the seed script
- Check backend logs for errors (click "Logs" tab)
- Verify `CLIENT_URL` matches your frontend URL exactly

### Changes not showing up
- Check deployment succeeded (green "Live" status)
- Clear browser cache
- Check you're viewing the correct URL

---

## Environment Variables Summary

### Backend (`tbm-delivery-api`)
```
DATABASE_URL = <from Render PostgreSQL>
PORT = 4000
CLIENT_URL = https://tbm-delivery.onrender.com
JWT_SECRET = <random string>
NODE_ENV = production
```

### Frontend (`tbm-delivery`)
```
REACT_APP_API_BASE_URL = https://tbm-delivery-api.onrender.com
```

---

## Costs

- **Database**: FREE for 90 days, then $7/month
- **Backend Web Service**: FREE (with sleep) or $7/month (24/7)
- **Frontend Static Site**: FREE forever

**Total FREE for 90 days**, then $7/month if you keep database.

---

## Need Help?

- Check Render logs: Click "Logs" tab in each service
- Render Docs: https://render.com/docs
- Check backend health: `https://your-backend-url.onrender.com/api/health`

---

## Summary Checklist

- [ ] Created PostgreSQL database
- [ ] Deployed backend with environment variables
- [ ] Deployed frontend with API URL
- [ ] Updated backend CLIENT_URL to frontend URL
- [ ] Ran seed script to create admin user
- [ ] Tested login with admin@tbm.com / Admin123!
- [ ] Shared frontend URL with users
- [ ] Changed admin password after first login

**You're done! Your app is live! 🎉**
