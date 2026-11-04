(async () => {
  await noamReady;
  let st = await noam.invoke('account:status'); let tab = 'signup', busy = false;
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  function strength(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++; return Math.min(4, s); }
  function render() {
    const root = $('#root');
    if (!st.server) { root.innerHTML = `<div class="page-head"><h1>👤 NoamBrowser Account</h1></div>
      <div class="box"><h2>The account server isn’t set up yet</h2><p class="sub">Accounts need a small server. If you run one (see <b>server/README.md</b> in NoamBrowser’s code), enter its address:</p>
      <input class="field" id="srv" placeholder="https://noambrowser-accounts.yourname.workers.dev"><button class="btn primary wide" id="srv-save">Use this server</button><div class="msg" id="m"></div></div>`;
      $('#srv-save').onclick = async () => { try { st = await noam.invoke('account:server', $('#srv').value); render(); } catch (e) { $('#m').className = 'msg err'; $('#m').textContent = clean(e); } };
      return; }
    if (!st.user) return signedOut(root);
    const dot = st.state === 'syncing' ? 'busy' : st.state === 'error' ? 'bad' : '';
    root.innerHTML = `<div class="box hero"><div class="av">${esc(st.user[0].toUpperCase())}</div><div style="flex:1"><h1>${esc(st.user)}</h1><p><span class="state"><i class="dot ${dot}"></i>${st.state === 'syncing' ? 'Syncing…' : st.state === 'error' ? 'Sync problem' : `Synced ${ago(st.last)}`}</span></p></div><button class="btn" id="now">🔄 Sync now</button></div>
      ${st.error ? `<div class="warn">⚠️ ${esc(st.error)}</div>` : ''}
      <div class="box"><h2>What syncs</h2><p class="sub">Everything is locked with your password before it leaves this computer. The server can’t read any of it.</p>
        <div class="row"><div class="t"><b>⭐ Bookmarks, settings and themes</b><span>Always</span></div><span class="tag">On</span></div>
        <div class="row"><div class="t"><b>🔑 Passwords</b><span>Your saved logins</span></div><button class="switch" role="switch" data-k="passwords" aria-checked="${st.passwords}"></button></div>
        <div class="row"><div class="t"><b>🕘 History</b><span>Your most recent 3,000 pages</span></div><button class="switch" role="switch" data-k="history" aria-checked="${st.history}"></button></div>
        <div class="row"><div class="t"><b>💬 NoamChat</b><span>Your chat identity, friends, groups and messages (photos stay on each computer)</span></div><button class="switch" role="switch" data-k="chat" aria-checked="${st.chat}"></button></div></div>
      <div class="box"><h2>NoamChat</h2><div class="row"><div class="t"><b>🔎 Let friends find me by my username</b><span>Friends can add you in NoamChat by typing @${esc(st.user)}</span></div><button class="switch" role="switch" data-k="findable" aria-checked="${st.findable !== false}"></button></div></div>
      <div class="box"><h2>Your computers</h2>${(st.devices || []).length ? st.devices.map((d) => `<div class="dev"><span class="ic">${/Mac/.test(d.name) ? '🍎' : /Linux/.test(d.name) ? '🐧' : '💻'}</span><span class="n">${esc(d.name || d.device)}${d.me ? '<span class="tag">This computer</span>' : ''}<small>Last synced ${ago(d.updated)}</small></span>${d.me ? '' : `<button class="btn ghost" data-rm="${esc(d.device)}">Remove</button>`}</div>`).join('') : '<p class="sub">Syncing for the first time…</p>'}</div>
      <div class="box"><h2>Account</h2><div class="acts"><button class="btn" id="pw">🔒 Change password</button><button class="btn" id="out">Sign out</button><button class="btn ghost" id="del" style="color:var(--danger)">Delete account…</button></div></div>`;
    $('#now').onclick = async () => { st = await noam.invoke('account:sync'); render(); };
    $$('[data-k]').forEach((b) => (b.onclick = async () => { st = await noam.invoke('account:set', { [b.dataset.k]: b.getAttribute('aria-checked') !== 'true' }); render(); }));
    $$('[data-rm]').forEach((b) => (b.onclick = async () => { if (confirm('Remove this computer from your account? Its synced copy is deleted (it can sign in again later).')) { st = await noam.invoke('account:remove-device', b.dataset.rm); render(); } }));
    $('#out').onclick = async () => { if (!confirm('Sign out on this computer? Your bookmarks, passwords and chats stay here; they just stop syncing.')) return; st = await noam.invoke('account:signout', { forget: true }); render(); };
    $('#pw').onclick = () => modal('Change password', [['current', 'Current password', 'password'], ['password', 'New password', 'password'], ['confirm', 'New password again', 'password']], 'Change password', async (v) => { if (v.password !== v.confirm) throw new Error('The new passwords don’t match.'); st = await noam.invoke('account:password', v); return '✅ Password changed. Your other computers will ask you to sign in again.'; });
    $('#del').onclick = () => modal('Delete your account', [['password', 'Type your password to confirm', 'password']], 'Delete my account forever', async (v) => { st = await noam.invoke('account:delete', v); return null; }, 'Your account and everything synced to the server is deleted. The copies on your computers stay.');
  }
  function signedOut(root) {
    root.innerHTML = `<div class="page-head"><h1>👤 NoamBrowser Account</h1></div>
      <div class="box"><div class="tabs"><button data-t="signup" class="${tab === 'signup' ? 'on' : ''}">Create account</button><button data-t="signin" class="${tab === 'signin' ? 'on' : ''}">Sign in</button></div>
        <form id="f"><label class="l">Username</label><input class="field" id="user" autocomplete="username" maxlength="32" placeholder="e.g. noam" spellcheck="false">
        <label class="l">Password</label><input class="field" id="pass" type="password" autocomplete="${tab === 'signup' ? 'new-password' : 'current-password'}" placeholder="At least 8 characters">
        ${tab === 'signup' ? '<div class="meter"><i id="mt"></i></div><label class="l">Password again</label><input class="field" id="pass2" type="password" autocomplete="new-password">' : ''}
        <button class="btn primary wide" id="go">${tab === 'signup' ? 'Create my account' : 'Sign in'}</button><div class="msg" id="m"></div></form>
        ${tab === 'signup' ? '<div class="warn">🔑 <b>Remember your password!</b> It locks your data, so nobody (not even NoamBrowser) can reset it. If you forget it, you can start a new account, but the synced copy is lost.</div>' : ''}</div>
      <div class="box"><h2>Why make an account?</h2><ul class="points">
        <li><b>💻</b><span>Sign in on any computer and get your bookmarks, passwords, settings, history and NoamChat.</span></li>
        <li><b>🔒</b><span>Zero-knowledge: everything is locked with your password on your computer first. The server only sees scrambled data.</span></li>
        <li><b>💬</b><span>NoamChat messages reach friends even when they’re offline. They’re collected next time they open NoamBrowser.</span></li>
        <li><b>🆓</b><span>Free. No email, no phone number, no ads.</span></li></ul></div>`;
    $$('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render(); }));
    const pass = $('#pass'); if ($('#mt')) pass.oninput = () => { const s = strength(pass.value); $('#mt').style.width = (s + 1) * 20 + '%'; $('#mt').style.background = ['#e5484d', '#ee7a2e', '#d9a21b', '#3fae5a', '#14a89b'][s]; };
    $('#user').focus();
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); if (busy) return; const m = $('#m'); m.className = 'msg';
      const user = $('#user').value.trim(), password = pass.value;
      if (tab === 'signup' && password !== $('#pass2').value) { m.className = 'msg err'; m.textContent = 'The passwords don’t match.'; return; }
      busy = true; $('#go').disabled = true; m.textContent = tab === 'signup' ? 'Creating your account…' : 'Signing in…';
      try { st = await noam.invoke(tab === 'signup' ? 'account:signup' : 'account:signin', { user, password }); render(); }
      catch (err) { m.className = 'msg err'; m.textContent = clean(err); $('#go').disabled = false; }
      busy = false;
    };
  }
  function modal(title, fields, btn, fn, note) {
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<form class="box"><h2>${esc(title)}</h2>${note ? `<p class="sub">${esc(note)}</p>` : ''}${fields.map(([k, l, t]) => `<label class="l">${esc(l)}</label><input class="field" name="${k}" type="${t}">`).join('')}<div class="acts" style="margin-top:14px"><button class="btn primary">${esc(btn)}</button><button type="button" class="btn ghost" data-x>Cancel</button></div><div class="msg"></div></form>`;
    document.body.appendChild(d); d.querySelector('input').focus();
    d.querySelector('[data-x]').onclick = () => d.remove();
    d.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const v = Object.fromEntries(fields.map(([k]) => [k, d.querySelector(`[name=${k}]`).value])); const m = d.querySelector('.msg'); m.className = 'msg'; m.textContent = 'Working…'; try { const ok = await fn(v); if (ok) { m.className = 'msg ok'; m.textContent = ok; setTimeout(() => { d.remove(); render(); }, 1600); } else { d.remove(); render(); } } catch (err) { m.className = 'msg err'; m.textContent = clean(err); } };
  }
  noam.on('account', (s) => { st = s; if (!document.querySelector('.modal') && !document.activeElement.matches('input')) render(); });
  render();
})();
