package com.stockcorrection.transfer;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/transfer")
public class TransferController {

    private final TransferReserveClient reserveClient;
    private final TransferCreditClient creditClient;

    public TransferController(TransferReserveClient reserveClient, TransferCreditClient creditClient) {
        this.reserveClient = reserveClient;
        this.creditClient = creditClient;
    }

    record ProductLine(String productId, String productName, String sku, String unit,
                        String areaId, String areaName, long requestedQuantity) {}

    record TransferRequestBody(String fromStoreId, String toStoreId, List<ProductLine> products) {}

    record ApproveLine(String productId, String destinationAreaId) {}

    record ApproveRequestBody(List<ApproveLine> lines) {}

    private enum Role { STORE_MANAGER, STORE_ASSOCIATE, ADMIN }

    private enum RejectionReason {
        FORBIDDEN_ROLE, CROSS_STORE_FORBIDDEN, INVALID_DESTINATION_STORE, EMPTY_PRODUCT_LIST, TRANSFER_NOT_FOUND
    }

    private static Role parseRole(String role) {
        try {
            return Role.valueOf(role);
        } catch (RuntimeException e) {
            return null;
        }
    }

    @GetMapping("/stores")
    public ResponseEntity<Map<String, Object>> listStores(
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String verifiedStoreId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role) {
        Role callerRole = parseRole(role);
        if (callerRole == null || !callerRole.equals(Role.STORE_MANAGER)) {
            return ResponseEntity.ok(errorBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may list valid destination stores."));
        }

        MockStoreData.Store callerStore = MockStoreData.findByStoreId(verifiedStoreId);
        List<Map<String, Object>> stores = MockStoreData.all().stream()
                .filter(s -> !s.storeId().equals(verifiedStoreId))
                .map(s -> Map.entry(s, GeoDistance.haversineKm(
                        callerStore.latitude(), callerStore.longitude(), s.latitude(), s.longitude())))
                .sorted(Comparator.<Map.Entry<MockStoreData.Store, Double>>comparingDouble(Map.Entry::getValue)
                        .thenComparing(e -> e.getKey().storeId()))
                .map(e -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("storeId", e.getKey().storeId());
                    entry.put("distanceKm", e.getValue());
                    return entry;
                })
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("stores", stores);
        return ResponseEntity.ok(body);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createTransfer(
            @RequestBody TransferRequestBody request,
            @RequestHeader("Authorization") String authorization,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String verifiedStoreId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role,
            @RequestAttribute(TokenAuthFilter.ATTR_EMPLOYEE_ID) String employeeId) {

        Role callerRole = parseRole(role);
        if (callerRole == null || !callerRole.equals(Role.STORE_MANAGER)) {
            return ResponseEntity.ok(createRejectionBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may create a transfer request."));
        }

        if (!verifiedStoreId.equals(request.fromStoreId())) {
            return ResponseEntity.ok(createRejectionBody(RejectionReason.CROSS_STORE_FORBIDDEN, "fromStoreId must match your own store."));
        }

        if (request.toStoreId().equals(request.fromStoreId()) || !MockStoreData.exists(request.toStoreId())) {
            return ResponseEntity.ok(createRejectionBody(RejectionReason.INVALID_DESTINATION_STORE, "Destination store is invalid or unrecognized."));
        }

        if (request.products() == null || request.products().isEmpty()) {
            return ResponseEntity.ok(createRejectionBody(RejectionReason.EMPTY_PRODUCT_LIST, "At least one product line is required."));
        }

        List<MockTransferData.TransferLine> lines = new ArrayList<>();
        for (ProductLine product : request.products()) {
            MockTransferData.TransferLine line = new MockTransferData.TransferLine(
                    product.productId(), product.productName(), product.sku(), product.unit(),
                    product.areaId(), product.areaName(), product.requestedQuantity());

            if (product.requestedQuantity() <= 0) {
                line.setStatus(MockTransferData.LineStatus.FAILURE);
                line.setErrorCode("INVALID_QUANTITY");
                line.setMessage("Requested quantity must be greater than zero.");
            } else {
                Map<String, Object> result = reserveClient.reserve(
                        authorization, product.areaId(), product.productId(), product.requestedQuantity());
                applyReserveResult(line, result);
            }

            lines.add(line);
        }

        MockTransferData.TransferRequest created = MockTransferData.record(
                verifiedStoreId, request.toStoreId(), employeeId, lines);

        return ResponseEntity.ok(successBody(created));
    }

    @PostMapping("/{transferId}/approve")
    public ResponseEntity<Map<String, Object>> approveTransfer(
            @PathVariable String transferId,
            @RequestBody ApproveRequestBody request,
            @RequestHeader("Authorization") String authorization,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String verifiedStoreId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role) {

        Role callerRole = parseRole(role);
        if (callerRole == null || !callerRole.equals(Role.STORE_MANAGER)) {
            return ResponseEntity.ok(errorBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may approve a transfer request."));
        }

        MockTransferData.TransferRequest found = MockTransferData.findById(transferId);
        if (found == null) {
            return ResponseEntity.ok(errorBody(RejectionReason.TRANSFER_NOT_FOUND, "No matching transfer request was found."));
        }
        if (!found.getToStoreId().equals(verifiedStoreId)) {
            return ResponseEntity.ok(errorBody(RejectionReason.CROSS_STORE_FORBIDDEN, "This transfer request is not addressed to your store."));
        }

        Map<String, String> destinationAreaByProduct = new HashMap<>();
        if (request.lines() != null) {
            for (ApproveLine line : request.lines()) {
                destinationAreaByProduct.put(line.productId(), line.destinationAreaId());
            }
        }

        for (MockTransferData.TransferLine line : found.getLines()) {
            // Re-checked immediately before mutating — a line already
            // TRANSFERRED or FAILURE (including by a concurrent approval
            // call) is left untouched, never re-processed.
            if (line.getStatus() != MockTransferData.LineStatus.IN_PROGRESS) {
                continue;
            }

            String destinationAreaId = destinationAreaByProduct.get(line.getProductId());
            if (destinationAreaId == null) {
                // No entry provided this call — stays IN_PROGRESS for a
                // future approval call.
                continue;
            }

            Map<String, Object> result = creditClient.credit(
                    authorization, destinationAreaId, line.getProductId(),
                    line.getProductName(), line.getSku(), line.getUnit(), line.getRequestedQuantity());
            if (Boolean.TRUE.equals(result.get("credited"))) {
                line.setStatus(MockTransferData.LineStatus.TRANSFERRED);
                line.setDestinationAreaId(destinationAreaId);
            }
        }

        return ResponseEntity.ok(transferBody(found));
    }

    @GetMapping("/{storeId}/outgoing")
    public ResponseEntity<Map<String, Object>> listOutgoing(
            @PathVariable String storeId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String verifiedStoreId) {
        Map<String, Object> rejection = checkListingAccess(storeId, role, verifiedStoreId);
        if (rejection != null) {
            return ResponseEntity.ok(rejection);
        }

        List<MockTransferData.TransferRequest> requests = MockTransferData.findByFromStore(storeId);
        return ResponseEntity.ok(listingBody(storeId, "OUTGOING", requests));
    }

    @GetMapping("/{storeId}/incoming")
    public ResponseEntity<Map<String, Object>> listIncoming(
            @PathVariable String storeId,
            @RequestAttribute(TokenAuthFilter.ATTR_ROLE) String role,
            @RequestAttribute(TokenAuthFilter.ATTR_STORE_ID) String verifiedStoreId) {
        Map<String, Object> rejection = checkListingAccess(storeId, role, verifiedStoreId);
        if (rejection != null) {
            return ResponseEntity.ok(rejection);
        }

        List<MockTransferData.TransferRequest> requests = MockTransferData.findByToStore(storeId);
        return ResponseEntity.ok(listingBody(storeId, "INCOMING", requests));
    }

    private Map<String, Object> checkListingAccess(String storeId, String role, String verifiedStoreId) {
        Role callerRole = parseRole(role);
        if (callerRole == null || !callerRole.equals(Role.STORE_MANAGER)) {
            return errorBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may view transfer requests.");
        }
        if (!verifiedStoreId.equals(storeId)) {
            return errorBody(RejectionReason.CROSS_STORE_FORBIDDEN, "storeId must match your own store.");
        }
        return null;
    }

    private Map<String, Object> listingBody(String storeId, String direction, List<MockTransferData.TransferRequest> requests) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("storeId", storeId);
        body.put("direction", direction);
        body.put("transfers", requests.stream().map(this::transferBody).toList());
        return body;
    }

    private Map<String, Object> errorBody(RejectionReason reason, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("errorCode", reason.name());
        body.put("message", message);
        return body;
    }

    private Map<String, Object> createRejectionBody(RejectionReason reason, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("created", false);
        body.putAll(errorBody(reason, message));
        return body;
    }

    private void applyReserveResult(MockTransferData.TransferLine line, Map<String, Object> result) {
        if (Boolean.TRUE.equals(result.get("reserved"))) {
            line.setStatus(MockTransferData.LineStatus.IN_PROGRESS);
        } else {
            line.setStatus(MockTransferData.LineStatus.FAILURE);
            line.setErrorCode((String) result.get("errorCode"));
            line.setMessage((String) result.get("message"));
        }
    }

    private Map<String, Object> successBody(MockTransferData.TransferRequest created) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("created", true);
        body.putAll(transferBody(created));
        return body;
    }

    private Map<String, Object> transferBody(MockTransferData.TransferRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("transferId", request.getTransferId());
        body.put("fromStoreId", request.getFromStoreId());
        body.put("toStoreId", request.getToStoreId());
        body.put("initiatedBy", request.getInitiatedBy());
        body.put("createdAt", request.getCreatedAt().toString());
        body.put("lines", request.getLines().stream().map(this::lineBody).toList());
        return body;
    }

    private Map<String, Object> lineBody(MockTransferData.TransferLine line) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", line.getProductId());
        body.put("productName", line.getProductName());
        body.put("areaId", line.getAreaId());
        body.put("areaName", line.getAreaName());
        body.put("requestedQuantity", line.getRequestedQuantity());
        body.put("status", line.getStatus().name());
        if (line.getStatus() == MockTransferData.LineStatus.FAILURE) {
            body.put("errorCode", line.getErrorCode());
            body.put("message", line.getMessage());
        }
        if (line.getStatus() == MockTransferData.LineStatus.TRANSFERRED) {
            body.put("destinationAreaId", line.getDestinationAreaId());
        }
        return body;
    }
}
