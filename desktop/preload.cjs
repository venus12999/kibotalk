const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("kibotalkDesktop", {
  isDesktop: true,
});
