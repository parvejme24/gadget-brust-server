# Gadget Brust Server Roadmap

Goal: a complete, secure, tested backend API for every frontend and role.

Legend: `[x]` done · `[~]` partly done · `[ ]` to do

Status: done 2026-10-24, apart from the open items at the end. `npm test`: 131 passed, 0 failed (on `gadget_brust_test` and on the real database)

Scope: every screen in the web client (`gadget-brust-client`) and the mobile app (`gadget-brust-app`), for all 6 roles (admin, manager, inventory, cashier, marketing, user) and guests. Data lives in the Atlas database named in `MONGODB_URI` (cluster `cluster0.bb7h1wi`, currently db `gadget-brust-db`).

The full endpoint list is in [API.md](API.md).

## Audit (2026-10-24)

- Every API call in the web client and the app hits a route that exists on the server. Nothing is calling a missing endpoint
- The gaps were elsewhere:
  1. **The Atlas database was empty**: it connected, but had no collections
  2. **Security holes**:
     - The cart and wishlist routes had no auth and took `userId` from the URL/body, so anyone could read, change or clear anyone's cart/wishlist
     - `GET /api/cart` and `GET /api/wishlist` listed every user's data
     - `GET /api/payments/:id` and `/api/payments/user/:user_id` were open
     - `.env` had no `JWT_SECRET`/`JWT_REFRESH_SECRET`, so tokens were signed with the hard-coded fallback `your-secret-key` and anyone could forge an admin token
  3. **Broken one-way cart/wishlist sync**: the web client pushed browser items after login (and every push failed validation), never read them back, and the app never synced
  4. **Data the app kept only on the device**: the address book (`lib/addressBook.js`)
  5. **Unused APIs with no screen**: the contact inbox (`GET /api/contact`) had no dashboard page
  6. **Missing features the UI points to**: the app had a fake "Forgot password" flow and no reset API existed. Google login had no backend
  7. **No automated API tests**

## Step 1: Database and environment
- [x] Strong random `JWT_SECRET` and `JWT_REFRESH_SECRET` added to `.env`. In production the server refuses to start without them (`shared/config/jwt.js`)
- [x] `npm run seed` loaded Atlas: 13 categories, 28 brands, 65 products, 11 users (all 6 roles) with saved addresses, 44 orders incl. guest orders, 34 payments, 8 coupons, 6 couriers, 3 shipping methods, 126 reviews, 96 stock movements, 11 notifications, 6 contact messages, settings
- [x] The seed builds every model index on Atlas (`syncIndexes`) and clears old sessions
- [x] `GET /api/health` reports database status

## Step 2: Security fixes on existing APIs
- [x] Cart: every route needs login and uses the token's user. Prices come from the product, quantities are capped at stock, and lines can only be changed by their owner. The list of everyone's carts is staff-only (`customers`); `/user/:userId` is the user or staff
- [x] Wishlist: the same treatment
- [x] Payments: `GET /:id` and `/user/:user_id` need login. Customers see only their own (others get 404); `payments`/`reports` staff see all
- [x] Reviews: authors can edit (text and rating only) and delete their own; moderators can do both on any review. One review per product per customer (409). Public review lists show the author's name instead of their email
- [x] Every protected route is checked against the permission table for every role and for guests (`tests/access.test.js`)
- [x] Also fixed while testing:
  - Guests could read every staff notification (customer names, order totals, stock alerts) from `GET /api/notifications`
  - Any staff role, including the store keeper, could open any customer's order
  - Shipping accepted couriers that don't exist or are inactive
  - Store settings accepted a plain value for a settings group and corrupted it
  - The contact inbox crashed on bad ids
  - Logout never revoked the refresh token (web client and app)
  - App registration always failed, because the API returns no tokens on register
  - The app showed a hardcoded "148 reviews" and never displayed review text

## Step 3: Missing APIs
- [x] **Cart/wishlist merge on login**: `POST /api/cart/sync` and `POST /api/wishlist/sync`. Plus `PUT /api/cart/me` and `PUT /api/wishlist/me`, which save the whole list after each change, so removals and lower quantities reach the server
- [x] **Saved addresses**: `/api/addresses` (list, create, update, delete, set default), with exactly one default, max 10, the same street + city merged, and a courier note plus the app's extra form fields kept. Checkout saves the address when `saveAddress: true`
- [x] **Forgot/reset password**: `POST /api/forgot-password` and `POST /api/reset-password`:
  - The 6-digit code is stored hashed and expires in 10 minutes
  - The reply is the same whether or not the email has an account
  - The code locks after 5 wrong tries
  - A reset signs the user in and signs out their other sessions
  - If the email can't be sent, development servers return the code (`devCode`) so the flow still works
- [~] **Google login**: `POST /api/auth/google` is built. It checks a Google ID token with Google and signs the user in, creating or linking the account. It returns 503 until `GOOGLE_CLIENT_ID` is set, and the frontends have no Google button yet
- [x] **Health**: `GET /api/health`
- [x] Register stores an optional mobile number (the app already sent one)

## Step 4: Connect the frontends to the new APIs
- [x] Web client (`lib/providers/StoreHydrator.jsx`, `lib/services/shopSync.js`):
  - On sign-in, the browser cart and wishlist are merged with the saved ones
  - Changes while signed in are saved to the server
  - Signing out clears them from the browser
- [x] App: the same cart/wishlist sync (`src/store/StoreHydrator.jsx`, `src/services/shopSync.js`):
  - The address book uses `/api/addresses` for signed-in users; guests keep the device copy
  - Forgot password is real, in both the sign-in sheet and the login screen
  - Product screens show the real review count, rating, author and text
- [x] Web dashboard: new **Messages** page (`/dashboard/messages`) for every staff role:
  - Status tabs with counts and search
  - Opening a message marks it as read
  - Reply by email, mark as replied/unread, archive
- [x] Web customer dashboard:
  - **Delivery addresses** on the profile page
  - Saved addresses at checkout (default prefilled, pick another, "save this address")
  - Edit/delete own reviews on **My reviews**
- [x] Web: **Forgot password** page (`/forgot-password`), linked from login

## Step 5: API test suite, run against real data
- [x] `tests/` uses Node's built-in test runner and `fetch` (no new dependencies). `npm test` reseeds `gadget_brust_test`, then runs everything
- [x] `npm run test:real` runs the same tests against the real database
- [x] Access matrix: 39 read routes and 27 write routes, each called by a guest and by all 6 roles
- [x] End-to-end flows, each checked against the database afterwards (stock counts, stock movements, totals, status history, payments, notifications, saved addresses):
  - **Guest**: quote → checkout (cash on delivery) → track
  - **Customer**: register → login → refresh → profile → addresses → cart/wishlist sync and save → coupon → checkout with saved address → my orders → review → notifications → change password → forgot/reset
  - **Cashier**: POS sale → stock down
  - **Store keeper**: product create/edit/delete → restock, damage and count → movement log
  - **Manager/Admin**: accept → courier → ship → deliver (cash collected); cancel returns stock; order edit; staff create/role/deactivate/delete; settings
  - **Marketing**: coupon create → apply → toggle → delete
  - **Staff**: contact inbox
- [x] Final check on the real database: the running server signs in with each demo role and loads that role's main dashboard endpoints (all 200)

## Step 6: Wrap-up
- [x] [API.md](API.md): every route, method and who can call it. The README links to it and covers seeding, tests and the new `.env` keys
- [x] This roadmap updated

## Still open
- **Email sending**: Gmail rejects the SMTP login in `.env` (`535 Username and Password not accepted`). Create a Google App Password and put it in `SMTP_PASS`. Until then reset codes aren't emailed (development servers show them on screen)
- **Google sign-in**: add `GOOGLE_CLIENT_ID` (web, iOS and Android client ids, comma separated), then add the Google button to the web login and the app
- **Test accounts in the real database**: `npm run test:real` leaves `test.*@example.com` customers, a few orders, payments and stock movements. Run `npm run seed` for a clean demo database
