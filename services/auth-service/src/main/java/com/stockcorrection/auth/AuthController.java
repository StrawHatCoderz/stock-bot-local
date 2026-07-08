package com.stockcorrection.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Mock AuthAPI per phase-1/05_api-contract.md — POST /api/login, GET /api/me.
 *
 * Token storage here is a plain in-memory map, standing in for
 * SessionTokenRepository described in phase-1/03_tech_stack.md: token ->
 * employeeId. No JWT signing/expiry — this is a mock, not a real auth service.
 */
@RestController
public class AuthController {

    // token -> employeeId
    private final Map<String, String> tokens = new ConcurrentHashMap<>();

    record LoginRequest(String username, String password) {}

    @PostMapping("/api/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request) {
        MockAuthData.Employee employee = MockAuthData.findByUsername(request.username());

        if (employee == null || !employee.password().equals(request.password())) {
            // No failure shape is specified for bad credentials in the given
            // contract (see api-contract.md) — this 401 + errorCode body is
            // this service's own reasonable fill-in for that gap.
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("errorCode", "INVALID_CREDENTIALS");
            body.put("message", "Username or password is incorrect.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
        }

        String token = "mock-jwt-" + UUID.randomUUID();
        tokens.put(token, employee.employeeId());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/api/me")
    public ResponseEntity<Map<String, Object>> me(
            @RequestHeader(value = "Authorization", required = false) String authorization) {

        String employeeId = resolveEmployeeId(authorization);
        if (employeeId == null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("errorCode", "INVALID_TOKEN");
            body.put("message", "Missing or invalid bearer token.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
        }

        MockAuthData.Employee employee = MockAuthData.findByEmployeeId(employeeId);
        if (employee == null || employee.assignedTo() == null) {
            // Per api-contract.md: valid credentials/token, but not an
            // authorized manager for any store.
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("authorized", false);
            body.put("errorCode", "UNAUTHORIZED_MANAGER");
            body.put("message", "Employee is not authorized for this store.");
            return ResponseEntity.ok(body);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authorized", true);
        body.put("employee_id", employee.employeeId());
        body.put("employee_number", employee.employeeNumber());
        body.put("name", employee.name());
        body.put("email", employee.email());
        body.put("assignedTo", employee.assignedTo());
        return ResponseEntity.ok(body);
    }

    private String resolveEmployeeId(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authorizationHeader.substring("Bearer ".length()).trim();
        return tokens.get(token);
    }
}
