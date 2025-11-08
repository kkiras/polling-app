import React, { useEffect, useMemo, useRef, useState } from 'react'
import styles from './Explore.module.css'
import axios from 'axios'
import { Message, toaster } from 'rsuite'
import 'rsuite/dist/rsuite.min.css'
import { io } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function Explore() {
  const [selected, setSelected] = useState()
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(false)
  const lastSeqRef = useRef(0)

  useEffect(() => {
    const fetchExplore = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('auth_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const { data } = await axios.get(`${API_BASE}/polls/explore`, { headers })
        setPolls(data)
        const maxSeq = data.reduce((m, p) => Math.max(m, p.serverSeq || 0), 0)
        lastSeqRef.current = maxSeq
      } catch (err) {
        const msg = err?.response?.data?.message || 'Không thể tải danh sách'
        toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
      } finally {
        setLoading(false)
      }
    }
    fetchExplore()
  }, [])

  const handleVote = async (pollId, optionIndex, isMine, hasVoted) => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      toaster.push(<Message type="warning">Vui lòng đăng nhập để bình chọn</Message>, { duration: 3500 })
      return
    }
    if (isMine) return
    if (hasVoted) return
    try {
      const { data } = await axios.post(
        `${API_BASE}/polls/${pollId}/vote`,
        { optionIndex },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      // Update local state with returned poll
      setPolls(prev => prev.map(p => (p._id === pollId ? { ...p, ...data.poll, isMine: p.isMine, hasVoted: true } : p)))
      toaster.push(<Message type="success">Đã ghi nhận bình chọn</Message>, { duration: 2500 })
    } catch (err) {
      const msg = err?.response?.data?.message || 'Bình chọn thất bại'
      toaster.push(<Message type="error">{msg}</Message>, { duration: 3500 })
    }
  }

  // Socket.IO live updates + reconnect backfill
  useEffect(() => {
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socket.on('connect', async () => {
      // Reconnect backfill: fetch polls after last known serverSeq
      const after = lastSeqRef.current || 0
      try {
        const token = localStorage.getItem('auth_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const { data } = await axios.get(`${API_BASE}/polls/explore`, { params: { after }, headers })
        if (Array.isArray(data) && data.length) {
          setPolls(prev => {
            // merge new items, avoid duplicates by _id
            const map = new Map(prev.map(p => [p._id, p]))
            data.forEach(item => map.set(item._id, item))
            const arr = Array.from(map.values())
            // keep recent first by createdAt desc
            arr.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
            return arr
          })
          const maxSeq = data.reduce((m, p) => Math.max(m, p.serverSeq || 0, after), after)
          lastSeqRef.current = maxSeq
        }
      } catch (_) {}
    })

    socket.on('polls:new', (p) => {
      // Ignore if expired already
      if (!p || new Date(p.expiresAt) <= new Date()) return
      // Compute client flags
      const myUid = localStorage.getItem('auth_uid')
      p.isMine = myUid ? String(p.userId) === String(myUid) : false
      p.hasVoted = false
      // Update lastSeq
      if (p.serverSeq && p.serverSeq > (lastSeqRef.current || 0)) {
        lastSeqRef.current = p.serverSeq
      }
      // Merge into list
      setPolls(prev => {
        if (prev.some(x => x._id === p._id)) return prev
        const arr = [p, ...prev]
        arr.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
        return arr
      })
    })

    socket.on('polls:update', (p) => {
      if (!p) return
      setPolls(prev => prev.map(item => item._id === p._id ? { ...item, ...p, isMine: item.isMine, hasVoted: item.hasVoted } : item))
    })

    return () => socket.close()
  }, [])

  return (
    <div className={styles.page}>
        <div className={styles.inner}>
            <h2 className={styles.heading}>Các cuộc thăm dò gần đây</h2>

            <div className={styles.pollsContainer}>
              {polls.map((poll) => (
                  <div key={poll._id} className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.title}>{poll.question}</div>
                        {poll.isMine && (
                          <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>(Poll của bạn)</span>
                        )}
                    </div>

                    <div className={styles.cardBody}>
                        <div className={styles.subtle}>{new Date(poll.createdAt).toLocaleString()}</div>
                        <div className={styles.optionContainer}>
                          {poll.options.map((opt, i) => (
                            <div 
                              key={i}
                              className={`${styles.optionBox} ${selected === opt.text ? styles.optionSelected : '' }`}
                              onClick={() => handleVote(poll._id, i, poll.isMine, poll.hasVoted)}
                              style={{ opacity: poll.isMine || poll.hasVoted ? 0.6 : 1, cursor: poll.isMine || poll.hasVoted ? 'not-allowed' : 'pointer' }}
                            >
                                {opt.text}
                            </div>
                          ))}
                        </div>
                        <div className={styles.voteText}>
                          <IconVoted size={20} />
                          <span>{poll.options.reduce((sum, o) => sum + (o.votes || 0), 0)}</span>
                        </div>
                    </div>

                    <div className={styles.cardFooter}>
                        <div
                          className={styles.footerItem}
                          onClick={async () => {
                            if (poll.isMine) return;
                            const token = localStorage.getItem('auth_token');
                            if (!token) {
                              toaster.push(<Message type="warning">Vui lòng đăng nhập để lưu trữ</Message>, { duration: 3500 })
                              return;
                            }
                            try {
                              const { data } = await axios.post(
                                `${API_BASE}/polls/${poll._id}/save`,
                                {},
                                { headers: { Authorization: `Bearer ${token}` } }
                              );
                              setPolls(prev => prev.map(p => p._id === poll._id ? { ...p, likesCount: data.likesCount ?? (p.likesCount + 1) } : p))
                              toaster.push(<Message type="success">Đã thêm vào kho lưu trữ</Message>, { duration: 2500 })
                            } catch (err) {
                              const msg = err?.response?.data?.message || 'Không thể lưu trữ'
                              toaster.push(<Message type="error">{msg}</Message>, { duration: 3500 })
                            }
                          }}
                          style={{ cursor: poll.isMine ? 'not-allowed' : 'pointer', opacity: poll.isMine ? 0.5 : 1 }}
                        >
                          <IconHeart size={20} />
                          <span>{poll.likesCount || 0}</span>
                        </div>
                        <div className={styles.footerItem}>
                          <IconShare size={20} />
                          <span>Chia sẻ</span>
                        </div>
                        <div className={styles.footerItem}>
                          <IconDownload size={20} />
                          <span>Tải xuống</span>
                        </div>
                    </div>
                  </div>
              ))}
            </div>

        </div>
      
    </div>
  )
}

function IconVoted({ size }) {
  return (
    <svg
      fill="currentColor"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
      <g id="SVGRepo_iconCarrier">
        {" "}
        <g>
          {" "}
          <path d="M1,15h1.8V6H1Zm12.6-9.38H10L10.64,4a3.31,3.31,0,0,0,.21-1.76A2.72,2.72,0,0,0,10.21.87,2.77,2.77,0,0,0,9.54.31,1.17,1.17,0,0,0,8.65,0,1,1,0,0,0,8,.66c-.11.29-.22.59-.34.88l-.57,1.4L4,6v9h7.11a1.82,1.82,0,0,0,1.61-1l1.94-3.68A3,3,0,0,0,15,8.94V7.07A1.42,1.42,0,0,0,13.61,5.62Zm0,3.32a1.58,1.58,0,0,1-.18.73l-1.93,3.68a.46.46,0,0,1-.38.25H5.4v-7L8.07,3.93a1.37,1.37,0,0,0,.3-.45c.13-.29.44-1,.72-1.76a1.46,1.46,0,0,1,.26,1.7L8,7l5.6.05Z" />{" "}
        </g>{" "}
      </g>
    </svg>
  )
}

function IconShare({ size }) {
  return (
    <svg
      fill="#fff"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
      <g id="SVGRepo_iconCarrier">
        <path
          d="M9 12C9 13.3807 7.88071 14.5 6.5 14.5C5.11929 14.5 4 13.3807 4 12C4 10.6193 5.11929 9.5 6.5 9.5C7.88071 9.5 9 10.6193 9 12Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M14 6.5L9 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M14 17.5L9 14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M19 5.5C19 6.88071 17.8807 8 16.5 8C15.1193 8 14 6.88071 14 5.5C14 4.11929 15.1193 3 16.5 3C17.8807 3 19 4.11929 19 5.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}

function IconHeart({ size }) {
  return (
    <svg
      fill="currentColor"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
      <g id="SVGRepo_iconCarrier">
        <path
          d="M8.96173 18.9109L9.42605 18.3219L8.96173 18.9109ZM12 5.50063L11.4596 6.02073C11.601 6.16763 11.7961 6.25063 12 6.25063C12.2039 6.25063 12.399 6.16763 12.5404 6.02073L12 5.50063ZM15.0383 18.9109L15.5026 19.4999L15.0383 18.9109ZM9.42605 18.3219C7.91039 17.1271 6.25307 15.9603 4.93829 14.4798C3.64922 13.0282 2.75 11.3345 2.75 9.1371H1.25C1.25 11.8026 2.3605 13.8361 3.81672 15.4758C5.24723 17.0866 7.07077 18.3752 8.49742 19.4999L9.42605 18.3219ZM2.75 9.1371C2.75 6.98623 3.96537 5.18252 5.62436 4.42419C7.23607 3.68748 9.40166 3.88258 11.4596 6.02073L12.5404 4.98053C10.0985 2.44352 7.26409 2.02539 5.00076 3.05996C2.78471 4.07292 1.25 6.42503 1.25 9.1371H2.75ZM8.49742 19.4999C9.00965 19.9037 9.55954 20.3343 10.1168 20.6599C10.6739 20.9854 11.3096 21.25 12 21.25V19.75C11.6904 19.75 11.3261 19.6293 10.8736 19.3648C10.4213 19.1005 9.95208 18.7366 9.42605 18.3219L8.49742 19.4999ZM15.5026 19.4999C16.9292 18.3752 18.7528 17.0866 20.1833 15.4758C21.6395 13.8361 22.75 11.8026 22.75 9.1371H21.25C21.25 11.3345 20.3508 13.0282 19.0617 14.4798C17.7469 15.9603 16.0896 17.1271 14.574 18.3219L15.5026 19.4999ZM22.75 9.1371C22.75 6.42503 21.2153 4.07292 18.9992 3.05996C16.7359 2.02539 13.9015 2.44352 11.4596 4.98053L12.5404 6.02073C14.5983 3.88258 16.7639 3.68748 18.3756 4.42419C20.0346 5.18252 21.25 6.98623 21.25 9.1371H22.75ZM14.574 18.3219C14.0479 18.7366 13.5787 19.1005 13.1264 19.3648C12.6739 19.6293 12.3096 19.75 12 19.75V21.25C12.6904 21.25 13.3261 20.9854 13.8832 20.6599C14.4405 20.3343 14.9903 19.9037 15.5026 19.4999L14.574 18.3219Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

function IconDownload({ size }) {
  return (
    <svg
      fill="currentColor"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
      <g id="SVGRepo_iconCarrier">
        <path
          d="M12.5535 16.5061C12.4114 16.6615 12.2106 16.75 12 16.75C11.7894 16.75 11.5886 16.6615 11.4465 16.5061L7.44648 12.1311C7.16698 11.8254 7.18822 11.351 7.49392 11.0715C7.79963 10.792 8.27402 10.8132 8.55352 11.1189L11.25 14.0682V3C11.25 2.58579 11.5858 2.25 12 2.25C12.4142 2.25 12.75 2.58579 12.75 3V14.0682L15.4465 11.1189C15.726 10.8132 16.2004 10.792 16.5061 11.0715C16.8118 11.351 16.833 11.8254 16.5535 12.1311L12.5535 16.5061Z"
          fill="currentColor"
        />
        <path
          d="M3.75 15C3.75 14.5858 3.41422 14.25 3 14.25C2.58579 14.25 2.25 14.5858 2.25 15V15.0549C2.24998 16.4225 2.24996 17.5248 2.36652 18.3918C2.48754 19.2919 2.74643 20.0497 3.34835 20.6516C3.95027 21.2536 4.70814 21.5125 5.60825 21.6335C6.47522 21.75 7.57754 21.75 8.94513 21.75H15.0549C16.4225 21.75 17.5248 21.75 18.3918 21.6335C19.2919 21.5125 20.0497 21.2536 20.6517 20.6516C21.2536 20.0497 21.5125 19.2919 21.6335 18.3918C21.75 17.5248 21.75 16.4225 21.75 15.0549V15C21.75 14.5858 21.4142 14.25 21 14.25C20.5858 14.25 20.25 14.5858 20.25 15C20.25 16.4354 20.2484 17.4365 20.1469 18.1919C20.0482 18.9257 19.8678 19.3142 19.591 19.591C19.3142 19.8678 18.9257 20.0482 18.1919 20.1469C17.4365 20.2484 16.4354 20.25 15 20.25H9C7.56459 20.25 6.56347 20.2484 5.80812 20.1469C5.07435 20.0482 4.68577 19.8678 4.40901 19.591C4.13225 19.3142 3.9518 18.9257 3.85315 18.1919C3.75159 17.4365 3.75 16.4354 3.75 15Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
