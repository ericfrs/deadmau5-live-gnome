import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@deadmau5/live';
const CHANNEL_IMAGE_URL = 'https://yt3.googleusercontent.com/gsIYpmjIShe3KyxlMqYlTeX9lL8_jRq3jPqVX4pxfkEBpKH3ePDsC5pKBH6jy00l8deAuo2LgQ=s160-c-k-c0x00ffffff-no-rj';

const Deadmau5Indicator = GObject.registerClass(
class Deadmau5Indicator extends PanelMenu.Button {
    _init(uuid) {
        super._init(0.0, 'deadmau5 Player');

        this._uuid = uuid;

        this._icon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._isPlaying = false;
        this._playerProcess = null;
        this._notificationSource = null;
        this._albumArtPath = null;
        this._streamUrl = null;
        this._reconnectTimeout = null;
        this._shouldBeePlaying = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        this._notificationTimeout = null;
        this._activeNotification = null;

        this.connect('button-press-event', this._onButtonPress.bind(this));
        
        this._initializeAlbumArt();
    }

    _initializeAlbumArt() {
        this._downloadIcon(CHANNEL_IMAGE_URL, iconPath => {
            if (iconPath) {
                this._albumArtPath = iconPath;
                log(`deadmau5-player: Album art cached at ${iconPath}`);
            }
        });
    }

    _getNotificationSource() {
        if (!this._notificationSource) {
            this._notificationSource = new MessageTray.Source({
                title: 'deadmau5 Player',
                iconName: 'audio-x-generic-symbolic',
            });

            this._notificationSource.connect('destroy', () => {
                this._notificationSource = null;
            });

            Main.messageTray.add(this._notificationSource);
        }
        return this._notificationSource;
    }

    _updateIcon() {
        this._icon.icon_name = this._isPlaying 
            ? 'media-playback-pause-symbolic' 
            : 'audio-x-generic-symbolic';
    }

    _onButtonPress(actor, event) {
        if (this._isPlaying) {
            this._stopPlayback();
        } else {
            this._startPlayback();
        }
        return Clutter.EVENT_STOP;
    }

    _startPlayback() {
        if (this._isPlaying || this._playerProcess) {
            log('deadmau5-player: Already playing or process exists, ignoring');
            return;
        }

        this._shouldBeePlaying = true;
        this._reconnectAttempts = 0;
        this._icon.icon_name = 'emblem-synchronizing-symbolic';
        log('deadmau5-player: Loading stream...');

        const startAction = () => {
            if (this._streamUrl) {
                log('deadmau5-player: Using cached stream URL.');
                this._playStream(this._streamUrl);
            } else {
                log('deadmau5-player: No cached URL, fetching new one.');
                this._fetchStreamUrl();
            }
        };

        if (!this._albumArtPath) {
            this._downloadIcon(CHANNEL_IMAGE_URL, iconPath => {
                this._albumArtPath = iconPath;
                if (this._shouldBeePlaying && !this._playerProcess) {
                    startAction();
                }
            });
        } else {
            startAction();
        }
    }

    _fetchStreamUrl() {
        try {
            const subprocess = Gio.Subprocess.new(
                ['yt-dlp', '-g', '-f', 'ba/b', YOUTUBE_CHANNEL_URL],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [ok, stdout, stderr] = source.communicate_utf8_finish(result);

                    if (!ok || !stdout.trim()) {
                        logError(new Error(stderr || 'yt-dlp failed to get stream URL'));
                        this._handlePlaybackError();
                        return;
                    }

                    this._streamUrl = stdout.trim();
                    log(`deadmau5-player: Fetched new stream URL: ${this._streamUrl}`);
                    
                    if (this._shouldBeePlaying) {
                        this._playStream(this._streamUrl);
                    }
                } catch (e) {
                    logError(e, 'Error fetching stream URL');
                    this._handlePlaybackError();
                }
            });
        } catch (e) {
            logError(e, 'Error creating yt-dlp process');
            this._handlePlaybackError();
        }
    }

    _playStream(streamUrl) {
        if (this._playerProcess) {
            log('deadmau5-player: Player process already exists, stopping it first');
            this._killPlayerProcess();
        }

        if (!this._shouldBeePlaying) {
            log('deadmau5-player: Should not be playing, aborting');
            return;
        }

        try {
            this._playerProcess = Gio.Subprocess.new(
                [
                    'bash',
                    '-c',
                    `exec ffplay -nodisp -autoexit -vn -infbuf -i "${streamUrl}"`
                ],
                Gio.SubprocessFlags.NONE
            );

            this._isPlaying = true;
            this._updateIcon();
            log('deadmau5-player: Now playing');
            
            this._dismissActiveNotification();
            
            this._notificationTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                this._notificationTimeout = null;
                if (this._isPlaying && this._playerProcess) {
                    this._showNotification('deadmau5 24/7', 'Now streaming');
                }
                return GLib.SOURCE_REMOVE;
            });

            this._playerProcess.wait_async(null, (source, result) => {
                try {
                    source.wait_finish(result);
                } catch (e) {
                    logError(e, 'Player process error');
                }
                
                this._isPlaying = false;
                this._playerProcess = null;
                this._updateIcon();
                log('deadmau5-player: Stopped');

                this._dismissActiveNotification();

                if (this._shouldBeePlaying) {
                    log('deadmau5-player: Clearing cached URL due to unexpected stop.');
                    this._streamUrl = null;

                    this._reconnectAttempts++;
                    if (this._reconnectAttempts <= this._maxReconnectAttempts) {
                        const delay = 2 + (this._reconnectAttempts * 2);
                        log(`deadmau5-player: Stream ended unexpectedly, reconnecting (${this._reconnectAttempts}/${this._maxReconnectAttempts}) in ${delay} seconds...`);
                        
                        if (this._reconnectTimeout) {
                            GLib.source_remove(this._reconnectTimeout);
                            this._reconnectTimeout = null;
                        }
                        
                        this._reconnectTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
                            this._reconnectTimeout = null;
                            if (this._shouldBeePlaying && !this._playerProcess) {
                                this._fetchStreamUrl();
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    } else {
                        log('deadmau5-player: Max reconnection attempts reached');
                        this._shouldBeePlaying = false;
                        this._updateIcon();
                        Main.notify('deadmau5 Player', 'Connection lost. Max reconnection attempts reached.');
                    }
                }
            });
        } catch (e) {
            logError(e, 'Error starting playback');
            this._handlePlaybackError();
        }
    }

    _handlePlaybackError() {
        this._icon.icon_name = 'dialog-error-symbolic';
        this._isPlaying = false;
        this._shouldBeePlaying = false;
        Main.notify(
            'deadmau5 Player', 
            'Failed to start playback. Make sure yt-dlp and ffplay are installed.'
        );
    }

    _killPlayerProcess() {
        if (!this._playerProcess) return;

        try {
            const pid = this._playerProcess.get_identifier();
            
            GLib.spawn_command_line_sync(`pkill -P ${pid}`);
            this._playerProcess.send_signal(15);
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                if (this._playerProcess) {
                    try {
                        this._playerProcess.force_exit();
                    } catch (e) {
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            logError(e, 'Error killing player process');
        }
        
        this._playerProcess = null;
    }

    _stopPlayback(silent = false) {
        this._shouldBeePlaying = false;
        this._reconnectAttempts = 0;

        if (this._notificationTimeout) {
            GLib.source_remove(this._notificationTimeout);
            this._notificationTimeout = null;
        }

        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._killPlayerProcess();

        this._isPlaying = false;
        this._updateIcon();
        
        if (!silent) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._showNotification('deadmau5 24/7', 'Streaming stoppep');
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _dismissActiveNotification() {
        if (this._activeNotification) {
            try {
                this._activeNotification.destroy();
            } catch (e) {
                logError(e, 'Error dismissing notification');
            }
            this._activeNotification = null;
        }
    }

    _showNotification(title, message) {
        this._dismissActiveNotification();

        try {
            const source = this._getNotificationSource();
            
            if (this._albumArtPath) {
                try {
                    source.icon = Gio.icon_new_for_string(this._albumArtPath);
                } catch (e) {
                    logError(e, 'Could not set source icon');
                }
            }

            const notification = new MessageTray.Notification({
                source,
                title,
                body: message,
                urgency: MessageTray.Urgency.NORMAL,
            });
            
            if (this._albumArtPath) {
                try {
                    notification.gicon = Gio.icon_new_for_string(this._albumArtPath);
                } catch (e) {
                    logError(e, 'Could not set notification icon');
                }
            }

            this._activeNotification = notification;
            source.addNotification(notification);
        } catch (e) {
            logError(e, 'Error showing notification');
            Main.notify(title, message);
        }
    }

    _downloadIcon(url, callback) {
        const ICON_CACHE_FILENAME = 'deadmau5-icon.jpg';
        try {
            const cacheDir = GLib.build_filenamev([
                GLib.get_user_cache_dir(), 
                this._uuid
            ]);
            GLib.mkdir_with_parents(cacheDir, 0o755);
            
            const iconPath = GLib.build_filenamev([cacheDir, ICON_CACHE_FILENAME]);
            
            if (GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
                callback(iconPath);
                return;
            }

            const session = new Soup.Session();
            const message = Soup.Message.new('GET', url);
            
            session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try {
                    const bytes = source.send_and_read_finish(result);
                    if (bytes) {
                        GLib.file_set_contents(iconPath, bytes.get_data());
                        callback(iconPath);
                    } else {
                        log('Failed to download icon: empty response');
                        callback(null);
                    }
                } catch (e) {
                    logError(e, 'Error downloading icon');
                    callback(null);
                }
            });
        } catch (e) {
            logError(e, 'Error in _downloadIcon');
            callback(null);
        }
    }

    destroy() {
        this._stopPlayback(true);
        this._streamUrl = null;

        if (this._notificationTimeout) {
            GLib.source_remove(this._notificationTimeout);
            this._notificationTimeout = null;
        }

        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._dismissActiveNotification();
        
        if (this._notificationSource) {
            this._notificationSource.destroy();
            this._notificationSource = null;
        }
        
        super.destroy();
    }
});

export default class Deadmau5Extension extends Extension {
    enable() {
        this._indicator = new Deadmau5Indicator(this.uuid);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}