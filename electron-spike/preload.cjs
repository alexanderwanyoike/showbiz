const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spike", {
  listVideos: () => ipcRenderer.invoke("list-videos"),
  readVideo: (filePath) => ipcRenderer.invoke("read-video", filePath),
});
