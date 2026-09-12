# Сборка и запуск прототипа одним контейнером: фронтенд уезжает внутрь jar,
# наружу торчит один порт. Render умеет собирать Java только так — нативной
# среды для JVM у него нет.

# --- сборка ---------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src

# Копируем всё, что нужно сборке: профиль prod собирает фронтенд (npm ci +
# vite build) и кладёт config/game.json и docs/rules.md внутрь jar как
# эталонные копии — приложение разворачивает их, если рядом файлов нет.
COPY backend backend
COPY frontend frontend
COPY config config
COPY docs docs

WORKDIR /src/backend
RUN mvn -B -Pprod clean package -DskipTests

# --- запуск ---------------------------------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app

COPY --from=build /src/backend/target/*.jar app.jar
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

ENV SPRING_PROFILES_ACTIVE=prod
# MaxRAMPercentage вместо -Xmx: контейнеру на бесплатном тарифе дают 512 МБ, и
# JVM по умолчанию взяла бы четверть, а остаток кучи ушёл бы в OOM-kill.
# SerialGC — потому что процессорного времени там десятая доля ядра, и
# параллельный сборщик на ней только отнимает его у игрового цикла.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC"

EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
