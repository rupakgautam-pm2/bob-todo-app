"""
Unit tests for the Todo Flask API.
Each test uses an isolated in-memory SQLite database so tests are hermetic
and can run in any order without side-effects.
"""

import json
import pytest
from app import create_app
from database import db as _db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def app():
    """Create a fresh Flask app wired to an in-memory SQLite DB per test."""
    test_app = create_app()
    test_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
    )
    with test_app.app_context():
        _db.create_all()
        yield test_app
        _db.drop_all()
        _db.engine.dispose()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def seed(client):
    """Helper: POST a todo and return the parsed JSON body."""
    def _seed(title="Test todo", description=None):
        payload = {"title": title}
        if description is not None:
            payload["description"] = description
        resp = client.post(
            "/api/todos",
            data=json.dumps(payload),
            content_type="application/json",
        )
        return resp.get_json()
    return _seed


# ---------------------------------------------------------------------------
# GET /api/todos
# ---------------------------------------------------------------------------

class TestGetTodos:
    def test_empty_list(self, client):
        resp = client.get("/api/todos")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_all_todos(self, client, seed):
        seed("First")
        seed("Second")
        resp = client.get("/api/todos")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_ordered_by_created_at_ascending(self, client, seed):
        seed("Alpha")
        seed("Beta")
        data = client.get("/api/todos").get_json()
        assert data[0]["title"] == "Alpha"
        assert data[1]["title"] == "Beta"

    def test_response_shape(self, client, seed):
        seed("Shape check", description="desc")
        item = client.get("/api/todos").get_json()[0]
        assert set(item.keys()) == {"id", "title", "description", "completed", "created_at"}

    def test_completed_defaults_to_false(self, client, seed):
        seed("Defaults")
        item = client.get("/api/todos").get_json()[0]
        assert item["completed"] is False


# ---------------------------------------------------------------------------
# POST /api/todos
# ---------------------------------------------------------------------------

class TestCreateTodo:
    def test_creates_with_title_only(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"title": "Buy milk"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["title"] == "Buy milk"
        assert body["description"] is None
        assert body["completed"] is False
        assert "id" in body
        assert "created_at" in body

    def test_creates_with_description(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"title": "Groceries", "description": "Milk and eggs"}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.get_json()["description"] == "Milk and eggs"

    def test_missing_title_returns_400(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"description": "No title here"}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_blank_title_returns_400(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"title": "   "}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "title is required"

    def test_empty_body_returns_400(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_non_json_body_returns_400(self, client):
        resp = client.post(
            "/api/todos",
            data="not json at all",
            content_type="text/plain",
        )
        assert resp.status_code == 400

    def test_title_is_stripped(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"title": "  Padded  "}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.get_json()["title"] == "Padded"

    def test_empty_description_stored_as_null(self, client):
        resp = client.post(
            "/api/todos",
            data=json.dumps({"title": "X", "description": "  "}),
            content_type="application/json",
        )
        assert resp.status_code == 201
        assert resp.get_json()["description"] is None

    def test_persisted_in_db(self, client):
        client.post(
            "/api/todos",
            data=json.dumps({"title": "Persistent"}),
            content_type="application/json",
        )
        data = client.get("/api/todos").get_json()
        assert len(data) == 1
        assert data[0]["title"] == "Persistent"


# ---------------------------------------------------------------------------
# PUT /api/todos/<id>
# ---------------------------------------------------------------------------

class TestUpdateTodo:
    def test_update_title(self, client, seed):
        todo_id = seed("Original")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"title": "Updated"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.get_json()["title"] == "Updated"

    def test_update_description(self, client, seed):
        todo_id = seed("Task")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"description": "New description"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.get_json()["description"] == "New description"

    def test_mark_completed(self, client, seed):
        todo_id = seed("Incomplete")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"completed": True}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.get_json()["completed"] is True

    def test_mark_uncompleted(self, client, seed):
        todo_id = seed("Done")["id"]
        # complete it first
        client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"completed": True}),
            content_type="application/json",
        )
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"completed": False}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.get_json()["completed"] is False

    def test_partial_update_preserves_other_fields(self, client, seed):
        todo = seed("Keep me", description="Keep this too")
        resp = client.put(
            f"/api/todos/{todo['id']}",
            data=json.dumps({"completed": True}),
            content_type="application/json",
        )
        body = resp.get_json()
        assert body["title"] == "Keep me"
        assert body["description"] == "Keep this too"
        assert body["completed"] is True

    def test_update_all_fields_at_once(self, client, seed):
        todo_id = seed("Old title")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"title": "New title", "description": "New desc", "completed": True}),
            content_type="application/json",
        )
        body = resp.get_json()
        assert body["title"] == "New title"
        assert body["description"] == "New desc"
        assert body["completed"] is True

    def test_not_found_returns_404(self, client):
        resp = client.put(
            "/api/todos/999",
            data=json.dumps({"completed": True}),
            content_type="application/json",
        )
        assert resp.status_code == 404
        assert resp.get_json()["error"] == "todo not found"

    def test_blank_title_returns_400(self, client, seed):
        todo_id = seed("Valid")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"title": ""}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "title must not be empty"

    def test_non_boolean_completed_returns_400(self, client, seed):
        todo_id = seed("Valid")["id"]
        resp = client.put(
            f"/api/todos/{todo_id}",
            data=json.dumps({"completed": "yes"}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "completed must be a boolean"

    def test_empty_body_is_a_noop(self, client, seed):
        todo = seed("No change")
        resp = client.put(
            f"/api/todos/{todo['id']}",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["title"] == "No change"
        assert body["completed"] is False

    def test_clear_description_with_empty_string(self, client, seed):
        todo = seed("Task", description="Will be cleared")
        resp = client.put(
            f"/api/todos/{todo['id']}",
            data=json.dumps({"description": ""}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert resp.get_json()["description"] is None


# ---------------------------------------------------------------------------
# DELETE /api/todos/<id>
# ---------------------------------------------------------------------------

class TestDeleteTodo:
    def test_delete_returns_204(self, client, seed):
        todo_id = seed("To delete")["id"]
        resp = client.delete(f"/api/todos/{todo_id}")
        assert resp.status_code == 204
        assert resp.data == b""

    def test_deleted_todo_no_longer_in_list(self, client, seed):
        todo_id = seed("Gone")["id"]
        client.delete(f"/api/todos/{todo_id}")
        data = client.get("/api/todos").get_json()
        assert all(t["id"] != todo_id for t in data)

    def test_delete_one_leaves_others(self, client, seed):
        keep = seed("Keep")
        remove = seed("Remove")
        client.delete(f"/api/todos/{remove['id']}")
        data = client.get("/api/todos").get_json()
        assert len(data) == 1
        assert data[0]["id"] == keep["id"]

    def test_not_found_returns_404(self, client):
        resp = client.delete("/api/todos/999")
        assert resp.status_code == 404
        assert resp.get_json()["error"] == "todo not found"

    def test_double_delete_returns_404(self, client, seed):
        todo_id = seed("Once")["id"]
        client.delete(f"/api/todos/{todo_id}")
        resp = client.delete(f"/api/todos/{todo_id}")
        assert resp.status_code == 404
