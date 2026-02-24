import './CalendarTable.css'

const TYPE_MAP = {
    DESIGNATED: 'designated', FLOATER: 'floater',
    LEAVE: 'leave', OFF_BATCH: 'off', HOLIDAY: 'holiday', REMOTE: 'remote',
}
const LABEL_MAP = {
    designated: (seatId, ci) => seatId ? `${seatId}${ci ? ' ✓' : ''}` : 'Desk',
    floater: (seatId, ci) => seatId ? `${seatId}${ci ? ' ✓' : ''}` : 'Float',
    leave: () => 'Leave',
    off: () => 'Off Batch',
    holiday: () => 'Holiday',
    remote: () => 'Remote',
}

export default function CalendarTable({ data }) {
    if (!data) return <div className="cal-empty">No calendar data available.</div>
    const { days = [], schedule = [] } = data

    return (
        <div className="cal-scroll">
            <table className="cal-table">
                <thead>
                    <tr>
                        <th className="cal-emp-th">Employee</th>
                        {days.map(d => (
                            <th key={d.date} className={d.isToday ? 'th-today' : d.isHoliday ? 'th-holiday' : ''}>
                                <div className="th-label">{d.label}</div>
                                <div className="th-date">{d.date?.slice(5)}</div>
                                {d.isToday && <span className="th-today-badge">TODAY</span>}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {schedule.map(emp => {
                        const color = emp.avatarColor ||
                            `hsl(${(parseInt(emp.id?.replace('EMP-', '') || '0') * 37) % 360},55%,55%)`
                        return (
                            <tr key={emp.id} data-batch={emp.batch}>
                                <td className="cal-emp-cell">
                                    <div className="emp-row">
                                        <div className="emp-av" style={{ background: color }}>
                                            {emp.initials}
                                        </div>
                                        <div className="emp-info">
                                            <div className="emp-name">{emp.name}</div>
                                            <div className="emp-sub">
                                                Batch {emp.batch} · {emp.seatType === 'DESIGNATED' ? 'Designated' : 'Non-Designated'}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                {days.map(d => {
                                    const cell = emp.days?.[d.date] ?? { type: 'OFF_BATCH', seatId: null }
                                    const kind = TYPE_MAP[cell.type] || 'off'
                                    const labelFn = LABEL_MAP[kind] || (() => kind)
                                    const label = labelFn(cell.seatId, cell.checkedIn)
                                    return (
                                        <td key={d.date} className={d.isToday ? 'td-today' : d.isHoliday ? 'td-holiday' : ''}>
                                            <span className={`cc cc-${kind}`}>{label}</span>
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
