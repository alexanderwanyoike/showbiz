type ApplicationMenu = {
  setApplicationMenu(menu: null): void;
};

export function hideDefaultApplicationMenu(menu: ApplicationMenu): void {
  menu.setApplicationMenu(null);
}
