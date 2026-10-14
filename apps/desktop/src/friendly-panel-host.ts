import { refreshDefaultPetContent } from "./default-pet-controller.js";
import { getFriendlyAppearance, saveFriendlyAppearance } from "./friendly-appearance.js";
import { refreshPetGazePreference } from "./pet-window-gaze.js";
import { openControlCenterWindow } from "./windows.js";

/** This small bridge belongs only to the bundled cat panel, never community plugins. */
export async function handleFriendlyPanelMessage(
  pluginId: string,
  value: unknown,
  reply: (message: unknown) => void,
): Promise<boolean> {
  if (pluginId !== "extrafriendly.cat" || !value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (typeof message.type !== "string" || !message.type.startsWith("host:")) return false;
  if (message.type === "host:open") {
    if (message.route === "pets" || message.route === "assistant" || message.route === "settings") {
      openControlCenterWindow(message.route);
    }
  } else if (message.type === "host:appearance") {
    if (typeof message.animation !== "boolean" || typeof message.customSkins !== "boolean") {
      throw new Error("Invalid cat appearance settings.");
    }
    // Closing the import feature preserves the user's currently selected artwork.
    saveFriendlyAppearance({ animation: message.animation, customSkins: message.customSkins });
    refreshDefaultPetContent();
    refreshPetGazePreference();
  }
  reply({ type: "host:state", ...getFriendlyAppearance() });
  return true;
}
