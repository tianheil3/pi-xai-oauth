# pi-xai-oauth

[![npm version](https://img.shields.io/npm/v/pi-xai-oauth.svg)](https://www.npmjs.com/package/pi-xai-oauth)
[![npm downloads](https://img.shields.io/npm/dm/pi-xai-oauth.svg)](https://www.npmjs.com/package/pi-xai-oauth)

xAI (Grok) model provider with OAuth login support for pi.

## Installation

```bash
pi install npm:pi-xai-oauth
# or
pi install git:github.com/BlockedPath/pi-xai-oauth
```

## Usage

After installing, authenticate with:

```bash
pi /login xai-oauth
```

Then select any Grok model via `/model`.

## Supported Models

- `grok-3`
- `grok-3-mini`
- `grok-4`
- `grok-4.3` (1M context)

All models support extended reasoning with thinking levels (`low` / `medium` / `high`).

## Configuration

The extension registers the provider as `xai-oauth`.

You can override the base URL or add custom headers via `~/.pi/agent/models.json` if needed.

## Authentication

This package uses a clean prompt-based flow for xAI API keys.

After installing, run:

```bash
pi /login xai-oauth
```

Then paste your key from https://console.x.ai
