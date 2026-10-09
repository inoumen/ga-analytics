# ga-analytics

## Overview

A lightweight, dependency-free Google Analytics click tracker built with vanilla JavaScript.

The tracker uses **centralized event delegation** to capture user interactions across the entire document without attaching individual event listeners to DOM elements.

To minimize synchronous work during event dispatch, the tracker captures essential event references immediately and defers DOM element identification, metadata extraction, and analytics processing using `setTimeout(..., 0)`.

### Key Features

- **Single Event Listener** — Centralized click tracking through event delegation.
- **Deferred DOM Processing** — Moves element analysis to a subsequent event loop task.
- **Automatic Element Identification** — Resolves meaningful interactive elements and extracts relevant metadata.
- **Dynamic DOM Support** — Tracks dynamically inserted elements without reinitialization.
- **Framework-Agnostic** — Works with vanilla JavaScript, React, Vue, and other web frameworks.
- **Google Analytics Integration** — Sends structured interaction events to GA4.
- **Zero Dependencies** — No external libraries required.

### Architecture

The tracker separates lightweight event capture from deferred interaction analysis, reducing the amount of synchronous processing performed inside the original click event handler.

This approach provides a simple, extensible foundation for automatic website interaction tracking.
