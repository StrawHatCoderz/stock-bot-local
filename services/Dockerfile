# Shared build stage: compiles all three services in one Gradle invocation.
# docker-compose builds each service image from this same file with a
# different `target`, so this stage's layer is built once and reused.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
COPY auth-service ./auth-service
COPY validation-service ./validation-service
COPY stock-service ./stock-service
ENV GRADLE_OPTS="-Dorg.gradle.jvmargs='-Xmx512m' -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1"
RUN chmod +x gradlew && \
    ./gradlew :auth-service:bootJar :validation-service:bootJar :stock-service:bootJar \
      --no-daemon --max-workers=1 -x test

FROM eclipse-temurin:21-jre AS auth-service
WORKDIR /app
COPY --from=build /workspace/auth-service/build/libs/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]

FROM eclipse-temurin:21-jre AS validation-service
WORKDIR /app
COPY --from=build /workspace/validation-service/build/libs/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]

FROM eclipse-temurin:21-jre AS stock-service
WORKDIR /app
COPY --from=build /workspace/stock-service/build/libs/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]
