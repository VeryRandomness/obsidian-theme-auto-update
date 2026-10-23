# Theme Auto-Update

> **This plugin is now part of [Vault Management](https://github.com/VeryRandomness/obsidian-vault-management)**, which combines bullet variants, color swatches, bulk property editing and theme updates in one plugin. This repo is archived and no longer updated.

An [Obsidian](https://obsidian.md) plugin that installs themes from GitHub and keeps them up to date. Add a theme's repo once; from then on it is checked every time Obsidian starts, and a newer `theme.css` is installed automatically.

## What it does

- Keeps a list of GitHub theme repos (Nordic Days & Nights is in the list by default).
- On startup, checks each enabled repo's latest commit and downloads `theme.css` and `manifest.json` if they changed.
- Installs them into `.obsidian/themes/<name from manifest.json>/`, and reloads the theme right away if it's the one in use. Otherwise it asks you to restart Obsidian.
- Command: **Check for theme updates now**.

## Install

This plugin isn't in Obsidian's community plugin list, so install it by hand:

1. In your vault, create the folder `.obsidian/plugins/theme-auto-update/`.
2. Copy `main.js` and `manifest.json` from this repo into it.
3. In Obsidian: Settings → Community plugins → turn off Restricted mode, reload, and enable **Theme Auto-Update**.
4. Restart Obsidian. Your themes download on launch.

## Adding a theme

Settings → Theme Auto-Update → **Add a theme**. Paste a GitHub link (`https://github.com/owner/repo`, optionally `/tree/branch`) or `owner/repo`, then **Add & install**. Each entry can be switched off, checked on its own, or removed. Removing keeps the installed theme.

A theme repo needs `theme.css` and `manifest.json` at its root, and `manifest.json` needs a `name` (used as the theme's folder name).

## Notes

- Your list of themes is stored in the plugin's `data.json`, which is not part of this repo.
- It reads from GitHub's public API and raw file hosts, so it needs an internet connection and public repos.
- The plugin's ID is `theme-auto-update`, which isn't used by any plugin in the community store, so Obsidian's "Check for updates" won't replace it.
