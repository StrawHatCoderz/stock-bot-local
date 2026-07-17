package com.stockcorrection.auth;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hardcoded, mutable stock-adjustment threshold ceilings for Phase 1, one
 * per Store Associate. Not a repository/persistence layer on purpose — same
 * mock-data convention as {@link MockAuthData}. Set and changed only by an
 * Admin (see AuthController's threshold endpoints); read by stock-service
 * via GET /api/auth/verify to enforce the per-(associate, product) quota
 * described in specs/002-admin-role/data-model.md.
 */
final class MockThresholdData {

    private static final Map<String, Double> THRESHOLDS = new ConcurrentHashMap<>(Map.of(
            "EMP-1004", 5.0,  // user004
            "EMP-1006", 12.0  // user005
    ));

    static Double get(String employeeId) {
        return THRESHOLDS.get(employeeId);
    }

    static void set(String employeeId, double thresholdPercent) {
        THRESHOLDS.put(employeeId, thresholdPercent);
    }

    private MockThresholdData() {}
}
