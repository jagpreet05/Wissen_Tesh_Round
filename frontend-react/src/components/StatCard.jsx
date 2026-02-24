import './StatCard.css'

export default function StatCard({ label, value, icon, color }) {
    return (
        <div className="stat-card" style={{ '--accent': color }}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
        </div>
    )
}
