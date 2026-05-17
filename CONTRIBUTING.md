# Contributing to pi-xai-oauth

Thank you for your interest in contributing to **pi-xai-oauth**! This guide will help you get started.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the behavior**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed after following the steps**
- **Explain which behavior you expected to see instead and why**
- **Include screenshots if possible**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and explain the expected behavior**
- **Explain why this would be useful to most users**

### Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/BlockedPath/pi-xai-oauth.git
cd pi-xai-oauth

# Install dependencies
npm install

# Run TypeScript check
npx tsc --noEmit

# Test the CLI
node bin/setup.js --help
```

## Style Guidelines

- Use TypeScript strict mode
- Prefer async/await for OAuth and API calls
- Add JSDoc for all exported functions
- Keep OAuth callback server minimal and secure
- Never log sensitive tokens

## Commit Messages

We follow conventional commits:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for code refactoring
- `test:` for adding tests
- `chore:` for maintenance tasks

## Questions?

Feel free to open an issue with the label `question` if you have any questions about contributing.

Thank you for contributing! 🚀