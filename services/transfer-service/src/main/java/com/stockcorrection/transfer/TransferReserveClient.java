package com.stockcorrection.transfer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
class TransferReserveClient {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${stock.service.url}")
    private String stockServiceUrl;

    @SuppressWarnings("unchecked")
    Map<String, Object> reserve(String authorization, String areaId, String productId, long requestedQuantity) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", authorization);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> requestBody = Map.of(
                "areaId", areaId,
                "productId", productId,
                "requestedQuantity", requestedQuantity);

        ResponseEntity<Map> response = restTemplate.exchange(
                stockServiceUrl + "/api/stock/transfer-reserve", HttpMethod.POST,
                new HttpEntity<>(requestBody, headers), Map.class);
        return response.getBody();
    }
}
