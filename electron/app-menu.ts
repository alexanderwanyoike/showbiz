export function projectApplicationMenu(
  send: (action: "new" | "open" | "save" | "save_as" | "close") => void,
) {
  return [
    {
      label: "&File",
      submenu: [
        {
          label: "New Project…",
          accelerator: "CmdOrCtrl+N",
          click: () => send("new"),
        },
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
          click: () => send("open"),
        },
        { type: "separator" as const },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => send("save"),
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => send("save_as"),
        },
        { type: "separator" as const },
        {
          label: "Close Project",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => send("close"),
        },
        { type: "separator" as const },
        { role: "quit" as const },
      ],
    },
    { role: "editMenu" as const },
    { label: "&View", submenu: [{ role: "resetZoom" as const }, { role: "zoomIn" as const }, { role: "zoomOut" as const }, { type: "separator" as const }, { role: "togglefullscreen" as const }] },
    { role: "windowMenu" as const },
  ];
}
