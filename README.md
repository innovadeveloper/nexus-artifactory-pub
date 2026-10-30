# ABEXA Flutter Libraries

A Visual Studio Code extension for managing Flutter libraries from Nexus/Artifactory repositories. Easily browse, install, publish, and remove private Flutter packages from your team's artifact repository.

## Features

- 📦 **Browse Libraries**: View available libraries from your Nexus repository
- ⬇️ **One-Click Install**: Download and install libraries with automatic project integration
- ⬆️ **Publish Libraries**: Upload new library versions to your Nexus repository
- 🗑️ **Remove Libraries**: Clean removal of libraries from your project
- 🔄 **Auto-Refresh**: Automatically sync with your repository
- 🔒 **Secure Authentication**: Safely store Nexus credentials using VSCode's secure storage

## Requirements

- Visual Studio Code 1.101.0 or higher
- Flutter/Dart project
- Access to a Nexus Repository Manager with raw repositories
- Valid Nexus credentials

## Quick Start

1. Install the extension from the VSCode Marketplace
2. Open a Flutter project in VSCode
3. Look for the "Lib Manager" panel in the Explorer sidebar
4. Configure your Nexus repository URL and credentials
5. Start browsing and managing your libraries!

## Configuration

Configure the extension through VSCode settings:

- `abexa.nexusUrl`: Your Nexus repository URL (e.g., `https://nexus.company.com/repository/flutter-libraries`)
- `abexa.username`: Your Nexus username
- `abexa.packagesDirectory`: Local directory for downloaded libraries (default: `build/packages`)
- `abexa.autoRefresh`: Automatically refresh library list on startup
- `abexa.showNotifications`: Show success/error notifications

## Usage

### Installing a Library
1. Browse available libraries in the "Available Libraries" section
2. Click on a library to view details (double-click for detailed information panel)
3. Click "Install Library" to download and integrate into your project

### Publishing a Library
1. Open your library project in VSCode
2. Use the Command Palette (`Ctrl+Shift+P`) and search for "ABEXA: Publish Library"
3. Enter the version number when prompted
4. The library will be packaged and uploaded to your Nexus repository

### Removing a Library
1. Find the library in the "Installed Libraries" section
2. Click "Remove Library"
3. Confirm the removal - this will delete the library folder and update your `pubspec.yaml`

## Supported Repository Types

- Nexus Repository Manager (Raw repositories)
- JFrog Artifactory (Raw repositories)
- Any repository supporting the Nexus REST API

## Security

- Credentials are stored securely using VSCode's built-in secret storage
- No passwords are stored in plain text or configuration files
- All API communications use HTTPS

## Troubleshooting

**Extension not showing libraries:**
- Verify your Nexus URL and credentials
- Check the VSCode Developer Console for error messages
- Ensure your repository is accessible and contains Flutter libraries

**Installation fails:**
- Verify you have write permissions to the packages directory
- Check your Flutter project structure
- Ensure your `pubspec.yaml` is valid

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

MIT License - see LICENSE file for details

## Release Notes

### 0.0.1

Initial release with core features:
- Nexus repository integration
- Library browsing and installation
- Publishing capabilities
- Secure credential management