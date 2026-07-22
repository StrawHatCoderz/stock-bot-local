package com.stockcorrection.transfer;

import java.util.List;
import java.util.Set;

final class MockStoreData {

    static final Set<String> STORE_IDS = Set.of("STORE-101", "STORE-102");

    static boolean exists(String storeId) {
        return STORE_IDS.contains(storeId);
    }

    static List<String> allExcept(String storeId) {
        return STORE_IDS.stream().filter(id -> !id.equals(storeId)).sorted().toList();
    }

    private MockStoreData() {}
}
