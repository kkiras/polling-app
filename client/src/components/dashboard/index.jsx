import React from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from '../navigation/Navigation'

const Dashboard = () => {
  return (
    <>
      <Navigation />
      <div style={{ marginLeft: 220, padding: 0 }}>
        <Outlet />
      </div>
    </>
  )
}

export default Dashboard

