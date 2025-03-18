import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Search, RefreshCw, ChevronDown, ChevronRight, ChevronUp, X, HelpCircle, Tag, CheckSquare, EyeOff } from 'lucide-react';
import { TFile, App, Menu, WorkspaceLeaf } from 'obsidian';
import type ObsidianClipperCatalog from './main';
import { ClipperCatalogView, VIEW_TYPE_CLIPPER_CATALOG } from './ClipperCatalogView';

interface ClipperCatalogProps {
  app: App;
  plugin: ObsidianClipperCatalog;
}

interface Article {
  title: string;
  urls: { [key: string]: string | string[] };
  path: string;
  date: number;
  tags: string[];
  frontmatterTags: string[];
  contentTags: string[];
  basename: string;
  content: string;
  read?: boolean;
}

interface SortConfig {
  key: keyof Article;
  direction: 'asc' | 'desc';
}

interface AdvancedSettings {
  ignoredDirectories: string[];
  isExpanded: boolean;
}

const isValidUrl = (url: string | string[]): boolean => {
  if (Array.isArray(url)) {
    return url.length > 0 && url.every(item => isValidUrl(item));
  }
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const extractDomain = (url: string): string => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const ArticleTitle = ({ file, content, title }: { file: TFile | null, content: string, title: string }) => {
  // If file is null or undefined, return the title directly
  if (!file) {
    return <span>{title}</span>;
  }

  const isUntitled = /^Untitled( \d+)?$/.test(file.basename);
  const headerMatch = content.match(/^#+ (.+)$/m);
  
  if (isUntitled && headerMatch) {
    return (
      <div className="cc-flex cc-flex-col">
        <span>{headerMatch[1].trim()}</span>
        <span className="cc-text-xs cc-text-muted">({file.basename})</span>
      </div>
    );
  }
  
  return <span>{file.basename}</span>;
};

const processFrontmatterTags = (frontmatter: any, settings: any): string[] => {
  if (!settings.includeFrontmatterTags || !frontmatter.tags) return [];
  
  const tags = Array.isArray(frontmatter.tags) 
    ? frontmatter.tags 
    : frontmatter.tags.split(',').map((t: string) => t.trim());
    
  return tags
    .map((tag: string) => tag.startsWith('#') ? tag.slice(1) : tag)
    .filter(Boolean);
};

const processContentTags = (tags: any): string[] => {
  if (!tags) return [];
  return tags
    .map((tag: any) => typeof tag === 'string' ? tag : tag.tag)
    .map((tag: string) => tag.startsWith('#') ? tag.slice(1) : tag)
    .filter(Boolean);
};

const ClipperCatalog: React.FC<ClipperCatalogProps> = ({ app, plugin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNarrowView, setIsNarrowView] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>({
    ignoredDirectories: plugin.settings.ignoredDirectories,
    isExpanded: plugin.settings.isAdvancedSettingsExpanded
  });
  const [newDirectory, setNewDirectory] = useState('');
  const completedCount = articles.filter(article => article.read).length;
  
    // Add state to track if we're currently hovering
  const [hoveredElement, setHoveredElement] = useState<{
    element: HTMLElement;
    path: string;
  } | null>(null);

  // Add effect to listen for CMD key while hovering
  useEffect(() => {
    if (!hoveredElement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // Check if hover editor plugin exists with proper type casting
        if (!(app as any).plugins?.plugins["obsidian-hover-editor"]) return;

        const targetFile = app.vault.getAbstractFileByPath(hoveredElement.path);
        if (targetFile instanceof TFile) {
          app.workspace.trigger('hover-link', {
            event: e,
            source: 'editor',
            hoverParent: hoveredElement.element,
            targetEl: hoveredElement.element,
            linktext: hoveredElement.path,
            sourcePath: hoveredElement.path || "",
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredElement]);

  // Handle resize observer
  useEffect(() => {
    const checkWidth = () => {
      // Get the current view using recommended API
      const view = app.workspace.getActiveViewOfType(ClipperCatalogView);
      if (view?.getViewType() === VIEW_TYPE_CLIPPER_CATALOG) {
        const width = view.containerEl.clientWidth;
        
        setIsNarrowView(width < 750);
      }
    };
  
    // Register workspace layout change event
    const handleLayoutChange = () => {
      requestAnimationFrame(checkWidth); // Use requestAnimationFrame for smoother handling
    };
  
    app.workspace.on('layout-change', handleLayoutChange);
    
    // Initial check
    requestAnimationFrame(checkWidth);
  
    // Also check on window resize
    window.addEventListener('resize', handleLayoutChange);
  
    return () => {
      app.workspace.off('layout-change', handleLayoutChange);
      window.removeEventListener('resize', handleLayoutChange);
    };
  }, [app.workspace]);

  // Save advanced settings to localStorage whenever they change
  useEffect(() => {
    // Update plugin settings when advanced settings change
    plugin.settings.ignoredDirectories = advancedSettings.ignoredDirectories;
    plugin.settings.isAdvancedSettingsExpanded = advancedSettings.isExpanded;
    plugin.saveSettings();
  }, [advancedSettings, plugin]);

  // Helper function to check if a path should be ignored
  const isPathIgnored = (filePath: string): boolean => {
    return advancedSettings.ignoredDirectories.some(dir => {
      // Normalize both paths to use forward slashes and remove trailing slashes
      const normalizedDir = dir.replace(/\\/g, '/').replace(/\/$/, '');
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      // Split the paths into segments
      const dirParts = normalizedDir.split('/');
      const pathParts = normalizedPath.split('/');
      
      // Check if the number of path parts is at least equal to directory parts
      if (pathParts.length < dirParts.length) return false;
      
      // Compare each segment
      for (let i = 0; i < dirParts.length; i++) {
        if (dirParts[i].toLowerCase() !== pathParts[i].toLowerCase()) {
          return false;
        }
      }
      
      // Only match if we've matched all segments exactly
      return dirParts.length === pathParts.length - 1 || // Directory contains files
              dirParts.length === pathParts.length;       // Directory is exactly matched
    });
  };
  
  const loadArticles = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    
    try {
      const articleFiles: Article[] = [];
      const files = app.vault.getMarkdownFiles();
      const propertyNames = plugin.settings.sourcePropertyName
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);
    
      for (const file of files) {
        try {
          if (isPathIgnored(file.parent?.path || '')) continue;
    
          const metadata = app.metadataCache.getFileCache(file);
          if (!metadata?.frontmatter) continue;
    
          // Explicitly type urls to accept both strings and string arrays
          const urls: { [key: string]: string | string[] } = {};
          const read = metadata.frontmatter[plugin.settings.readPropertyName] === true;
    
          // Collect URLs from specified properties
          for (const propName of propertyNames) {
            const value = metadata.frontmatter[propName];
            if (value) {
              if (Array.isArray(value)) {
                // Filter out empty items in the array
                const filteredValue = value.filter(item => typeof item === 'string' && item.trim() !== '');
                if (filteredValue.length > 0) {
                  urls[propName] = filteredValue;
                }
              } else {
                urls[propName] = value;
              }
            }
          }
    
          if (Object.keys(urls).length > 0) {
            const content = await app.vault.read(file);
            const frontmatterTags = processFrontmatterTags(metadata.frontmatter, plugin.settings);
            const contentTags = processContentTags(metadata.tags);
            const allTags = [...new Set([...frontmatterTags, ...contentTags])];
    
            articleFiles.push({
              title: file.basename,
              urls, // Now correctly typed as { [key: string]: string | string[] }
              path: file.path,
              date: file.stat.ctime,
              tags: allTags,
              frontmatterTags,
              contentTags,
              basename: file.basename,
              content,
              read
            });
          }
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
        }
      }
    
      setArticles(articleFiles);
    } catch (error) {
      console.error("Error loading articles:", error);
      setError("Failed to load articles");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [app.vault, app.metadataCache, advancedSettings.ignoredDirectories, plugin.settings]);
  
  useEffect(() => {
    // Load articles initially
    loadArticles();
  
    // Set up file system event handlers
    const handleCreate = () => loadArticles();
    const handleDelete = () => loadArticles();
    const handleRename = () => loadArticles();
    const handleModify = () => loadArticles();
  
    // Register the event handlers
    app.vault.on('create', handleCreate);
    app.vault.on('delete', handleDelete);
    app.vault.on('rename', handleRename);
    app.vault.on('modify', handleModify);
  
    // Cleanup function to remove event handlers
    return () => {
      app.vault.off('create', handleCreate);
      app.vault.off('delete', handleDelete);
      app.vault.off('rename', handleRename);
      app.vault.off('modify', handleModify);
    };
  }, [loadArticles, app.vault]);

  // Initial load
  useEffect(() => {
    loadArticles();
  }, [loadArticles, advancedSettings.ignoredDirectories]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadArticles();
    }, 60000);
  
    return () => clearInterval(intervalId);
  }, [loadArticles]);

  if (error) {
    return (
      <div className="cc-flex cc-justify-center cc-items-center cc-p-4 cc-text-red-400">
        {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="cc-flex cc-justify-center cc-items-center cc-p-4 cc-gap-2">
        <div className="cc-animate-spin cc-h-4 cc-w-4">
          <RefreshCw className="cc-h-4 cc-w-4" />
        </div>
        <span className="cc-text-sm">Loading articles...</span>
      </div>
    );
  }

  const handleRefresh = () => {
    loadArticles();
  };

  const handleSort = (key: keyof Article) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedArticles = [...articles].sort((a, b) => {
    if (sortConfig.key === 'date') {
      return sortConfig.direction === 'asc' 
        ? a.date - b.date 
        : b.date - a.date;
    }

    if (sortConfig.key === 'read') {
      // Sort read items first when ascending, unread first when descending
      if (sortConfig.direction === 'asc') {
        return (a.read === b.read) ? 0 : a.read ? -1 : 1;
      }
      return (a.read === b.read) ? 0 : a.read ? 1 : -1;
    }

    const aValue = String(a[sortConfig.key]).toLowerCase();
    const bValue = String(b[sortConfig.key]).toLowerCase();
    
    if (sortConfig.direction === 'asc') {
      return aValue.localeCompare(bValue);
    }
    return bValue.localeCompare(aValue);
  });

  const filteredArticles = sortedArticles
  .filter(article => {
    // First apply the read/unread filters
    if (hideCompleted && article.read) return false;
    if (showOnlyCompleted && !article.read) return false;
    
    // Then apply the search filter
    return (
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
      searchTerm.startsWith('#') && article.tags.some(tag => 
        tag.toLowerCase() === searchTerm.slice(1).toLowerCase()
      )
    );
  });

  const getSortIcon = (key: keyof Article) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? '↑' : '↓';
    }
    return null;
  };

  const openArticle = async (path: string, event: React.MouseEvent) => {
    // Prevent text selection when shift-clicking
    if (event.shiftKey) {
      event.preventDefault();
    }
  
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
  
    // If shift is pressed, open in new window using Obsidian's native window creation
    if (event.shiftKey) {
      const leaf = app.workspace.openPopoutLeaf();
      await leaf.openFile(file);
      return;
    }
  
    // Check for Ctrl (Windows) or Command (Mac)
    const newLeaf = event.ctrlKey || event.metaKey;
  
    try {
      if (plugin.settings.openInSameLeaf && !newLeaf) {
        // Get the most suitable leaf
        const currentView = app.workspace.getActiveViewOfType(ClipperCatalogView);
        if (currentView) {
          // If we're in the catalog view, reuse its leaf
          await currentView.leaf.openFile(file);
        } else {
          // If we're not in the catalog view, use the active leaf
          const leaf = app.workspace.getLeaf();
          await leaf.openFile(file);
        }
      } else {
        // Open in a new tab when either:
        // 1. openInSameLeaf is false, or
        // 2. Ctrl/Cmd is pressed
        const leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(file);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      // Fallback to opening in a new leaf if something goes wrong
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    }
  };
  

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleAddDirectory = () => {
    if (!newDirectory.trim()) return;

    // Split by commas and clean up each directory path
    const directoriesToAdd = newDirectory
      .split(',')
      .map(dir => dir.trim())
      .filter(dir => dir.length > 0);

    if (directoriesToAdd.length === 0) return;

    setAdvancedSettings(prev => {
      const updatedDirectories = [...prev.ignoredDirectories];
      
      directoriesToAdd.forEach(dir => {
        if (!updatedDirectories.includes(dir)) {
          updatedDirectories.push(dir);
        }
      });

      return {
        ...prev,
        ignoredDirectories: updatedDirectories
      };
    });

    setNewDirectory('');
  };

  const handleRemoveDirectory = (dir: string) => {
    setAdvancedSettings(prev => ({
      ...prev,
      ignoredDirectories: prev.ignoredDirectories.filter(d => d !== dir)
    }));
    // Articles will reload automatically due to the useEffect dependency on ignoredDirectories
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newDirectory.trim()) {
      handleAddDirectory();
    }
  };

  const toggleAdvancedSettings = () => {
    setAdvancedSettings(prev => ({
      ...prev,
      isExpanded: !prev.isExpanded
    }));
  };
  
  const handleClearAllDirectories = () => {
    setAdvancedSettings(prev => ({
      ...prev,
      ignoredDirectories: []
    }));
  };

  const renderAdvancedSettingsHeader = () => {
    const excludedCount = advancedSettings.ignoredDirectories.length;
    const completedCount = articles.filter(article => article.read).length;
    
    return (
      <div>
        <div className="cc-flex cc-items-center cc-justify-between cc-w-full">
          <button
            onClick={toggleAdvancedSettings}
            className="cc-flex cc-items-center cc-gap-1 cc-text-sm cc-font-medium hover:cc-underline cc-text-muted cc-transition-all"
          >
            {advancedSettings.isExpanded ? <ChevronDown className="cc-h-4 cc-w-4" /> : <ChevronRight className="cc-h-4 cc-w-4" />}
            Advanced search options
          </button>
          {!advancedSettings.isExpanded && excludedCount > 0 && (
            <em className="cc-text-xs cc-text-muted cc-p-2 cc-narrow-view-hidden">
              Note: There {excludedCount === 1 ? 'is' : 'are'} {excludedCount} path{excludedCount === 1 ? '' : 's'} excluded from showing up in the results
            </em>
          )}
        </div>
        {plugin.settings.readPropertyName && (
          <div className="cc-mt-2 cc-ml-2 cc-flex cc-items-center cc-gap-4">
            <span
              onClick={() => {
                setHideCompleted(!hideCompleted);
                if (showOnlyCompleted) setShowOnlyCompleted(false);
              }}
              className={`cc-inline-flex cc-items-center cc-gap-1 cc-text-sm cc-text-accent hover:cc-underline cc-cursor-pointer internal-link ${
                hideCompleted ? 'cc-font-bold' : ''
              }`}
            >
              {hideCompleted ? (
                <ChevronUp className="cc-h-3.5 cc-w-3.5" />
              ) : (
                <ChevronDown className="cc-h-3.5 cc-w-3.5" />
              )}
              <span className="cc-underline-offset-2">
                {hideCompleted ? 'Show' : 'Hide'} {plugin.settings.readPropertyName} notes
              </span>
            </span>

            <span className="cc-text-muted">|</span>

            <span
              onClick={() => {
                setShowOnlyCompleted(!showOnlyCompleted);
                if (hideCompleted) setHideCompleted(false);
              }}
              className={`cc-inline-flex cc-items-center cc-gap-1 cc-text-sm cc-text-accent hover:cc-underline cc-cursor-pointer internal-link ${
                showOnlyCompleted ? 'cc-font-bold' : ''
              }`}
            >
              {showOnlyCompleted ? (
                <ChevronUp className="cc-h-3.5 cc-w-3.5" />
              ) : (
                <ChevronDown className="cc-h-3.5 cc-w-3.5" />
              )}
              <span className="cc-underline-offset-2">
                {showOnlyCompleted ? 'Show all notes' : `Show only ${plugin.settings.readPropertyName} notes`}
              </span>
            </span>
          </div>
        )}  
        {!advancedSettings.isExpanded && excludedCount > 0 && (
          <em className="cc-text-xs cc-text-muted cc-p-2 cc-narrow-view-visible">
            Note: There {excludedCount === 1 ? 'is' : 'are'} {excludedCount} path{excludedCount === 1 ? '' : 's'} excluded from showing up in the results
          </em>
        )}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef} 
      className={`clipper-catalog-content cc-flex cc-flex-col cc-gap-4${isNarrowView ? ' cc-narrow-view' : ''}`}
      data-narrow={isNarrowView ? 'true' : 'false'} // Add this for debugging
    >
      <div className="cc-relative">
        {/* Search input container */}
        <div className="cc-flex cc-items-center cc-gap-2 cc-px-4 cc-py-2 cc-rounded-lg clipper-catalog-search">
          <Search className="cc-h-4 cc-w-4 clipper-catalog-icon" />
          <div className="cc-relative cc-flex-1">
            <input
              type="text"
              placeholder="Search articles or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cc-w-full cc-bg-transparent cc-outline-none cc-text-sm cc-pr-16 clipper-catalog-input"
            />
            {searchTerm && (
              <div 
                onClick={() => setSearchTerm('')}
                className="cc-absolute cc-right-2 cc-flex cc-items-center cc-gap-1 cc-cursor-pointer cc-transition-colors clipper-catalog-clear-btn"
              >
                <svg className="cc-h-3.5 cc-w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="cc-text-xs">clear</span>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Settings Section */}
        <div className="cc-mt-2">
          {renderAdvancedSettingsHeader()}
          
          {advancedSettings.isExpanded && (
            <div className="cc-mt-2 cc-px-4 cc-py-2 cc-rounded-lg clipper-catalog-advanced">
            <div className="cc-flex cc-flex-col cc-gap-3">
              <div className="cc-flex cc-flex-col cc-gap-1">
                <div className="cc-flex cc-items-center cc-gap-2">
                  <input
                    type="text"
                    placeholder="Enter full paths to ignore (comma-separated, e.g., research/links/delago, work/expenses)"
                    value={newDirectory}
                    onChange={(e) => setNewDirectory(e.target.value)}
                    onKeyUp={handleKeyPress}
                    className="cc-flex-1 cc-px-2 cc-py-1 cc-text-sm cc-rounded clipper-catalog-input"
                  />
                  <button
                    onClick={handleAddDirectory}
                    disabled={!newDirectory.trim()}
                    className="cc-px-3 cc-py-1 cc-text-sm cc-rounded cc-bg-accent-primary cc-text-on-accent cc-font-medium clipper-catalog-button hover:cc-opacity-90"
                  >
                    Add
                  </button>
                </div>
                <span className="cc-text-xs cc-text-muted">
                  Tip: You can enter multiple paths separated by commas
                </span>
              </div>
              
              {advancedSettings.ignoredDirectories.length > 0 && (
                <div className="cc-flex cc-flex-col cc-gap-2">
                <div className="cc-flex cc-items-center cc-justify-between">
                  <span className="cc-text-xs cc-font-medium">Excluded Paths:</span>
                  <button
                    onClick={handleClearAllDirectories}
                    className="cc-px-3 cc-py-1 cc-text-xs cc-rounded cc-bg-accent-primary cc-text-on-accent cc-font-medium clipper-catalog-button hover:cc-opacity-90"
                  >
                    Clear all excluded paths
                  </button>
                </div>
                <div className="cc-flex cc-flex-wrap cc-gap-1.5">
                  {advancedSettings.ignoredDirectories.map((dir) => (
                    <button
                      key={dir}
                      onClick={() => handleRemoveDirectory(dir)}
                      className="cc-inline-flex cc-items-center cc-bg-chip cc-px-3 cc-py-1.5 cc-rounded-full cc-text-xs hover:cc-bg-chip-hover cc-transition-colors cc-cursor-pointer"
                      aria-label={`Remove ${dir} from excluded paths`}
                    >
                      <span className="cc-text-muted">{dir}</span>
                      <span className="cc-ml-2 cc-text-muted cc-opacity-60 cc-text-sm">×</span>
                    </button>
                  ))}
                </div>
              </div>
              )}
            </div>
          </div>
        )}
      </div>
        
        {/* Refresh link */}
        <div className="cc-absolute cc-right-2 cc-top-full cc-mt-1 cc-text-right">
          <span 
            onClick={handleRefresh} 
            className="cc-flex cc-items-center cc-gap-1 cc-text-[10px] cc-cursor-pointer cc-transition-colors cc-justify-end clipper-catalog-refresh"
          >
            <RefreshCw className={`cc-h-2.5 cc-w-2.5 ${isRefreshing ? 'cc-animate-spin' : ''}`} />
            <span className="cc-underline">refresh list</span>
          </span>
        </div>
      </div>
      
      <div className="cc-overflow-x-auto cc-min-h-[120px]">
        <table className="cc-w-full cc-text-sm">
          <colgroup>
            {plugin.settings.readPropertyName && (
              <col className="cc-w-[3%]" />
            )}
            <col className="cc-w-[30%]" />
            <col className="cc-w-[15%] cc-narrow-view-hidden" />
            <col className="cc-w-[15%] cc-narrow-view-hidden" />
            <col className="cc-w-[22%]" />
            <col className="cc-w-[15%]" />
          </colgroup>
          <thead>
            <tr className="clipper-catalog-header-row">
              {plugin.settings.readPropertyName && (
                <th 
                  onClick={() => handleSort('read')}
                  className="cc-w-[3%] cc-px-4 cc-py-2 clipper-catalog-header-cell"
                  style={{ textAlign: 'center', verticalAlign: 'middle' }}
                >
                  <div 
                    className="cc-inline-flex cc-justify-center cc-items-center"
                    data-tooltip={`Sort by ${plugin.settings.readPropertyName} status`}
                  >
                    {!hideCompleted && (
                      <>
                        <CheckSquare 
                          className="cc-h-4 cc-w-4 cc-opacity-50 cc-text-muted" 
                          strokeWidth={1.5}
                        />
                        {getSortIcon('read')}
                      </>
                    )}
                  </div>
                </th>
              )}
              <th 
                onClick={() => handleSort('title')}
                className="cc-px-4 cc-py-2 cc-text-left cc-cursor-pointer clipper-catalog-header-cell"
              >
                Note 
                <span 
                  className="count cc-px-1.5 cc-text-xs cc-text-muted cc-font-normal"
                  data-tooltip={showOnlyCompleted ? 
                    `Showing ${filteredArticles.length} ${plugin.settings.readPropertyName} notes, ${articles.length - filteredArticles.length} unchecked notes hidden` :
                    hideCompleted ? 
                      `${completedCount} ${plugin.settings.readPropertyName} notes hidden, ${filteredArticles.length} notes visible` : 
                      plugin.settings.readPropertyName ? 
                        `${filteredArticles.filter(article => article.read).length} marked as ${plugin.settings.readPropertyName} out of ${filteredArticles.length} total clippings` : 
                        `${filteredArticles.length} total clippings found`
                  }
                >
                  ({showOnlyCompleted ? 
                    <span className="cc-inline-flex cc-items-center cc-gap-0.5">
                      {`${filteredArticles.length}/${filteredArticles.length} + ${articles.length - filteredArticles.length}`} <EyeOff className="cc-h-3 cc-w-3" strokeWidth={1.5} />
                    </span> :
                    hideCompleted ? 
                      <span className="cc-inline-flex cc-items-center cc-gap-0.5">
                        {completedCount} <EyeOff className="cc-h-3 cc-w-3" strokeWidth={1.5} />/{filteredArticles.length}
                      </span> : 
                      plugin.settings.readPropertyName ? 
                        `${filteredArticles.filter(article => article.read).length}/${filteredArticles.length}` : 
                        filteredArticles.length
                  })
                </span>
                {getSortIcon('title')}
              </th>
              <th 
                onClick={() => handleSort('date')}
                className="cc-px-4 cc-py-2 cc-text-left cc-cursor-pointer cc-whitespace-nowrap clipper-catalog-header-cell  cc-narrow-view-hidden"
              >
                Date {getSortIcon('date')}
              </th>
              <th 
                onClick={() => handleSort('path')}
                className="cc-px-4 cc-py-2 cc-text-left cc-cursor-pointer clipper-catalog-header-cell  cc-narrow-view-hidden"
              >
                Path {getSortIcon('path')}
              </th>
              <th className="cc-px-4 cc-py-2 cc-text-left clipper-catalog-header-cell">
                <div className="cc-flex cc-items-center cc-gap-1">
                  <Tag className="cc-h-3.5 cc-w-3.5 clipper-catalog-tag-icon cc-flex-shrink-0" />
                  Tags
                  {plugin.settings.includeFrontmatterTags && (
                    <>
                      <div 
                        className="cc-relative cc-inline-flex cc-items-center"
                        data-tooltip="Frontmatter tags (bordered) appear first, followed by inline content tags (filled)"
                      >
                        <HelpCircle className="cc-h-4 cc-w-4 clipper-catalog-help-icon cc-flex-shrink-0 cc-cursor-help" />
                      </div>
                    </>
                  )}
                </div>
              </th>
              <th className="cc-px-4 cc-py-2 cc-text-left clipper-catalog-header-cell">
                Link
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredArticles.map((article) => (
              <tr key={article.path} className="clipper-catalog-row">
                {plugin.settings.readPropertyName && (
                  <td className="cc-px-1.5 cc-py-2" onClick={(e) => e.stopPropagation()}>
                    <span className="cc-flex cc-justify-center cc-items-center cc-gap-2 cc-cursor-pointer cc-min-h-[1.5rem]">
                    <input 
                      type="checkbox" 
                      className={plugin.settings.useNativeCheckbox ? 'clipper-catalog-compatible-checkbox' : 'clipper-catalog-checkbox'}
                      checked={article.read === true}
                      onChange={async (e) => {
                        const isChecked = e.target.checked;
                        const file = app.vault.getAbstractFileByPath(article.path);
                        if (!(file instanceof TFile)) return;
                      
                        try {
                          setArticles(prev => prev.map(a => 
                            a.path === article.path ? {...a, read: isChecked} : a
                          ));
                      
                          const metadata = app.metadataCache.getFileCache(file);
                          const content = await app.vault.read(file);
                      
                          if (!metadata?.frontmatter) {
                            const newContent = `---\n${plugin.settings.readPropertyName}: ${isChecked}\n---\n${content}`;
                            await app.vault.modify(file, newContent);
                          } else {
                            await app.fileManager.processFrontMatter(file, (frontmatter) => {
                              frontmatter[plugin.settings.readPropertyName] = isChecked;
                            });
                          }
                        } catch (error) {
                          console.error('Error:', error);
                          setArticles(prev => prev.map(a => 
                            a.path === article.path ? {...a, read: !isChecked} : a
                          ));
                        }
                      }}
                    />
                    </span>
                  </td>
                )}
                <td className="cc-px-4 cc-py-2">
                  <div className="cc-flex cc-flex-col">
                    <div 
                      className="cc-flex cc-items-center cc-cursor-pointer cc-gap-2 cc-min-h-[1.5rem]"
                      onClick={(event) => openArticle(article.path, event)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        const menu = new Menu();

                        menu.addItem((item) => {
                          item
                            .setTitle(`Open in new tab`)
                            .setIcon("file-plus")
                            .onClick(() => {
                              const file = app.vault.getAbstractFileByPath(article.path);
                              if (!(file instanceof TFile)) return;
                              
                              // Get a new leaf in tab mode
                              const leaf = app.workspace.getLeaf('tab');
                              
                              // Open the file in the new leaf
                              leaf.openFile(file);
                            });
                        });

                        menu.addItem((item) => {
                          item
                            .setTitle(`Open in new window`)
                            .setIcon("picture-in-picture-2")
                            .onClick(() => {
                              const file = app.vault.getAbstractFileByPath(article.path);
                              if (!(file instanceof TFile)) return;
                              
                              const leaf = app.workspace.openPopoutLeaf();  // Create the popout window
                              leaf.openFile(file);  // Open the file in the new leaf
                            });
                        });

                        menu.addItem((item) => {
                          item
                            .setTitle(`Open to the right`)
                            .setIcon("separator-vertical")
                            .onClick(() => {
                              const file = app.vault.getAbstractFileByPath(article.path);
                              if (!(file instanceof TFile)) return;
                              
                              // Get a new leaf in the preferred direction
                              const leaf = app.workspace.getLeaf('split', 'vertical');
                              
                              // Open the file in the new leaf
                              leaf.openFile(file);
                            });
                        });

                        if ((app as any).plugins?.plugins["obsidian-hover-editor"]) {
                          menu.addItem((item) => {
                            item
                              .setTitle(`Open in Hover Editor`)
                              .setIcon("arrow-up-right")
                              .onClick(async () => {
                                const file = app.vault.getAbstractFileByPath(article.path);
                                if (!(file instanceof TFile)) return;
                                
                                // Get the hover editor plugin instance
                                const hoverEditorPlugin = (app as any).plugins.plugins["obsidian-hover-editor"];
                                
                                // Create new leaf using the plugin's spawnPopover method
                                const newLeaf = hoverEditorPlugin.spawnPopover();
                                
                                // Open the file in the new leaf
                                await newLeaf.openFile(file);
                                
                                // Optional: Focus the new leaf
                                app.workspace.setActiveLeaf(newLeaf, { focus: true });
                              });
                          });
                        }

                        menu.addSeparator();
                        
                        menu.addItem((item) => {
                          item
                            .setTitle("Reveal file in navigation")
                            .setIcon("folder")
                            .onClick(async () => {
                              // Get the file and ensure it's a TFile
                              const file = app.vault.getAbstractFileByPath(article.path);
                              if (!(file instanceof TFile)) return;
                        
                              // Helper to check if file explorer is open
                              const isFileExplorerOpen = () => {
                                let isOpen = false;
                                app.workspace.iterateAllLeaves((leaf) => {
                                  const leafWithContainer = leaf as WorkspaceLeaf & { containerEl: Element };
                                  if (leaf.getViewState().type === "file-explorer" && 
                                      window.getComputedStyle(leafWithContainer.containerEl, null).display !== "none") {
                                    isOpen = true;
                                  }
                                });
                                return isOpen;
                              };
                        
                              // Store current active view
                              const currentView = app.workspace.getActiveViewOfType(ClipperCatalogView);
                        
                              try {
                                // If file explorer isn't open, open it
                                if (!isFileExplorerOpen()) {
                                  await (app as any).commands.executeCommandById('file-explorer:open');
                                }
                        
                                // Find the file explorer leaf
                                let explorerLeaf: WorkspaceLeaf | null = null;
                                app.workspace.iterateAllLeaves((leaf) => {
                                  if (leaf.getViewState().type === "file-explorer") {
                                    explorerLeaf = leaf;
                                  }
                                });
                        
                                if (explorerLeaf) {
                                  // Create a background leaf but don't focus it
                                  const backgroundLeaf = app.workspace.getLeaf('tab');
                                  
                                  // Load the file in the background
                                  await backgroundLeaf.openFile(file, { 
                                    active: false,
                                    state: { mode: 'source' }
                                  });
                        
                                  // Temporarily activate explorer leaf (needed for reveal)
                                  app.workspace.setActiveLeaf(explorerLeaf, { focus: false });
                                  
                                  // Reveal the file
                                  await (app as any).commands.executeCommandById('file-explorer:reveal-active-file');
                        
                                  // Clean up the background leaf
                                  backgroundLeaf.detach();
                                }
                              } finally {
                                // Restore the previous active view
                                if (currentView) {
                                  window.setTimeout(() => {
                                    // Find the leaf containing our view and activate it
                                    app.workspace.iterateAllLeaves((leaf) => {
                                      if (leaf.view === currentView) {
                                        app.workspace.setActiveLeaf(leaf, { focus: true });
                                      }
                                    });
                                  }, 10);
                                }
                              }
                            });
                        });                        
                        

                        menu.addItem((item) => {
                          item
                            .setTitle("Copy full path")
                            .setIcon("copy")
                            .onClick(() => {
                              navigator.clipboard.writeText(article.path);
                            });
                        });

                        // Loop through all URLs in article.urls
                        // In handleContextMenu function for files
                        Object.entries(article.urls).forEach(([propName, url]) => {
                          // Handle single URL (string)
                          if (typeof url === 'string' && isValidUrl(url)) {
                            menu.addSeparator();

                            menu.addItem((item) => {
                              item
                                .setTitle(`Open ${propName} in browser`)
                                .setIcon("globe")
                                .onClick(() => {
                                  window.open(url, '_blank');
                                });
                            });

                            menu.addItem((item) => {
                              item
                                .setTitle(`Copy ${propName} ${propName === "url" ? '' : 'URL'}`)
                                .setIcon("copy")
                                .onClick(() => {
                                  navigator.clipboard.writeText(url);
                                });
                            });
                          }
                          // Handle array of URLs
                          else if (Array.isArray(url)) {
                            // Filter out empty items
                            const validUrls = url.filter(item => typeof item === 'string' && item.trim() !== '');
                            
                            if (validUrls.length > 0) {
                              menu.addSeparator();
                              
                              // Add a submenu for each URL in the array
                              validUrls.forEach((singleUrl, index) => {
                                if (typeof singleUrl === 'string' && isValidUrl(singleUrl)) {
                                  menu.addItem((item) => {
                                    item
                                      .setTitle(`Open ${propName} ${validUrls.length > 1 ? (index + 1) : ''} in browser`.trim())
                                      .setIcon("globe")
                                      .onClick(() => {
                                        window.open(singleUrl, '_blank');
                                      });
                                  });

                                  menu.addItem((item) => {
                                    item
                                      .setTitle(`Copy ${propName} ${validUrls.length > 1 ? (index + 1) : ''} URL`.trim())
                                      .setIcon("copy")
                                      .onClick(() => {
                                        navigator.clipboard.writeText(singleUrl);
                                      });
                                  });
                                }
                              });
                            }
                          }

                        });

                        // Convert React MouseEvent to DOM MouseEvent for showAtMouseEvent
                        menu.showAtMouseEvent(event.nativeEvent);
                      }}
                    >
                      <svg 
                        className="cc-h-4 cc-w-4 cc-flex-shrink-0 clipper-catalog-icon" 
                        fill="none" 
                        strokeWidth="2" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        <path d="M14 2v6h6" />
                        <path d="M5 9h14" strokeWidth="1" />
                      </svg>
                      
                      {/* Title container - no hover events here */}
                      <div className="cc-flex cc-items-center">
                        {/* The actual hoverable link element */}
                        <span 
                          className={`clipper-catalog-title-link internal-link markdown-preview-view cc-text-sm ${
                            (plugin.settings.readPropertyName && !article.read) ? 'cc-font-bold' : ''
                          }`}
                          data-href={article.path}
                          data-type="link"
                          /* aria-label={article.title} */
                          onMouseEnter={(event) => {
                            setHoveredElement({
                              element: event.currentTarget,
                              path: article.path
                            });

                            if (event.metaKey || event.ctrlKey) {
                              // Check if hover editor plugin exists with proper type casting
                              if (!(app as any).plugins?.plugins["obsidian-hover-editor"]) return;
                      
                              const targetFile = app.vault.getAbstractFileByPath(article.path);
                              if (targetFile instanceof TFile) {
                                app.workspace.trigger('hover-link', {
                                  event: event,
                                  source: 'editor',
                                  hoverParent: event.currentTarget,
                                  targetEl: event.currentTarget,
                                  linktext: article.path,
                                  sourcePath: article.path || "",
                                });
                              }
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredElement(null);
                          }}
                        >
                          <ArticleTitle 
                            file={app.vault.getAbstractFileByPath(article.path) as TFile || null}
                            content={article.content || ''}
                            title={article.title}
                          />
                        </span>
                      </div>
                    </div>
                    {/* "Clipped from" info - no hover events */}
                    {plugin.settings.showClippedFrom && 
                      // First, extract all domains from valid URLs
                      (() => {
                        const domains = Object.entries(article.urls)
                          .flatMap(([propName, urlValue]) => {
                            if (typeof urlValue === 'string') {
                              return isValidUrl(urlValue) ? extractDomain(urlValue) : null;
                            } else if (Array.isArray(urlValue)) {
                              return urlValue
                                .filter(item => typeof item === 'string' && item.trim() !== '')
                                .map(url => isValidUrl(url) ? extractDomain(url) : null)
                                .filter(Boolean);
                            }
                            return null;
                          })
                          .filter(Boolean);
                        
                        // Only render if we have valid domains
                        return domains.length > 0 ? (
                          <span className="cc-text-[0.8rem] cc-text-muted cc-ml-6 cc-italic">
                            Clipped from {domains.join(', ')}
                          </span>
                        ) : null;
                      })()
                    }
                  </div>
                </td>
                <td className="cc-px-4 cc-py-2 clipper-catalog-muted cc-narrow-view-hidden">
                  {formatDate(article.date)}
                </td>
                <td className="cc-px-4 cc-py-2 clipper-catalog-muted cc-narrow-view-hidden">
                  <span
                    onContextMenu={(event) => {
                      event.preventDefault();
                      const menu = new Menu();
                      
                      menu.addItem((item) => {
                        item
                          .setTitle("Copy path")
                          .setIcon("copy")
                          .onClick(() => {
                            navigator.clipboard.writeText(article.path.split('/').slice(0, -1).join('/') || '/');
                          });
                      });

                      // Convert React MouseEvent to DOM MouseEvent for showAtMouseEvent
                      menu.showAtMouseEvent(event.nativeEvent);
                    }}
                  >
                  {article.path.split('/').slice(0, -1).join('/') || '/'}
                  </span>
                </td>
                <td className="cc-px-4 cc-py-2">
                  <div className="cc-flex cc-gap-1 cc-flex-wrap cc-items-center">
                    {/* Frontmatter tags section */}
                    {article.frontmatterTags?.length > 0 && (
                      <>
                        {article.frontmatterTags.map((tag, i) => (
                          <span 
                            key={`fm-${i}`}
                            onClick={() => setSearchTerm(`#${tag}`)}
                            className="cc-px-2 cc-py-1 cc-text-xs cc-rounded-full cc-cursor-pointer cc-transition-colors clipper-catalog-frontmatter-tag"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              const menu = new Menu();

                              menu.addItem((item) => {
                                item
                                  .setTitle("Frontmatter tag")
                                  .setDisabled(true)
                                  .setIcon("tag")
                              });
  
                              menu.addSeparator();
  
                              menu.addItem((item) => {
                                item
                                  .setTitle("Search tag")
                                  .setIcon("search")
                                  .onClick(() => {
                                    setSearchTerm(`#${tag}`)
                                  });
                              });

                              menu.addItem((item) => {
                                item
                                  .setTitle("Copy tag")
                                  .setIcon("copy")
                                  .onClick(() => {
                                    navigator.clipboard.writeText(tag);
                                  });
                              });
      
                              // Convert React MouseEvent to DOM MouseEvent for showAtMouseEvent
                              menu.showAtMouseEvent(event.nativeEvent);
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </>
                    )}

                    {/* Content tags section */}
                    {article.contentTags?.length > 0 && (
                      article.contentTags.map((tag, i) => (
                        <span 
                          key={`content-${i}`}
                          onClick={() => setSearchTerm(`#${tag}`)}
                          className="cc-px-2 cc-py-1 cc-text-xs cc-rounded-full cc-cursor-pointer cc-transition-colors clipper-catalog-tag"
                          onContextMenu={(event) => {
                            event.preventDefault();
                            const menu = new Menu();

                            menu.addItem((item) => {
                              item
                                .setTitle("Inline tag")
                                .setDisabled(true)
                                .setIcon("tag")
                            });

                            menu.addSeparator();

                            menu.addItem((item) => {
                              item
                                .setTitle("Search tag")
                                .setIcon("search")
                                .onClick(() => {
                                  setSearchTerm(`#${tag}`)
                                });
                            });

                            menu.addItem((item) => {
                              item
                                .setTitle("Copy tag")
                                .setIcon("copy")
                                .onClick(() => {
                                  navigator.clipboard.writeText(`#${tag}`);
                                });
                            });
    
                            // Convert React MouseEvent to DOM MouseEvent for showAtMouseEvent
                            menu.showAtMouseEvent(event.nativeEvent);
                          }}
                        >
                          #{tag}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="cc-px-4 cc-py-2">
                  <div className="cc-flex cc-flex-col cc-gap-1">
                    {Object.entries(article.urls).map(([propName, urlValue], index, array) => {
                    // Handle strings
                    if (typeof urlValue === 'string') {
                      return isValidUrl(urlValue) ? (
                        <div key={propName} className="cc-flex cc-flex-col">
                          <a 
                            key={propName}
                            href={urlValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            onContextMenu={(event: React.MouseEvent<HTMLAnchorElement>) => {
                              event.preventDefault();
                              const menu = new Menu();

                              menu.addItem((item) => {
                                item
                                  .setTitle(`Open ${propName} in browser`)
                                  .setIcon("globe")
                                  .onClick(() => {
                                    window.open(urlValue, '_blank');
                                  });
                              });

                              menu.addItem((item) => {
                                item
                                  .setTitle(`Copy ${propName} ${propName === "url" ? '' : 'URL'}`)
                                  .setIcon("copy")
                                  .onClick(() => {
                                    navigator.clipboard.writeText(urlValue);
                                  });
                              });

                              menu.showAtMouseEvent(event.nativeEvent);
                            }}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                                window.open(urlValue, '_external');
                              }
                            }}
                            className="cc-inline-flex cc-items-center cc-gap-0.5 cc-transition-colors clipper-catalog-link"
                            aria-label={`Go to ${urlValue}`}
                          >
                            <Link className="cc-h-3 cc-w-3" />
                            <span className="cc-text-sm">
                              {array.length === 1 ? `${propName}` : propName}
                            </span>
                          </a>
                        </div>
                      ) : (
                        <span 
                          key={propName}
                          className="cc-inline-flex cc-items-center cc-gap-0.5 cc-text-error cc-opacity-50"
                          title="Invalid URL"
                        >
                          <X className="cc-h-3 cc-w-3" />
                          <span className="cc-text-xs">{propName}</span>
                        </span>
                      );
                    } 
                    // Handle arrays
                    else if (Array.isArray(urlValue)) {
                      // Filter out empty items from the array
                      const validUrls = urlValue.filter(item => typeof item === 'string' && item.trim() !== '');
                      
                      return (
                        <div key={propName} className="cc-flex cc-flex-col cc-gap-0.5">
                          {validUrls.map((urlItem, urlIndex) => {
                            // Ensure urlItem is a string and valid
                            if (typeof urlItem === 'string' && isValidUrl(urlItem)) {
                              // Now urlItem is definitely a string
                              const safeUrl = urlItem; // Create a const reference that TS knows is a string
                              
                              return (
                                <a 
                                  key={`${propName}-${urlIndex}`}
                                  href={safeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onContextMenu={(event: React.MouseEvent<HTMLAnchorElement>) => {
                                    event.preventDefault();
                                    const menu = new Menu();
                    
                                    menu.addItem((item) => {
                                      item
                                        .setTitle(`Open ${propName} ${validUrls.length > 1 ? (urlIndex + 1) : ''} in browser`.trim())
                                        .setIcon("globe")
                                        .onClick(() => {
                                          window.open(safeUrl, '_blank');
                                        });
                                    });
                    
                                    menu.addItem((item) => {
                                      item
                                        .setTitle(`Copy ${propName} ${validUrls.length > 1 ? (urlIndex + 1) : ''} URL`.trim())
                                        .setIcon("copy")
                                        .onClick(() => {
                                          navigator.clipboard.writeText(safeUrl);
                                        });
                                    });
                    
                                    menu.showAtMouseEvent(event.nativeEvent);
                                  }}
                                  onClick={(e) => {
                                    if (e.ctrlKey || e.metaKey) {
                                      e.preventDefault();
                                      window.open(safeUrl, '_external');
                                    }
                                  }}
                                  className="cc-inline-flex cc-items-center cc-gap-0.5 cc-transition-colors clipper-catalog-link"
                                  aria-label={`Go to ${safeUrl}`}
                                >
                                  <Link className="cc-h-3 cc-w-3" />
                                  <span className="cc-text-sm">
                                    {validUrls.length > 1 ? `${propName} ${urlIndex + 1}` : propName}
                                  </span>
                                </a>
                              );
                            } else {
                              return (
                                <span 
                                  key={`${propName}-${urlIndex}`}
                                  className="cc-inline-flex cc-items-center cc-gap-0.5 cc-text-error cc-opacity-50"
                                  title="Invalid URL"
                                >
                                  <X className="cc-h-3 cc-w-3" />
                                  <span className="cc-text-xs">
                                    {validUrls.length > 1 ? `${propName} ${urlIndex + 1}` : propName}
                                  </span>
                                </span>
                              );
                            }
                          })}
                        </div>
                      );
                    }
                                    
                      return null;
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  
      {filteredArticles.length === 0 && (
        <div className="cc-text-center cc-py-4 cc-flex cc-flex-col cc-gap-2">
          <div className="clipper-catalog-muted">
            No articles found matching your search.
          </div>
          <div className="cc-text-xs cc-text-muted cc-max-w-[400px] cc-text-center cc-mx-auto">
            Note: This catalog shows any markdown files containing a URL in their frontmatter under the property: "{plugin.settings.sourcePropertyName}". 
            You can change this property name in <span 
              className="cc-text-accent cc-underline cc-cursor-pointer hover:cc-opacity-80"
              onClick={() => plugin.openSettings()}
            >
              plugin&nbsp;settings</span> to match your preferred clipping workflow.
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipperCatalog;
