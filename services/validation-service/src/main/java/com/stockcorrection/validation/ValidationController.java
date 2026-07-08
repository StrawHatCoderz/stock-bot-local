package com.stockcorrection.validation;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Mock ValidationAPI per phase-1/05_api-contract.md —
 * POST /api/validation/area, POST /api/validation/product.
 *
 * Both are single-guess-and-retry: an exact (case-insensitive) name match
 * or a not-found response, no fuzzy matching or candidate lists — see
 * api-contract.md's "Note on disambiguation."
 */
@RestController
@RequestMapping("/api/validation")
public class ValidationController {

    record AreaRequest(String storeId, String areaName) {}

    record ProductRequest(String storeId, String areaId, String productName) {}

    @PostMapping("/area")
    public ResponseEntity<Map<String, Object>> validateArea(@RequestBody AreaRequest request) {
        MockValidationData.Area area = MockValidationData.findArea(request.storeId(), request.areaName());

        Map<String, Object> body = new LinkedHashMap<>();
        if (area == null) {
            body.put("exists", false);
            body.put("errorCode", "AREA_NOT_FOUND");
            body.put("message", "Area does not exist.");
            return ResponseEntity.ok(body);
        }

        body.put("exists", true);
        body.put("areaId", area.areaId());
        body.put("storageType", area.storageType());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/product")
    public ResponseEntity<Map<String, Object>> validateProduct(@RequestBody ProductRequest request) {
        MockValidationData.Product product =
                MockValidationData.findProduct(request.areaId(), request.productName());

        Map<String, Object> body = new LinkedHashMap<>();
        if (product == null) {
            body.put("exists", false);
            body.put("errorCode", "PRODUCT_NOT_FOUND");
            body.put("message", "Product does not exist in the specified area.");
            return ResponseEntity.ok(body);
        }

        body.put("exists", true);
        body.put("productId", product.productId());
        body.put("sku", product.sku());
        return ResponseEntity.ok(body);
    }
}
