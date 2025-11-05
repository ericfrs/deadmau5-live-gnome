# deadmau5 24/7 GNOME Extension 🎵

A GNOME Shell extension to stream deadmau5's 24/7 live broadcast directly from your top panel.

[![deadmau5 24/7](https://img.shields.io/badge/deadmau5-24%2F7%20Live-ff0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/@deadmau5/live)

## Features

- 🎧 One-click playback of the official deadmau5 livestream
- 📡 Smart controller with retry logic and cache-aware reconnects
- ℹ️ Persistent in-panel status messages (Stopped, Loading…, Playing, Error)
- 🎛️ Menu actions for play/stop and quick access to the YouTube channel

## Requirements

Before installing the extension, make sure you have the following dependencies installed:

### Arch Linux / Manjaro
```bash
sudo pacman -S mpv yt-dlp
```

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install mpv yt-dlp
```

### Fedora
```bash
sudo dnf install mpv yt-dlp
```

### openSUSE
```bash
sudo zypper install mpv yt-dlp
```

## Installation

1. **Clone the repository:**
```bash
git clone https://github.com/ericfrs/deadmau5-live-gnome.git
cd deadmau5-live-gnome
```

2. **Copy the extension into GNOME's extensions directory:**
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/deadmau5-player@ericfrs
cp -r * ~/.local/share/gnome-shell/extensions/deadmau5-player@ericfrs/
```

3. **Restart GNOME Shell:**
   - On X11: Press `Alt + F2`, type `r` and press Enter
   - On Wayland: Log out and log back in

4. **Enable the extension:**
```bash
gnome-extensions enable deadmau5-player@ericfrs
```

Or use the **Extensions** app (GNOME Extensions Manager).

## Troubleshooting

### Extension doesn't appear after installation
- Make sure the directory has the correct name: `deadmau5-player@ericfrs`
- Restart GNOME Shell completely

### Stream fails to start or stops unexpectedly
- Confirm dependencies: `mpv --version` and `yt-dlp --version`
- Test the direct URL fetch: `yt-dlp -g -f ba/b https://www.youtube.com/@deadmau5/live`
- Tail GNOME Shell logs for clues: `journalctl -f -o cat /usr/bin/gnome-shell | grep deadmau5`

### Stream doesn't start
- Check your internet connection
- Make sure deadmau5's channel is live streaming
- Test manually: `yt-dlp -g -f ba/b https://www.youtube.com/@deadmau5/live`

## Compatibility

- GNOME Shell 47+

## Credits

- Music: [deadmau5](https://www.youtube.com/@deadmau5)

---

**Note:** This is an unofficial extension and is not affiliated with deadmau5 or mau5trap.

