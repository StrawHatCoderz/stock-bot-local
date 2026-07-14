package com.stockcorrection.validation;

import java.util.List;

/**
 * Hardcoded stores/areas/products for Phase 1. Not a repository/persistence
 * layer on purpose — this is a mock service, so these lists are the
 * "database." Mirrors the areaId/productId values stock-service also
 * hardcodes (see that service's MockStockData) — in a real deployment
 * these would be the same underlying tables; here each mock service owns
 * its own copy, kept in sync by hand. See ../../README.md.
 */
final class MockValidationData {

    record Area(String areaId, String storeId, String areaName, String storageType) {}

    record Product(String productId, String areaId, String productName, String sku) {}

    static final List<Area> AREAS = List.of(
            new Area("AREA-10", "STORE-101", "Refrigerator X", "REFRIGERATOR"),
                new Area("AREA-11", "STORE-101", "Backroom Storage", "STORAGE"),
            new Area("AREA-20", "STORE-102", "Freezer Section", "FREEZER")
    );

    static final List<Product> PRODUCTS = List.of(
            new Product("PROD-501", "AREA-10", "Eggs", "SKU-100501"),
            new Product("PROD-502", "AREA-10", "Milk 1L", "SKU-100502"),
            new Product("PROD-503", "AREA-10", "Butter", "SKU-100503"),
            new Product("PROD-504", "AREA-11", "Cardboard Boxes", "SKU-100504"),
            new Product("PROD-601", "AREA-20", "Ice Cream Tub", "SKU-200601")
    );

    static Area findArea(String storeId, String areaName) {
        return AREAS.stream()
                .filter(a -> a.storeId().equals(storeId) && a.areaName().equalsIgnoreCase(areaName))
                .findFirst()
                .orElse(null);
    }

    static Product findProduct(String storeId, String areaId, String productName) {
        if (!areaBelongsToStore(storeId, areaId)) {
            return null;
        }
        return PRODUCTS.stream()
                .filter(p -> p.areaId().equals(areaId) && p.productName().equalsIgnoreCase(productName))
                .findFirst()
                .orElse(null);
    }

    static List<Area> searchAreas(String storeId, String query) {
        return AREAS.stream()
                .filter(a -> a.storeId().equals(storeId) && a.areaName().toLowerCase().contains(query.toLowerCase()))
                .toList();
    }

    static List<Area> listAreas(String storeId) {
        return AREAS.stream()
                .filter(a -> a.storeId().equals(storeId))
                .toList();
    }

    static List<Product> searchProducts(String storeId, String areaId, String query) {
        if (!areaBelongsToStore(storeId, areaId)) {
            return List.of();
        }
        return PRODUCTS.stream()
                .filter(p -> p.areaId().equals(areaId) && p.productName().toLowerCase().contains(query.toLowerCase()))
                .toList();
    }

    private static boolean areaBelongsToStore(String storeId, String areaId) {
        return AREAS.stream().anyMatch(a -> a.areaId().equals(areaId) && a.storeId().equals(storeId));
    }

    private MockValidationData() {}
}
