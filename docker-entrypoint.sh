#!/bin/sh
set -e

# Render отдаёт адрес базы в переменной DATABASE_URL и в своём формате:
#
#   postgresql://user:password@host:5432/dbname
#
# JDBC такой строки не понимает — ему нужен jdbc:postgresql://host:5432/dbname,
# а логин и пароль отдельными свойствами. Разбираем здесь, чтобы в панели
# Render не пришлось руками разносить одно и то же по трём переменным: лишний
# ручной шаг в ночь перед сдачей — лишний способ уронить деплой.
#
# Заданный вручную SPRING_DATASOURCE_URL имеет приоритет: он нужен, если базу
# возьмут не у Render.
if [ -n "$DATABASE_URL" ] && [ -z "$SPRING_DATASOURCE_URL" ]; then
  rest="${DATABASE_URL#*://}"
  credentials="${rest%%@*}"
  hostAndDb="${rest#*@}"

  SPRING_DATASOURCE_USERNAME="${credentials%%:*}"
  SPRING_DATASOURCE_PASSWORD="${credentials#*:}"
  SPRING_DATASOURCE_URL="jdbc:postgresql://${hostAndDb}"
  # Драйвер выставляем здесь же: без базы в силе остаётся H2 из
  # application.properties, и прописать postgres в профиле значило бы уронить
  # запуск на пустом окружении.
  SPRING_DATASOURCE_DRIVER_CLASS_NAME="org.postgresql.Driver"

  export SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD SPRING_DATASOURCE_URL \
         SPRING_DATASOURCE_DRIVER_CLASS_NAME
  echo "Datasource: jdbc:postgresql://${hostAndDb%%\?*} (пользователь ${SPRING_DATASOURCE_USERNAME})"
else
  echo "DATABASE_URL не задан — работаем на настройках профиля"
fi

exec java $JAVA_OPTS -jar /app/app.jar
