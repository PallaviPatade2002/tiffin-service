import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Delivery() {
  const [orders, setOrders] = useState([]);
  const load = () => api('GET', '/orders').then(setOrders);
  useEffect(() => {
    load();
  }, []);

  const mark = (id, status) => api('PATCH', '/orders/' + id, { status }).then(load);

  return (
    <section className="card">
      <h2>My deliveries <span className="count">{orders.length}</span></h2>
      {orders.length === 0 && <p className="empty">No deliveries assigned yet 🛵</p>}
      {orders.map((o) => (
        <div className="row" key={o.id}>
          <div>
            <b>#{o.id}</b> · {o.order_date} · <b>{o.customer_name}</b> ({o.customer_phone})
            <br />
            <small>{o.address}</small>
            <br />
            <small>{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</small>
          </div>
          <div className="actions">
            <span className={'tag ' + o.status}>{o.status.replaceAll('_', ' ')}</span>
            {o.status === 'preparing' || o.status === 'pending' ? (
              <button onClick={() => mark(o.id, 'out_for_delivery')}>Picked up</button>
            ) : null}
            {o.status === 'out_for_delivery' && <button onClick={() => mark(o.id, 'delivered')}>Delivered</button>}
          </div>
        </div>
      ))}
    </section>
  );
}
