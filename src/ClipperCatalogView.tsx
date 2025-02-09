import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import ClipperCatalog from './ClipperCatalog';
import ErrorBoundary from './ErrorBoundary';
import React from 'react';
import { ICON_NAME } from './main'; 
import type ObsidianClipperCatalog from './main';

export const VIEW_TYPE_CLIPPER_CATALOG = "clipper-catalog";

export class ClipperCatalogView extends ItemView {
  plugin: ObsidianClipperCatalog;
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianClipperCatalog) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_CLIPPER_CATALOG;
  }
      
  // Specify the icon here
  getIcon(): string {
    return ICON_NAME || 'document'; 
  }

  getDisplayText() {
    return "Clipper catalog";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    
    const reactContainer = container.createDiv({ cls: 'clipper-catalog-container' });
    this.root = createRoot(reactContainer);
    
    const clipperCatalog = React.createElement(ClipperCatalog, {
      app: this.app,
      plugin: this.plugin
    });
    
    this.root.render(
      React.createElement(ErrorBoundary, {
        children: clipperCatalog
      })
    );
  }

  async onClose() {
    if (this.root) {
      this.root.unmount();
    }
  }

  onResize() {
    super.onResize();
    // Trigger a re-render of our React component
    this.root?.render(
      React.createElement(ClipperCatalog, {
        app: this.app,
        plugin: this.plugin
      })
    );
  }
}
