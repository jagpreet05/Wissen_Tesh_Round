package com.wissen.backed.api.v1;

import com.wissen.backed.SeatStateStore;
import com.wissen.backed.SeatStateStore.Employee;
import com.wissen.backed.SeatStateStore.BookingEntry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.*;

/**
 * Seat layout endpoint.
 * GET /api/v1/seats/status?date=YYYY-MM-DD  (date defaults to today)
 *
 * Reads from SeatStateStore:
 *   - Designated seats: shows LEAVE_RELEASED if the employee is on leave that day
 *   - Floater seats: shows OCCUPIED if a booking exists, AVAILABLE otherwise
 */
@RestController
@RequestMapping("/api/v1/seats")
public class SeatStatusController {

    private static final String[] CHECKINS = {
        "08:42 AM","08:51 AM","09:00 AM","09:08 AM",
        "09:17 AM","09:22 AM","09:30 AM","09:45 AM"
    };

    record Occupant(String employeeId, String name, String team, int batch) {}

    record SeatStatus(
        String seatId, String type, String zone, String status,
        boolean occupied, boolean onLeave,
        Occupant occupant, String checkinTime, String date
    ) {}

    record SeatLayoutResponse(
        String date, int totalSeats, int occupied, int available,
        int leaveReleased, List<SeatStatus> seats
    ) {}

    private final SeatStateStore store;
    public SeatStatusController(SeatStateStore store) { this.store = store; }

    @GetMapping("/status")
    public ResponseEntity<SeatLayoutResponse> getStatus(
            @RequestParam(required = false) String date) {

        LocalDate targetDate = (date != null && !date.isBlank())
                ? LocalDate.parse(date)
                : LocalDate.now(SeatStateStore.IST);

        List<SeatStatus> seats = buildSeats(targetDate);

        long occupiedCount      = seats.stream().filter(SeatStatus::occupied).count();
        long leaveReleasedCount = seats.stream().filter(SeatStatus::onLeave).count();
        long availableCount     = seats.size() - occupiedCount;

        return ResponseEntity.ok(new SeatLayoutResponse(
            targetDate.toString(),
            seats.size(),
            (int) occupiedCount,
            (int) availableCount,
            (int) leaveReleasedCount,
            seats
        ));
    }

    private List<SeatStatus> buildSeats(LocalDate date) {
        List<SeatStatus> seats = new ArrayList<>(50);

        // ── Zone A: 40 designated seats ───────────────────────────────────
        for (int i = 1; i <= 40; i++) {
            String seatId = String.format("D-%02d", i);
            String empId  = String.format("EMP-%03d", i);

            // Is this employee on leave on the target date?
            boolean onLeave = store.isOnLeave(empId, date);

            boolean occupied = !onLeave && i <= 33; // same baseline occupancy as before
            String status = onLeave ? "LEAVE_RELEASED" : (occupied ? "OCCUPIED" : "AVAILABLE");

            var empOpt = store.findEmployee(empId);
            Occupant occupant = (occupied && empOpt.isPresent())
                ? new Occupant(empId, empOpt.get().name(), empOpt.get().team(), empOpt.get().batch())
                : null;
            String checkin = occupied ? CHECKINS[(i - 1) % CHECKINS.length] : null;

            seats.add(new SeatStatus(seatId, "DESIGNATED", "Zone A",
                status, occupied, onLeave, occupant, checkin, date.toString()));
        }

        // ── Zone B: 10 floater seats ──────────────────────────────────────
        // F-01…F-10: check if a real booking exists in the store for each seat
        // Seats F-01…F-03 have static baseline occupancy if no dynamic booking overrides
        Map<String, BookingEntry> dayBookings = new HashMap<>();
        for (var b : store.bookingsOnDate(date)) {
            if (!"CANCELLED".equals(b.status())) dayBookings.put(b.seatId(), b);
        }

        for (int i = 1; i <= 10; i++) {
            String seatId = String.format("F-%02d", i);
            boolean staticOccupied = i <= 3;  // baseline

            BookingEntry booking = dayBookings.get(seatId);
            boolean occupied = booking != null || staticOccupied;

            Occupant occupant = null;
            String checkin    = null;

            if (booking != null) {
                var emp = store.findEmployee(booking.employeeId());
                occupant = emp.map(e -> new Occupant(e.id(), e.name(), e.team(), e.batch()))
                              .orElse(new Occupant(booking.employeeId(), "Unknown", "—", 0));
                checkin  = "Booked";
            } else if (staticOccupied) {
                String staticEmpId = String.format("EMP-%03d", 40 + i);
                var emp = store.findEmployee(staticEmpId);
                occupant = emp.map(e -> new Occupant(e.id(), e.name(), e.team(), e.batch()))
                              .orElse(new Occupant(staticEmpId, "Floater Emp " + i, "—", 2));
                checkin  = CHECKINS[(i - 1) % CHECKINS.length];
            }

            seats.add(new SeatStatus(seatId, "FLOATER", "Zone B",
                occupied ? "OCCUPIED" : "AVAILABLE",
                occupied, false, occupant, checkin, date.toString()));
        }

        return seats;
    }
}
