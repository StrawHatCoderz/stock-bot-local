package com.stockcorrection.transfer;

import java.util.List;

final class MockStoreData {

    record Store(String storeId, double latitude, double longitude) {}

    static final List<Store> STORES = List.of(
            new Store("STORE-101", 40.7128, -74.0060),  // Manhattan
            new Store("STORE-102", 34.0522, -118.2437), // Los Angeles
            new Store("STORE-103", 40.6782, -73.9442),  // Brooklyn — close to STORE-101
            new Store("STORE-104", 41.8781, -87.6298),  // Chicago
            new Store("STORE-105", 39.9526, -75.1652),  // Philadelphia — close-ish to STORE-101
            new Store("STORE-106", 29.7604, -95.3698)   // Houston
    );

    static boolean exists(String storeId) {
        return findByStoreId(storeId) != null;
    }

    static Store findByStoreId(String storeId) {
        return STORES.stream()
                .filter(s -> s.storeId().equals(storeId))
                .findFirst()
                .orElse(null);
    }

    static List<Store> all() {
        return STORES.stream().toList();
    }

    private MockStoreData() {}
}
