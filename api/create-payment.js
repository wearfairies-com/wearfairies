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
        fairies_cut: ((rentalAmountCents * 0.6 + tipAmountCents) / 100).toFixed(2)
      }
    };

    // Only split if the lender actually finished Connect onboarding.
    // A real connected account id always starts with acct_ — anything
    // else (null, or a leftover "pending_" placeholder) means no split,
    // and the money sits with Fairies to be paid out by hand.
    const hasRealAccount =
      typeof lender_stripe_id === 'string' && lender_stripe_id.startsWith('acct_');

    if (hasRealAccount) {
      options.transfer_data = {
        amount: lenderCutCents,
        destination: lender_stripe_id
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(options);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      split: hasRealAccount ? 'automatic' : 'manual',
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
