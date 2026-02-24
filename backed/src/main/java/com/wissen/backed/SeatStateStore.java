package com.wissen.backed;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * SeatStateStore — single source of truth for all in-memory state.
 *
 * Replaces the scattered static maps in individual controllers.
 * Injected as a Spring singleton into every controller that needs it.
 *
 * Stores:
 *   1. Employee catalog (EMP-001 … EMP-050, drawn from the same names as before)
 *   2. Leave records: empId → list of LeaveEntry (date range, leaveId)
 *   3. Floater seat bookings: date → (seatId → BookingEntry)
 *
 * Business rules encoded here:
 *   - Designated employees' seats are auto-released when they apply leave
 *   - Target date for booking = today before 09:00 IST, tomorrow from 09:00 IST
 */
@Component
public class SeatStateStore {

    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // ── Employee catalog ──────────────────────────────────────────────────

    public record Employee(
        String id, String name, String initials, String team,
        int batch,                   // 1 or 2
        String seatType,             // "DESIGNATED" | "FLOATER"
        String designatedSeat,       // null for floaters
        String avatarColor
    ) {}

    private static final String[] NAMES = {
        "Raj Patel","Arjun Singh","Priya Sharma","Vikram Rao","Anita Joshi",
        "Suresh Iyer","Kavita Nair","Mohit Verma","Deepa Kapoor","Ramesh Bose",
        "Sunita Das","Tarun Gupta","Smita Jha","Nikhil Khanna","Reena Bajaj",
        "Harish Patel","Swati Desai","Manish Agarwal","Pallavi Shah","Karan Sethi",
        "Uma Krishnan","Rohan Sinha","Neha Kumar","Vivek Saxena","Divya Reddy",
        "Geeta Pillai","Anjali Mehta","Sanjay Tiwari","Lata Rao","Pooja Nair",
        "Arun Kumar","Meera Kapoor","Ravi Das","Komal Shukla","Naveen Yadav",
        "Preethi Menon","Ashish Malhotra","Farida Khan","Gaurav Jain","Hema S.",
        // Floaters EMP-041 … EMP-050
        "Ishaan Mehta","Priyanka Roy","Siddharth Nair","Tanvi Sharma","Yash Patel",
        "Ritu Agarwal","Vishal Gupta","Nisha Tomar","Kiran Bhat","Dev Pillai"
    };
    private static final String[] TEAMS = {"Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta","Iota","Kappa"};
    private static final String[] COLORS = {
        "#3B82F6","#8B5CF6","#EC4899","#F59E0B","#10B981",
        "#EF4444","#6366F1","#F97316","#14B8A6","#A855F7"
    };

    /** All 50 employees keyed by employeeId. */
    private final Map<String, Employee> CATALOG = buildCatalog();

    private Map<String, Employee> buildCatalog() {
        var map = new LinkedHashMap<String, Employee>();
        for (int i = 1; i <= 50; i++) {
            String id        = String.format("EMP-%03d", i);
            String name      = NAMES[i - 1];
            boolean floater  = i > 40;
            int batch        = floater
                ? ((i - 41) % 2 == 0 ? 1 : 2)
                : (i <= 20 ? 1 : 2);
            String seatType  = floater ? "FLOATER" : "DESIGNATED";
            String dSeat     = floater ? null : String.format("D-%02d", i);
            String team      = TEAMS[(i - 1) % TEAMS.length];
            String color     = COLORS[(i - 1) % COLORS.length];
            String initials  = Arrays.stream(name.split(" "))
                                     .map(w -> String.valueOf(w.charAt(0)))
                                     .collect(Collectors.joining());
            map.put(id, new Employee(id, name, initials, team, batch, seatType, dSeat, color));
        }
        // Override EMP-001 / EMP-002 to match AuthController MOCK_USERS
        map.put("EMP-001", new Employee("EMP-001","Raj Patel","RP","Alpha",1,"DESIGNATED","D-01","#3B82F6"));
        map.put("EMP-002", new Employee("EMP-002","Priya Sharma","PS","Beta",2,"FLOATER",null,"#EC4899"));
        return Collections.unmodifiableMap(map);
    }

    // ── Leave records ─────────────────────────────────────────────────────

    public record LeaveEntry(
        String leaveId, String employeeId, String leaveType,
        LocalDate startDate, LocalDate endDate,
        boolean halfDay, String halfDaySlot, String reason,
        String status,           // "PENDING" | "CANCELLED"
        boolean seatReleased, String releasedSeatId,
        String createdAt
    ) {}

    /** employeeId → list of leaves (including cancelled ones for overlap check). */
    private final Map<String, List<LeaveEntry>> leavesByEmp = new ConcurrentHashMap<>();

    /** leaveId → leave entry, for fast lookup. */
    private final Map<String, LeaveEntry> leavesById = new ConcurrentHashMap<>();

    // ── Floater seat bookings ─────────────────────────────────────────────

    public record BookingEntry(
        String bookingId, String employeeId, String seatId,
        LocalDate date, String status, String bookedAt
    ) {}

    /** date (ISO) → seatId → booking. */
    private final Map<String, Map<String, BookingEntry>> bookingsByDate = new ConcurrentHashMap<>();

    // ── Public API — Employees ────────────────────────────────────────────

    public Collection<Employee> allEmployees() { return CATALOG.values(); }

    public Optional<Employee> findEmployee(String id) { return Optional.ofNullable(CATALOG.get(id)); }

    /** Username → employee. Hardcoded for mock — mirrors AuthController.MOCK_USERS. */
    public Optional<Employee> findByUsername(String username) {
        return switch (username) {
            case "user"  -> findEmployee("EMP-001");
            case "admin" -> findEmployee("EMP-002");
            default      -> Optional.empty();
        };
    }

    // ── Public API — Leaves ───────────────────────────────────────────────

    public void addLeave(LeaveEntry entry) {
        leavesById.put(entry.leaveId(), entry);
        leavesByEmp.computeIfAbsent(entry.employeeId(), k -> new ArrayList<>()).add(entry);
    }

    public void updateLeave(LeaveEntry updated) {
        leavesById.put(updated.leaveId(), updated);
        List<LeaveEntry> list = leavesByEmp.get(updated.employeeId());
        if (list != null) {
            list.replaceAll(e -> e.leaveId().equals(updated.leaveId()) ? updated : e);
        }
    }

    public Optional<LeaveEntry> findLeave(String leaveId) {
        return Optional.ofNullable(leavesById.get(leaveId));
    }

    /** Returns all non-cancelled leaves for an employee, sorted by start date. */
    public List<LeaveEntry> activeLeavesFor(String employeeId) {
        return leavesByEmp.getOrDefault(employeeId, List.of()).stream()
            .filter(l -> !"CANCELLED".equals(l.status()))
            .sorted(Comparator.comparing(LeaveEntry::startDate))
            .toList();
    }

    /** Returns all non-cancelled leaves that overlap the given date. */
    public List<LeaveEntry> leavesOnDate(LocalDate date) {
        return leavesById.values().stream()
            .filter(l -> !"CANCELLED".equals(l.status()))
            .filter(l -> !date.isBefore(l.startDate()) && !date.isAfter(l.endDate()))
            .toList();
    }

    /** True if the employee has a non-cancelled leave overlapping [from, to]. */
    public boolean hasLeaveOverlap(String employeeId, LocalDate from, LocalDate to) {
        return leavesByEmp.getOrDefault(employeeId, List.of()).stream()
            .filter(l -> !"CANCELLED".equals(l.status()))
            .anyMatch(l -> !from.isAfter(l.endDate()) && !to.isBefore(l.startDate()));
    }

    /** True if the employee is on leave on the given date. */
    public boolean isOnLeave(String employeeId, LocalDate date) {
        return activeLeavesFor(employeeId).stream()
            .anyMatch(l -> !date.isBefore(l.startDate()) && !date.isAfter(l.endDate()));
    }

    // ── Public API — Bookings ─────────────────────────────────────────────

    public void addBooking(BookingEntry entry) {
        bookingsByDate
            .computeIfAbsent(entry.date().toString(), k -> new ConcurrentHashMap<>())
            .put(entry.seatId(), entry);
    }

    public boolean isSeatBooked(String seatId, LocalDate date) {
        var dayMap = bookingsByDate.get(date.toString());
        return dayMap != null && dayMap.containsKey(seatId)
            && !"CANCELLED".equals(dayMap.get(seatId).status());
    }

    /** All bookings for a specific date. */
    public Collection<BookingEntry> bookingsOnDate(LocalDate date) {
        return bookingsByDate.getOrDefault(date.toString(), Map.of()).values();
    }

    public void cancelBooking(String seatId, LocalDate date) {
        var dayMap = bookingsByDate.get(date.toString());
        if (dayMap != null && dayMap.containsKey(seatId)) {
            var old = dayMap.get(seatId);
            dayMap.put(seatId, new BookingEntry(old.bookingId(), old.employeeId(),
                old.seatId(), old.date(), "CANCELLED", old.bookedAt()));
        }
    }

    // ── Target-date helper (9 AM cutoff) ─────────────────────────────────

    /**
     * Returns the "target date" for a booking:
     *   Before 09:00 IST → today (same-day booking still open)
     *   From  09:00 IST  → tomorrow (today's allocation is closed)
     */
    public LocalDate targetDate() {
        ZonedDateTime now = ZonedDateTime.now(IST);
        if (now.getHour() < 9) {
            return now.toLocalDate();
        }
        // Skip weekends when advancing to tomorrow
        LocalDate next = now.toLocalDate().plusDays(1);
        while (next.getDayOfWeek().getValue() > 5) next = next.plusDays(1);
        return next;
    }
}
