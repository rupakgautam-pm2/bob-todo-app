// =============================================================================
// app.js — Todo App: Frontend Logic
// =============================================================================
//
// This file is responsible for everything that happens in the browser:
//
//   1. Talking to the Flask backend over HTTP (the "API calls" section)
//   2. Keeping a local copy of the todos in memory (the "State" section)
//   3. Drawing the todo list on the page (the "Render" section)
//   4. Reacting to user clicks and form submissions (the "Event listeners" section)
//
// Read top-to-bottom — each section builds on the one above it.
// =============================================================================


// =============================================================================
// CONFIG
// =============================================================================
//
// API_BASE is the root URL of our Flask backend.
// Every network request in this file is prefixed with this value.
//
// Having it in one place means you only need to change this single line
// if you move the backend to a different server or port.
//
const API_BASE = "http://127.0.0.1:5001";


// =============================================================================
// STATE
// =============================================================================
//
// "State" means the data the app needs to remember between user actions.
//
// We store two pieces of state:
//
//   todos        — the full list of todo objects we last received from the API.
//                  Each object looks like:
//                  { id: 1, title: "Buy milk", description: null,
//                    completed: false, created_at: "2024-01-01T12:00:00" }
//
//   activeFilter — which tab the user has selected ("all", "active", or
//                  "completed"). This controls which subset of `todos` is
//                  visible without needing to call the API again.
//
let todos = [];
let activeFilter = "all"; // possible values: "all" | "active" | "completed"


// =============================================================================
// DOM REFERENCES
// =============================================================================
//
// We grab references to the HTML elements we'll need to read from or write to.
// Doing this once at startup is faster than searching the DOM every time we
// need an element.
//
// document.getElementById("x") finds the element with id="x" in index.html.
// document.querySelectorAll(".x") finds ALL elements with class="x".
//
const addForm    = document.getElementById("add-form");    // the <form>
const titleInput = document.getElementById("title-input"); // title text field
const descInput  = document.getElementById("desc-input");  // description text field
const todoList   = document.getElementById("todo-list");   // the <ul> list
const emptyState = document.getElementById("empty-state"); // "nothing here" message
const statsEl    = document.getElementById("stats");       // "N tasks remaining"
const filterBtns = document.querySelectorAll(".filters__btn"); // All/Active/Completed buttons


// =============================================================================
// UTILITY HELPERS
// =============================================================================

// -----------------------------------------------------------------------------
// formatDate(iso)
// -----------------------------------------------------------------------------
// Converts an ISO 8601 timestamp string like "2024-06-15T09:30:00" into a
// human-friendly string like "Jun 15, 09:30 AM".
//
// `new Date(iso)` parses the string into a JavaScript Date object.
// `.toLocaleDateString()` formats it using the user's local time zone and
// language automatically — no manual timezone arithmetic needed.
//
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// -----------------------------------------------------------------------------
// showToast(message, isError)
// -----------------------------------------------------------------------------
// Displays a small notification bar at the bottom of the screen for 2.5 seconds.
// Pass isError=true to show it in red (for error messages).
//
// How it works:
//   - The first time it's called, it creates a <div id="toast"> and adds it to
//     the page. On subsequent calls it reuses the same element.
//   - The CSS class "toast--visible" triggers a CSS transition that slides the
//     bar into view.
//   - `void toast.offsetWidth` forces the browser to recalculate layout before
//     re-adding the class. Without this, if the toast is already visible and
//     showToast is called again, the CSS transition would not restart.
//   - `clearTimeout(toastTimer)` cancels any pending hide so back-to-back
//     calls each get a fresh 2.5 second window.
//
let toastTimer;
function showToast(message, isError = false) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = "toast" + (isError ? " toast--error" : "");
  void toast.offsetWidth; // force reflow so the CSS transition restarts
  toast.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 2500);
}

// -----------------------------------------------------------------------------
// apiFetch(path, options)   ← THE CORE API HELPER
// -----------------------------------------------------------------------------
// All four API functions below (fetchTodos, createTodo, updateTodo, deleteTodo)
// call THIS function instead of calling fetch() directly. That way all the
// shared plumbing lives in one place.
//
// WHY async/await?
// ----------------
// Talking to a server takes time — the browser cannot freeze the page while
// it waits. JavaScript solves this with "asynchronous" functions.
//
// The old approach used .then() chains which could become deeply nested
// ("callback hell"). async/await is the modern syntax that makes the same
// asynchronous code look like normal, top-to-bottom synchronous code.
//
// When JavaScript hits an `await` expression it:
//   1. Pauses execution of the current function.
//   2. Lets the rest of the browser (UI, other events) continue running.
//   3. Resumes from where it paused once the awaited Promise resolves.
//
// HOW THIS FUNCTION WORKS:
// ------------------------
// 1. `fetch(url, options)` sends an HTTP request to the backend and returns
//    a Promise. We `await` it to get the Response object `res`.
//
// 2. `res.status === 204` — the DELETE endpoint returns "204 No Content"
//    with an empty body. Calling res.json() on an empty body would throw,
//    so we return null early.
//
// 3. `await res.json()` reads the response body and parses it as JSON.
//    We `await` again because reading the body stream is also asynchronous.
//
// 4. `if (!res.ok)` — res.ok is true for status codes 200–299.
//    For errors like 400 or 404 the backend sends { "error": "..." }.
//    We throw an Error so the caller's catch block can handle it.
//
// 5. `return json` — hands the parsed data back to whoever called apiFetch.
//
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" }, // tell the server we're sending JSON
    ...options, // spread in method, body, etc. provided by the caller
  });

  // DELETE returns 204 No Content — no body to parse, return null immediately
  if (res.status === 204) return null;

  // Parse the JSON body (works for both success and error responses)
  const json = await res.json();

  // The request reached the server but the server reported an error (4xx/5xx).
  // We convert it into a thrown Error so callers can use try/catch.
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

  return json; // success — return the parsed data to the caller
}


// =============================================================================
// API CALL FUNCTIONS
// =============================================================================
//
// Each function below maps to one of the four REST endpoints on the backend.
// They all follow the same pattern:
//
//   1. Call apiFetch() with the right HTTP method and body.
//   2. Update the local `todos` array so the UI stays in sync without needing
//      to reload the entire list from the server.
//   3. Call renderTodos() to repaint the page.
//
// Errors are NOT caught here — they bubble up to the event listeners which
// are responsible for showing error messages to the user.
//

// -----------------------------------------------------------------------------
// fetchTodos()  →  GET /api/todos
// -----------------------------------------------------------------------------
// Called once on page load to populate the list.
// Shows a loading skeleton while the request is in flight, then replaces it
// with the real data. If the backend is unreachable, shows an error toast.
//
async function fetchTodos() {
  showSkeleton(); // show grey placeholder bars immediately
  try {
    todos = await apiFetch("/api/todos"); // wait for the server response
    renderTodos();                        // paint the real list
  } catch (err) {
    // Network error (e.g. backend not running) lands here.
    // We clear the skeleton and show a helpful message.
    showToast("Could not load todos. Is the backend running?", true);
    todoList.innerHTML = "";
  }
}

// -----------------------------------------------------------------------------
// createTodo(title, description)  →  POST /api/todos
// -----------------------------------------------------------------------------
// Sends a new todo to the backend. On success, appends the returned todo
// object (which now has a server-assigned `id`) to the local array.
//
// The request body is JSON: { "title": "...", "description": "..." }
// JSON.stringify() converts the JS object into a JSON string for transport.
//
async function createTodo(title, description) {
  const body = { title }; // always include title
  if (description) body.description = description; // only include description if provided

  const todo = await apiFetch("/api/todos", {
    method: "POST",
    body: JSON.stringify(body), // convert JS object → JSON string
  });

  todos.push(todo); // add the server response (with its real id) to local state
  renderTodos();
  showToast("Todo added ✓");
}

// -----------------------------------------------------------------------------
// updateTodo(id, patch)  →  PUT /api/todos/<id>
// -----------------------------------------------------------------------------
// Updates an existing todo. `patch` is a partial object — you only need to
// include the fields you want to change, e.g. { completed: true }.
//
// After the server confirms the update, we replace the old todo object in the
// local array with the fresh one returned by the server.
//
// Array.map() creates a NEW array — it never mutates the original, which
// makes the data flow easier to reason about.
//
async function updateTodo(id, patch) {
  const updated = await apiFetch(`/api/todos/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });

  // Replace only the updated todo; every other item stays unchanged
  todos = todos.map(t => (t.id === id ? updated : t));
  renderTodos();
}

// -----------------------------------------------------------------------------
// deleteTodo(id)  →  DELETE /api/todos/<id>
// -----------------------------------------------------------------------------
// Asks the backend to permanently delete a todo. On success (204 No Content),
// we remove it from the local array using Array.filter(), which returns a new
// array containing only the items that pass the test (id !== the deleted one).
//
async function deleteTodo(id) {
  await apiFetch(`/api/todos/${id}`, { method: "DELETE" });

  // Keep every todo whose id is NOT the one we just deleted
  todos = todos.filter(t => t.id !== id);
  renderTodos();
  showToast("Todo deleted");
}


// =============================================================================
// RENDER FUNCTIONS
// =============================================================================
//
// These functions take the current state (todos + activeFilter) and update the
// DOM to match. They are "pure" in the sense that they never talk to the API —
// they only read state and write to the DOM.
//

// -----------------------------------------------------------------------------
// getFilteredTodos()
// -----------------------------------------------------------------------------
// Returns the subset of `todos` that should be visible given `activeFilter`.
// This is called by renderTodos() before drawing the list.
//
function getFilteredTodos() {
  if (activeFilter === "active")    return todos.filter(t => !t.completed);
  if (activeFilter === "completed") return todos.filter(t =>  t.completed);
  return todos; // "all" — no filtering
}

// -----------------------------------------------------------------------------
// updateStats()
// -----------------------------------------------------------------------------
// Counts how many todos are NOT yet completed and updates the subtitle text
// in the header. Uses a ternary chain to pick the right phrasing.
//
function updateStats() {
  const remaining = todos.filter(t => !t.completed).length;
  statsEl.textContent =
    remaining === 0 ? "All done — great job! 🎉"
    : remaining === 1 ? "1 task remaining"
    : `${remaining} tasks remaining`;
}

// -----------------------------------------------------------------------------
// showSkeleton()
// -----------------------------------------------------------------------------
// Replaces the todo list with three grey "skeleton" bars while data is loading.
// This gives the user immediate visual feedback that something is happening.
//
// Array.from({ length: 3 }) creates an array of 3 undefined values; .map()
// turns each into a <li> HTML string; .join("") concatenates them.
//
function showSkeleton() {
  todoList.innerHTML = Array.from({ length: 3 })
    .map(() => `<li class="skeleton"></li>`)
    .join("");
  emptyState.hidden = true;
}

// -----------------------------------------------------------------------------
// escapeHtml(str)
// -----------------------------------------------------------------------------
// Converts special HTML characters in a string into their safe equivalents
// before injecting user-supplied text into innerHTML.
//
// WHY THIS MATTERS (XSS prevention):
// If a user creates a todo with the title:  <script>alert('hacked')</script>
// and we inject that directly into innerHTML, the browser would run it.
// escapeHtml turns it into: &lt;script&gt;alert('hacked')&lt;/script&gt;
// which the browser displays as plain text instead of executing as code.
//
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")  // & must be escaped first (it's part of all other escapes)
    .replace(/</g, "&lt;")   // prevents opening HTML tags
    .replace(/>/g, "&gt;")   // prevents closing HTML tags
    .replace(/"/g, "&quot;"); // prevents breaking out of attribute values
}

// -----------------------------------------------------------------------------
// createTodoEl(todo)
// -----------------------------------------------------------------------------
// Builds a single <li> DOM element for one todo object and attaches its
// button event handlers. Returns the element — it is NOT added to the page
// here; renderTodos() does that.
//
// ERROR HANDLING PATTERN used on the buttons:
//   1. Immediately disable all buttons to prevent double-clicks mid-request.
//   2. await the API call inside a try block.
//   3. If it throws, show a toast and re-enable the buttons so the user
//      can try again.
//   4. On success, renderTodos() removes this element and replaces it with
//      the updated version, so there's no need to manually re-enable.
//
function createTodoEl(todo) {
  const li = document.createElement("li");
  li.className = "todo-item" + (todo.completed ? " todo-item--completed" : "");
  li.dataset.id = todo.id; // store the id on the element for easy reference

  const completeLabel = todo.completed ? "Undo" : "Complete";
  const completeCls   = todo.completed ? "btn--undo" : "btn--complete";

  // Build the inner HTML using a template literal.
  // All user-supplied values go through escapeHtml() to prevent XSS.
  li.innerHTML = `
    <div class="todo-item__body">
      <p class="todo-item__title">${escapeHtml(todo.title)}</p>
      ${todo.description
        ? `<p class="todo-item__desc">${escapeHtml(todo.description)}</p>`
        : ""}
      <p class="todo-item__meta">${formatDate(todo.created_at)}</p>
    </div>
    <div class="todo-item__actions">
      <button class="btn ${completeCls} js-complete" aria-label="${completeLabel}">
        ${completeLabel}
      </button>
      <button class="btn btn--delete js-delete" aria-label="Delete">Delete</button>
    </div>`;

  // --- "Complete" / "Undo" button ---
  // Flips the completed flag to its opposite value (!todo.completed).
  // The async arrow function lets us use await inside an event listener.
  li.querySelector(".js-complete").addEventListener("click", async () => {
    li.querySelectorAll(".btn").forEach(b => (b.disabled = true)); // disable during request
    try {
      await updateTodo(todo.id, { completed: !todo.completed });
      // On success renderTodos() rebuilds the list — this li is replaced
    } catch (err) {
      showToast(err.message, true);
      li.querySelectorAll(".btn").forEach(b => (b.disabled = false)); // restore on failure
    }
  });

  // --- "Delete" button ---
  // Fades the item visually before the request completes so it feels instant.
  // If the request fails, we restore the opacity and re-enable buttons.
  li.querySelector(".js-delete").addEventListener("click", async () => {
    li.style.opacity = "0.4"; // optimistic visual feedback
    li.querySelectorAll(".btn").forEach(b => (b.disabled = true));
    try {
      await deleteTodo(todo.id);
      // On success renderTodos() removes this element from the DOM entirely
    } catch (err) {
      showToast(err.message, true);
      li.style.opacity = ""; // undo the visual change on failure
      li.querySelectorAll(".btn").forEach(b => (b.disabled = false));
    }
  });

  return li;
}

// -----------------------------------------------------------------------------
// renderTodos()
// -----------------------------------------------------------------------------
// The single function that redraws the entire visible list. Called after every
// state change (fetch, create, update, delete, filter change).
//
// Uses a DocumentFragment to build all <li> elements off-screen first, then
// appends them in one operation. This is more efficient than appending one
// at a time because each DOM insertion can trigger a browser layout recalculation;
// a fragment batches them all into a single reflow.
//
function renderTodos() {
  const visible = getFilteredTodos(); // apply the active filter
  todoList.innerHTML = "";            // clear whatever was there before

  if (visible.length === 0) {
    emptyState.hidden = false; // show the "nothing here" message
  } else {
    emptyState.hidden = true;
    const frag = document.createDocumentFragment(); // off-screen container
    visible.forEach(t => frag.appendChild(createTodoEl(t)));
    todoList.appendChild(frag); // single DOM insertion for the whole list
  }

  updateStats(); // always refresh the header counter
}


// =============================================================================
// EVENT LISTENERS
// =============================================================================
//
// Event listeners wire user interactions (form submit, button click) to the
// functions above. They are the entry points for all user-initiated actions.
//

// -----------------------------------------------------------------------------
// Form submit — Add a new todo
// -----------------------------------------------------------------------------
// `e.preventDefault()` stops the browser's default form behaviour, which would
// reload the page. We handle the submission ourselves via the API instead.
//
// The `finally` block runs whether the try succeeded or threw an error.
// We use it to re-enable the submit button in both cases.
//
addForm.addEventListener("submit", async e => {
  e.preventDefault(); // don't reload the page on submit

  const title = titleInput.value.trim(); // .trim() removes leading/trailing spaces
  if (!title) {
    titleInput.focus();
    showToast("Please enter a title", true);
    return; // stop here — don't send an empty title to the API
  }

  const description = descInput.value.trim();
  const submitBtn = addForm.querySelector(".add-form__btn");
  submitBtn.disabled = true; // prevent double-submission while request is in flight

  try {
    await createTodo(title, description);
    titleInput.value = ""; // clear the inputs on success
    descInput.value  = "";
    titleInput.focus(); // ready for the next todo
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false; // always re-enable, even if there was an error
  }
});

// -----------------------------------------------------------------------------
// Filter button clicks — All / Active / Completed
// -----------------------------------------------------------------------------
// When a filter tab is clicked:
//   1. Update `activeFilter` to the value stored on the button's data-filter attribute.
//   2. Remove the "active" highlight from all buttons, then add it to the clicked one.
//   3. Re-render — getFilteredTodos() will now return a different subset.
//
// No API call is needed here; we already have all the todos in `todos[]`.
//
filterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter; // read the data-filter="all/active/completed" attribute
    filterBtns.forEach(b => b.classList.remove("filters__btn--active")); // clear all highlights
    btn.classList.add("filters__btn--active"); // highlight the clicked tab
    renderTodos(); // redraw with the new filter applied
  });
});


// =============================================================================
// INITIALISATION
// =============================================================================
//
// DOMContentLoaded fires when the browser has finished parsing the HTML and
// building the DOM, but before images and stylesheets have fully loaded.
// It is the earliest safe moment to access DOM elements and start the app.
//
// We call fetchTodos() here to load the initial list from the backend as
// soon as the page is ready.
//
document.addEventListener("DOMContentLoaded", fetchTodos);
