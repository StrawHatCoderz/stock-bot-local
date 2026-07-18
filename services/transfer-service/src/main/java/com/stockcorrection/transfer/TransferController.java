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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/transfer")
public class TransferController {

    private final TransferReserveClient reserveClient;

    public TransferController(TransferReserveClient reserveClient) {
        this.reserveClient = reserveClient;
    }

    record ProductLine(String productId, String areaId, long requestedQuantity) {}

    record TransferRequestBody(String fromStoreId, String toStoreId, List<ProductLine> products) {}

    private enum Role { STORE_MANAGER, STORE_ASSOCIATE, ADMIN }

    private enum RejectionReason { FORBIDDEN_ROLE, CROSS_STORE_FORBIDDEN, INVALID_DESTINATION_STORE, EMPTY_PRODUCT_LIST }

    private static Role parseRole(String role) {
        try {
            return Role.valueOf(role);
        } catch (RuntimeException e) {
            return null;
        }
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
            return ResponseEntity.ok(rejectionBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may create a transfer request."));
        }

        if (!verifiedStoreId.equals(request.fromStoreId())) {
            return ResponseEntity.ok(rejectionBody(RejectionReason.CROSS_STORE_FORBIDDEN, "fromStoreId must match your own store."));
        }

        if (request.toStoreId().equals(request.fromStoreId()) || !MockStoreData.exists(request.toStoreId())) {
            return ResponseEntity.ok(rejectionBody(RejectionReason.INVALID_DESTINATION_STORE, "Destination store is invalid or unrecognized."));
        }

        if (request.products() == null || request.products().isEmpty()) {
            return ResponseEntity.ok(rejectionBody(RejectionReason.EMPTY_PRODUCT_LIST, "At least one product line is required."));
        }

        List<MockTransferData.TransferLine> lines = new ArrayList<>();
        for (ProductLine product : request.products()) {
            MockTransferData.TransferLine line = new MockTransferData.TransferLine(
                    product.productId(), product.areaId(), product.requestedQuantity());

            if (product.requestedQuantity() <= 0) {
                line.setStatus("FAILURE");
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
            return rejectionBody(RejectionReason.FORBIDDEN_ROLE, "Only store managers may view transfer requests.");
        }
        if (!verifiedStoreId.equals(storeId)) {
            return rejectionBody(RejectionReason.CROSS_STORE_FORBIDDEN, "storeId must match your own store.");
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

    private Map<String, Object> rejectionBody(RejectionReason reason, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("created", false);
        body.put("errorCode", reason.name());
        body.put("message", message);
        return body;
    }

    private void applyReserveResult(MockTransferData.TransferLine line, Map<String, Object> result) {
        if (Boolean.TRUE.equals(result.get("reserved"))) {
            line.setStatus("IN_PROGRESS");
        } else {
            line.setStatus("FAILURE");
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
        body.put("areaId", line.getAreaId());
        body.put("requestedQuantity", line.getRequestedQuantity());
        body.put("status", line.getStatus());
        if ("FAILURE".equals(line.getStatus())) {
            body.put("errorCode", line.getErrorCode());
            body.put("message", line.getMessage());
        }
        return body;
    }
}
