import { useEffect, useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

const name = () => { try { return JSON.parse(localStorage.getItem('session')).user.name.split(' ')[0]; } catch { return ''; } };

export default function Customer() {
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState('');
  const [subs, setSubs] = useState([]);
  const [sub, setSub] = useState({ menu_item_id: '', start_date: today(), end_date: today() });

  const load = () => {
    api('GET', '/menu').then(setMenu);
    api('GET', '/orders').then(setOrders);
    api('GET', '/subscriptions').then(setSubs);
  };

  const cancel = (id) => api('POST', `/orders/${id}/cancel`).then(load).catch((e) => setMsg(e.message));

  const subscribe = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('POST', '/subscriptions', { ...sub, menu_item_id: Number(sub.menu_item_id) });
      setMsg('Subscription started ✔');
      load();
    } catch (e2) {
      setMsg(e2.message);
    }
  };

  const setSubStatus = (id, status) =>
    api('PATCH', '/subscriptions/' + id, { status }).then(load).catch((e) => setMsg(e.message));
  useEffect(load, []);

  const change = (id, d) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }));
  const lines = menu.filter((m) => cart[m.id] > 0);
  const total = lines.reduce((s, m) => s + m.price * cart[m.id], 0);

  const place = async () => {
    setMsg('');
    try {
      await api('POST', '/orders', {
        order_date: date,
        items: lines.map((m) => ({ menu_item_id: m.id, qty: cart[m.id] })),
      });
      setCart({});
      setMsg('Order placed ✔');
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <>
      <h2 className="greet">
        Namaskar, {name()} 👋
        <small>What would you like to eat today?</small>
      </h2>
      <section className="card">
        <h2>Today&apos;s menu</h2>
        <div className="menu-grid">
          {menu.map((m) => (
            <div className={'dish' + (cart[m.id] ? ' picked' : '')} key={m.id}>
              <div className="top">
                <h3>{m.name}</h3>
                <span className={'veg' + (m.is_veg ? '' : ' non')} title={m.is_veg ? 'Veg' : 'Non-veg'} />
              </div>
              <small style={{ textTransform: 'capitalize' }}>{m.meal_type}</small>
              <p>{m.description}</p>
              <div className="foot">
                <span className="amt">₹{m.price}</span>
                <span className="stepper">
                  <button onClick={() => change(m.id, -1)}>−</button>
                  <span>{cart[m.id] || 0}</span>
                  <button onClick={() => change(m.id, 1)}>+</button>
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="checkout">
          <label>
            Delivery date <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button disabled={!lines.length} onClick={place}>
            Place order · ₹{total}
          </button>
        </div>
        {msg && <p className="msg">{msg}</p>}
      </section>

      <section className="card">
        <h2>Monthly subscription</h2>
        <form className="row addform" style={{ paddingTop: 0 }} onSubmit={subscribe}>
          <select value={sub.menu_item_id} onChange={(e) => setSub({ ...sub, menu_item_id: e.target.value })} required>
            <option value="" disabled>Choose tiffin</option>
            {menu.map((m) => <option key={m.id} value={m.id}>{m.name} · ₹{m.price}/day</option>)}
          </select>
          <input type="date" value={sub.start_date} min={today()} onChange={(e) => setSub({ ...sub, start_date: e.target.value })} required />
          <input type="date" value={sub.end_date} min={sub.start_date} onChange={(e) => setSub({ ...sub, end_date: e.target.value })} required />
          <button>Subscribe</button>
        </form>
        {subs.map((s) => (
          <div className="row" key={s.id}>
            <div>
              <b>{s.item_name}</b> · ₹{s.price}/day
              <br />
              <small>{s.start_date} → {s.end_date}</small>
            </div>
            <div className="actions">
              <span className={'tag ' + s.status}>{s.status}</span>
              {s.status === 'active' && <button className="ghost sm" onClick={() => setSubStatus(s.id, 'paused')}>Pause</button>}
              {s.status === 'paused' && <button className="ghost sm" onClick={() => setSubStatus(s.id, 'active')}>Resume</button>}
              {s.status !== 'ended' && <button className="ghost sm" onClick={() => setSubStatus(s.id, 'ended')}>End</button>}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>My orders <span className="count">{orders.length}</span></h2>
        {orders.length === 0 && <p className="empty">No orders yet — pick something tasty above 🍛</p>}
        {orders.map((o) => (
          <div className="row" key={o.id}>
            <div>
              <b>#{o.id}</b> · {o.order_date}
              <br />
              <small>{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</small>
            </div>
            <div className="actions">
              <span className="price">₹{o.total}</span>
              <span className={'tag ' + o.status}>{o.status.replaceAll('_', ' ')}</span>
              <span className={'tag ' + o.payment_status}>{o.payment_status}</span>
              {o.status === 'pending' && <button className="ghost sm" onClick={() => cancel(o.id)}>Cancel</button>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
