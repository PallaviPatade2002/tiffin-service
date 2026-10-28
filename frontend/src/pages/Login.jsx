import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', phone: '', password: '', address: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      onLogin(await api('POST', '/auth/' + mode, f));
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="auth">
      <section className="hero">
        <div className="brand">
          <span className="logo">🍱</span> Tiffin Service
        </div>
        <div>
          <h1>Ghar jaisa khana, roz tumchya darapashi.</h1>
          <p>Order a single meal or subscribe for the month. Fresh, home-style tiffin, delivered on time.</p>
          <ul className="perks">
            <li>🥗 Fresh veg &amp; non-veg thalis</li>
            <li>📅 Monthly plans — pause anytime</li>
            <li>🛵 Live delivery status</li>
          </ul>
        </div>
        <small style={{ color: 'rgba(255,255,255,.8)' }}>© Tiffin Service</small>
      </section>

      <div className="auth-side">
        <form className="login" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="sub">{mode === 'login' ? 'Login to order your tiffin.' : 'It takes less than a minute.'}</p>
          {mode === 'register' && (
            <>
              <input placeholder="Full name" value={f.name} onChange={set('name')} required />
              <input placeholder="Delivery address" value={f.address} onChange={set('address')} required />
            </>
          )}
          <input placeholder="Phone number" value={f.phone} onChange={set('phone')} required />
          <input type="password" placeholder="Password (min 6)" value={f.password} onChange={set('password')} required />
          {err && <p className="err">{err}</p>}
          <button>{mode === 'login' ? 'Login' : 'Create account'}</button>
          <p className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'New customer? Register' : 'Have an account? Login'}
          </p>
          {mode === 'login' && (
            <p className="demo">Demo — customer 9000000003 · admin 9000000001 · delivery 9000000002 (password 123456)</p>
          )}
        </form>
      </div>
    </div>
  );
}
