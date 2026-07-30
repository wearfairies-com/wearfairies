const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Sends the "welcome to the circle" email after signup, with the Discord
// invite. Called by the signup pages right after an account is created.
//
// Needs two env vars in Vercel:
//   RESEND_API_KEY  — from resend.com after domain verification
//   CIRCLE_INVITE   — the permanent Discord invite URL
//
// The email only goes to addresses that actually exist in Supabase Auth —
// the token check stops randoms hammering this endpoint to spam people.
module.exports = async (req, res) => {
  // GET just hands back the invite link, so pages can show a "Join the
  // Circle" button without the link being hardcoded into HTML. Change
  // CIRCLE_INVITE in Vercel and every page updates at once.
  if (req.method === 'GET') {
    return res.status(200).json({ invite: process.env.CIRCLE_INVITE || null });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const email = userData.user.email;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const name = (body && body.name) || '';
    const invite = process.env.CIRCLE_INVITE;

    if (!process.env.RESEND_API_KEY || !invite) {
      // Not configured yet — fail quietly so signup never breaks over a
      // missing welcome email.
      return res.status(200).json({ sent: false, reason: 'email not configured' });
    }

    const firstName = name.split(' ')[0] || 'there';

    const html = `
<div style="background:#0A3B2E;padding:48px 24px;font-family:Georgia,serif">
  <div style="max-width:520px;margin:0 auto;text-align:center">
    <p style="font-size:44px;color:#C9A84C;margin:0 0 8px;font-family:'Brush Script MT',cursive">Fairies</p>
    <p style="font-size:11px;letter-spacing:3px;color:#F2EAD6;text-transform:uppercase;margin:0 0 32px">Greater Boston &middot; Dress Lending</p>

    <p style="color:#F2EAD6;font-size:19px;font-style:italic;line-height:1.7;margin:0 0 20px">
      ${firstName}, you're in the circle.
    </p>
    <p style="color:#8aab92;font-size:15px;font-style:italic;line-height:1.8;margin:0 0 20px">
      A circle of women across Greater Boston, sharing what's already
      hanging in our closets.
    </p>
    <p style="color:#8aab92;font-size:15px;font-style:italic;line-height:1.8;margin:0 0 32px">
      Post your night. Ask the room what to wear.
      See new pieces before they reach the wardrobe.
      Nobody&rsquo;s selling you anything in here &mdash;
      it&rsquo;s just somewhere to be fashionably free.
    </p>

    <a href="${invite}"
       style="display:inline-block;background:#C9A84C;color:#0A3B2E;text-decoration:none;
              padding:14px 36px;font-size:12px;letter-spacing:2px;text-transform:uppercase;
              font-family:Georgia,serif">
      Join the Circle &#10022;
    </a>

    <p style="color:#4a6e55;font-size:12px;font-style:italic;margin:40px 0 0">
      wearfairies.com
    </p>
  </div>
</div>`;

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Fairies <hello@wearfairies.com>',
        to: [email],
        subject: "You're in the circle \u2726",
        html: html
      })
    });

    if (!sendRes.ok) {
      const detail = await sendRes.text();
      console.error('Resend error:', detail);
      return res.status(200).json({ sent: false, reason: 'send failed' });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('circle-welcome failed:', err);
    // Never let the welcome email break signup.
    return res.status(200).json({ sent: false, reason: err.message });
  }
};
