const statusText = document.querySelector("#status-text");
const statusDot = document.querySelector("#status-dot");
const noteList = document.querySelector("#notes");
const noteSearch = document.querySelector("#note-search");
const preview = document.querySelector("#preview");
const message = document.querySelector("#message");
const saveButton = document.querySelector("#save-button");
const form = document.querySelector("#note-form");
let allNotes = [];
let selectedNoteId = "";
let previewRequest = 0;

async function request(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function showPreviewMessage(text) {
  preview.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = text;
  preview.append(empty);
}

async function selectNote(note) {
  selectedNoteId = note.id;
  const currentRequest = ++previewRequest;
  for (const button of noteList.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.noteId === note.id));
  }
  preview.setAttribute("aria-busy", "true");
  showPreviewMessage("Loading note…");
  try {
    const result = await request("/api/notes/" + encodeURIComponent(note.id));
    if (currentRequest !== previewRequest) return;
    preview.replaceChildren();
    const title = document.createElement("p");
    title.className = "note-title";
    title.textContent = note.title;
    const date = document.createElement("time");
    date.className = "note-date";
    date.dateTime = note.createdAt;
    date.textContent = new Date(note.createdAt).toLocaleString();
    const content = document.createElement("p");
    content.className = "preview-content";
    content.textContent = result.content;
    preview.append(title, date, content);
  } catch (error) {
    if (currentRequest === previewRequest) {
      showPreviewMessage(error.message || "Could not load this note.");
    }
  } finally {
    if (currentRequest === previewRequest) preview.removeAttribute("aria-busy");
  }
}

function renderNotes(notes, preferredId = selectedNoteId) {
  allNotes = notes;
  const query = noteSearch.value.trim().toLowerCase();
  const visibleNotes = notes.filter((note) => note.title.toLowerCase().includes(query));
  noteList.replaceChildren();
  if (visibleNotes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = notes.length === 0
      ? "No notes yet. Add one above to get started."
      : "No notes match that title.";
    noteList.append(empty);
    selectedNoteId = "";
    previewRequest += 1;
    preview.removeAttribute("aria-busy");
    showPreviewMessage("Choose a note to preview its contents.");
    return;
  }
  for (const note of visibleNotes) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "note";
    item.dataset.noteId = note.id;
    item.setAttribute("aria-pressed", String(note.id === preferredId));
    const title = document.createElement("p");
    title.className = "note-title";
    title.textContent = note.title;
    const date = document.createElement("time");
    date.className = "note-date";
    date.dateTime = note.createdAt;
    date.textContent = new Date(note.createdAt).toLocaleString();
    item.append(title, date);
    item.addEventListener("click", () => selectNote(note));
    noteList.append(item);
  }
  const selected = visibleNotes.find((note) => note.id === preferredId) ?? visibleNotes[0];
  if (selected && selected.id !== selectedNoteId) void selectNote(selected);
  else if (selected) {
    for (const button of noteList.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.noteId === selected.id));
    }
  }
}

noteSearch.addEventListener("input", () => renderNotes(allNotes));

async function refresh() {
  try {
    const [status, notes] = await Promise.all([
      request("/api/status"),
      request("/api/notes")
    ]);
    statusText.textContent = status.message;
    statusDot.className = "dot connected";
    document.querySelector("#mode").textContent = status.mode === "demo" ? "Demo" : "Solid Pod";
    document.querySelector("#demo-hint").hidden = status.mode !== "demo";
    renderNotes(notes.notes);
  } catch (error) {
    statusText.textContent = error.message;
    statusDot.className = "dot error";
    noteList.replaceChildren();
    const unavailable = document.createElement("p");
    unavailable.className = "empty";
    unavailable.textContent = "Could not load notes. Check the connection and try again.";
    noteList.append(unavailable);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  saveButton.disabled = true;
  try {
    const result = await request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.querySelector("#title").value,
        content: document.querySelector("#content").value
      })
    });
    form.reset();
    message.textContent = "Note saved.";
    renderNotes(result.notes);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

refresh();