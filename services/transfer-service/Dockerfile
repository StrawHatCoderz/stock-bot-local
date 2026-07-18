FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
COPY transfer-service ./transfer-service
# Create dummy directories for other projects so settings.gradle doesn't complain
RUN mkdir auth-service validation-service stock-service

ENV GRADLE_OPTS="-Dorg.gradle.jvmargs='-Xmx384m' -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1 -Dorg.gradle.vfs.watch=false"

RUN ./gradlew :transfer-service:bootJar --no-daemon --max-workers=1 -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/transfer-service/build/libs/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
