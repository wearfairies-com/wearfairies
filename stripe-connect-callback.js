const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Stripe redirects the lender's browser here after they authorize.
// We exchange the one-time code for a real acct_ id, save it, then
// bounce them to the dashboard.
module.exports = async (req, res) => {
  const { code, state, error: stripeError, error_description } = req.query;

  // Lender hit "cancel" on Stripe's page, or Stripe rejected it.
  if (stripeError) {
    return res.redirect(
      302,
      '/dashboard.html?stripe=error&reason=' +
        encodeURIComponent(error_description || stripeError)
    );
  }

  if (!code || !state) {
    return res.redirect(302, '/dashboard.html?stripe=error&reason=missing_code');
  }

  try {
    // state carries the user_id we set before redirecting to Stripe
    let userId;
    try {
      userId = JSON.parse(Buffer.from(state, 'base64').toString()).user_id;
    } catch (e) {
      return res.redirect(302, '/dashboard.html?stripe=error&reason=bad_state');
    }
    if (!userId) {
      return res.redirect(302, '/dashboard.html?stripe=error&reason=bad_state');
    }

    // The actual exchange. This is the step that was missing.
    // Returns the lender's real Stripe account id.
    const tokenRes = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code
    });

    const connectedAccountId = tokenRes.stripe_user_id; // acct_...
    if (!connectedAccountId) {
      return res.redirect(302, '/dashboard.html?stripe=error&reason=no_account_id');
    }

    // Save to the lender's profile.
    const { error: lenderErr } = await supabase
      .from('lenders')
      .update({
        stripe_connected_account: connectedAccountId,
        stripe_auth_code: null
      })
      .eq('user_id', userId);

    if (lenderErr) throw lenderErr;

    // The payment function reads lender_stripe_id off the listing, so
    // backfill every listing this lender already has.
    const { data: lender } = await supabase
      .from('lenders')
      .select('email')
      .eq('user_id', userId)
      .single();

    if (lender && lender.email) {
      await supabase
        .from('listings')
        .update({ lender_stripe_id: connectedAccountId })
        .eq('lister_email', lender.email);
    }

    return res.redirect(302, '/dashboard.html?stripe=connected');
  } catch (err) {
    console.error('Stripe Connect exchange failed:', err);
    return res.redirect(
      302,
      '/dashboard.html?stripe=error&reason=' +
        encodeURIComponent(err.message || 'exchange_failed')
    );
  }
};
