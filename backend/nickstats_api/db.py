import os

import mysql.connector
from flask import current_app, g


def _required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_db():
    if "db" not in g:
        g.db = mysql.connector.connect(
            host=_required("MYSQL_HOST"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            database=os.getenv("MYSQL_DATABASE", "nickstats"),
            user=_required("MYSQL_USER"),
            password=_required("MYSQL_PASSWORD"),
            charset="utf8mb4",
            collation="utf8mb4_0900_ai_ci",
            autocommit=False,
            connection_timeout=5,
        )
        with g.db.cursor() as cursor:
            cursor.execute("SET time_zone = '+00:00'")
    return g.db


def close_db(_error=None):
    connection = g.pop("db", None)
    if connection is not None:
        if connection.in_transaction:
            connection.rollback()
        connection.close()


def init_app(app):
    app.teardown_appcontext(close_db)

