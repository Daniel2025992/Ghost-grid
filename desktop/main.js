const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
function create() {
  const w = new BrowserWindow({ width: 1366, height: 800, backgroundColor: '#02030a', autoHideMenuBar: true, title: 'GHOST//GRID', webPreferences: { contextIsolation: true } });
  Menu.setApplicationMenu(null);
  w.loadFile(path.join(__dirname, 'app', 'index.html'));
  w.webContents.setWindowOpenHandler(({ url }) => { require('electron').shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
