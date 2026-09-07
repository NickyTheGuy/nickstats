import os

import mysql.connector
from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

from .auth import require_upload_token
from .db import get_db, init_app
from .errors import ApiError
from .importer import import_match
from .queries import get_match, list_matches, list_players
from .validation import validate_match


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH", "2097152"))
    init_app(app)

    @app.get("/health")
    def health():
        connection = get_db()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return jsonify(status="ok")

    @app.post("/matches")
    def upload_match():
        require_upload_token()
        if not request.is_json:
            raise ApiError(415, "json_required", "Content-Type must be application/json.")
        try:
            payload = request.get_json()
        except BadRequest as error:
            raise ApiError(400, "invalid_json", "The request body is not valid JSON.") from error
        payload = validate_match(payload)
        match_id, created = import_match(get_db(), payload)
        return jsonify(id=match_id, created=created), 201 if created else 200

    @app.get("/matches")
    def matches():
        return jsonify(list_matches(get_db(), request.args))

    @app.get("/matches/<int:match_id>")
    def match(match_id):
        return jsonify(get_match(get_db(), match_id))

    @app.get("/players")
    def players():
        return jsonify(list_players(get_db(), request.args))

    @app.errorhandler(ApiError)
    def api_error(error):
        body = {"error": {"code": error.code, "message": error.message}}
        if error.details:
            body["error"]["details"] = error.details
        return jsonify(body), error.status

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return jsonify(error={
            "code": "payload_too_large",
            "message": "Compact match JSON exceeds the configured upload limit.",
        }), 413

    @app.errorhandler(mysql.connector.Error)
    def database_error(error):
        app.logger.exception("Database request failed: %s", error)
        return jsonify(error={
            "code": "database_unavailable",
            "message": "The database could not complete this request.",
        }), 503

    return app
