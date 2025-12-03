const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let db;
let getMaxCopyNumberForIsbn;
let insertBookCopy;

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
    isbn TEXT NOT NULL,
    book_copy_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    k_books INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    checkout_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT
  );
`);

  getMaxCopyNumberForIsbn = db.prepare(`
  SELECT IFNULL(MAX(book_copy_number), 0) AS maxCopy
  FROM books
  WHERE isbn = ?
`);

  insertBookCopy = db.prepare(`
  INSERT INTO books (isbn, book_copy_number, title, author)
  VALUES (?, ?, ?, ?)
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

    // 1) Get current highest copy number for this ISBN
    const row = getMaxCopyNumberForIsbn.get(isbn);
    const nextCopyNumber = row.maxCopy + 1;

    // 2) Insert a new row for this physical copy
    const result = insertBookCopy.run(
      isbn,
      nextCopyNumber,
      title,
      author || null
    );

    return {
      success: true,
      id: result.lastInsertRowid,
      bookCopyNumber: nextCopyNumber,
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
