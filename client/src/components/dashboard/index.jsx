import React from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from '../navigation/Navigation'

const Dashboard = () => {
  return (
    <div
      style={{
        height: '100vh',
        display:'flex',
        alignItems: 'stretch',
        overflow: 'hidden'
      }}
    >
      <Navigation />
      <div style={{ flex: 1, padding: 0 }}>
        <Outlet />
      </div>
    </div>
  )
}

export default Dashboard

