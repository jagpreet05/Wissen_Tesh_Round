import './SeatGrid.css'

/** Normalise a seat object so both the old mock shape and the new backend shape work. */
function normalise(s) {
    return {
        seatId: s.seatId,
        type: s.type === 'DESIGNATED' ? 'Designated' : s.type === 'FLOATER' ? 'Floater' : s.type,
        occupied: s.occupied,
        onLeave: s.onLeave || s.status === 'LEAVE_RELEASED',
        occupant: s.occupant
            ? (typeof s.occupant === 'string' ? s.occupant : s.occupant.name)
            : null,
        team: s.occupant?.team || s.team || null,
        batch: s.occupant?.batch || s.batch || null,
        checkin: s.checkinTime || s.checkin || null,
        status:
            s.status === 'OCCUPIED' ? 'occupied' :
                s.status === 'LEAVE_RELEASED' ? 'on-leave' :
                    s.status === 'AVAILABLE' ? 'free' :
                        s.occupied ? 'occupied' : 'free',
    }
}

export default function SeatGrid({ seats = [], compact = false }) {
    const designated = seats.filter(s => normalise(s).type === 'Designated').map(normalise)
    const floater = seats.filter(s => normalise(s).type === 'Floater').map(normalise)

    return (
        <div className={`seat-grid-wrapper ${compact ? 'compact' : ''}`}>
            <div className="seat-section">
                <div className="seat-section-label">
                    🪑 Designated Seats
                    <span className="seat-badge">{designated.filter(s => s.occupied).length}/{designated.length}</span>
                </div>
                <div className="seat-tiles">
                    {designated.map(s => <SeatTile key={s.seatId} seat={s} />)}
                </div>
            </div>

            <div className="seat-section">
                <div className="seat-section-label">
                    🔄 Floater Seats
                    <span className="seat-badge">{floater.filter(s => s.occupied).length}/{floater.length}</span>
                </div>
                <div className="seat-tiles">
                    {floater.map(s => <SeatTile key={s.seatId} seat={s} />)}
                    {floater.length === 0 && (
                        <div className="seat-empty">No floater seat data</div>
                    )}
                </div>
            </div>
        </div>
    )
}

function SeatTile({ seat }) {
    const stateClass =
        seat.onLeave ? 'tile-leave' :
            seat.occupied ? 'tile-occupied' : 'tile-free'

    const stateLabel =
        seat.onLeave ? 'Leave Released' :
            seat.occupied ? 'Occupied' : 'Available'

    return (
        <div className={`seat-tile ${stateClass}`} title={seat.occupant || seat.seatId}>
            <div className="tile-id">{seat.seatId}</div>
            {seat.occupant && <div className="tile-name">{seat.occupant}</div>}
            {seat.team && <div className="tile-meta">{seat.team} · B{seat.batch}</div>}
            <div className={`tile-status ${stateClass}`}>{stateLabel}</div>
        </div>
    )
}
