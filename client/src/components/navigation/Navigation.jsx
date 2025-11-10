import React from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import styles from './Navigation.module.css'
import { Button } from 'rsuite'
import 'rsuite/dist/rsuite.min.css'

const Navigation = () => {
  const navigate = useNavigate()
  const onLogout = () => {
    try {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_uid')
    } catch {}
    navigate('/login')
  }
  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.brand}>Thăm Dò Ý Kiến</Link>
      <div className={styles.linkContainer}>
        <ul className={styles.menu}>
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              Trang chủ
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/create"
              end
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              Tạo mới
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/own"
              end
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              Đã tạo
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/explore"
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              Khám phá
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/storage"
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              Đã thích
            </NavLink>
          </li>
        </ul>
      </div>


      <Button className={styles.logoutBtn} onClick={onLogout} appearance="subtle">
        Đăng xuất
      </Button>
    </nav>
  )
}

export default Navigation
