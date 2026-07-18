package com.stockcorrection.transfer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

final class MockTransferData {

    static final class TransferLine {
        private final String productId;
        private final String areaId;
        private final long requestedQuantity;
        private String status;
        private String errorCode;
        private String message;

        TransferLine(String productId, String areaId, long requestedQuantity) {
            this.productId = productId;
            this.areaId = areaId;
            this.requestedQuantity = requestedQuantity;
        }

        String getProductId() {
            return productId;
        }

        String getAreaId() {
            return areaId;
        }

        long getRequestedQuantity() {
            return requestedQuantity;
        }

        String getStatus() {
            return status;
        }

        void setStatus(String status) {
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

    private MockTransferData() {}
}
