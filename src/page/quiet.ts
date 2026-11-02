// Page-world patches that keep automated shares from touching the clipboard or opening share popups.
// Whatnot still gets a resolved promise, and its LogShare request fires either way.
export const installQuietPatches = (quiet: () => boolean) => {
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text: string) => (quiet() ? Promise.resolve() : writeText(text));
  }

  if (typeof document.execCommand === 'function') {
    const execCommand = document.execCommand.bind(document);
    document.execCommand = (command: string, showUI?: boolean, value?: string) =>
      quiet() && command.toLowerCase() === 'copy' ? true : execCommand(command, showUI, value);
  }

  const open = window.open.bind(window);
  window.open = (...args: Parameters<typeof window.open>) => (quiet() ? null : open(...args));

  // X/Facebook share links are target=_blank anchors; Whatnot's onClick still runs, only the tab is suppressed.
  document.addEventListener(
    'click',
    (e) => {
      if (!quiet()) return;
      const link = (e.target as Element | null)?.closest?.('a[target="_blank"]');
      if (link) e.preventDefault();
    },
    true,
  );
};
