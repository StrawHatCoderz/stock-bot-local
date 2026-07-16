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
 *
 * storeId/role/requestedBy are never accepted from the caller —
 * TokenAuthFilter verifies the bearer token against auth-service and
 * attaches the caller's real identity as request attributes, read here via
 * @RequestAttribute.
 */
@RestController
@RequestMapping("/api/stock")
public class StockController {

    // Seeded to match the example IDs in api-contract.md, then incrementing.
    private final AtomicInteger zeroizationSeq = new AtomicInteger(90001);
    private final AtomicInteger transactionSeq = new AtomicInteger(88292);
    private final AtomicInteger adjustmentSeq = new AtomicInteger(70001);

    record ZeroizationRequest(
            String areaId, String productId, long quantity, String reason, String remarks) {}

    record AreaZeroizationRequest(String areaId, String reason, String remarks) {}

    record AdjustmentRequest(
            String areaId, String productId, long requestedQuantity, String reason, String remarks) {}

    @GetMapping
    public ResponseEntity<Map<String, Object>> getStock(
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String storeId,
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
    public ResponseEntity<Map<String, Object>> createZeroization(
            @RequestBody ZeroizationRequest request,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String storeId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role) {
        if (!"STORE_MANAGER".equals(role)) {
            return ResponseEntity.ok(forbiddenRoleBody());
        }

        MockStockData.StockItem item = MockStockData.find(storeId, request.areaId(), request.productId());

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
    public ResponseEntity<Map<String, Object>> createAreaZeroization(
            @RequestBody AreaZeroizationRequest request,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String storeId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role) {
        if (!"STORE_MANAGER".equals(role)) {
            return ResponseEntity.ok(forbiddenRoleBody());
        }

        List<MockStockData.StockItem> items = MockStockData.findByArea(storeId, request.areaId());

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

    @PostMapping("/adjustment")
    public ResponseEntity<Map<String, Object>> createAdjustment(
            @RequestBody AdjustmentRequest request,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String storeId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role) {
        if (!"STORE_MANAGER".equals(role) && !"STORE_ASSOCIATE".equals(role)) {
            return ResponseEntity.ok(adjustmentForbiddenRoleBody());
        }

        MockStockData.StockItem item = MockStockData.find(storeId, request.areaId(), request.productId());

        if (item == null) {
            return ResponseEntity.ok(adjustmentFailedBody());
        }

        long resultingQuantity = item.quantity - request.requestedQuantity();

        if (resultingQuantity < 0) {
            return ResponseEntity.ok(adjustmentExceedsAvailableBody());
        }

        if (resultingQuantity == 0 && "STORE_ASSOCIATE".equals(role)) {
            return ResponseEntity.ok(zeroAdjustmentRequiresManagerBody());
        }

        item.quantity = resultingQuantity;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("adjustmentId", "ADJ-" + adjustmentSeq.getAndIncrement());
        body.put("status", "SUCCESS");
        body.put("transactionId", "TXN-" + transactionSeq.getAndIncrement());
        body.put("resultingQuantity", resultingQuantity);
        body.put("message", "Stock adjustment applied.");
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

    private Map<String, Object> adjustmentForbiddenRoleBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "FORBIDDEN_ROLE");
        body.put("message", "Only store managers or store associates can adjust stock.");
        return body;
    }

    private Map<String, Object> adjustmentFailedBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "ADJUSTMENT_FAILED");
        body.put("message", "Unable to create adjustment.");
        return body;
    }

    private Map<String, Object> zeroAdjustmentRequiresManagerBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "ZERO_ADJUSTMENT_REQUIRES_MANAGER");
        body.put("message", "Reducing stock to zero requires a store manager; ask a manager to perform a zeroisation.");
        return body;
    }

    private Map<String, Object> adjustmentExceedsAvailableBody() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "FAILED");
        body.put("errorCode", "ADJUSTMENT_EXCEEDS_AVAILABLE");
        body.put("message", "Requested quantity exceeds available stock.");
        return body;
    }
}
