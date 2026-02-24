package com.wissen.backed.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Authentication utility endpoints.
 *
 * GET  /api/auth/me     — returns current user info (or 401 if not logged in)
 * POST /api/auth/logout — invalidates session, returns JSON
 *
 * These are called by the React frontend to:
 *  1. Check if a session is still valid on page load (/api/auth/me)
 *  2. Log the user out cleanly (/api/auth/logout)
 *
 * Spring Security handles the 401 for /api/auth/me automatically
 * because all /api/** routes require authentication (see SecurityConfig).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * GET /api/auth/me
     *
     * Returns the currently authenticated user's basic info.
     * If not authenticated, Spring Security returns 401 JSON automatically.
     *
     * Response 200:
     * {
     *   "username": "user",
     *   "authenticated": true
     * }
     *
     * TODO: Replace with employeeRepository.findByUsername(auth.getName())
     *       to return full employee profile (id, name, role, batch, team, designatedSeat)
     */
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication auth) {
        return ResponseEntity.ok(Map.of(
            "username",      auth.getName(),
            "authenticated", true
            // TODO: add employeeId, name, role, batch, team, designatedSeat
        ));
    }

    /**
     * POST /api/auth/logout
     *
     * Invalidates the current HTTP session and returns confirmation JSON.
     * The JSESSIONID cookie is cleared by the browser automatically
     * since the session is invalidated server-side.
     *
     * Response 200:
     * { "status": "LOGGED_OUT" }
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
