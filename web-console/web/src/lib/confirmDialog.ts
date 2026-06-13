import type { ConfirmDialogRequest } from "../types";

let openConfirmDialog: ((request: ConfirmDialogRequest) => void) | null = null;

export function setOpenConfirmDialog(handler: ((request: ConfirmDialogRequest) => void) | null) {
  openConfirmDialog = handler;
}

export function confirmDialog(message: string, options: Partial<Omit<ConfirmDialogRequest, "message" | "resolve">> = {}) {
  return new Promise<boolean>((resolve) => {
    const danger = options.danger ?? /delete|remove|reset|restore|wipe|kick|stop|disable|despawn|destructive|cannot be undone/i.test(message);
    if (!openConfirmDialog) {
      resolve(false);
      return;
    }
    openConfirmDialog({
      title: options.title || (danger ? "Confirm Action" : "Continue?"),
      message,
      confirmLabel: options.confirmLabel || "Yes",
      cancelLabel: options.cancelLabel || "No",
      danger,
      details: options.details,
      resolve
    });
  });
}

export function confirmSettingsRestart(kind: "UserEngine" | "UserGame") {
  return confirmDialog(
    `Save ${kind} changes? To apply these changes, the Dune server services need to restart.`,
    {
      title: "Restart Required",
      confirmLabel: "Yes, Save And Restart",
      cancelLabel: "No, Cancel"
    }
  );
}

