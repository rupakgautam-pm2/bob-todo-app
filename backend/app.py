import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from database import init_db, db
from models import Todo


def create_app():
    app = Flask(__name__)

    # --- Configuration ---
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"sqlite:///{os.path.join(base_dir, 'todo.db')}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # --- Extensions ---
    CORS(app)
    init_db(app)

    # -------------------------------------------------------------------------
    # Routes
    # -------------------------------------------------------------------------

    @app.get("/api/todos")
    def get_todos():
        """Return all todos ordered by creation date ascending."""
        todos = Todo.query.order_by(Todo.created_at.asc()).all()
        return jsonify([t.to_dict() for t in todos]), 200

    @app.post("/api/todos")
    def create_todo():
        """Create a new todo. Required field: title."""
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "title is required"}), 400

        todo = Todo(
            title=title,
            description=(data.get("description") or "").strip() or None,
        )
        db.session.add(todo)
        db.session.commit()
        return jsonify(todo.to_dict()), 201

    @app.put("/api/todos/<int:todo_id>")
    def update_todo(todo_id):
        """Update title, description, and/or completed for an existing todo."""
        todo = db.session.get(Todo, todo_id)
        if todo is None:
            return jsonify({"error": "todo not found"}), 404

        data = request.get_json(silent=True) or {}

        if "title" in data:
            title = (data["title"] or "").strip()
            if not title:
                return jsonify({"error": "title must not be empty"}), 400
            todo.title = title

        if "description" in data:
            todo.description = (data["description"] or "").strip() or None

        if "completed" in data:
            if not isinstance(data["completed"], bool):
                return jsonify({"error": "completed must be a boolean"}), 400
            todo.completed = data["completed"]

        db.session.commit()
        return jsonify(todo.to_dict()), 200

    @app.delete("/api/todos/<int:todo_id>")
    def delete_todo(todo_id):
        """Delete a todo by id."""
        todo = db.session.get(Todo, todo_id)
        if todo is None:
            return jsonify({"error": "todo not found"}), 404

        db.session.delete(todo)
        db.session.commit()
        return "", 204

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=5001)
