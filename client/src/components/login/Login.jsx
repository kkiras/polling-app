import React, { useMemo, useState, useEffect } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import {
  Button,
  ButtonToolbar,
  Input,
  Message,
  Panel,
  toaster,
  Divider,
} from 'rsuite'
import 'rsuite/dist/rsuite.min.css'
import styles from './Login.module.css'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const Login = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [search] = useSearchParams()

  const initialMode = useMemo(() => {
    if (location.pathname.includes('reset-password')) return 'reset'
    if (location.pathname.includes('forgot-password')) return 'forgot'
    return 'login'
  }, [location.pathname])

  const [mode, setMode] = useState(initialMode)
  useEffect(() => setMode(initialMode), [initialMode])

  // Shared states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset password states
  const uid = search.get('uid') || ''
  const token = search.get('token') || ''
  const [newPassword, setNewPassword] = useState('')

  async function onLogin() {
    setLoading(true)
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, { email, password })
      toaster.push(<Message type="success">Đăng nhập thành công</Message>, { duration: 3000 })
      // Save token for later API calls
      localStorage.setItem('auth_token', data.token)
      if (data.uid) localStorage.setItem('auth_uid', data.uid)
      navigate('/create')
    } catch (err) {
      const msg = err?.response?.data?.message || 'Đăng nhập thất bại'
      toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
    } finally {
      setLoading(false)
    }
  }

  async function onRegister() {
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/auth/register`, { email, password })
      toaster.push(<Message type="success">Đăng ký thành công. Vui lòng đăng nhập.</Message>, { duration: 3500 })
      setMode('login')
    } catch (err) {
      const msg = err?.response?.data?.message || 'Đăng ký thất bại'
      toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
    } finally {
      setLoading(false)
    }
  }

  async function onForgot() {
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email })
      toaster.push(
        <Message type="info">Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.</Message>,
        { duration: 5000 }
      )
      setMode('login')
    } catch (_err) {
      // Always show safe response
      toaster.push(
        <Message type="info">Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.</Message>,
        { duration: 5000 }
      )
    } finally {
      setLoading(false)
    }
  }

  async function onReset() {
    if (!uid || !token) {
      toaster.push(<Message type="error">Thiếu token hoặc uid</Message>, { duration: 4000 })
      return
    }
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, { uid, token, newPassword })
      toaster.push(<Message type="success">Đặt lại mật khẩu thành công</Message>, { duration: 3500 })
      setMode('login')
      navigate('/login')
    } catch (err) {
      const msg = err?.response?.data?.message || 'Đặt lại mật khẩu thất bại'
      toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles._page}>
      <div className={styles._panel}>
        <div className={styles._title}>
          {mode === 'login' && 'Đăng nhập'}
          {mode === 'register' && 'Tạo tài khoản'}
          {mode === 'forgot' && 'Quên mật khẩu'}
          {mode === 'reset' && 'Đặt lại mật khẩu'}
        </div>
        <div className={styles._muted}>
          {mode === 'login' && 'Chào mừng trở lại. Vui lòng đăng nhập để tiếp tục.'}
          {mode === 'register' && 'Tạo tài khoản mới để sử dụng ứng dụng.'}
          {mode === 'forgot' && 'Nhập email để nhận liên kết đặt lại mật khẩu.'}
          {mode === 'reset' && 'Nhập mật khẩu mới cho tài khoản của bạn.'}
        </div>

        {mode !== 'reset' && (
          <>
            <Input
              className={styles._full}
              placeholder="Email"
              value={email}
              onChange={setEmail}
              type="email"
            />
            {(mode === 'login' || mode === 'register') && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Input
                  className={styles._full}
                  placeholder="Mật khẩu"
                  value={password}
                  onChange={setPassword}
                  type="password"
                />
              </>
            )}
            <ButtonToolbar className={styles._actions}>
              {mode === 'login' && (
                <>
                  <Button appearance="primary" loading={loading} onClick={onLogin} className={styles._full}>
                    Đăng nhập
                  </Button>
                  <Button appearance="link" onClick={() => setMode('forgot')}>
                    Quên mật khẩu?
                  </Button>
                </>
              )}
              {mode === 'register' && (
                <Button appearance="primary" loading={loading} onClick={onRegister} className={styles._full}>
                  Đăng ký
                </Button>
              )}
              {mode === 'forgot' && (
                <Button appearance="primary" loading={loading} onClick={onForgot} className={styles._full}>
                  Gửi liên kết đặt lại
                </Button>
              )}
            </ButtonToolbar>

            <div className={styles._switch}>
              {mode !== 'login' && (
                <Button size="sm" appearance="subtle" onClick={() => setMode('login')}>
                    Đăng nhập
                </Button>
              )}
              {mode !== 'register' && mode !== 'forgot' && (
                <Button size="sm" appearance="subtle" onClick={() => setMode('register')}>
                  Tạo tài khoản mới
                </Button>
              )}
            </div>
          </>
        )}

        {mode === 'reset' && (
          <>
            <Input
              className={styles._full}
              placeholder="Mật khẩu mới"
              value={newPassword}
              onChange={setNewPassword}
              type="password"
            />
            <ButtonToolbar className={styles._actions}>
              <Button appearance="primary" loading={loading} onClick={onReset} className={styles._full}>
                Đặt lại mật khẩu
              </Button>
            </ButtonToolbar>
            <div className={styles._switch}>
              <Button size="sm" appearance="subtle" onClick={() => navigate('/login')}>
                Quay về đăng nhập
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Login
