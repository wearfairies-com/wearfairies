// Renter Authentication Modal
// Reuses the Supabase client wardrobe.html already creates (`sb`) rather
// than spinning up a second one — two clients on the same project can
// fight over the stored session.
var currentRenter = null;

function renterClient() {
  return window.sb || null;
}

window.addEventListener('load', function() {
  // wardrobe.html builds `sb` on its own load handler; wait a tick for it.
  setTimeout(function() {
    var db = renterClient();
    if(!db) return;

    db.auth.getSession().then(function(res) {
      if(res.data && res.data.session) currentRenter = res.data.session.user;
    });

    db.auth.onAuthStateChange(function(event, session) {
      currentRenter = session ? session.user : null;
    });
  }, 100);
});

// Opening is handled by goToWantThis() in wardrobe.html, which knows
// which listing was clicked and stashes it in window.pendingListingId.

function closeRenterAuthModal() {
  document.getElementById('renterAuthOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function showRenterForm(form, btn) {
  document.querySelectorAll('.renter-auth-form').forEach(function(f){ f.classList.remove('active'); });
  document.querySelectorAll('.renter-auth-toggle-btn').forEach(function(b){ b.classList.remove('active'); });

  var target = form === 'signup' ? 'renterSignupForm' : 'renterLoginForm';
  document.getElementById(target).classList.add('active');
  if(btn) btn.classList.add('active');
}

async function handleRenterSignup(e) {
  e.preventDefault();
  
  var name = document.getElementById('renter_signup_name').value;
  var email = document.getElementById('renter_signup_email').value;
  var password = document.getElementById('renter_signup_password').value;
  var phone = document.getElementById('renter_signup_phone').value;
  var btn = e.target.querySelector('button');
  var errEl = document.getElementById('renterSignupError');
  
  btn.disabled = true;
  btn.textContent = 'Creating...';
  errEl.classList.remove('show');

  try {
    // Sign up with Supabase Auth
    var authRes = await renterClient().auth.signUp({ email, password });
    if(authRes.error) throw authRes.error;

    var userId = authRes.data.user.id;

    // signUp only returns a session if email confirmation is off. If it's
    // on, the account exists but nobody is signed in yet — and the database
    // rejects writes from anonymous visitors. Sign in explicitly so the
    // profile insert runs as the account it belongs to.
    if(!authRes.data.session){
      var signIn = await renterClient().auth.signInWithPassword({ email: email, password: password });
      if(signIn.error){
        // Almost always: Supabase is waiting on email confirmation.
        errEl.textContent = 'Account created — check your email to confirm, then sign in.';
        errEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Create Account \u2726';
        return;
      }
    }

    // Create renter profile
    var profileRes = await renterClient().from('renters').insert([{
      user_id: userId,
      name: name,
      email: email,
      phone: phone,
      created_at: new Date().toISOString()
    }]);

    if(profileRes.error) throw profileRes.error;

    currentRenter = authRes.data.user;
    closeRenterAuthModal();
    if(window.pendingListingId) openModal(window.pendingListingId);

  } catch(err) {
    errEl.textContent = err.message || 'Signup failed. Try again.';
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Create Account ✦';
  }
}

async function handleRenterLogin(e) {
  e.preventDefault();
  
  var email = document.getElementById('renter_login_email').value;
  var password = document.getElementById('renter_login_password').value;
  var btn = e.target.querySelector('button');
  var errEl = document.getElementById('renterLoginError');
  
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errEl.classList.remove('show');

  try {
    var res = await renterClient().auth.signInWithPassword({ email, password });
    if(res.error) throw res.error;

    currentRenter = res.data.user;
    closeRenterAuthModal();
    
    // Proceed with "I Want This" flow
    if(window.pendingListingId) {
      openModal(window.pendingListingId);
    }

  } catch(err) {
    errEl.textContent = err.message || 'Login failed. Try again.';
    errEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Sign In ✦';
  }
}
