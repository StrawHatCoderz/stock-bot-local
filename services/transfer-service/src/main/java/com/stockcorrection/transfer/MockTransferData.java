package com.stockcorrection.transfer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

final class MockTransferData {

    enum LineStatus { IN_PROGRESS, FAILURE, TRANSFERRED }

    static final class TransferLine {
        private final String productId;
        private final String productName;
        private final String sku;
        private final String unit;
        private final String areaId;
        private final String areaName;
        private final long requestedQuantity;
        private LineStatus status;
        private String errorCode;
        private String message;
        private String destinationAreaId;

        TransferLine(String productId, String productName, String sku, String unit,
                     String areaId, String areaName, long requestedQuantity) {
            this.productId = productId;
            this.productName = productName;
            this.sku = sku;
            this.unit = unit;
            this.areaId = areaId;
            this.areaName = areaName;
            this.requestedQuantity = requestedQuantity;
        }

        String getProductId() {
            return productId;
        }

        String getProductName() {
            return productName;
        }

        String getUnit() {
            return unit;
        }

        String getSku() {
            return sku;
        }

        String getAreaId() {
            return areaId;
        }

        String getAreaName() {
            return areaName;
        }

        long getRequestedQuantity() {
            return requestedQuantity;
        }

        LineStatus getStatus() {
            return status;
        }

        void setStatus(LineStatus status) {
            this.status = status;
        }

        String getErrorCode() {
            return errorCode;
        }

        void setErrorCode(String errorCode) {
            this.errorCode = errorCode;
        }

        String getMessage() {
            return message;
        }

        void setMessage(String message) {
            this.message = message;
        }

        String getDestinationAreaId() {
            return destinationAreaId;
        }

        void setDestinationAreaId(String destinationAreaId) {
            this.destinationAreaId = destinationAreaId;
        }
    }

    static final class TransferRequest {
        private final String transferId;
        private final String fromStoreId;
        private final String toStoreId;
        private final String initiatedBy;
        private final Instant createdAt;
        private final List<TransferLine> lines;

        private TransferRequest(String transferId, String fromStoreId, String toStoreId,
                                 String initiatedBy, Instant createdAt, List<TransferLine> lines) {
            this.transferId = transferId;
            this.fromStoreId = fromStoreId;
            this.toStoreId = toStoreId;
            this.initiatedBy = initiatedBy;
            this.createdAt = createdAt;
            this.lines = lines;
        }

        String getTransferId() {
            return transferId;
        }

        String getFromStoreId() {
            return fromStoreId;
        }

        String getToStoreId() {
            return toStoreId;
        }

        String getInitiatedBy() {
            return initiatedBy;
        }

        Instant getCreatedAt() {
            return createdAt;
        }

        List<TransferLine> getLines() {
            return lines;
        }
    }

    private static final AtomicInteger transferSeq = new AtomicInteger(90001);
    private static final List<TransferRequest> REQUESTS = new ArrayList<>();

    static synchronized TransferRequest record(
            String fromStoreId, String toStoreId, String initiatedBy, List<TransferLine> lines) {
        TransferRequest request = new TransferRequest(
                "XFER-" + transferSeq.getAndIncrement(), fromStoreId, toStoreId, initiatedBy, Instant.now(), lines);
        REQUESTS.add(request);
        return request;
    }

    static synchronized List<TransferRequest> findByFromStore(String storeId) {
        return REQUESTS.stream()
                .filter(r -> r.getFromStoreId().equals(storeId))
                .sorted(Comparator.comparing(TransferRequest::getCreatedAt).reversed())
                .toList();
    }

    static synchronized List<TransferRequest> findByToStore(String storeId) {
        return REQUESTS.stream()
                .filter(r -> r.getToStoreId().equals(storeId))
                .sorted(Comparator.comparing(TransferRequest::getCreatedAt).reversed())
                .toList();
    }

    static synchronized TransferRequest findById(String transferId) {
        return REQUESTS.stream()
                .filter(r -> r.getTransferId().equals(transferId))
                .findFirst()
                .orElse(null);
    }

    private MockTransferData() {}
}
