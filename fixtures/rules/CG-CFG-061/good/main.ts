import { BrowserWindow } from "electron";
import { join } from "path";
export function create() {
  return new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });
}
