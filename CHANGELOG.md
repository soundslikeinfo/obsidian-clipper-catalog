## Changelog

### [1.1.1] - 2025-02-07
- Remove incorrect privacy statement from the [README.md](README.md)
- Provide Hover Editor support, if Hover Editor plugin is turned on
- Context menus everywhere. Find context menus in Titles, Paths, tags, URLs
	- Discern frontmatter tags from inline tags
	- Open URLs from the note's link context menu
- More control over where notes are opened from the main catalog view
	- Open to the right with the context menu
	- Open in Hover Editor by pressing ctrl/cmd on the keyboard while hovering the link to the note
	- Open note in a new window when holding down shift
- Update note's link style

### [1.1.0] - 2025-02-04 
- Introduce **Checkboxes** - Mark clippings as *read* or *completed*, found in preferences for **Read status**
	- Experimental: Change the checkbox styles if loading an incompatible theme
		- Turn this on for Cupertino theme
- Link column's text now show the property name instead of generic text
- Multiple "source" properties, comma separated in the settings (source, url, link)
	- Shows each link if there are more than one url properties (One url entered per property)
- Toggle domain name hint underneath note title, on by default
- Note icon refreshed
- Change **Note Title** column to just **Note**
- Settings update no longer requires clicking on *refresh list*
- Responsive adjustments

### [1.0.9] - 2025-02-03
- Added setting that can open notes in the same window, to help those who use mobile navigation.

### [1.0.8] - 2025-02-01
- Introduce CHANGELOG
- Moved all tag hints to the header row for cleaner UI  
- Added responsive layout support  
  - Date column hides on narrow views  
  - Path column hides on narrow views  
- Added prefix to paths for root folder notes  
- Rename links column to "Visit"  
- Added padding to notice for excluded paths  
- Added link to settings when no notes are detected  
  
### [1.0.7] - 2025-01-28
- Frontmatter tags now show up in the tags column. Before, you would only find any tags placed inside your Clipping Note's contents.
- Frontmatter tags will show a distinct background from the note's content tags.
- Option to toggle Frontmatter tags.
  
### [1.0.5] - 2025-01-24
- Remove duplicate hashtag character

### [1.0.1] - 2025-01-24
- Update and fix sentence case in UI elements
- MetadataCache API update
- Remove setting header
- No longer using localStorage

### [1.0.0] - 2024-12-09
- First release