# Payments Setup

This project now supports:
- Paystack hosted checkout for shop orders
- Paystack hosted checkout for one-time donations
- Vercel serverless functions for secure initialization, callback verification, status checks, and webhooks
- Supabase as the payment and order record store

## 1. Create the Supabase tables
Run `supabase/schema.sql` in your Supabase SQL editor.

## 2. Configure environment variables
Add the values from `.env.example` in your Vercel project settings.

Required:
- `PAYSTACK_SECRET_KEY`
- `SITE_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred in the current Supabase dashboard)
- `ADMIN_ORDER_EMAIL`

Legacy fallback:
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but recommended for admin notifications:
- `RESEND_API_KEY`
- `ADMIN_FROM_EMAIL`

## 3. Register the Paystack webhook
In Paystack, set the webhook URL to:
- `https://your-domain.com/api/payments/webhook`

## 4. Update delivery fees before going live
Edit `data/store-config.json` and replace the starter area fees with your real delivery prices.

## 5. Finalize unfinished products
Products marked `purchasable: false` and `enquireOnly: true` stay visible but cannot be purchased until their data is complete.
