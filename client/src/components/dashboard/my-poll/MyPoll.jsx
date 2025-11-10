import React, { useEffect, useMemo, useState } from 'react'
import styles from './MyPoll.module.css'
import axios from 'axios'
import { Message, toaster, Modal, Button, Toggle } from 'rsuite'
import 'rsuite/dist/rsuite.min.css'
import { PieChart, BarChart, Bars } from '@rsuite/charts'
import * as echarts from 'echarts'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const ResultRow = ({ label, count, percent, highlight }) => {
  return (
    <div className={styles.resultRow}>
      <div className={styles.resultLabel}>{label}</div>
      <div className={styles.barWrap}>
        <div
          className={`${styles.barFill} ${highlight ? styles.barAccent : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className={styles.resultMeta}>{count} phiếu ({percent.toFixed(1)}%)</div>
    </div>
  )
}

export default function MyPoll() {
  const [selected, setSelected] = useState()
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartType, setChartType] = useState('pie') // 'pie' | 'bar'
  const [currentPollId, setCurrentPollId] = useState(null)
  // export helpers

  useEffect(() => {
    const fetchPolls = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('auth_token')
        const { data } = await axios.get(`${API_BASE}/polls/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setPolls(data)
      } catch (err) {
        const msg = err?.response?.data?.message || 'Không thể tải danh sách poll'
        toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
      } finally {
        setLoading(false)
      }
    }
    fetchPolls()
  }, [])

  const handleSelected = (item) => {
    if (selected === item) {
      setSelected(null)
      return
    }
    setSelected(item)
  }

  const currentPoll = useMemo(() => polls.find(p => p._id === currentPollId) || null, [polls, currentPollId])
  const chartDataTuples = useMemo(() => {
    if (!currentPoll) return []
    return currentPoll.options.map(o => [o.text, o.votes || 0])
  }, [currentPoll])

  const toCsv = (options) => {
    const header = 'option,votes\n'
    const body = options.map(o => `"${String(o.text).replaceAll('"','""')}",${o.votes || 0}`).join('\n')
    return header + body
  }

  // Create a temporary ECharts instance off-screen and export to image
  async function exportEchartImage(option, type = 'png', size = { width: 800, height: 480 }, bg = '#ffffff') {
    const div = document.createElement('div')
    Object.assign(div.style, {
      position: 'fixed', left: '-10000px', top: '0', width: `${size.width}px`, height: `${size.height}px`, opacity: '0', pointerEvents: 'none', zIndex: '-1'
    })
    document.body.appendChild(div)
    const inst = echarts.init(div, undefined, { renderer: type === 'svg' ? 'svg' : 'canvas' })
    inst.setOption(option, { notMerge: true, lazyUpdate: false })
    await new Promise(r => requestAnimationFrame(() => r(null)))
    try {
      const url = inst.getDataURL({ type, pixelRatio: 2, backgroundColor: bg })
      return url
    } finally {
      inst.dispose()
      div.remove()
    }
  }

  function toAscii(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
  }

  async function handleDownload(poll) {
    try {
      if (!poll) return

      // Build chart options and export images without mounting React charts
      const tuples = (poll.options || []).map(o => [o.text, o.votes || 0])
      const totalVotes = tuples.reduce((s, [,v]) => s + (v||0), 0)
      const pieOption = {
        backgroundColor: '#ffffff',
        tooltip: { trigger: 'item' },
        legend: { show: false },
        series: [{
          name: 'Kết quả', type: 'pie', radius: ['50%','70%'], avoidLabelOverlap: true, animation: false,
          label: { show: true, formatter: '{b}: {c}' },
          data: totalVotes > 0
            ? tuples.map(([name, value]) => ({ name, value }))
            : [{ name: 'Chưa có dữ liệu', value: 1 }]
        }]
      }
      const barOption = {
        backgroundColor: '#ffffff',
        animation: false,
        grid: { left: 140, right: 20, top: 20, bottom: 20, containLabel: true },
        xAxis: { type: 'value', min: 0 },
        yAxis: { type: 'category', data: tuples.map(([name]) => name) },
        series: [{ type: 'bar', data: tuples.map(([, value]) => value), barWidth: 16, label: { show: true, position: 'right' } }]
      }
      const pieUrl = await exportEchartImage(pieOption, 'png', { width: 800, height: 480 })
      const barUrl = await exportEchartImage(barOption, 'png', { width: 800, height: 480 })

      // Generate PDF via dynamic import
      let jsPDF
      try {
        const mod = await import('jspdf')
        jsPDF = mod.default
      } catch (e) {
        toaster.push(<Message type="warning">Thiếu thư viện jsPDF. Vui lòng cài: npm i jspdf</Message>, { duration: 5000 })
        setExportingId(null)
        return
      }
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const m = 40
      let y = m
      // jsPDF standard fonts không hỗ trợ Unicode tốt -> strip dấu để tránh ký tự lạ
      doc.setFontSize(14); doc.text(toAscii(poll.question), m, y); y += 22
      doc.setFontSize(10); doc.text(`Updated: ${new Date(poll.updatedAt || poll.createdAt).toLocaleString()}`, m, y); y += 14
      const w = doc.internal.pageSize.getWidth() - m * 2
      const h = w * 0.45
      if (pieUrl) { doc.addImage(pieUrl, 'PNG', m, y, w, h, undefined, 'FAST'); y += h + 12 }
      if (barUrl) { doc.addImage(barUrl, 'PNG', m, y, w, h, undefined, 'FAST'); y += h + 16 }
      doc.setFontSize(12); doc.text('Results', m, y); y += 16
      doc.setFontSize(10)
      const totalStr = `Tong so luot vote: ${totalVotes}`
      doc.text(totalStr, m, y); y += 14
      ;(poll.options || []).forEach(o => { doc.text(`• ${toAscii(o.text)}: ${o.votes || 0}`, m, y); y += 12 })
      doc.save(`poll-${poll._id}.pdf`)
    } catch (err) {
      console.log(err)
      toaster.push(<Message type="error">Không thể xuất PDF</Message>, { duration: 4000 })
    } finally {
      // no-op
    }
  }

  return (
    <div className={styles.page}>
        <div className={styles.inner}>
            <h2 className={styles.heading}>Các cuộc thăm dò đã tạo</h2>

            <div className={styles.pollsContainer} >
              {polls.map((poll) => {
                const isExpired = new Date() > new Date(poll.expiresAt);
                const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);

                return (
                  <div key={poll._id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.title}>{poll.question}</div>
                    </div>

                    {isExpired ? (
                      <div className={styles.cardBody}>
                        <div className={styles.subtle}>{new Date(poll.createdAt).toLocaleString()}</div>
                        <div 
                          style={{
                            marginTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '24px'
                          }} 
                        >
                          {poll.options.map((opt, i) => (
                            <ResultRow
                              key={i}
                              label={opt.text}
                              count={opt.votes || 0}
                              percent={totalVotes ? ((opt.votes || 0) / totalVotes) * 100 : 0}
                              highlight={poll.myOptionIndex === i}
                            />
                          ))}
                        </div>
                        <div className={styles.voteText}>
                          <IconVoted size={20} />
                          <span>{totalVotes}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.cardBody}>
                        <div className={styles.subtle}>{new Date(poll.createdAt).toLocaleString()}</div>
                        <div className={styles.optionContainer} >
                          {poll.options.map((opt, i) => (
                            <div
                              key={i}
                              className={`${styles.optionBox} ${selected === opt.text ? styles.optionSelected : ''}`}
                              onClick={() => handleSelected(opt.text)}
                            >
                              {opt.text}
                            </div>
                          ))}
                        </div>
                        <div className={styles.voteText}>
                          <IconVoted size={20} />
                          <span>{totalVotes}</span>
                        </div>
                      </div>
                    )}

                    <div className={styles.cardFooter}>
                      {isExpired && (
                        <div
                          className={styles.footerItem}
                          onClick={() => { setCurrentPollId(poll._id); setChartOpen(true); }}
                        >
                          <IconChart size={20} />
                          <span>Xem biểu đồ</span>
                        </div>
                      )}

                      <div className={styles.footerItem}>
                        <IconShare size={20} />
                        <span>Chia sẻ</span>
                      </div>

                      {isExpired && (
                        <div
                          className={styles.footerItem}
                          onClick={() => handleDownload(poll)}
                          style={{ cursor: 'pointer' }}
                        >
                          <IconDownload size={20} />
                          <span>Tải xuống</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

            </div>
            

            <Modal open={chartOpen} onClose={() => setChartOpen(false)} size="md"
              
              >
              <Modal.Header>
                <Modal.Title>{currentPoll?.question || 'Biểu đồ kết quả'}</Modal.Title>
              </Modal.Header>
              <Modal.Body
              // style={{height: '700px'}}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ color: '#489FB5', fontWeight: 600 }}>Chế độ hiển thị</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ opacity: 0.75 }}>Pie</span>
                    <Toggle checked={chartType === 'bar'} onChange={(checked) => setChartType(checked ? 'bar' : 'pie')} />
                    <span style={{ opacity: 0.75 }}>Bar</span>
                  </div>
                </div>
                {chartType === 'pie' ? (
                  <PieChart name="Kết quả" data={chartDataTuples} donut="true" 
                  // style={{height: '500px'}}

                  />
                ) : (
                  <BarChart horizontal data={chartDataTuples}>
                    <Bars name="Votes" barWidth={12} />
                  </BarChart>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button onClick={() => setChartOpen(false)} appearance="subtle">Đóng</Button>
              </Modal.Footer>
            </Modal>

            {/* No hidden charts needed; export uses raw ECharts off-screen */}
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

function IconChart({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth={0} />
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
      <g id="SVGRepo_iconCarrier">
        {" "}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M18.9553 1.25C18.5224 1.24995 18.1256 1.24991 17.8028 1.29331C17.4473 1.3411 17.0716 1.45355 16.7626 1.76257C16.4535 2.07159 16.3411 2.44732 16.2933 2.8028C16.2499 3.12561 16.25 3.52244 16.25 3.95525V17.0448C16.25 17.4776 16.2499 17.8744 16.2933 18.1972C16.3411 18.5527 16.4535 18.9284 16.7626 19.2374C17.0716 19.5465 17.4473 19.6589 17.8028 19.7067C18.1256 19.7501 18.5224 19.7501 18.9553 19.75H19.0448C19.4776 19.7501 19.8744 19.7501 20.1972 19.7067C20.5527 19.6589 20.9284 19.5465 21.2374 19.2374C21.5465 18.9284 21.6589 18.5527 21.7067 18.1972C21.7501 17.8744 21.7501 17.4776 21.75 17.0448V3.95526C21.7501 3.52245 21.7501 3.12561 21.7067 2.8028C21.6589 2.44732 21.5465 2.07159 21.2374 1.76257C20.9284 1.45355 20.5527 1.3411 20.1972 1.29331C19.8744 1.24991 19.4776 1.24995 19.0448 1.25H18.9553ZM17.8257 2.82187L17.8232 2.82324L17.8219 2.82568C17.8209 2.82761 17.8192 2.83093 17.8172 2.83597C17.8082 2.85775 17.7929 2.90611 17.7799 3.00267C17.7516 3.21339 17.75 3.5074 17.75 4.00001V17C17.75 17.4926 17.7516 17.7866 17.7799 17.9973C17.7929 18.0939 17.8082 18.1423 17.8172 18.164C17.8192 18.1691 17.8209 18.1724 17.8219 18.1743L17.8232 18.1768L17.8257 18.1781C17.8265 18.1786 17.8276 18.1791 17.8289 18.1797C17.8307 18.1806 17.8331 18.1817 17.836 18.1828C17.8578 18.1918 17.9061 18.2071 18.0027 18.2201C18.2134 18.2484 18.5074 18.25 19 18.25C19.4926 18.25 19.7866 18.2484 19.9973 18.2201C20.0939 18.2071 20.1423 18.1918 20.164 18.1828C20.1691 18.1808 20.1724 18.1792 20.1743 18.1781L20.1768 18.1768L20.1781 18.1743C20.1792 18.1724 20.1808 18.1691 20.1828 18.164C20.1918 18.1423 20.2071 18.0939 20.2201 17.9973C20.2484 17.7866 20.25 17.4926 20.25 17V4.00001C20.25 3.5074 20.2484 3.21339 20.2201 3.00267C20.2071 2.90611 20.1918 2.85775 20.1828 2.83597C20.1808 2.83093 20.1792 2.82761 20.1781 2.82568L20.1768 2.82324L20.1743 2.82187C20.1724 2.82086 20.1691 2.81924 20.164 2.81717C20.1423 2.80821 20.0939 2.79291 19.9973 2.77993C19.7866 2.7516 19.4926 2.75001 19 2.75001C18.5074 2.75001 18.2134 2.7516 18.0027 2.77993C17.9061 2.79291 17.8578 2.80821 17.836 2.81717C17.8309 2.81924 17.8276 2.82086 17.8257 2.82187Z"
          fill="currenColor"
        />{" "}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11.9553 4.25H12.0448C12.4776 4.24995 12.8744 4.24991 13.1972 4.29331C13.5527 4.3411 13.9284 4.45355 14.2374 4.76257C14.5465 5.07159 14.6589 5.44732 14.7067 5.8028C14.7501 6.12561 14.7501 6.52243 14.75 6.95524V17.0448C14.7501 17.4776 14.7501 17.8744 14.7067 18.1972C14.6589 18.5527 14.5465 18.9284 14.2374 19.2374C13.9284 19.5465 13.5527 19.6589 13.1972 19.7067C12.8744 19.7501 12.4776 19.7501 12.0448 19.75H11.9553C11.5225 19.7501 11.1256 19.7501 10.8028 19.7067C10.4473 19.6589 10.0716 19.5465 9.76257 19.2374C9.45355 18.9284 9.3411 18.5527 9.29331 18.1972C9.24991 17.8744 9.24995 17.4776 9.25 17.0448V6.95526C9.24995 6.52244 9.24991 6.12561 9.29331 5.8028C9.3411 5.44732 9.45355 5.07159 9.76257 4.76257C10.0716 4.45355 10.4473 4.3411 10.8028 4.29331C11.1256 4.24991 11.5224 4.24995 11.9553 4.25ZM10.8232 5.82324L10.8257 5.82187L10.8234 18.1768L10.8219 18.1743C10.8209 18.1724 10.8192 18.1691 10.8172 18.164C10.8082 18.1423 10.7929 18.0939 10.7799 17.9973C10.7516 17.7866 10.75 17.4926 10.75 17V7.00001C10.75 6.5074 10.7516 6.21339 10.7799 6.00267C10.7929 5.90611 10.8082 5.85775 10.8172 5.83597C10.8192 5.83093 10.8209 5.82761 10.8219 5.82568L10.8232 5.82324ZM10.8234 18.1768L10.8257 5.82187L10.8295 5.81999L10.836 5.81717C10.8578 5.80821 10.9061 5.79291 11.0027 5.77993C11.2134 5.7516 11.5074 5.75001 12 5.75001C12.4926 5.75001 12.7866 5.7516 12.9973 5.77993C13.0939 5.79291 13.1423 5.80821 13.164 5.81717C13.1691 5.81924 13.1724 5.82086 13.1743 5.82187L13.1768 5.82324L13.1781 5.82568C13.1792 5.82761 13.1808 5.83093 13.1828 5.83597C13.1918 5.85775 13.2071 5.90611 13.2201 6.00267C13.2484 6.21339 13.25 6.5074 13.25 7.00001V17C13.25 17.4926 13.2484 17.7866 13.2201 17.9973C13.2071 18.0939 13.1918 18.1423 13.1828 18.164C13.1808 18.1691 13.1792 18.1724 13.1781 18.1743L13.1768 18.1768L13.1743 18.1781C13.1731 18.1788 13.1712 18.1797 13.1686 18.1809C13.1673 18.1815 13.1658 18.1821 13.164 18.1828C13.1423 18.1918 13.0939 18.2071 12.9973 18.2201C12.7866 18.2484 12.4926 18.25 12 18.25C11.5074 18.25 11.2134 18.2484 11.0027 18.2201C10.9061 18.2071 10.8578 18.1918 10.836 18.1828C10.8309 18.1808 10.8276 18.1792 10.8257 18.1781L10.8234 18.1768Z"
          fill="currenColor"
        />{" "}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.95526 8.25C4.52244 8.24995 4.12561 8.24991 3.8028 8.29331C3.44732 8.3411 3.07159 8.45355 2.76257 8.76257C2.45355 9.07159 2.3411 9.44732 2.29331 9.8028C2.24991 10.1256 2.24995 10.5224 2.25 10.9553V17.0448C2.24995 17.4776 2.24991 17.8744 2.29331 18.1972C2.3411 18.5527 2.45355 18.9284 2.76257 19.2374C3.07159 19.5465 3.44732 19.6589 3.8028 19.7067C4.12561 19.7501 4.52245 19.7501 4.95526 19.75H5.04475C5.47757 19.7501 5.8744 19.7501 6.19721 19.7067C6.5527 19.6589 6.92842 19.5465 7.23744 19.2374C7.54647 18.9284 7.65891 18.5527 7.70671 18.1972C7.75011 17.8744 7.75006 17.4776 7.75001 17.0448V10.9553C7.75006 10.5224 7.75011 10.1256 7.70671 9.8028C7.65891 9.44732 7.54647 9.07159 7.23744 8.76257C6.92842 8.45355 6.5527 8.3411 6.19721 8.29331C5.8744 8.24991 5.47757 8.24995 5.04476 8.25H4.95526ZM3.82568 9.82187L3.82324 9.82324L3.82187 9.82568C3.82086 9.82761 3.81924 9.83093 3.81717 9.83597C3.80821 9.85775 3.79291 9.90611 3.77993 10.0027C3.7516 10.2134 3.75001 10.5074 3.75001 11V17C3.75001 17.4926 3.7516 17.7866 3.77993 17.9973C3.79291 18.0939 3.80821 18.1423 3.81717 18.164C3.81924 18.1691 3.82086 18.1724 3.82187 18.1743L3.82284 18.1761L3.82568 18.1781C3.82761 18.1792 3.83093 18.1808 3.83597 18.1828C3.85775 18.1918 3.90611 18.2071 4.00267 18.2201C4.21339 18.2484 4.5074 18.25 5.00001 18.25C5.49261 18.25 5.78662 18.2484 5.99734 18.2201C6.0939 18.2071 6.14226 18.1918 6.16404 18.1828C6.16909 18.1808 6.1724 18.1792 6.17434 18.1781L6.17677 18.1768L6.17815 18.1743L6.18036 18.1698L6.18285 18.164C6.19181 18.1423 6.2071 18.0939 6.22008 17.9973C6.24841 17.7866 6.25001 17.4926 6.25001 17V11C6.25001 10.5074 6.24841 10.2134 6.22008 10.0027C6.2071 9.90611 6.19181 9.85775 6.18285 9.83597C6.18077 9.83093 6.17916 9.82761 6.17815 9.82568L6.17677 9.82324L6.17434 9.82187C6.1724 9.82086 6.16909 9.81924 6.16404 9.81717C6.14226 9.8082 6.0939 9.79291 5.99734 9.77993C5.78662 9.7516 5.49261 9.75001 5.00001 9.75001C4.5074 9.75001 4.21339 9.7516 4.00267 9.77993C3.90611 9.79291 3.85775 9.8082 3.83597 9.81717C3.83093 9.81924 3.82761 9.82086 3.82568 9.82187Z"
          fill="currenColor"
        />{" "}
        <path
          d="M3.00001 21.25C2.58579 21.25 2.25001 21.5858 2.25001 22C2.25001 22.4142 2.58579 22.75 3.00001 22.75H21C21.4142 22.75 21.75 22.4142 21.75 22C21.75 21.5858 21.4142 21.25 21 21.25H3.00001Z"
          fill="currenColor"
        />{" "}
      </g>
    </svg>
  )
}

