import { useEffect, useState } from 'react';
import { api } from '../api';

const STATUSES = ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

export default function Admin() {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [boys, setBoys] = useState([]);
  const [report, setReport] = useState(null);
  const [item, setItem] = useState({ name: '', price: '', meal_type: 'lunch', description: '' });
  const [err, setErr] = useState('');
  const [subs, setSubs] = useState([]);
  const [genDate, setGenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [info, setInfo] = useState('');
  const [boy, setBoy] = useState({ name: '', phone: '', password: '' });

  const load = () => {
    api('GET', '/orders').then(setOrders);
    api('GET', '/menu/all').then(setMenu);
    api('GET', '/delivery-boys').then(setBoys);
    api('GET', '/reports/summary').then(setReport);
    api('GET', '/subscriptions').then(setSubs);
  };

  const generate = () =>
    api('POST', '/subscriptions/generate', { date: genDate })
      .then((r) => {
        setInfo(`Created ${r.created} order(s) for ${genDate}` + (r.skipped_no_address ? `, ${r.skipped_no_address} skipped (no address)` : ''));
        load();
      })
      .catch((e) => setErr(e.message));

  const addBoy = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('POST', '/delivery-boys', boy);
      setBoy({ name: '', phone: '', password: '' });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  useEffect(load, []);

  const patch = (id, body) => api('PATCH', '/orders/' + id, body).then(load).catch((e) => setErr(e.message));

  const addItem = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('POST', '/menu', { ...item, price: Number(item.price) });
      setItem({ name: '', price: '', meal_type: 'lunch', description: '' });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <>
      {err && <p className="err">{err}</p>}
      {report && (
        <>
        <section className="stats">
          <div className="stat"><span>Orders · {report.month}</span><b>{report.orders}</b></div>
          <div className="stat"><span>Income (paid)</span><b>₹{report.income}</b></div>
          <div className="stat"><span>Pending payments</span><b>₹{report.pending_payments}</b></div>
        </section>
        <div style={{ height: 20 }} />
        </>
      )}

      <section className="card">
        <h2>Orders <span className="count">{orders.length}</span></h2>
        {orders.length === 0 && <p className="empty">No orders yet.</p>}
        {orders.map((o) => (
          <div className="row" key={o.id}>
            <div>
              <b>#{o.id}</b> · {o.order_date} · <b>{o.customer_name}</b> ({o.customer_phone})
              <br />
              <small>{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')} — {o.address}</small>
            </div>
            <div className="actions">
              <span className="price">₹{o.total}</span>
              <select value={o.status} onChange={(e) => patch(o.id, { status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
              </select>
              <select value={o.delivery_boy_id || ''} onChange={(e) => patch(o.id, { delivery_boy_id: Number(e.target.value) })}>
                <option value="" disabled>Assign delivery</option>
                {boys.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button className={'sm ' + (o.payment_status === 'paid' ? 'ok' : '')} onClick={() => patch(o.id, { payment_status: o.payment_status === 'paid' ? 'unpaid' : 'paid' })}>
                {o.payment_status === 'paid' ? '✔ Paid' : 'Mark paid'}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Subscriptions</h2>
        <div className="row">
          <label>
            Date <input type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)} />
          </label>
          <button className="sm" onClick={generate}>Generate orders for this date</button>
        </div>
        {info && <p>{info}</p>}
        {subs.length === 0 && <p className="empty">No subscriptions yet.</p>}
        {subs.map((s) => (
          <div className="row" key={s.id}>
            <div>
              <b>{s.customer_name}</b> ({s.customer_phone}) · {s.item_name}
              <br />
              <small>{s.start_date} → {s.end_date}</small>
            </div>
            <div className="actions">
              <span className={'tag ' + s.status}>{s.status}</span>
              {s.status !== 'ended' && (
                <button className="ghost sm" onClick={() => api('PATCH', '/subscriptions/' + s.id, { status: s.status === 'active' ? 'paused' : 'active' }).then(load)}>
                  {s.status === 'active' ? 'Pause' : 'Resume'}
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Delivery staff</h2>
        {boys.map((b) => <div className="row" key={b.id}><span>{b.name}</span><span>{b.phone}</span></div>)}
        <form className="row addform" onSubmit={addBoy}>
          <input placeholder="Name" value={boy.name} onChange={(e) => setBoy({ ...boy, name: e.target.value })} required />
          <input placeholder="Phone" value={boy.phone} onChange={(e) => setBoy({ ...boy, phone: e.target.value })} required />
          <input placeholder="Password (min 6)" type="password" value={boy.password} onChange={(e) => setBoy({ ...boy, password: e.target.value })} required />
          <button>Add delivery boy</button>
        </form>
      </section>

      <section className="card">
        <h2>Menu</h2>
        {menu.map((m) => (
          <div className="row" key={m.id}>
            <span><b>{m.name}</b> <small>({m.meal_type}{m.available ? '' : ' · hidden'})</small></span>
            <span>
              ₹{m.price}{' '}
              <button className="ghost sm" onClick={() => api('PUT', '/menu/' + m.id, { available: !m.available }).then(load)}>
                {m.available ? 'Hide' : 'Unhide'}
              </button>
            </span>
          </div>
        ))}
        <form className="row addform" onSubmit={addItem}>
          <input placeholder="Item name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required />
          <input placeholder="Price" type="number" min="0" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} required />
          <select value={item.meal_type} onChange={(e) => setItem({ ...item, meal_type: e.target.value })}>
            <option>breakfast</option><option>lunch</option><option>dinner</option>
          </select>
          <button>Add item</button>
        </form>
      </section>
    </>
  );
}
