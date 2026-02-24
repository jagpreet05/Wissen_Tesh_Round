package com.wissen.backed.api.v1;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Seat layout endpoint.
 * GET /api/v1/seats/status — returns status of all 50 seats for a given date.
 *
 * TODO: Replace mock list with SeatService / SeatRepository once JPA entities are ready.
 */
@RestController
@RequestMapping("/api/v1/seats")
public class SeatStatusController {

    // ------------------------------------------------------------------
    // Response records (Java 17+)
    // ------------------------------------------------------------------

    record Occupant(
            String employeeId,
            String name,
            String team,
            int    batch
    ) {}

    record SeatStatus(
            String   seatId,
            String   type,          // "DESIGNATED" | "FLOATER"
            String   zone,          // "Zone A" | "Zone B"
            String   status,        // "OCCUPIED" | "AVAILABLE" | "LEAVE_RELEASED"
            boolean  occupied,
            boolean  onLeave,
            Occupant occupant,      // null when not occupied
            String   checkinTime,   // null when not checked-in
            String   date
    ) {}

    record SeatLayoutResponse(
            String         date,
            int            totalSeats,
            int            occupied,
            int            available,
            int            leaveReleased,
            List<SeatStatus> seats
    ) {}

    // ------------------------------------------------------------------
    // Endpoint
    // ------------------------------------------------------------------

    /**
     * GET /api/v1/seats/status?date=YYYY-MM-DD   (date is optional, defaults to today)
     *
     * TODO: Connect to GET /api/v1/seats/status?date=YYYY-MM-DD as per API contract.
     *       Replace buildMockSeats() with seatService.getSeatStatus(date).
     */
    @GetMapping("/status")
    public ResponseEntity<SeatLayoutResponse> getStatus(
            @RequestParam(required = false) String date) {

        String targetDate = (date != null && !date.isBlank())
                ? date
                : LocalDate.now().toString();

        List<SeatStatus> seats = buildMockSeats(targetDate);

        long occupiedCount      = seats.stream().filter(SeatStatus::occupied).count();
        long leaveReleasedCount = seats.stream().filter(SeatStatus::onLeave).count();
        long availableCount     = seats.size() - occupiedCount;

        return ResponseEntity.ok(new SeatLayoutResponse(
                targetDate,
                seats.size(),
                (int) occupiedCount,
                (int) availableCount,
                (int) leaveReleasedCount,
                seats
        ));
    }

    // ------------------------------------------------------------------
    // Mock data builder
    // TODO: Delete this method once SeatService + JPA entities are wired in.
    // ------------------------------------------------------------------

    private static final String[] NAMES = {
            "Raj Patel", "Arjun Singh", "Priya Sharma", "Vikram Rao", "Anita Joshi",
            "Suresh Iyer", "Kavita Nair", "Mohit Verma", "Deepa Kapoor", "Ramesh Bose",
            "Sunita Das", "Tarun Gupta", "Smita Jha", "Nikhil Khanna", "Reena Bajaj",
            "Harish Patel", "Swati Desai", "Manish Agarwal", "Pallavi Shah", "Karan Sethi",
            "Uma Krishnan", "Rohan Sinha", "Neha Kumar", "Vivek Saxena", "Divya Reddy",
            "Geeta Pillai", "Anjali Mehta", "Sanjay Tiwari", "Lata Rao", "Pooja Nair",
            "Arun Kumar", "Meera Kapoor", "Ravi Das", "Komal Shukla", "Naveen Yadav",
            "Preethi Menon", "Ashish Malhotra", "Farida Khan", "Gaurav Jain", "Hema S."
    };

    private static final String[] TEAMS   = {"Alpha", "Beta", "Gamma", "Delta", "Epsilon"};
    private static final String[] CHECKINS = {"08:42 AM", "08:51 AM", "09:00 AM", "09:08 AM",
                                               "09:17 AM", "09:22 AM", "09:30 AM", "09:45 AM"};

    /**
     * Builds mock seat data: 40 designated (D-01…D-40) + 10 floaters (F-01…F-10).
     * Occupancy mirrors the dashboard stats: 33 designated occupied, 3 floater occupied,
     * 3 designated seats leave-released.
     */
    private List<SeatStatus> buildMockSeats(String date) {
        List<SeatStatus> seats = new ArrayList<>(50);

        // ── Zone A: 40 designated seats ──────────────────────────────
        // Seats D-01…D-33  → OCCUPIED
        // Seats D-34…D-36  → LEAVE_RELEASED (designated emp on leave, seat joins floater pool)
        // Seats D-37…D-40  → AVAILABLE
        for (int i = 1; i <= 40; i++) {
            String seatId  = String.format("D-%02d", i);
            String empId   = String.format("EMP-%03d", i);
            String name    = NAMES[i - 1];
            String team    = TEAMS[(i - 1) / 8 % TEAMS.length];
            int    batch   = i <= 20 ? 1 : 2;

            boolean occupied      = i <= 33;
            boolean onLeave       = i >= 34 && i <= 36;
            String  status        = onLeave  ? "LEAVE_RELEASED"
                                  : occupied ? "OCCUPIED"
                                             : "AVAILABLE";
            Occupant occupant     = occupied
                    ? new Occupant(empId, name, team, batch)
                    : null;
            String checkin        = occupied ? CHECKINS[(i - 1) % CHECKINS.length] : null;

            seats.add(new SeatStatus(seatId, "DESIGNATED", "Zone A",
                    status, occupied, onLeave, occupant, checkin, date));
        }

        // ── Zone B: 10 floater seats ─────────────────────────────────
        // Seats F-01…F-03  → OCCUPIED (booked by floater employees)
        // Seats F-04…F-10  → AVAILABLE
        for (int i = 1; i <= 10; i++) {
            String  seatId   = String.format("F-%02d", i);
            boolean occupied = i <= 3;
            String  empId    = String.format("EMP-%03d", 40 + i);
            String  team     = TEAMS[(i - 1) % TEAMS.length];

            Occupant occupant = occupied
                    ? new Occupant(empId, "Floater Emp " + i, team, 2)
                    : null;
            String checkin    = occupied ? CHECKINS[(i - 1) % CHECKINS.length] : null;

            seats.add(new SeatStatus(seatId, "FLOATER", "Zone B",
                    occupied ? "OCCUPIED" : "AVAILABLE",
                    occupied, false, occupant, checkin, date));
        }

        return seats;
    }
}
