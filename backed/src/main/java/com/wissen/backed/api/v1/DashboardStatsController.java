package com.wissen.backed.api.v1;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * Dashboard statistics endpoint.
 * GET /api/v1/dashboard/stats — returns sample seat allocation stats as JSON.
 *
 * TODO: Replace static sample data with calls to the service/repository layer
 *       once entities (Seat, Employee, Leave) are implemented.
 */
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardStatsController {

    // ---------- response record (Java 17+) ----------

    record DashboardStats(
            int  totalEmployees,
            int  occupiedSeats,
            int  availableSeats,
            int  leavesToday,
            int  utilizationPercent,
            // Extra fields aligned with the agreed API contract
            int  totalSeats,
            int  designatedOccupied,
            int  floaterOccupied,
            int  leaveReleasedToPool,
            String date
    ) {}

    // ---------- endpoint ----------

    /**
     * GET /api/v1/dashboard/stats
     *
     * Returns sample dashboard statistics.
     * TODO: wire to SeatService / EmployeeService / LeaveService
     */
    @GetMapping("/stats")
    public ResponseEntity<DashboardStats> getStats() {

        // TODO: replace with real queries once service layer is ready
        //   e.g. seatService.getOccupiedCount(LocalDate.now())
        DashboardStats stats = new DashboardStats(
                /* totalEmployees      */ 80,
                /* occupiedSeats       */ 36,
                /* availableSeats      */ 14,
                /* leavesToday         */ 5,
                /* utilizationPercent  */ 72,
                /* totalSeats          */ 50,
                /* designatedOccupied  */ 33,
                /* floaterOccupied     */ 3,
                /* leaveReleasedToPool */ 3,
                /* date                */ LocalDate.now().toString()
        );

        return ResponseEntity.ok(stats);
    }
}
