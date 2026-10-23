const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require("obsidian");

const DEFAULT_SETTINGS = {
	themes: [{ repo: "VeryRandomness/obsidian-nordic-days-and-nights", branch: "", enabled: true }],
};

// Accepts "owner/repo", "https://github.com/owner/repo", ".../tree/branch", or a ".git" URL.
function parseLink(input) {
	let s = (input || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
	let branch = "";
	const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)(?:\/tree\/(.+))?$/i)
		|| s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
	if (!m) return null;
	if (m[3]) branch = m[3];
	return { repo: `${m[1]}/${m[2]}`, branch };
}

module.exports = class ThemeAutoUpdate extends Plugin {
	async onload() {
		await this.loadSettings();
		this.addCommand({
			id: "check-theme-update",
			name: "Check for theme updates now",
			callback: () => this.checkAll(true),
		});
		this.addSettingTab(new ThemeAutoUpdateSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => this.checkAll(false));
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		if (!Array.isArray(this.settings.themes)) this.settings.themes = DEFAULT_SETTINGS.themes;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async checkAll(manual) {
		const active = this.settings.themes.filter((t) => t.enabled !== false);
		if (!active.length) {
			if (manual) new Notice("Theme Auto-Update: no themes in the list.");
			return;
		}
		for (const t of active) await this.check(t, manual);
	}

	async defaultBranch(repo) {
		const res = await requestUrl({
			url: `https://api.github.com/repos/${repo}`,
			headers: { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
		});
		return (res.json && res.json.default_branch) || "main";
	}

	// Resolve the branch to an exact commit so we never read a stale CDN copy of the branch.
	async latestRef(repo, branch) {
		try {
			const res = await requestUrl({
				url: `https://api.github.com/repos/${repo}/commits/${branch}`,
				headers: { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
			});
			if (res.json && res.json.sha) return res.json.sha;
		} catch (e) {
			console.warn(`Theme Auto-Update: commit lookup failed for ${repo}, falling back to branch`, e);
		}
		return branch;
	}

	async fetchText(repo, ref, file) {
		const url = `https://raw.githubusercontent.com/${repo}/${ref}/${file}?t=${Date.now()}`;
		const res = await requestUrl({ url, headers: { "Cache-Control": "no-cache" } });
		return res.text;
	}

	// Downloads theme.css + manifest.json for one entry and installs them under themes/<manifest name>.
	// Returns a short status string; throws on failure.
	async check(entry, manual) {
		const adapter = this.app.vault.adapter;
		const repo = entry.repo;
		try {
			const branch = entry.branch || (await this.defaultBranch(repo));
			const ref = await this.latestRef(repo, branch);
			const [css, manifest] = await Promise.all([
				this.fetchText(repo, ref, "theme.css"),
				this.fetchText(repo, ref, "manifest.json"),
			]);
			const meta = JSON.parse(manifest);
			const name = meta.name;
			if (!name || /[\\/:*?"<>|]/.test(name) || name.includes("..")) {
				throw new Error(`manifest.json has an invalid theme name: ${JSON.stringify(name)}`);
			}
			if (!css.trim()) throw new Error("downloaded theme.css is empty");

			entry.name = name;
			entry.version = meta.version;
			const dir = `${this.app.vault.configDir}/themes/${name}`;

			const read = async (f) => {
				try { return await adapter.read(`${dir}/${f}`); } catch { return null; }
			};
			const norm = (s) => (s || "").replace(/\r\n/g, "\n");
			if (norm(await read("theme.css")) === norm(css) && norm(await read("manifest.json")) === norm(manifest)) {
				console.log(`Theme Auto-Update: ${name} up to date (${meta.version}, ${String(ref).slice(0, 7)})`);
				if (manual) new Notice(`${name} is up to date (version ${meta.version}).`);
				await this.saveSettings();
				return "up-to-date";
			}

			const fresh = !(await adapter.exists(dir));
			if (fresh) await adapter.mkdir(dir);
			await adapter.write(`${dir}/theme.css`, css);
			await adapter.write(`${dir}/manifest.json`, manifest);

			let reloaded = false;
			try {
				if (this.app.customCss.theme === name) {
					this.app.customCss.setTheme(name);
					reloaded = true;
				}
			} catch (e) { console.warn("Theme Auto-Update: reload failed", e); }
			new Notice(
				`${name} ${fresh ? "installed" : "updated to"} ${meta.version}${reloaded ? "" : " (restart Obsidian to apply)"}.`
			);
			await this.saveSettings();
			return fresh ? "installed" : "updated";
		} catch (e) {
			console.error(`Theme Auto-Update (${repo}):`, e);
			if (manual) new Notice(`Theme update check failed for ${repo}: ${e.message}`);
			throw e;
		}
	}
};

class ThemeAutoUpdateSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Theme Auto-Update" });
		containerEl.createEl("p", {
			text: "Each GitHub repo below must have theme.css and manifest.json at its root. Themes are checked on startup and installed into your themes folder using the name in manifest.json.",
			cls: "setting-item-description",
		});

		this.plugin.settings.themes.forEach((t, i) => {
			const label = t.name ? `${t.name}${t.version ? ` (${t.version})` : ""}` : t.repo;
			new Setting(containerEl)
				.setName(label)
				.setDesc(`${t.repo}${t.branch ? ` @ ${t.branch}` : ""}`)
				.addToggle((tg) =>
					tg.setValue(t.enabled !== false).onChange(async (v) => {
						t.enabled = v;
						await this.plugin.saveSettings();
					})
				)
				.addExtraButton((b) =>
					b.setIcon("refresh-cw").setTooltip("Check this theme now").onClick(async () => {
						try { await this.plugin.check(t, true); } catch {}
						this.display();
					})
				)
				.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove from list (keeps the installed theme)").onClick(async () => {
						this.plugin.settings.themes.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});

		let link = "";
		new Setting(containerEl)
			.setName("Add a theme")
			.setDesc("Paste a GitHub link (https://github.com/owner/repo, optionally /tree/branch) or owner/repo.")
			.addText((txt) => txt.setPlaceholder("https://github.com/owner/repo").onChange((v) => (link = v)))
			.addButton((btn) =>
				btn.setButtonText("Add & install").setCta().onClick(async () => {
					const parsed = parseLink(link);
					if (!parsed) return new Notice("That doesn't look like a GitHub repo link.");
					const dupe = this.plugin.settings.themes.some(
						(t) => t.repo.toLowerCase() === parsed.repo.toLowerCase()
					);
					if (dupe) return new Notice("That repo is already in the list.");
					const entry = { repo: parsed.repo, branch: parsed.branch, enabled: true };
					try {
						await this.plugin.check(entry, true);
					} catch {
						return; // check() already showed the error; don't add a broken entry
					}
					this.plugin.settings.themes.push(entry);
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Check all now")
			.addButton((btn) =>
				btn.setButtonText("Check").onClick(async () => {
					await this.plugin.checkAll(true);
					this.display();
				})
			);
	}
}
