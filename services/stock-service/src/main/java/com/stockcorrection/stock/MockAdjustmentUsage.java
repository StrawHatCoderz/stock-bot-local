package com.stockcorrection.stock;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hardcoded, mutable running total of how much of a Store Associate's
 * stock-adjustment threshold has already been consumed, tracked separately
 * for each product they adjust. Not a transaction log — only the cumulative
 * percentage is kept, per specs/002-admin-role/data-model.md's Adjustment
 * Usage Ledger entity. Never reset automatically; only an Admin raising or
 * lowering the associate's threshold ceiling (in auth-service) changes how
 * much room is left.
 */
final class MockAdjustmentUsage {

    private static final Map<String, Double> USED_PERCENT = new ConcurrentHashMap<>();

    static double getUsed(String employeeId, String areaId, String productId) {
        return USED_PERCENT.getOrDefault(key(employeeId, areaId, productId), 0.0);
    }

    static void addUsed(String employeeId, String areaId, String productId, double percent) {
        USED_PERCENT.merge(key(employeeId, areaId, productId), percent, Double::sum);
    }

    private static String key(String employeeId, String areaId, String productId) {
        return employeeId + "|" + areaId + "|" + productId;
    }

    private MockAdjustmentUsage() {}
}
