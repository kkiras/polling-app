import React, { useEffect, useMemo, useState } from 'react'
import styles from './Storage.module.css'
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

const Storage = () => {
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartType, setChartType] = useState('pie')
  const [currentPollId, setCurrentPollId] = useState(null)

  // Helpers for export
  function toAscii(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
  }

  async function exportEchartImage(option, type = 'png', size = { width: 800, height: 480 }, bg = '#ffffff') {
    const div = document.createElement('div')
    Object.assign(div.style, { position: 'fixed', left: '-10000px', top: '0', width: `${size.width}px`, height: `${size.height}px`, opacity: '0', pointerEvents: 'none', zIndex: '-1' })
    document.body.appendChild(div)
    const inst = echarts.init(div, undefined, { renderer: type === 'svg' ? 'svg' : 'canvas' })
    inst.setOption(option, { notMerge: true, lazyUpdate: false })
    await new Promise(r => requestAnimationFrame(() => r(null)))
    try {
      const url = inst.getDataURL({ type, pixelRatio: 2, backgroundColor: bg })
      return url
    } finally {
      inst.dispose(); div.remove()
    }
  }

  async function handleDownload(poll) {
    try {
      if (!poll) return
      const tuples = (poll.options || []).map(o => [o.text, o.votes || 0])
      const totalVotes = tuples.reduce((s, [,v]) => s + (v||0), 0)
      const pieOption = {
        backgroundColor: '#ffffff',
        tooltip: { trigger: 'item' },
        legend: { show: false },
        series: [{
          name: 'Kết quả', type: 'pie', radius: ['50%','70%'], avoidLabelOverlap: true, animation: false,
          label: { show: true, formatter: '{b}: {c}' },
          data: totalVotes > 0 ? tuples.map(([name, value]) => ({ name, value })) : [{ name: 'Chưa có dữ liệu', value: 1 }]
        }]
      }
      const barOption = {
        backgroundColor: '#ffffff', animation: false,
        grid: { left: 140, right: 20, top: 20, bottom: 20, containLabel: true },
        xAxis: { type: 'value', min: 0 },
        yAxis: { type: 'category', data: tuples.map(([name]) => name) },
        series: [{ type: 'bar', data: tuples.map(([, value]) => value), barWidth: 16, label: { show: true, position: 'right' } }]
      }
      const pieUrl = await exportEchartImage(pieOption, 'png', { width: 800, height: 480 })
      const barUrl = await exportEchartImage(barOption, 'png', { width: 800, height: 480 })

      let jsPDF
      try {
        const mod = await import('jspdf')
        jsPDF = mod.default
      } catch (e) {
        toaster.push(<Message type="warning">Thiếu jsPDF. Vui lòng cài: npm i jspdf</Message>, { duration: 5000 })
        return
      }
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const m = 40
      let y = m
      doc.setFontSize(14); doc.text(toAscii(poll.question), m, y); y += 22
      doc.setFontSize(10); doc.text(`Updated: ${new Date(poll.updatedAt || poll.createdAt).toLocaleString()}`, m, y); y += 14
      const w = doc.internal.pageSize.getWidth() - m * 2
      const h = w * 0.45
      if (pieUrl) { doc.addImage(pieUrl, 'PNG', m, y, w, h, undefined, 'FAST'); y += h + 12 }
      if (barUrl) { doc.addImage(barUrl, 'PNG', m, y, w, h, undefined, 'FAST'); y += h + 16 }
      doc.setFontSize(12); doc.text('Results', m, y); y += 16
      const totalStr = `Tong so luot vote: ${totalVotes}`
      doc.setFontSize(10); doc.text(totalStr, m, y); y += 14
      ;(poll.options || []).forEach(o => { doc.text(`• ${toAscii(o.text)}: ${o.votes || 0}`, m, y); y += 12 })
      doc.save(`poll-${poll._id}.pdf`)
    } catch (err) {
      toaster.push(<Message type="error">Không thể xuất PDF</Message>, { duration: 4000 })
    }
  }

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('auth_token')
        const { data } = await axios.get(`${API_BASE}/polls/saved`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setPolls(data)
      } catch (err) {
        const msg = err?.response?.data?.message || 'Không thể tải kho lưu trữ'
        toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
      } finally {
        setLoading(false)
      }
    }
    fetchSaved()
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.heading}>Kho lưu trữ</h2>

        {polls.map((p) => {
          const totalVotes = p.options.reduce((sum, o) => sum + (o.votes || 0), 0)
          if (p.expired) {
            return (
              <div key={p._id} className={styles.card}>
                <div className={styles.resultHeader}>{p.question}</div>
                <div className={styles.cardBody}>
                  <div className={styles.metaRow}>
                    <span>{totalVotes} phiếu</span>
                    <span>{p.likesCount || 0} lượt thích</span>
                    <span>{new Date(p.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <div className={styles.results}>
                    {p.options.map((o, i) => (
                      <ResultRow
                        key={i}
                        label={o.text}
                        count={o.votes || 0}
                        percent={totalVotes ? ((o.votes || 0) / totalVotes) * 100 : 0}
                        highlight={p.myOptionIndex === i}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <Button size="xs" appearance="subtle" onClick={() => handleDownload(p)}>
                      Tải xuống
                    </Button>
                    <Button size="xs" appearance="primary" onClick={() => { setCurrentPollId(p._id); setChartOpen(true) }}>
                      Xem biểu đồ
                    </Button>
                  </div>
                </div>
              </div>
            )
          }
          // not expired: show like Explore with highlight if user has voted
          return (
            <div key={p._id} className={styles.card}>
              <div className={styles.resultHeader}>{p.question}</div>
              <div className={styles.cardBody}>
                <div className={styles.metaRow}>
                  <span>{totalVotes} phiếu</span>
                </div>
                {p.options.map((o, i) => (
                  <div
                    key={i}
                    className={`${styles.optionBox} ${p.myOptionIndex === i ? styles.optionSelected : ''}`}
                  >
                    {o.text}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Modal biểu đồ */}
        <Modal open={chartOpen} onClose={() => setChartOpen(false)} size="md">
          <Modal.Header>
            <Modal.Title>{polls.find(x => x._id === currentPollId)?.question || 'Biểu đồ kết quả'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#489FB5', fontWeight: 600 }}>Chế độ hiển thị</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ opacity: 0.75 }}>Pie</span>
                <Toggle checked={chartType === 'bar'} onChange={(checked) => setChartType(checked ? 'bar' : 'pie')} />
                <span style={{ opacity: 0.75 }}>Bar</span>
              </div>
            </div>
            {(() => {
              const poll = polls.find(x => x._id === currentPollId)
              const tuples = poll ? poll.options.map(o => [o.text, o.votes || 0]) : []
              if (chartType === 'pie') {
                return <PieChart name="Kết quả" data={tuples} donut="true" />
              }
              return (
                <BarChart horizontal data={tuples}>
                  <Bars name="Votes" barWidth={12} />
                </BarChart>
              )
            })()}
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={() => setChartOpen(false)} appearance="subtle">Đóng</Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  )
}

export default Storage
