# Gadget Brust API reference

Base URL: `http://localhost:6060/api` in development (`SERVER_RUNNING_PORT` in `.env`).

Every response has the same shape: `{ success, message, data, timestamp }` (errors: `{ success: false, message, errors }`).

Signed-in calls send `Authorization: Bearer <token>`. Tokens last 1 hour; `POST /refresh` swaps the 7-day refresh token for a new one.

## Who can call what

**Access** column:
- **Public**: no sign-in
- **Signed in**: any role
- **Own**: the signed-in user's own data, taken from the token (never from the URL or body)
- A permission name, such as `orders`: roles that have it (table below)

| Permission | Admin | Manager | Store keeper (`inventory`) | Cashier | Marketing | Customer (`user`) |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | |
| reports | ✓ | ✓ | | | ✓ | |
| catalog | ✓ | ✓ | ✓ | | ✓ | |
| inventory | ✓ | ✓ | ✓ | | | |
| reviews (moderate) | ✓ | ✓ | ✓ | | ✓ | |
| coupons | ✓ | ✓ | | | ✓ | |
| pos | ✓ | ✓ | | ✓ | | |
| orders | ✓ | ✓ | | ✓ | | |
| payments | ✓ | ✓ | | | | |
| customers | ✓ | ✓ | | ✓ | | |
| couriers | ✓ | ✓ | | ✓ | | |
| shipping | ✓ | ✓ | | | | |
| settings | ✓ | | | | | |
| staff | ✓ | | | | | |

The table lives in `shared/config/permissions.js` (and `gadget-brust-client/lib/permissions.js`). `tests/access.test.js` checks every route below against it for every role and for guests.

## Auth and account

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/register` | Public | `{ fullName, email, password, phone? }`. Always creates a customer. No tokens: sign in next |
| POST | `/login` | Public | `{ email, password }` → `{ user, token, refreshToken }` |
| POST | `/refresh` | Public | `{ refreshToken }` → `{ token }` |
| POST | `/logout` | Public | `{ refreshToken }` revokes it |
| POST | `/forgot-password` | Public | `{ email }`. Emails a 6-digit code (10 min). Same reply whether or not the email exists. Without working SMTP, development servers return `devCode` |
| POST | `/reset-password` | Public | `{ email, code, newPassword }` → signs in like `/login`. Signs out other sessions. Locks after 5 wrong codes |
| POST | `/auth/google` | Public | `{ idToken }` from Google sign-in. Needs `GOOGLE_CLIENT_ID`; returns 503 until it is set |
| GET | `/profile` | Signed in | |
| PUT | `/profile` | Signed in | `{ fullName?, profileImage? }` only |
| DELETE | `/profile` | Signed in | Deletes the account |
| PUT | `/change-password` | Signed in | `{ currentPassword, newPassword }` |
| GET | `/addresses` | Own | Saved delivery addresses |
| POST | `/addresses` | Own | `{ label, name, phone, street, city, zipCode?, note?, details?, isDefault? }`. The same street + city updates the saved one. Max 10 |
| PUT | `/addresses/:id` | Own | Partial update |
| DELETE | `/addresses/:id` | Own | Another address becomes the default |
| PATCH | `/addresses/:id/default` | Own | |

## Staff and customers

| Method | Path | Access |
| --- | --- | --- |
| GET | `/users` | customers, staff |
| GET | `/users/:id` | customers, staff |
| GET | `/users/email/:email` | customers, staff, pos |
| POST | `/users` | staff: `{ fullName, email, password, role, phone? }` |
| PUT | `/users/:id` | staff: `{ fullName?, phone?, isActive?, password? }` (you can't deactivate yourself) |
| PUT | `/users/:userId/role` | staff (you can't change your own role) |
| DELETE | `/users/:id` | staff |

## Catalog

| Method | Path | Access |
| --- | --- | --- |
| GET | `/products` | Public: `page, limit, search, category, subcategory, brand, remark, minPrice, maxPrice, minRating, inStock, stockLevel, sortBy, sortOrder` |
| GET | `/products/search`, `/slider`, `/discounted`, `/cheapest`, `/newest` | Public |
| GET | `/products/category/:id`, `/subcategory/:name`, `/brand/:id`, `/remark/:remark` | Public |
| GET | `/products/:id` | Public |
| POST / PUT / DELETE | `/products`, `/products/:id` | catalog (JSON or multipart with `image`; `imageUrl` accepted) |
| GET | `/categories`, `/categories/:id`, `/categories/:id/subcategories` | Public |
| POST / PUT / DELETE | `/categories…` incl. subcategories | catalog |
| GET | `/brands`, `/brands/:id` | Public |
| POST / PUT / DELETE | `/brands…` | catalog |
| POST / PUT / DELETE | `/upload/single`, `/upload/multiple`, `/upload/update`, `/upload/:publicId` | catalog, couriers, settings |

## Reviews

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/reviews`, `/reviews/product/:id`, `/reviews/customer/:id`, `/reviews/:id` | Public | Each review has `customerName`. Emails go only to moderators and the author |
| POST | `/reviews` | Signed in | `{ productID, rating, reviewText }`. One per product (409 if repeated); the author comes from the token |
| PUT | `/reviews/:id` | Author or reviews | Authors can change `rating` and `reviewText` only |
| DELETE | `/reviews/:id` | Author or reviews | |

## Cart and wishlist (signed-in shoppers)

Guests keep their cart in the browser or app. After sign-in, the frontends call `/sync`, then save the whole list with `PUT /me` after each change.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/cart/me` | Own | `{ cartItems, cartSummary }` with current prices |
| PUT | `/cart/me` | Own | `{ items: [{ product_id, qty, color?, size? }] }` replaces the cart |
| POST | `/cart/sync` | Own | Same body; merges (the larger quantity wins) |
| POST | `/cart` | Own | Add one line. Adding again increases the quantity. Prices come from the product; quantities are capped at stock |
| PATCH / PUT | `/cart/:id/quantity`, `/cart/:id` | Own | `{ qty }` |
| DELETE | `/cart/:id`, `/cart/me` | Own | |
| GET / DELETE | `/cart/user/:userId[/summary|/clear]` | Own or customers | |
| GET | `/cart` | customers | Every cart |
| GET | `/wishlist/me` | Own | |
| PUT | `/wishlist/me` | Own | `{ productIDs: [...] }` replaces the wishlist |
| POST | `/wishlist/sync` | Own | Same body; merges |
| POST | `/wishlist` | Own | `{ productID }` |
| GET | `/wishlist/check?productID=` | Own | |
| DELETE | `/wishlist/:id` | Own | Wishlist row id or product id |
| DELETE | `/wishlist/me` | Own | |
| GET / DELETE | `/wishlist/user/:userId`, `/wishlist/:userId/clear` | Own or customers | |
| GET | `/wishlist` | customers | |

## Orders

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/invoices/quote` | Public | `{ items: [{ product, qty }], shippingMethod, couponCode? }`. Server prices |
| POST | `/invoices/checkout` | Public | Guest or customer order: `{ customer: { name, phone, email? }, shippingAddress, shippingMethod, items, couponCode?, paymentMethod?, notes?, saveAddress? }` |
| GET | `/invoices/track?number=&phone=` | Public | No personal details in the reply |
| GET | `/invoices/mine` | Signed in | |
| GET | `/invoices/:id` | Owner or orders, reports, customers, pos | |
| GET | `/invoices/user/:userId[/summary]` | Owner or orders, reports, customers, pos | |
| GET | `/invoices` | orders, reports, customers | `status, paymentStatus, orderStatus, source, guest=true, q` |
| POST | `/invoices` | orders | Phone order added by staff (`customer.userId` links an account) |
| PUT | `/invoices/:id` | orders | Edit items, customer, address, charges and notes. Totals and stock are recalculated |
| PATCH | `/invoices/:id/order-status` | orders | `{ orderStatus, note? }`. Accepting takes stock, cancelling returns it, delivering collects cash on delivery |
| PATCH | `/invoices/:id/shipment` | orders | `{ courier, trackingNumber?, note?, markShipped? }`. Needs an active courier |
| PATCH | `/invoices/:id/status`, `/invoices/:id/payment-status` | orders | |
| DELETE | `/invoices/:id` | orders | Returns held stock |
| POST | `/pos/orders` | pos | Counter sale. Takes stock immediately |

## Payments

| Method | Path | Access |
| --- | --- | --- |
| GET | `/payments/order/methods` | Public |
| POST | `/payments/order/start`, `/payments/order/cod` | Public (order number + phone) |
| POST / GET | `/payments/order/ssl-ipn`, `/payments/order/stripe-return` and the gateway callbacks | Payment gateways |
| GET | `/payments/:id` | Owner or payments, reports (others get 404) |
| GET | `/payments/user/:userId` | Owner or payments, reports |
| GET | `/payments/admin/all`, `/payments/admin/stats` | payments, reports |
| PATCH / POST | `/payments/:id/status`, `/payments/:id/refund` | payments, reports |

## Store operations

| Method | Path | Access |
| --- | --- | --- |
| GET | `/inventory/summary`, `/inventory/movements` | inventory |
| POST | `/inventory/adjust` | inventory: `{ product, type: restock, return, sale, damage or adjustment, quantity or setTo, note? }` |
| GET | `/coupons/offers` | Public |
| POST | `/coupons/apply` | Public: `{ code, items }` |
| GET | `/coupons` | coupons, pos |
| GET / POST / PUT / PATCH / DELETE | `/coupons/:id`, `/coupons`, `/coupons/:id/toggle` | coupons |
| GET | `/couriers`, `/couriers/:id` | couriers, orders |
| POST / PUT / PATCH / DELETE | `/couriers…` incl. `/toggle-status`, `/default` | couriers |
| GET | `/shipping`, `/shipping/:id` | Public |
| POST | `/shipping/calculate` | Public |
| POST / PUT / PATCH / DELETE | `/shipping…` | shipping |
| GET | `/store-settings` | Public |
| PUT | `/store-settings` | settings. Partial: groups such as `announcement` must be objects |
| POST | `/contact` | Public: `{ name, email, phone?, subject?, message }` |
| GET | `/contact` | dashboard: `status, search, page, limit` → `{ messages, total, pages, counts }` |
| PATCH | `/contact/:id/status` | dashboard: `{ status: unread, read, replied or archived }` |
| GET | `/notifications` | Signed in sees their own plus their role's (guests get an empty list): `limit, unread=true` |
| PATCH | `/notifications/:id/read`, `/notifications/read-all` | Signed in |
| GET | `/search?q=` | Signed in (results depend on the role) |
| GET | `/dashboard/me` | Signed in |
| GET | `/dashboard/stats`, `/revenue`, `/products`, `/customers`, `/sales`, `/activities` | dashboard |
| GET | `/health` | Public. 200 with `database: "connected"`, 503 otherwise |
