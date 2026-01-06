const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let db;
let getMaxCopyNumberForIsbn;
let insertBookCopy;
let getAllBooks;
let findBook;
let getAllStudents;
let findStudent;
let insertStudent;

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
    pk_books INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn TEXT NOT NULL,
    book_copy_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT
  );

  CREATE TABLE IF NOT EXISTS loans (
    pk_loans INTEGER PRIMARY KEY AUTOINCREMENT,
    k_books INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    checkout_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT
  );
  
  CREATE TABLE IF NOT EXISTS students (
    pk_student INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    period INTEGER NOT NULL
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

  getAllBooks = db.prepare(`
    SELECT 
      title
      ,author
      ,book_copy_number
    FROM books
    ORDER BY title ASC, book_copy_number ASC
  `);

  findBook = db.prepare(`
    SELECT 
      title
      ,author
      ,book_copy_number
    FROM books
    WHERE title LIKE ?
    ORDER BY title ASC, book_copy_number ASC
  `);

  getAllStudents = db.prepare(`
    SELECT 
      full_name
      ,period
    FROM students
    ORDER BY period ASC, full_name asc
  `);

  findStudent = db.prepare(`
  SELECT 
    full_name
    ,period
  FROM students
  WHERE full_name LIKE ?
  ORDER BY full_name ASC, period ASC
`);

  insertStudent = db.prepare(`
    INSERT INTO students (full_name, period)
    VALUES (?, ?)
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

  ipcMain.handle("books:list", () => {
    const rows = getAllBooks.all(); // runs SELECT
    return rows;
  });

  ipcMain.handle("books:search", (event, bookTitle) => {
    const rows = findBook.all(`%${bookTitle}%`);
    return rows;
  });

  ipcMain.handle("student:list", () => {
    const rows = getAllStudents.all(); // runs SELECT
    return rows;
  });

  ipcMain.handle("student:search", (event, studentName) => {
    const rows = findStudent.all(`%${studentName}%`);
    return rows;
  });

  // main.js

  ipcMain.handle("student:add", (event, student) => {
    // CHANGE THIS LINE: extract full_name and period from the student object
    const { full_name, period } = student;

    // Now these variables exist, so this check will work
    if (!full_name || period === undefined || period === null) {
      throw new Error("full_name and period are required");
    }

    const result = insertStudent.run(full_name, Number(period));

    return { success: true, id: result.lastInsertRowid };
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
