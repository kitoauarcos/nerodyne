/* ===========================================================================
   members.js — email-code (OTP) auth via Supabase + the gated Vortex
   positions page. No passwords anywhere: users request a 6-digit code by
   email each time they sign in. Only registered emails receive a code
   (shouldCreateUser:false on login); registration happens on signup.html.
   The publishable key below is safe to expose — data access is protected
   by row-level security rules in the database, not by this key.
   =========================================================================== */
(function () {
  const SUPABASE_URL = 'https://rykiqxkxaebgugkjwsrv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_J_6D1UcQvRZ13_3RlVIhyg_9NBh4f4M';
  if (!window.supabase) { console.error('supabase-js failed to load'); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
  const msg = (el, text, isError) => {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : 'var(--text)';
    show(el, !!text);
  };
  const friendly = (error) => {
    const m = (error && error.message) || '';
    if (/signups not allowed/i.test(m)) return 'This email is not registered. Please request access first.';
    if (/rate limit/i.test(m)) return 'Too many emails sent just now. Please wait a few minutes and try again.';
    if (/expired|invalid/i.test(m)) return 'That code is invalid or has expired. Request a new one.';
    return m || 'Something went wrong. Please try again.';
  };

  /* ---- single active session: each sign-in stamps a fresh token into the
     profile; any other device holding an older stamp is signed out. ---- */
  const DEVICE_KEY = 'nerodyneDeviceSession';
  async function stampSession(userId) {
    const tok = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
    try { localStorage.setItem(DEVICE_KEY, tok); } catch (e) {}
    await sb.from('profiles').update({ current_session: tok }).eq('id', userId);
    return tok;
  }
  function sessionIsCurrent(profile) {
    let mine = null;
    try { mine = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    return !profile.current_session || profile.current_session === mine;
  }

  /* =========================================================================
     SIGNUP PAGE — registers the email (creates the user) and verifies it
     with a one-time code in the same flow.
     ========================================================================= */
  const suForm = $('emailForm');
  if (suForm && $('signupCodeRow')) {
    let pendingEmail = null;
    suForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('email').value.trim().toLowerCase();
      const name = $('name').value.trim();
      msg($('signupMsg'), 'Sending your verification email…');
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { name },
          emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + 'positions.html'
        }
      });
      if (error) { msg($('signupMsg'), friendly(error), true); return; }
      pendingEmail = email;
      msg($('signupMsg'), 'We emailed ' + email + '. Enter the code below if the email contains one, or simply click the sign-in link in the email.');
      show($('signupCodeRow'), true);
      $('signupCode').focus();
    });
    $('signupVerify').addEventListener('click', async () => {
      if (!pendingEmail) return;
      const token = $('signupCode').value.trim();
      msg($('signupMsg'), 'Checking the code…');
      const { data, error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      if (error) { msg($('signupMsg'), friendly(error), true); return; }
      if (data && data.user) await stampSession(data.user.id);
      show($('signupCodeRow'), false);
      msg($('signupMsg'), '');
      $('okDetail').textContent = 'Your registration is confirmed. You now have access to the members area, where the current Vortex positions are published.';
      show($('okMsg'), true);
      const link = $('okLink'); if (link) show(link, true);
      $('okMsg').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* =========================================================================
     MEMBERS PAGE — login with emailed code, then show the positions with a
     per-user watermark (email + member number) for traceability.
     ========================================================================= */
  const gate = $('memberGate');
  if (gate) {
    let pendingEmail = null;
    // captured before supabase-js strips the auth hash: arriving via the
    // emailed sign-in link is a fresh login and must claim the session slot
    const cameViaLink = /access_token=|type=(magiclink|email|signup)/.test(location.hash);

    async function init() {
      const { data: { session } } = await sb.auth.getSession();
      if (session) await enter(session.user);
      else showLogin();
    }

    function showLogin() {
      show($('authEmail'), true); show($('authCode'), false); show($('posArea'), false);
    }

    $('sendCode').addEventListener('click', async () => {
      const email = $('loginEmail').value.trim().toLowerCase();
      if (!email) { msg($('authMsg'), 'Enter your registered email address.', true); return; }
      msg($('authMsg'), 'Sending your sign-in email…');
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,   // only registered users receive a code
          emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + 'positions.html'
        }
      });
      if (error) { msg($('authMsg'), friendly(error), true); return; }
      pendingEmail = email;
      msg($('authMsg'), 'We emailed ' + email + '. Enter the code below if the email contains one, or simply click the sign-in link in the email. It expires in a few minutes.');
      show($('authEmail'), false); show($('authCode'), true);
      $('loginCode').focus();
    });

    $('verifyCode').addEventListener('click', async () => {
      const token = $('loginCode').value.trim();
      msg($('authMsg'), 'Checking the code…');
      const { data, error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      if (error) { msg($('authMsg'), friendly(error), true); return; }
      msg($('authMsg'), '');
      await stampSession(data.user.id);
      await enter(data.user);
    });

    $('backToEmail').addEventListener('click', () => { showLogin(); msg($('authMsg'), ''); });
    $('signOut').addEventListener('click', async () => { await sb.auth.signOut(); showLogin(); });

    async function enter(user) {
      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
      // fresh arrival on this device (e.g. via the emailed sign-in link):
      // claim the single active session before the check below
      let mine = null;
      try { mine = localStorage.getItem(DEVICE_KEY); } catch (e) {}
      if (!mine || cameViaLink) {
        const tok = await stampSession(user.id);
        if (profile) profile.current_session = tok;
      }
      if (profile && !sessionIsCurrent(profile)) {
        await sb.auth.signOut();
        showLogin();
        msg($('authMsg'), 'This account was signed in on another device, which ended this session. Accounts are limited to one active session.', true);
        return;
      }
      const memberNo = profile ? String(profile.customer_no).padStart(4, '0') : '0000';
      const ident = user.email + ' · member #' + memberNo;

      const { data: rows, error } = await sb.from('positions')
        .select('ticker,company,weight_pct,as_of,note')
        .eq('model', 'vortex')
        .order('weight_pct', { ascending: false });
      if (error || !rows || !rows.length) {
        msg($('authMsg'), 'Could not load the positions right now. Please try again shortly.', true);
        return;
      }

      $('posAsOf').textContent = 'Rebalance of ' + rows[0].as_of;
      $('posRows').innerHTML = rows.map(r =>
        '<tr><td>' + r.ticker + '</td><td style="text-align:left;">' + r.company + '</td><td>' +
        Number(r.weight_pct).toFixed(1) + '%</td></tr>').join('');

      // per-user watermark: tiled identity over the table + a printed license line
      const wm = $('posWatermark');
      wm.innerHTML = '';
      for (let i = 0; i < 24; i++) {
        const s = document.createElement('span');
        s.textContent = ident;
        wm.appendChild(s);
      }
      $('posLicense').textContent = 'Licensed to ' + ident + '. Personal use only; redistribution ends access.';

      show($('authEmail'), false); show($('authCode'), false); show($('posArea'), true);
    }

    init();
  }
})();
