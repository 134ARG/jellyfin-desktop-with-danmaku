# Jellium Desktop

An unofficial [Jellyfin](https://jellyfin.org) desktop client built on [CEF](https://github.com/chromiumembedded/cef) and [mpv](https://mpv.io/).

## Downloads
### Linux
- AppImage
  - [x86_64](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-linux-appimage/main/linux-appimage-x86_64.zip)
  - [aarch64](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-linux-appimage/main/linux-appimage-aarch64.zip)
- Arch Linux (AUR): [jellium-desktop-git](https://aur.archlinux.org/packages/jellium-desktop-git)
- [Flatpak (non-Flathub bundle)](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-linux-flatpak/main/linux-flatpak-x86_64.zip)

### macOS
- [Apple Silicon](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-macos/main/macos-arm64.zip)
- [Intel](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-macos/main/macos-x86_64.zip)

After installing, remove quarantine: 
```
sudo xattr -cr /Applications/Jellium\ Desktop.app
```

### Windows
- [x64](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-windows/main/windows-x64.zip)
- [arm64](https://nightly.link/andrewrabert/jellium-desktop/workflows/build-windows/main/windows-arm64.zip)


## Development

### Danmaku branch

This branch follows `andrewrabert/jellium-desktop` on `main` and adds danmaku
playback. The `jellium` remote is the Rust/CEF upstream; `origin` remains the
official Qt client, and `self` is this fork.

Copy `.env.example` to `.env` and set `DANMAKU_API_URL` to your plain API base
address and `DANMAKU_API_KEY` to your key. The client appends `/api/v2/...` and
sends the key in the `X-API-key` header. Old browser API/CORS overrides are ignored.
`.env` files are ignored by Git; only `.env.example` is tracked.

The app reads the file at runtime when creating the Jellyfin browser. File
precedence is `JFN_DANMAKU_ENV` (an explicit file path), `.env` in the working
directory, then `.env` in the app's configuration directory. On macOS the default
is `~/.config/jellium-desktop/.env`; installed GUI apps should use that location
or the configured `--config-dir`. Restart after editing. Files are not merged,
and credentials are not compiled into the binary or saved in `settings.json`.
They are available to the injected JavaScript while the app runs.

Online danmaku requires both values; without them the Jellyfin plugin's XML
danmaku can still be used. The API must allow your Jellyfin origin and the
`X-API-key` header through CORS. Authenticated API redirects are rejected.

Run danmaku request and player-adapter checks with
`node --test dev/tests/danmaku.test.cjs`.

### Build commands

This project uses [just](https://github.com/casey/just) as a command runner.

```
Available recipes:
    [package]
    appimage ...    # [linux] build AppImage
    flatpak ...     # [linux] build Flatpak bundle
    dmg             # [macos] build Apple Disk Image (.dmg)

    [maintenance]
    outdated      # List outdated dependencies
    clean         # Remove build artifacts

    [test]
    test          # Run tests

    [lint]
    fmt           # Format workspace
    fmt-check     # Check formatting
    clippy        # Run clippy
    lint          # Lint workspace
    strict-lint   # Strict lint workspace

    [build]
    build         # Build the app

    [run]
    run *args     # Run the app
    run-mpv *args # Run the mpv CLI
```
