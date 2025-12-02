import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sessions = new Map(); // sessionId -> ChildProcess
const isDev = process.env.ELECTRON_ENV === 'development';
let win;

const sendToRenderer = (channel, payload) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
};

const mimeFromExt = (ext) => {
  const lower = ext.toLowerCase();
  if (lower === '.png') return 'image/png';
  if (lower === '.jpg' || lower === '.jpeg') return 'image/jpeg';
  if (lower === '.gif') return 'image/gif';
  if (lower === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#060814',
    titleBarStyle: 'hiddenInset',
    title: 'Codex Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devServer) {
    window.loadURL(devServer);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.codex.desktop');
  app.setName('Codex Desktop');
  win = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      win = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (isDev) {
    // Best-effort cleanup of dev ports so next run doesn't hit EADDRINUSE.
    spawn('npx', ['kill-port', '5173', '5175'], {
      shell: true,
      windowsHide: true,
    });
  }
});

ipcMain.handle('file:pickImages', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Odaberi slike',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('cwd:pick', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Odaberi radni direktorij',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('file:previewImage', async (_event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const mime = mimeFromExt(path.extname(filePath));
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (err) {
    console.error('Failed to read image', err);
    return null;
  }
});

// For now session:start is a no-op placeholder so the renderer can establish listeners.
ipcMain.handle('session:start', async (_event, payload) => {
  const { sessionId } = payload;
  // ensure no stale child
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.kill();
    sessions.delete(sessionId);
  }
});

ipcMain.handle('session:send', async (_event, payload) => {
  const { sessionId, text, attachments, model, sandbox, cwd } = payload;

  const cliCmd = process.env.CODEX_CLI_PATH ?? 'codex';
  const cliArgs = ['exec', '--json', '--skip-git-repo-check'];
  (attachments ?? []).forEach((file) => {
    cliArgs.push('--image', file);
  });
  if (model) {
    cliArgs.push('-m', model);
  }
  if (sandbox) {
    cliArgs.push('--sandbox', sandbox);
  }

  // Kill any existing child for this session before starting a new run.
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.kill();
    sessions.delete(sessionId);
  }

  let child;
  try {
    child = spawn(cliCmd, cliArgs, {
      cwd: cwd ?? process.cwd(),
      env: process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
  } catch (err) {
    sendToRenderer('session:error', { sessionId, message: err.message });
    return;
  }

  child.once('error', (err) => {
    sendToRenderer('session:error', { sessionId, message: err.message });
    sessions.delete(sessionId);
  });

  child.stdout.on('data', (data) => {
    sendToRenderer('session:data', { sessionId, data: data.toString() });
  });

  child.stderr.on('data', (data) => {
    sendToRenderer('session:data', { sessionId, data: data.toString() });
  });

  child.on('exit', (code, signal) => {
    sendToRenderer('session:exit', { sessionId, code: code ?? 0, signal });
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, child);

  // Write prompt to stdin and close.
  const prompt = text ?? '';
  child.stdin.write(prompt + os.EOL);
  child.stdin.end();
});

ipcMain.handle('session:stop', async (_event, sessionId) => {
  const child = sessions.get(sessionId);
  if (child) {
    child.kill();
    sessions.delete(sessionId);
  }
});
