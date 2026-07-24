package com.stockcorrection.auth;

import java.util.List;

/**
 * Hardcoded employee directory for Phase 1. Not a repository/persistence
 * layer on purpose — this is a mock service, so the "database" is this list.
 */
final class MockAuthData {

    record Employee(
            String username,
            String password,
            String employeeId,
            String employeeNumber,
            String name,
            String email,
            String assignedTo, // storeId this employee currently manages, or null if not a manager
            String role // STORE_MANAGER, STORE_ASSOCIATE, or ADMIN
    ) {}

    static final List<Employee> EMPLOYEES = List.of(
            new Employee("user001", "password123", "EMP-1001", "1001",
                    "User 001", "user001@example.com", "STORE-101", "STORE_MANAGER"),
            new Employee("user002", "password123", "EMP-1002", "1002",
                    "User 002", "user002@example.com", "STORE-102", "STORE_MANAGER"),
            // Valid login, but not a store manager — exercises UNAUTHORIZED_MANAGER.
            new Employee("user003", "password123", "EMP-1003", "1003",
                    "User 003", "user003@example.com", null, "STORE_ASSOCIATE"),
            // Passes the login gate (has a store assignment) but is not a
            // manager — exercises the role-based FORBIDDEN_ROLE check.
            new Employee("user004", "password123", "EMP-1004", "1004",
                    "User 004", "user004@example.com", "STORE-101", "STORE_ASSOCIATE"),
            // Second real associate, at a different store — lets the Admin
            // roster/threshold feature demonstrate two independent associates.
            new Employee("user005", "password123", "EMP-1006", "1006",
                    "User 005", "user005@example.com", "STORE-102", "STORE_ASSOCIATE"),
            // System-wide Admin — deliberately storeless (assignedTo null),
            // unlike user003 this is expected and must not trip UNAUTHORIZED_MANAGER.
            new Employee("user006", "password123", "EMP-1005", "1005",
                    "User 006", "user006@example.com", null, "ADMIN"),
            // Managers of the 4 new stores added for nearby-store-suggestion
            // demonstrability — each is a fully real destination, not just a
            // listing entry, so a transfer to it can be approved end to end.
            new Employee("user007", "password123", "EMP-1007", "1007",
                    "User 007", "user007@example.com", "STORE-103", "STORE_MANAGER"),
            new Employee("user008", "password123", "EMP-1008", "1008",
                    "User 008", "user008@example.com", "STORE-104", "STORE_MANAGER"),
            new Employee("user009", "password123", "EMP-1009", "1009",
                    "User 009", "user009@example.com", "STORE-105", "STORE_MANAGER"),
            new Employee("user010", "password123", "EMP-1010", "1010",
                    "User 010", "user010@example.com", "STORE-106", "STORE_MANAGER")
    );

    static Employee findByUsername(String username) {
        return EMPLOYEES.stream()
                .filter(e -> e.username().equalsIgnoreCase(username))
                .findFirst()
                .orElse(null);
    }

    static Employee findByEmployeeId(String employeeId) {
        return EMPLOYEES.stream()
                .filter(e -> e.employeeId().equals(employeeId))
                .findFirst()
                .orElse(null);
    }

    private MockAuthData() {}
}
