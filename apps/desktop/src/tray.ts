import { Menu, Tray, type MenuItemConstructorOptions } from "electron";

import { getAppStateSnapshot } from "./app-state.js";
import { createTrayIcon } from "./assets.js";
import { hideDefaultPet, isDefaultPetVisible, setDefaultPetPaused, showDefaultPet } from "./default-pet-controller.js";
import { t } from "./i18n/index.js";
import { quitOpenPets } from "./lifecycle.js";
import { info, openLogsFolder, warn } from "./logger.js";
import { shellState, togglePaused } from "./state.js";
import { getUpdateStatus, openUpdateReleasePage } from "./update-checker.js";
import { subscribePluginVoiceOperation } from "./plugin-voice.js";
import { openControlCenterWindow } from "./windows.js";
import { onVoiceAssistantEvent } from "./voice-assistant-host.js";
import { executeDefaultPetPluginCommand } from "./plugin-service.js";

let tray: Tray | null = null;
let voiceOperationSubscriptionInstalled = false;
let voiceAssistantSubscriptionInstalled = false;

export function createAppTray(): Tray {
  if (tray) {
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Extrafriendly Cat · 你的猫猫");
  if (!voiceOperationSubscriptionInstalled) {
    voiceOperationSubscriptionInstalled = true;
    subscribePluginVoiceOperation(() => refreshTrayMenu());
  }
  if (!voiceAssistantSubscriptionInstalled) {
    voiceAssistantSubscriptionInstalled = true;
    onVoiceAssistantEvent(() => refreshTrayMenu());
  }
  refreshTrayMenu();
  info("tray", "created");
  console.log("OpenPets tray created.");

  return tray;
}

export function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const state = getAppStateSnapshot();
  const defaultPet = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId && !pet.broken) ?? state.pets.installed[0];
  const defaultPetName = defaultPet?.displayName ?? t("common.builtInPet");

  const menu = Menu.buildFromTemplate([
    {
      label: "Extrafriendly Cat",
      enabled: false,
    },
    ...createUpdateMenuItems(),
    { type: "separator" },
    {
      label: "猫猫设置",
      click: () => {
        void executeDefaultPetPluginCommand("extrafriendly.cat", "settings").catch((error: unknown) => {
          warn("tray", "cat settings open failed", { reason: error instanceof Error ? error.message : String(error) });
        });
      },
    },
    {
      label: t("tray.defaultPet", { name: defaultPetName }),
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: isDefaultPetVisible() ? t("tray.hideDefaultPet") : t("tray.showDefaultPet"),
      click: () => {
        if (isDefaultPetVisible()) {
          hideDefaultPet();
        } else {
          showDefaultPet();
        }

        refreshTrayMenu();
      },
    },
    {
      label: shellState.paused ? t("tray.resumeAllPets") : t("tray.pauseAllPets"),
      click: () => {
        const paused = togglePaused();
        setDefaultPetPaused(paused);
        info("tray", "pause toggled", { paused });
        console.log(paused ? "OpenPets paused." : "OpenPets resumed.");
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: t("tray.managePets"),
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: t("tray.controlCenter"),
      click: () => openControlCenterWindow(),
    },
    { label: "个人 AI 接口", click: () => openControlCenterWindow("assistant") },
    {
      label: t("tray.plugins"),
      click: () => openControlCenterWindow("plugins"),
    },
    {
      label: t("tray.settings"),
      click: () => openControlCenterWindow("settings"),
    },
    { type: "separator" },
    {
      label: t("tray.openLogsFolder"),
      click: () => { void openLogsFolder(); },
    },
    { type: "separator" },
    {
      label: t("tray.quit"),
      click: () => quitOpenPets(),
    },
  ]);

  tray.setContextMenu(menu);
}

function createUpdateMenuItems(): MenuItemConstructorOptions[] {
  const status = getUpdateStatus();
  if (status.state !== "available") return [];
  return [
    {
      label: t("tray.updateAvailable", { version: status.latestVersion ?? t("common.latest") }),
      click: () => {
        void openUpdateReleasePage().catch((error: unknown) => {
          warn("tray", "release page open failed", { reason: error instanceof Error ? error.message : String(error) });
        });
      },
    },
  ];
}
