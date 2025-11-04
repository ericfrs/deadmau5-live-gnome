# deadmau5 24/7 GNOME Extension 🎵

A GNOME Shell extension to stream deadmau5's 24/7 live broadcast directly from your top panel.

[![deadmau5 24/7](https://img.shields.io/badge/deadmau5-24%2F7%20Live-ff0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/@deadmau5/live)

## Features

- 🎧 Automatically plays deadmau5's live stream
- ℹ️ In-panel status messages for playback state
- 🔄 Auto-reconnect on stream interruption
- 🎛️ Simple click to play/pause from the top panel

## Requirements

Before installing the extension, make sure you have the following dependencies installed:

### Arch Linux / Manjaro
```bash
sudo pacman -S yt-dlp ffmpeg
```

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

### Fedora
```bash
sudo dnf install yt-dlp ffmpeg
```

### openSUSE
```bash
sudo zypper install yt-dlp ffmpeg
```                        

## Installation

1. **Clone the repository:**
```bash
git clone https://github.com/ericfrs/deadmau5-live-gnome.git
cd deadmau5-live-gnome
```

2. **Copy the extension to GNOME extensions directory:**
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

## Usage

1. Once installed and enabled, you'll see an audio icon in the top panel
2. **Click the icon** to start/stop playback
3. The first time may take a few seconds while it fetches the stream URL
4. Enjoy deadmau5 24/7! 🎶

## Troubleshooting

### Extension doesn't appear after installation
- Make sure the directory has the correct name: `deadmau5-player@ericfrs`
- Restart GNOME Shell completely

### Error when playing
- Verify `yt-dlp` is installed: `yt-dlp --version`
- Verify `ffplay` is installed: `ffplay -version`
- Check the logs: `journalctl -f -o cat /usr/bin/gnome-shell`

### Stream doesn't start
- Check your internet connection
- Make sure deadmau5's channel is live streaming
- Test manually: `yt-dlp -g -f ba/b https://www.youtube.com/@deadmau5/live`

## Compatibility

- GNOME Shell 47+

## Credits

- Music: [deadmau5](https://www.youtube.com/@deadmau5)

---

**Note**: This is an unofficial extension and is not affiliated with deadmau5 or mau5trap.

