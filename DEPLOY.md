# Deploying the API to Vercel

The API runs on Vercel as one serverless function:
- `api/index.js` wraps the Express app and reuses one MongoDB connection per warm instance
- `vercel.json` sends every path to it
- Local development is unchanged: `npm run dev` still uses `index.js`

## 1. MongoDB Atlas

Vercel functions don't have fixed IP addresses. In Atlas, go to **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`). Keep a strong database user password.

## 2. Create the Vercel project

Either:
- **GitHub (recommended)**: [vercel.com/new](https://vercel.com/new) → import `parvejme24/gadget-brust-server`. Framework preset **Other**, root directory `./`, and leave the build and output settings empty. Every push to `main` then deploys automatically
- **CLI**: `npx vercel login`, then `npx vercel` (preview) and `npx vercel --prod` from this folder. `.vercelignore` keeps `.env`, logs and tests out of the upload

The Node.js version comes from `engines` in `package.json` (24.x).

## 3. Environment variables

Add these in **Project → Settings → Environment Variables** (Production, plus Preview if you use preview deploys). Copy the values from your local `.env` unless a production value is shown.

| Variable | Required | Production value / note |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | Long random strings. The API refuses to start without them. Use new ones for production; changing them signs everyone out |
| `FRONTEND_URL` | yes | The deployed website, e.g. `https://gadget-brust.vercel.app` (CORS and payment returns) |
| `BACKEND_URL` | yes | This API's own URL, e.g. `https://gadget-brust-server.vercel.app` (payment callbacks) |
| `CORS_ORIGINS` | optional | Extra allowed origins, comma separated |
| `ALLOWED_RETURN_ORIGINS` | optional | Extra sites a payment may return to, comma separated |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET` | for image uploads | Cloudinary |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | for password reset | For Gmail, use an App Password. In production a failed email is not shown on screen, so this must work |
| `GOOGLE_CLIENT_ID` | for Google sign-in | Comma-separated client ids |
| `SSL_COMMERZ_STORE_ID`, `SSL_COMMERZ_STORE_PASSWORD`, `SSL_COMMERZ_SANDBOX` | for SSLCommerz | The `SSLCOMMERZ_*` spelling also works |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | for Stripe | |
| `SP_ENDPOINT`, `SP_USERNAME`, `SP_PASSWORD`, `SP_PREFIX`, `SP_RETURN_URL` | for ShurjoPay | `SP_RETURN_URL` must point at the deployed site |
| `RATE_LIMIT_MAX`, `CHECKOUT_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` | optional | Defaults 1000 / 30 / 20 per 15 minutes per visitor |

Don't set `PORT`, `SERVER_RUNNING_PORT`, `MONGODB_DB_NAME` or `NODE_ENV`; Vercel handles them. `VERCEL` is set automatically: the app then trusts Vercel's proxy, so rate limits count per visitor IP.

## 4. Seed the production database (once)

From your machine, with `MONGODB_URI` in `.env` pointing at the production database:

```bash
npm run seed
```

This **replaces** all data with the demo data. Run it only on an empty or demo database.

## 5. Check the deployment

```bash
curl https://<your-api>.vercel.app/api/health   # {"status":"ok","database":"connected"}
curl https://<your-api>.vercel.app/api/products?limit=1
```

Then point the frontends at it:
- Web client: `NEXT_PUBLIC_API_URL=https://<your-api>.vercel.app/api` in its Vercel project
- App: `EXPO_PUBLIC_API_URL` in `gadget-brust-app`, ending in `/api`

## Limits on serverless

- **Rate limits** are counted per function instance, not across all of them. They stop casual abuse; for strict limits, add a shared store (for example Upstash Redis with `rate-limit-redis`)
- **Uploads** stay in memory and go to Cloudinary. Vercel's request body limit is 4.5 MB, so keep images under that
- **Cold starts**: the first request after a quiet period connects to MongoDB (about 1-2 s); later requests reuse the connection
