import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Poll from './components/dashboard/poll/Poll'
import Explore from './components/dashboard/explore/Explore'
import Storage from './components/dashboard/storage/Storage'
import MyPoll from './components/dashboard/my-poll/MyPoll'
import Login from './components/login/Login'
import Dashboard from './components/dashboard'

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<Login />} />
        <Route path="/reset-password" element={<Login />} />

        <Route path="/dashboard/" element={<Dashboard />}>
          <Route index element={<Explore />} />
          <Route path="create" element={<Poll />} />
          <Route path="explore" element={<Explore />} />
          <Route path="storage" element={<Storage />} />
          <Route path="own" element={<MyPoll />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
