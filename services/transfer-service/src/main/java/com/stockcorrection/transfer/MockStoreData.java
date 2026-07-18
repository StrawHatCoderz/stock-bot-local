package com.stockcorrection.transfer;

import java.util.Set;

final class MockStoreData {

    static final Set<String> STORE_IDS = Set.of("STORE-101", "STORE-102");

    static boolean exists(String storeId) {
        return STORE_IDS.contains(storeId);
    }

    private MockStoreData() {}
}
