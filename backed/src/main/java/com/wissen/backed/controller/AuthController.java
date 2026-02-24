package com.wissen.backed.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Authentication utility endpoints.
 *
 * GET  /api/auth/me     — returns full profile for the authenticated user
 * POST /api/auth/logout — invalidates session, returns JSON
 *
 * Profile is resolved from MOCK_USERS in-memory map keyed by Spring Security
 * username. Replace this map with a real EmployeeRepository when the DB is ready.
 *
 * Mock users:
 *   user  → Raj Patel   EMP-001  Batch 1  Team Alpha  Designated
 *   admin → Priya Sharma EMP-002  Batch 2  Team Beta   Floater
 *   (any other username gets a generic fallback profile)
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * In-memory user profiles keyed by Spring Security username.
     * Each profile contains the fields the frontend needs.
     *
     * Fields:
     *   employeeId    — display ID shown in the dashboard header
     *   name          — full display name
     *   batch         — 1 or 2 (FIXED per user, used for calendar filtering)
     *   team          — team name (Alpha, Beta, Gamma …)
     *   role          — "designated" | "floater"
     *   designatedSeat — seat ID if role is designated, null otherwise
     */
    private static final Map<String, Map<String, Object>> MOCK_USERS = Map.of(
        "user", Map.of(
            "employeeId",     "EMP-001",
            "name",           "Raj Patel",
            "batch",          1,
            "team",           "Alpha",
            "role",           "designated",
            "designatedSeat", "D-01"
        ),
        "admin", Map.of(
            "employeeId",     "EMP-002",
            "name",           "Priya Sharma",
            "batch",          2,
            "team",           "Beta",
            "role",           "floater",
            "designatedSeat", ""
        )
    );

    // ── Endpoints ─────────────────────────────────────────────────────────

    /**
     * GET /api/auth/me
     *
     * Returns the profile of the currently authenticated user.
     * Spring Security's 401 JSON entry point handles the unauthenticated case.
     *
     * Response 200:
     * {
     *   "username":       "user",
     *   "employeeId":     "EMP-001",
     *   "name":           "Raj Patel",
     *   "batch":          1,
     *   "team":           "Alpha",
     *   "role":           "designated",
     *   "designatedSeat": "D-01",
     *   "authenticated":  true
     * }
     */
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication auth) {
        String username = auth.getName();

        // Look up full profile; fall back to a generic profile if username not in map
        Map<String, Object> profile = MOCK_USERS.getOrDefault(username, Map.of(
            "employeeId",     "EMP-999",
            "name",           username,
            "batch",          1,
            "team",           "General",
            "role",           "floater",
            "designatedSeat", ""
        ));

        // Build response: merge profile + meta fields
        var response = new java.util.LinkedHashMap<String, Object>();
        response.put("username",      username);
        response.put("authenticated", true);
        response.putAll(profile);

        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/auth/logout
     *
     * Invalidates the current HTTP session. The browser discards the
     * JSESSIONID cookie automatically when the session is gone server-side.
     *
     * Response 200: { "status": "LOGGED_OUT" }
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.ok(Map.of("status", "LOGGED_OUT"));
    }
}
