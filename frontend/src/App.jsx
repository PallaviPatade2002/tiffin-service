import { useState } from 'react'
import { getSession, setSession } from './api'
import Login from './pages/Login'
import Customer from './pages/Customer'
import Admin from './pages/Admin'
import Delivery from './pages/Delivery'
import './App.css'

const HOME = { customer: Customer, admin: Admin, delivery: Delivery }

export default function App() {
  const [session, setS] = useState(getSession())

  const update = (s) => {
    setSession(s)
    setS(s)
  }

  if (!session) return <Login onLogin={update} />
  const Page = HOME[session.user.role]

  return (
    <>
      <header className="bar">
        <div className="brand">
          <span className="logo">🍱</span> Tiffin Service
        </div>
        <div className="user">
          <span className="avatar">{session.user.name.charAt(0).toUpperCase()}</span>
          <span className="who">
            {session.user.name}
            <small>{session.user.role}</small>
          </span>
          <button className="ghost sm" onClick={() => update(null)}>Logout</button>
        </div>
      </header>
      <main>
        <Page />
      </main>
    </>
  )
}
