const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// The lender's share of the rental fee:
//   40% as standard,
//   50% for founding lenders (the first 20 to join) for their first six months.
// The rest of the rental, and 100% of any tip, stays with WearFairies.
// The share is decided here on the server, from the lenders table, so it can't
// be changed from the browser.
const STANDARD_SHARE = 0.4;
const FOUNDING_SHARE = 0.5;

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function isFoundingNow(row) {
  return !!(row && row.founding && row.founding_until && new Date(row.founding_until) > new Date());
}

// Who gets paid, and how much, is worked out here on the server from the
// listing, never taken from the browser, so nobody can point a payout at
// someone else's Stripe account. If the lender connected Stripe after they
// listed, their account is found through their email and saved onto the
// listing for next time.
async function lenderFor(listingId) {
  const result = { account: null, share: STANDARD_SHARE };
  if (!supabase || !listingId) return result;
  try {
    const { data: rows } = await supabase
      .from('listings').select('id, lister_email, lender_stripe_id').eq('id', listingId).limit(1);
    const listing = rows && rows[0];
    if (!listing) return result;
    let lender = null;
    if (listing.lister_email) {
      const { data } = await supabase
        .from('lenders').select('stripe_connected_account, founding, founding_until')
        .ilike('email', listing.lister_email.replace(/[%_\\]/g, '\\$&')).limit(1);
      lender = data && data[0];
    }
    const fromLender = lender && typeof lender.stripe_connected_account === 'string' && lender.stripe_connected_account.startsWith('acct_')
      ? lender.stripe_connected_account : null;
    const fromListing = typeof listing.lender_stripe_id === 'string' && listing.lender_stripe_id.startsWith('acct_')
      ? listing.lender_stripe_id : null;
    result.account = fromLender || fromListing;
    if (isFoundingNow(lender)) result.share = FOUNDING_SHARE;
    if (fromLender && fromLender !== listing.lender_stripe_id) {
      await supabase.from('listings').update({ lender_stripe_id: fromLender }).eq('id', listing.id);
    }
  } catch (e) {
    console.error('Lender lookup failed, using standard share and manual payout:', e);
  }
  return result;
}

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
      listing_id,
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
    const lender = await lenderFor(listing_id);
    const share = lender.share;
    const lenderAccount = lender.account;
    const lenderCutCents = Math.round(rentalAmountCents * share);
    const fairiesCutCents = rentalAmountCents - lenderCutCents + tipAmountCents;

    const options = {
      amount: totalCents,
      currency: 'usd',
      description: description || 'WearFairies Dress Rental',
      receipt_email: renter_email,
      metadata: {
        renter_name: renter_name || '',
        renter_email: renter_email || '',
        rental_amount: String(amount),
        tip_amount: String(tip || 0),
        listing_id: listing_id ? String(listing_id) : '',
        lender_share: String(share),
        lender_cut: (lenderCutCents / 100).toFixed(2),
        fairies_cut: (fairiesCutCents / 100).toFixed(2),
        // release-payout reads these back off the PaymentIntent, so the
        // amount can't be tampered with from the browser.
        lender_stripe_id: lenderAccount || '',
        lender_cut_cents: String(lenderCutCents),
        payout_released: 'no'
      }
    };

    // The lender's share is NOT transferred here.
    //
    // Splitting at charge time would pay the lender before the piece has
    // left their hands — so a lender could take the money and never hand
    // the dress over, and Fairies would be refunding the renter out of its
    // own cut. Instead the full amount lands in the Fairies balance and the
    // lender's share is released by /api/release-payout once the piece has
    // actually been delivered to the renter.
    const hasRealAccount = !!lenderAccount;

    const paymentIntent = await stripe.paymentIntents.create(options);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      // What the lender is owed once delivery is confirmed, and where it goes.
      payout_pending: {
        amount: (lenderCutCents / 100).toFixed(2),
        destination: hasRealAccount ? lenderAccount : null,
        released_on: 'delivery to renter'
      },
      split: hasRealAccount ? 'on_delivery' : 'manual',
      breakdown: {
        total: (totalCents / 100).toFixed(2),
        rental: parseFloat(amount).toFixed(2),
        tip: parseFloat(tip || 0).toFixed(2),
        lender_receives: (lenderCutCents / 100).toFixed(2),
        lender_share: share,
        fairies_receives: (fairiesCutCents / 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
};
