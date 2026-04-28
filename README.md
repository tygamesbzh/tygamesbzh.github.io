# TyGAMES

Jekyll + Tailwind CSS site, deployed to GitHub Pages via GitHub Actions.

## Setup

```bash
npm install
bundle install
```

## Development

```bash
npm run serve
```

Runs Tailwind in watch mode and Jekyll with live reload in parallel. Site available at `http://localhost:4000`.

## Build

```bash
npm run build
```

Outputs to `_site/`.

## Deploy

Push to `main`. GitHub Actions builds and deploys automatically.

## Adding a game

Create a file in `_games/` following the naming pattern `YYYY-MM-DD-slug.md`:

```yaml
---
layout: game
date: 2025-01-01
game: "Game Title"
img: filename.jpg        # place image in assets/img/games/
platforms: PC/iOS
description: "Short description."
---
```
