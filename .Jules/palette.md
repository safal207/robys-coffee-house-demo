## 2025-05-22 - [Centralized Dynamic ARIA Labels]
**Learning:** In multilingual apps, ARIA labels for dynamic elements (like a menu toggle that changes between 'Open' and 'Close') must be centralized in the i18n dictionary and updated programmatically alongside the UI state to remain accessible to all users.
**Action:** Always use a declarative mechanism (like `data-i18n-aria`) or a centralized update function to handle ARIA label localization, especially for interactive elements with multiple states.
