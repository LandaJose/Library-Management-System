const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  console.log("Electron loaded");
});

contextBridge.exposeInMainWorld("libraryAPI", {
  addBook: (book) => ipcRenderer.invoke("books:add", book),
});
