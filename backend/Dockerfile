# syntax=docker/dockerfile:1.7

# ---------- Этап 1: сборка ----------
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /build

COPY pom.xml .
COPY src ./src

# Тесты запускаются отдельно в CI/локально, поэтому при сборке production-образа
# не компилируем и не запускаем их.
#
# Maven repository вынесен в BuildKit cache mount:
# - ускоряет повторные сборки;
# - обычный layer cache для корректности сборки не требуется;
# - sharing=locked защищает repository от конкурентной записи.
RUN --mount=type=cache,id=max-approval-maven,target=/root/.m2/repository,sharing=locked \
    mvn -B -ntp -Dmaven.test.skip=true package && \
    mv target/*.jar /build/app.jar


# ---------- Этап 2: рантайм ----------
# Только JRE, без Maven и исходников — образ меньше, поверхность атаки меньше.
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S app && \
    adduser -S -G app app && \
    command -v wget >/dev/null

# Корневой сертификат Минцифры (Russian Trusted Root CA). На нём работают
# platform-api2.max.ru и GigaChat; в стандартном хранилище JRE его нет.
# Файл публичный, взят с gu-st.ru (Госуслуги). SHA-256:
# D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
# Отключать проверку сертификатов вместо этого нельзя.
COPY certs/russian_trusted_root_ca.pem /tmp/russian_trusted_root_ca.pem

RUN keytool -importcert -noprompt -cacerts -storepass changeit \
      -alias russian-trusted-root-ca \
      -file /tmp/russian_trusted_root_ca.pem && \
    rm /tmp/russian_trusted_root_ca.pem

WORKDIR /app

COPY --chown=app:app --from=build /build/app.jar app.jar

USER app

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

HEALTHCHECK --interval=10s --timeout=3s --start-period=45s --retries=5 \
    CMD wget -q -T 2 -O /dev/null http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]