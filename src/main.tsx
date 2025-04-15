import * as React from 'react';
import { App, Plugin, WorkspaceLeaf, addIcon, PluginSettingTab, Setting } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { ClipperCatalogView, VIEW_TYPE_CLIPPER_CATALOG } from './ClipperCatalogView';

interface ObsidianClipperCatalogSettings {
  sourcePropertyName: string;
  ignoredDirectories: string[];
  isAdvancedSettingsExpanded: boolean;
  showClippedFrom: boolean;
  includeFrontmatterTags: boolean;
  openInSameLeaf: boolean;
  readPropertyName: string;
  useNativeCheckbox: boolean;
  hideCompleted: boolean;
  showOnlyCompleted: boolean;
}

interface ObsidianSettings {
  open: () => void;
  openTabById: (tabId: string) => void;
}

// Add this before the ObsidianClipperCatalog class definition
export const ICON_NAME = 'clipper-catalog';

const DEFAULT_SETTINGS: ObsidianClipperCatalogSettings = {
  sourcePropertyName: 'source',
  ignoredDirectories: [],
  isAdvancedSettingsExpanded: false,
  showClippedFrom: true,
  includeFrontmatterTags: true,
  openInSameLeaf: false,
  readPropertyName: '',
  useNativeCheckbox: false,
  hideCompleted: false,
  showOnlyCompleted: false
}

export default class ObsidianClipperCatalog extends Plugin {
  settings: ObsidianClipperCatalogSettings;

  openSettings(): void {
    const setting = (this.app as any).setting as ObsidianSettings;
    setting.open();
    setting.openTabById('clipper-catalog');
  }

  async onload() {
    await this.loadSettings();

    // Register the custom icon
    addIcon(ICON_NAME, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1"/>
      <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" stroke-width="1"/>
      <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" stroke-width="1"/>
      </svg>`);

    this.registerView(
      VIEW_TYPE_CLIPPER_CATALOG,
      (leaf: WorkspaceLeaf) => new ClipperCatalogView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon(ICON_NAME, 'Show all clippings', (evt: MouseEvent) => {
      // Get active leaf or create new one in center
      const leaf = this.app.workspace.getLeaf('tab');
      if (leaf) {
        leaf.setViewState({
          type: VIEW_TYPE_CLIPPER_CATALOG,
          active: true
        });
        this.app.workspace.revealLeaf(leaf);
      }
    });


    this.addCommand({
      id: 'show-all-clippings',
      name: 'Show all clippings',
      callback: () => {
        // Get active leaf or create new one in center
        const leaf = this.app.workspace.getLeaf('tab');
        if (leaf) {
          leaf.setViewState({
            type: VIEW_TYPE_CLIPPER_CATALOG,
            active: true,
          });
          this.app.workspace.revealLeaf(leaf);
        }
      }
    });

    this.addSettingTab(new ClipperCatalogSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ClipperCatalogSettingTab extends PluginSettingTab {
  plugin: ObsidianClipperCatalog;
  advancedSettingsEl: HTMLDetailsElement;
  advancedContentEl: HTMLDivElement;

  constructor(app: App, plugin: ObsidianClipperCatalog) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    containerEl.addClass('clipper-catalog-plugin');
    containerEl.addClass('clipper-catalog-settings');

    new Setting(containerEl)
    .setName('Property name(s)')
    .setDesc(createFragment(el => {
      el.createSpan({
          text: 'Specify which frontmatter properties contain your clipped URLs.'
      });
      el.createEl('br');
      el.createSpan({text: '(comma separated)'});
    }))
    .addText(text => text
      .setValue(this.plugin.settings.sourcePropertyName)
      .setPlaceholder('e.g., source, url, link')
      .then(textComponent => {
        const inputEl = textComponent.inputEl;
        let initialValue = this.plugin.settings.sourcePropertyName;

        inputEl.addEventListener('blur', async () => {
          if (inputEl.value !== initialValue) {
            initialValue = inputEl.value; // Update reference
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_CATALOG).forEach(leaf => {
              if (leaf.view instanceof ClipperCatalogView) {
                leaf.view.onOpen();
              }
            });
          }
        });
      })
      .onChange(async (value) => {
        this.plugin.settings.sourcePropertyName = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Show source domain below the title')
      .setDesc('Display the website domain (e.g., wikipedia.org) beneath each note title in the catalog')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showClippedFrom)
        .onChange(async (value) => {
          this.plugin.settings.showClippedFrom = value;
          await this.plugin.saveSettings();
          // Refresh all clipper catalog views
          this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_CATALOG).forEach(leaf => {
            if (leaf.view) {
              leaf.view.onResize();
            }
          });
        }));

    new Setting(containerEl)
      .setName('Include frontmatter tags')
      .setDesc('Include tags from the frontmatter "tags" field')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeFrontmatterTags)
        .onChange(async (value) => {
          this.plugin.settings.includeFrontmatterTags = value;
          await this.plugin.saveSettings();
          // Refresh all articles
          this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_CATALOG).forEach(leaf => {
            if (leaf.view instanceof ClipperCatalogView) {
              // Force reload articles
              leaf.view.onOpen();
            }
          });
        }));

    new Setting(containerEl)
      .setName('Open notes in same window')
      .setDesc('When enabled, clicking a note title will open it in the active window instead of creating a new one. To open the note in a new window, hold down the Ctrl key on Windows or the Command key on Mac while clicking the title.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openInSameLeaf)
        .onChange(async (value) => {
          this.plugin.settings.openInSameLeaf = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('div', {
      text: '⚠️ Warning: The next setting will allow the catalog to overwrite any property you set here. Proceed if you know what you are doing.',
      cls: 'setting-item-description warning-text'
    }).style.color = 'var(--text-warning)';

    new Setting(containerEl)
      .setName('Read status property name')
      .setDesc('Leave blank to hide checkboxes. If set, specifies which frontmatter property tracks read status (e.g., "read", "completed"). Note: Changing this affects new changes only and will not erase any values.')
      .addText(text => text
        .setPlaceholder('e.g., read')
        .setValue(this.plugin.settings.readPropertyName)
        .then(textComponent => {
          const inputEl = textComponent.inputEl;
          let initialValue = this.plugin.settings.readPropertyName;

          inputEl.addEventListener('blur', async () => {
            if (inputEl.value !== initialValue) {
              initialValue = inputEl.value; // Update reference
              this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_CATALOG).forEach(leaf => {
                if (leaf.view instanceof ClipperCatalogView) {
                  leaf.view.onOpen();
                }
              });
            }
          });
        })
        .onChange(async (value) => {
          this.plugin.settings.readPropertyName = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Experimental: Use a compatible checkbox')
      .setDesc('Enable for better compatibility with themes where the custom checkbox is not visible.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useNativeCheckbox)
        .onChange(async (value) => {
          this.plugin.settings.useNativeCheckbox = value;
          await this.plugin.saveSettings();
          // Refresh all clipper catalog views
          this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_CATALOG).forEach(leaf => {
            if (leaf.view) {
              leaf.view.onResize();
            }
          });
        }));
      }
}
