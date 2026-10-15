# Bob Todo App

A full-stack todo application built with a **Python Flask** REST API backend and a **Vanilla JavaScript** frontend. No frameworks, no build step — just clean, well-commented code.

## Features

- Create, read, update, and delete todos
- Optional description per todo
- Mark todos complete / undo
- Filter by All / Active / Completed
- Live task counter
- Responsive design (mobile + desktop)
- Loading skeleton and toast notifications
- XSS-safe HTML rendering

## Project Structure

```
todo-app/
├── backend/
│   ├── app.py            # Flask application factory + all API routes
│   ├── models.py         # SQLAlchemy Todo model
│   ├── database.py       # DB initialisation helper
│   ├── requirements.txt  # Python dependencies
│   └── test_app.py       # Unit tests (99% coverage)
└── frontend/
    ├── index.html        # HTML shell
    ├── styles.css        # Responsive CSS
    └── app.js            # Fetch-based API client + DOM logic
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3 |
| Web framework | Flask 3 |
| ORM | Flask-SQLAlchemy |
| Database | SQLite (file-based, zero config) |
| CORS | Flask-CORS |
| Frontend | Vanilla JS + HTML + CSS |
| Tests | pytest + pytest-cov |

## Database Schema

**Table: `todos`**

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, autoincrement |
| `title` | VARCHAR(255) | Required |
| `description` | TEXT | Optional |
| `completed` | BOOLEAN | Default `false` |
| `created_at` | DATETIME | Set automatically on creation |

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/todos` | — | `200` array of todos |
| `POST` | `/api/todos` | `{ "title", "description"? }` | `201` new todo |
| `PUT` | `/api/todos/<id>` | `{ "title"?, "description"?, "completed"? }` | `200` updated todo |
| `DELETE` | `/api/todos/<id>` | — | `204` no content |

## Getting Started

### Prerequisites

- Python 3.9+
- A modern browser (Chrome, Firefox, Safari, Edge)

> **macOS note:** Port 5000 is reserved by AirPlay. The backend runs on **port 5001** by default.

### 1. Clone the repository

```bash
git clone https://github.com/rupakgautam-pm2/bob-todo-app.git
cd bob-todo-app
```

### 2. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The API will be available at `http://127.0.0.1:5001`.

### 3. Open the frontend

Open `frontend/index.html` directly in your browser — no server required.

### 4. Run the tests

```bash
cd backend
pytest test_app.py -v --cov=app --cov=models --cov=database --cov-report=term-missing
```

Expected: **30 tests passed, 99% coverage**.

## Sample curl Commands

```bash
# List all todos
curl http://127.0.0.1:5001/api/todos

# Create a todo
curl -X POST http://127.0.0.1:5001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries","description":"Milk, eggs, bread"}'

# Mark complete
curl -X PUT http://127.0.0.1:5001/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# Delete
curl -X DELETE http://127.0.0.1:5001/api/todos/1
```

## License

MIT
