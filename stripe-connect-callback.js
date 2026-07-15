const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  try {
    const { code, state } = event.queryStringParameters;

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No authorization code' })
      };
    }

    // Exchange authorization code for access token
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code
    });

    const connectedAccountId = response.stripe_user_id;
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.user_id;

    // Update lender profile with connected account
    const { error } = await supabase
      .from('lenders')
      .update({
        stripe_connected_account: connectedAccountId,
        stripe_access_token: response.access_token
      })
      .eq('user_id', userId);

    if (error) throw error;

    // Redirect to dashboard
    return {
      statusCode: 302,
      headers: {
        Location: '/stripe-callback.html?success=true'
      }
    };

  } catch (err) {
    console.error('Stripe Connect error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
