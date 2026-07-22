package com.stockcorrection.stock;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Hardcoded, mutable stock levels for Phase 1. Not a repository/persistence
 * layer on purpose — this is a mock service, so this in-memory list is the
 * "database," and zeroization really does mutate {@link StockItem#quantity}
 * in place (reset to 0), which is what makes GET /api/stock reflect a
 * zeroization that already happened.
 *
 * Mirrors the areaId/productId values validation-service also hardcodes
 * (see that service's MockValidationData) — in a real deployment these
 * would be the same underlying tables; here each mock service owns its own
 * copy, kept in sync by hand. See ../../README.md.
 */
final class MockStockData {

    /** Mutable on purpose: {@code quantity} changes when zeroization runs. */
    static final class StockItem {
        final String storeId;
        final String areaId;
        final String productId;
        final String sku;
        final String productName;
        final String unit;
        long quantity;

        StockItem(String storeId, String areaId, String productId, String sku,
                  String productName, String unit, long quantity) {
            this.storeId = storeId;
            this.areaId = areaId;
            this.productId = productId;
            this.sku = sku;
            this.productName = productName;
            this.unit = unit;
            this.quantity = quantity;
        }

        long getQuantity() {
            return quantity;
        }

        void setQuantity(long quantity) {
            this.quantity = quantity;
        }
    }

    // A synchronized, growable list rather than List.of(...) — a transfer
    // credit can insert a brand-new row for a store/area/product combination
    // that has never been stocked before (see specs/007-transfer-approval).
    private static final List<StockItem> STOCK = Collections.synchronizedList(new ArrayList<>(List.of(
            new StockItem("STORE-101", "AREA-10", "PROD-501", "SKU-100501", "Eggs", "BOX", 120),
            new StockItem("STORE-101", "AREA-10", "PROD-502", "SKU-100502", "Milk 1L", "BOX", 40),
            // Already zero on purpose — exercises the "nothing to write off" path.
            new StockItem("STORE-101", "AREA-10", "PROD-503", "SKU-100503", "Butter", "BOX", 0),
            new StockItem("STORE-101", "AREA-11", "PROD-504", "SKU-100504", "Cardboard Boxes", "PCS", 500),
            new StockItem("STORE-102", "AREA-20", "PROD-601", "SKU-200601", "Ice Cream Tub", "BOX", 60)
    )));

    static StockItem find(String storeId, String areaId, String productId) {
        synchronized (STOCK) {
            return STOCK.stream()
                    .filter(s -> s.storeId.equals(storeId) && s.areaId.equals(areaId) && s.productId.equals(productId))
                    .findFirst()
                    .orElse(null);
        }
    }

    static List<StockItem> findByArea(String storeId, String areaId) {
        synchronized (STOCK) {
            return STOCK.stream()
                    .filter(s -> s.storeId.equals(storeId) && s.areaId.equals(areaId))
                    .collect(Collectors.toList());
        }
    }

    /**
     * Inserts a brand-new row — used when a transfer credit targets a
     * store/area/product combination with no existing stock record.
     */
    static StockItem insert(String storeId, String areaId, String productId,
                             String productName, String sku, String unit, long quantity) {
        StockItem created = new StockItem(storeId, areaId, productId, sku, productName, unit, quantity);
        STOCK.add(created);
        return created;
    }

    private MockStockData() {}
}
