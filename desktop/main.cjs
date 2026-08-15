const { app, BrowserWindow, Menu, session, shell, systemPreferences } = require("electron");
const path = require("node:path");

const APP_URL = process.env["KIBOTALK_URL"] || "https://kibotalk.lovable.app";
const APP_HOSTS = new Set([
  new URL(APP_URL).host,
  "kibotalk.lovable.app",
  "kibotalk.superpowerlulu.win",
]);

function isAllowedUrl(target) {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (APP_HOSTS.has(url.host)) return true;
    if (url.host.endsWith(".supabase.co")) return true;
    return false;
  } catch {
    return false;
  }
}

function installMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  if (process.platform === "darwin") {
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch {
      // Gatekeeper / unsigned builds may still prompt later from Chromium.
    }
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 820,
    minHeight: 640,
    title: "KiboTalk",
    backgroundColor: "#f7f4ee",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const userAgent = `${session.defaultSession.getUserAgent()} KiboTalkDesktop/${app.getVersion()}`;
  await win.loadURL(APP_URL, { userAgent });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function allowMediaPermission(_webContents, permission, callback, details) {
  const name = String(permission);
  const types = details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  const allowed =
    name === "media" ||
    name === "microphone" ||
    name === "audioCapture" ||
    name === "display-capture" ||
    name === "clipboard-sanitized-write" ||
    types.includes("audio");
  callback(allowed);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler(allowMediaPermission);
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "microphone" || permission === "display-capture";
  });
  installMenu();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
