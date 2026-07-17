const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'wearfairies@outlook.com';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Releases the lender's 40% AFTER the piece has been delivered to the renter.
//
// create-payment deliberately does not split at charge time — the whole
// amount sits in the Fairies balance until Rome confirms she has collected
// the piece and handed it over. This is what stops a lender taking the money
// and never producing the dress.
//
// This endpoint moves real money, so it is admin-only and every amount is
// read back off the PaymentIntent rather than trusted from the caller.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --- who is asking? ---
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    if ((userData.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    // --- what are we releasing? ---
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { payment_intent_id, request_id } = body || {};
    if (!payment_intent_id) {
      return res.status(400).json({ error: 'payment_intent_id required' });
    }

    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);

    // Only release money that actually arrived.
    if (pi.status !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment has not succeeded (status: ' + pi.status + ')'
      });
    }

    // Don't pay twice.
    if (pi.metadata.payout_released === 'yes') {
      return res.status(409).json({ error: 'Payout already released for this booking' });
    }

    const destination = pi.metadata.lender_stripe_id;
    const amountCents = parseInt(pi.metadata.lender_cut_cents, 10);

    if (!destination || !destination.startsWith('acct_')) {
      return res.status(400).json({
        error: 'This lender has no connected Stripe account — pay them manually'
      });
    }
    if (!amountCents || amountCents < 1) {
      return res.status(400).json({ error: 'No payout amount recorded on this payment' });
    }

    // --- move it ---
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: destination,
      transfer_group: payment_intent_id,
      source_transaction: pi.latest_charge,
      metadata: {
        payment_intent: payment_intent_id,
        released_by: userData.user.email,
        reason: 'delivered to renter'
      }
    });

    // Mark it so a second click can't pay again.
    await stripe.paymentIntents.update(payment_intent_id, {
      metadata: {
        ...pi.metadata,
        payout_released: 'yes',
        payout_transfer_id: transfer.id,
        payout_released_at: new Date().toISOString()
      }
    });

    if (request_id) {
      await supabase
        .from('rental_requests')
        .update({ status: 'delivered' })
        .eq('id', request_id);
    }

    return res.status(200).json({
      released: true,
      transfer_id: transfer.id,
      amount: (amountCents / 100).toFixed(2),
      destination: destination
    });
  } catch (err) {
    console.error('Payout release failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
