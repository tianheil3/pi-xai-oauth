xAI (Grok) provider extension for Pi with clean OAuth-style login.

This package adds full support for Grok models (including reasoning) through the official xAI API.

## Installation

```bash
# Recommended
pi install npm:pi-xai-oauth

# Or install from GitHub
pi install git:github.com/BlockedPath/pi-xai-oauth
```

## Usage

After installing, authenticate using:

```bash
pi /login xai-oauth
```

Then select any supported Grok model with `/model` or `--model`.

## Supported Models

- `grok-3`
- `grok-3-mini`
- `grok-4`
- `grok-4.3` (1M context)

All models support extended thinking with levels: `low`, `medium`, `high`.

## Quick Reference

| Action                    | Command                              |
|---------------------------|--------------------------------------|
| Install                   | `pi install npm:pi-xai-oauth`        |
| Try without installing    | `pi -e npm:pi-xai-oauth`             |
| Update                    | `pi update npm:pi-xai-oauth`         |
| Remove                    | `pi remove npm:pi-xai-oauth`         |
| List installed packages   | `pi list`                            |

## Authentication

Run:

```bash
pi /login xai-oauth
```

Then paste your xAI API key from https://console.x.ai

## Updating the Package

```bash
# 1. Bump version in package.json
# 2. Publish new version
npm publish
```

Users can update with:

```bash
pi update npm:pi-xai-oauth
```
