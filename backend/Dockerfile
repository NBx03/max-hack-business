# syntax=docker/dockerfile:1.7

# ---------- Этап 1: зависимости ----------
# Отдельный слой только под pom.xml. Пока зависимости не менялись, этот слой
# берётся из кэша и повторная сборка укладывается в секунды - это то, что
# держит нас в лимите 5 минут из требований кейса.
FROM maven:3.9-eclipse-temurin-21 AS deps
WORKDIR /build
COPY pom.xml .
# dependency:resolve, а не go-offline: go-offline дополнительно тянет плагины
# для всех фаз жизненного цикла. Замерено на этом проекте: go-offline 238 с,
# dependency:resolve 162 с при лимите кейса 300 с.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp dependency:resolve

# ---------- Этап 2: сборка ----------
FROM deps AS build
WORKDIR /build
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp clean package -DskipTests && \
    cp target/*.jar /build/app.jar

# ---------- Этап 3: рантайм ----------
# Только JRE, без Maven и исходников - образ меньше, поверхность атаки меньше.
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S app && adduser -S -G app app && \
    apk add --no-cache curl

WORKDIR /app
COPY --from=build /build/app.jar app.jar
RUN chown -R app:app /app
USER app

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

HEALTHCHECK --interval=10s --timeout=3s --start-period=45s --retries=5 \
    CMD curl -fsS http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
