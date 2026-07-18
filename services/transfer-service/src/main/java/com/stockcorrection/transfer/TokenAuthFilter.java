package com.stockcorrection.transfer;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.util.Map;

@Component
public class TokenAuthFilter implements Filter {

    public static final String ATTR_EMPLOYEE_ID = "verifiedEmployeeId";
    public static final String ATTR_STORE_ID = "verifiedStoreId";
    public static final String ATTR_ROLE = "verifiedRole";

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${auth.service.url}")
    private String authServiceUrl;

    @Override
    @SuppressWarnings("unchecked")
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String authorization = httpRequest.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            httpResponse.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", authorization);

        Map<String, Object> identity;
        try {
            ResponseEntity<Map> verifyResponse = restTemplate.exchange(
                    authServiceUrl + "/api/auth/verify", HttpMethod.GET,
                    new HttpEntity<>(headers), Map.class);
            identity = verifyResponse.getBody();
        } catch (HttpClientErrorException.Unauthorized e) {
            httpResponse.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        } catch (RestClientException e) {
            httpResponse.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            return;
        }

        Object storeId = identity.get("storeId");
        if (storeId == null) {
            httpResponse.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        httpRequest.setAttribute(ATTR_EMPLOYEE_ID, identity.get("employeeId"));
        httpRequest.setAttribute(ATTR_STORE_ID, storeId);
        httpRequest.setAttribute(ATTR_ROLE, identity.get("role"));

        chain.doFilter(request, response);
    }
}
