const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 40% of the rental goes to the lender.
// 60% of the rental + 100% of the tip stays with Fairies.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      amount,
      tip,
      lender_stripe_id,
      description,
      renter_email,
      renter_name
    } = body || {};

    const rentalAmountCents = Math.round(parseFloat(amount) * 100);
    const tipAmountCents = Math.round(parseFloat(tip || 0) * 100);

    if (!rentalAmountCents || rentalAmountCents < 50) {
      return res.status(400).json({ error: 'Invalid rental amount' });
    }

    const totalCents = rentalAmountCents + tipAmountCents;
    const lenderCutCents = Math.round(rentalAmountCents * 0.4);

    const options = {
      amount: totalCents,
      currency: 'usd',
      description: description || 'Fairies Dress Rental',
      receipt_email: renter_email,
      metadata: {
        renter_name: renter_name || '',
        renter_email: renter_email || '',
        rental_amount: String(amount),
        tip_amount: String(tip || 0),
        lender_cut: (lenderCutCents / 100).toFixed(2),
        fairies_cut: ((rentalAmountCents * 0.6 + tipAmountCents) / 100).toFixed(2),
        // release-payout reads these back off the PaymentIntent, so the
        // amount can't be tampered with from the browser.
        lender_stripe_id: lender_stripe_id || '',
        lender_cut_cents: String(lenderCutCents),
        payout_released: 'no'
      }
    };

    // The lender's 40% is NOT transferred here.
    //
    // Splitting at charge time would pay the lender before the piece has
    // left their hands — so a lender could take the money and never hand
    // the dress over, and Fairies would be refunding the renter out of its
    // own cut. Instead the full amount lands in the Fairies balance and the
    // lender's share is released by /api/release-payout once the piece has
    // actually been delivered to the renter.
    const hasRealAccount =
      typeof lender_stripe_id === 'string' && lender_stripe_id.startsWith('acct_');

    const paymentIntent = await stripe.paymentIntents.create(options);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      // What the lender is owed once delivery is confirmed, and where it goes.
      payout_pending: {
        amount: (lenderCutCents / 100).toFixed(2),
        destination: hasRealAccount ? lender_stripe_id : null,
        released_on: 'delivery to renter'
      },
      split: hasRealAccount ? 'on_delivery' : 'manual',
      breakdown: {
        total: (totalCents / 100).toFixed(2),
        rental: parseFloat(amount).toFixed(2),
        tip: parseFloat(tip || 0).toFixed(2),
        lender_receives: (lenderCutCents / 100).toFixed(2),
        fairies_receives: ((rentalAmountCents * 0.6 + tipAmountCents) / 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
};
