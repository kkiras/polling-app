import React, { useState } from 'react'
import styles from './Poll.module.css'
import axios from 'axios'
import { toaster, Message } from 'rsuite'
import 'rsuite/dist/rsuite.min.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export default function Poll() {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])

  const addOption = () => setOptions((prev) => [...prev, ''])

  const removeOption = (index) => {
    setOptions((prev) => prev.filter((_,i) => i !== index));
  }

  const updateOption = (idx, value) => {
    setOptions((prev) => prev.map((opt, i) => (i === idx ? value : opt)))
  }

  const clearPoll = () => {
    setQuestion('');
    setOptions(['', ''])
  }

  const onPublish = async () => {
    const cleanOptions = options.map(o => o.trim()).filter(Boolean)
    if (!question.trim() || cleanOptions.length < 2) {
      toaster.push(
        <Message type="warning">Vui lòng nhập câu hỏi và ít nhất 2 lựa chọn.</Message>,
        { duration: 3000 }
      )
      return
    }
    try {
      const token = localStorage.getItem('auth_token')
      const { data } = await axios.post(`${API_BASE}/polls`, {
        question: question.trim(),
        options: cleanOptions,
      }, { headers: { Authorization: `Bearer ${token}` } })
      toaster.push(
        <Message type="success">Đã public poll thành công.</Message>,
        { duration: 3000 }
      )
      // Reset
      clearPoll()
      // Optionally navigate or show link
      // console.log('Created poll:', data)
    } catch (err) {
      const msg = err?.response?.data?.message || 'Không thể lưu poll'
      toaster.push(<Message type="error">{msg}</Message>, { duration: 4000 })
    }
  }

  return (
    <div className={styles.page}>
        <div className={styles.inner}>
            <h1 className={styles.title}>New poll</h1>
            <div className={styles.card}>
                <div className={styles.cardHeader}>Question 1</div>
                <div className={styles.cardBody}>
                <div className={styles.field}>
                    <label className={styles.label}>Question *</label>
                    <textarea
                    className={styles.inputArea}
                    placeholder="Type your question..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={3}
                    />
                </div>

                <div className={styles.field}>
                    <label className={styles.label}>Options (at least 2) *</label>
                    <div className={styles.optionList}>
                    {options.length === 2 ? (
                        options.map((opt, idx) => (
                            <input
                                key={idx}
                                className={styles.input}
                                placeholder={`Option ${idx + 1}`}
                                value={opt}
                                onChange={(e) => updateOption(idx, e.target.value)}
                            />
                        ))
                    ) : (
                        options.map((opt, idx) => (
                            <div className={styles.optionContainer}>
                                <input
                                    key={idx}
                                    className={styles.input}
                                    placeholder={`Option ${idx + 1}`}
                                    value={opt}
                                    onChange={(e) => updateOption(idx, e.target.value)}
                                    style={{flex: 1}}
                                />

                                <div onClick={() => removeOption(idx)}>
                                    <RemoveIcon size={18} />
                                </div>
                            </div>

                        ))
                    )}

                    </div>
                </div>

                <button type="button" className={styles.addOption} onClick={addOption}>
                    + New option
                </button>
                </div>
            </div>

            <div className={styles.actions}>
                <button type="button" className={styles.btnGhost} onClick={clearPoll} >Cancel</button>
                <button type="button" className={styles.btnPrimary} onClick={onPublish}>Public poll</button>
            </div>
        </div>
        
    </div>
  )
}

function RemoveIcon({ size }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-x h-4 w-4"
        >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    )
}
