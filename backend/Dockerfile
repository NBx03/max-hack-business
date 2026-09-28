# ---------- Этап 1: зависимости ----------
# Отдельный слой только под pom.xml. Пока зависимости не менялись, этот слой
# берётся из кэша и повторная сборка укладывается в секунды - это то, что
# держит нас в лимите 5 минут из требований кейса.
FROM public.ecr.aws/docker/library/maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320 AS deps
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
FROM public.ecr.aws/docker/library/eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555 AS runtime

RUN addgroup -S app && adduser -S -G app app && \
    apk add --no-cache curl

# Корневой сертификат Минцифры (Russian Trusted Root CA). На нём работают
# platform-api2.max.ru и GigaChat; в стандартном хранилище JRE его нет.
# Файл публичный, взят с gu-st.ru (Госуслуги). SHA-256:
# D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
# Отключать проверку сертификатов вместо этого нельзя.
COPY certs/russian_trusted_root_ca.pem /tmp/russian_trusted_root_ca.pem
RUN keytool -importcert -noprompt -cacerts -storepass changeit \
      -alias russian-trusted-root-ca -file /tmp/russian_trusted_root_ca.pem && \
    rm /tmp/russian_trusted_root_ca.pem

WORKDIR /app
COPY --from=build /build/app.jar app.jar
RUN chown -R app:app /app
USER app

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

HEALTHCHECK --interval=10s --timeout=3s --start-period=45s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
