const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let db;
let insertOrUpdateBook;

// 1. Initialize SQLite and tables
function initDatabase() {
  const dbFolder = path.join(__dirname, "database");
  const dbPath = path.join(dbFolder, "library.db");

  // Make sure the /database folder exists
  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
  }

  // Open (or create) the SQLite DB file
  db = new Database(dbPath);

  // Create tables if they don't exist yet
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      isbn TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      publisher TEXT,
      published_year INTEGER
    );

    CREATE TABLE IF NOT EXISTS book_copies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      copy_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      location TEXT,
      copy_barcode TEXT UNIQUE,
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_copy_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      checkout_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      FOREIGN KEY (book_copy_id) REFERENCES book_copies(id)
    );
  `);

  // Prepare a reusable INSERT/UPDATE statement for books
  insertOrUpdateBook = db.prepare(`
    INSERT INTO books (isbn, title, author)
    VALUES (?, ?, ?)
    ON CONFLICT(isbn) DO UPDATE SET
      title  = excluded.title,
      author = excluded.author
  `);

  console.log("✅ SQLite database initialized at:", dbPath);
}

// 2. Create the Electron window
function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("library_management_container.html");
}

// 3. App lifecycle
app.whenReady().then(() => {
  initDatabase(); // make sure DB is ready first
  // Handle "add book" requests from the renderer
  ipcMain.handle("books:add", (event, book) => {
    const { isbn, title, author } = book;

    if (!isbn || !title) {
      throw new Error("ISBN and title are required");
    }

    const result = insertOrUpdateBook.run(isbn, title, author || null);

    return {
      success: true,
      changes: result.changes,
      id: result.lastInsertRowid,
    };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (db) db.close(); // close DB cleanly
    app.quit();
  }
});
