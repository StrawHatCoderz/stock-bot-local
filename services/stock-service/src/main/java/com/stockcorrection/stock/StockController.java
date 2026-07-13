package com.stockcorrection.stock;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Mock StockAPI per phase-1/05_api-contract.md — GET /api/stock,
 * POST /api/stock/zeroization, POST /api/stock/zeroization/area.
 */
@RestController
@RequestMapping("/api/stock")
public class StockController {

    // Seeded to match the example IDs in api-contract.md, then incrementing.
    private final AtomicInteger zeroizationSeq = new AtomicInteger(90001);
    private final AtomicInteger transactionSeq = new AtomicInteger(88292);

    record ZeroizationRequest(
            String storeId, String areaId, String productId,
            long quantity, String reason, String remarks, String requestedBy,
            String requestedByRole) {}

    record AreaZeroizationRequest(
            String storeId, String areaId, String reason, String remarks, String requestedBy,
            String requestedByRole) {}

    @GetMapping
    public ResponseEntity<Map<String, Object>> getStock(
            @RequestParam String storeId,
            @RequestParam String areaId,
            @RequestParam(required = false) String productId) {

        if (productId != null) {
            return ResponseEntity.ok(singleProductBody(storeId, areaId, productId));
        }
        return ResponseEntity.ok(areaWideBody(storeId, areaId));
    }

    private Map<String, Object> singleProductBody(String storeId, String areaId, String productId) {
        MockStockData.StockItem item = MockStockData.find(storeId, areaId, productId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("storeId", storeId);
        body.put("areaId", areaId);
        body.put("productId", productId);
        // Not in the given contract: a productId that validate_product never
        // actually returned. Rather than invent a new error code, this mock
        // just reports zero stock — same shape as the documented "no stock"
        // response.
        body.put("availableQuantity", item != null ? item.quantity : 0);
        if (item != null) {
            body.put("unit", item.unit);
        }
        return body;
    }

    private Map<String, Object> areaWideBody(String storeId, String areaId) {
        List<MockStockData.StockItem> items = MockStockData.findByArea(storeId, areaId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("storeId", storeId);
        body.put("areaId", areaId);
        body.put("products", items.stream().map(item -> {
            Map<String, Object> product = new LinkedHashMap<>();
            product.put("productId", item.productId);
            product.put("sku", item.sku);
            product.put("productName", item.productName);
            product.put("availableQuantity", item.quantity);
            product.put("unit", item.unit);
            return product;
        }).toList());
        return body;
    }

    @PostMapping("/zeroization")
    public ResponseEntity<Map<String, Object>> createZeroization(@RequestBody ZeroizationRequest request) {
        if (!"STORE_MANAGER".equals(request.requestedByRole())) {
            return ResponseEntity.ok(forbiddenRoleBody());
        }

        MockStockData.StockItem item = MockStockData.find(request.storeId(), request.areaId(), request.productId());

        if (item == null) {
            return ResponseEntity.ok(failureBody());
        }

        item.quantity = 0;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("zeroizationId", "ZERO-" + zeroizationSeq.getAndIncrement());
        body.put("status", "SUCCESS");
        body.put("transactionId", "TXN-" + transactionSeq.getAndIncrement());
        body.put("message", "Stock successfully zeroized.");
        return ResponseEntity.ok(body);
    }

    @PostMapping("/zeroization/area")
    public ResponseEntity<Map<String, Object>> createAreaZeroization(@RequestBody AreaZeroizationRequest request) {
        if (!"STORE_MANAGER".equals(request.requestedByRole())) {
            return ResponseEntity.ok(forbiddenRoleBody());
        }

        List<MockStockData.StockItem> items = MockStockData.findByArea(request.storeId(), request.areaId());

        if (items.isEmpty()) {
            return ResponseEntity.ok(failureBody());
        }

        List<Map<String, Object>> zeroedItems = items.stream().map(item -> {
            Map<String, Object> zeroed = new LinkedHashMap<>();
            zeroed.put("productId", item.productId);
            zeroed.put("sku", item.sku);
            zeroed.put("quantityZeroed", item.quantity);
            item.quantity = 0;
            return zeroed;
        }).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("zeroizationId", "ZERO-" + zeroizationSeq.getAndIncrement());
        body.put("status", "SUCCESS");
        body.put("transactionId", "TXN-" + transactionSeq.getAndIncrement());
        body.put("items", zeroedItems);
        body.put("message", "Stock successfully zeroized for all products in area.");
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> failureBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "ZEROIZATION_FAILED");
        body.put("message", "Unable to create zeroization.");
        return body;
    }

    private Map<String, Object> forbiddenRoleBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "FORBIDDEN_ROLE");
        body.put("message", "Only store managers can perform zeroisation.");
        return body;
    }
}
