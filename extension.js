import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@deadmau5/live';

const Deadmau5Indicator = GObject.registerClass(
class Deadmau5Indicator extends PanelMenu.Button {
    _init(uuid) {
        super._init(0.0, 'deadmau5 Player');

        this._uuid = uuid;

        this._icon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'system-status-icon',
        });

        this._statusLabel = new St.Label({
            text: '',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const box = new St.BoxLayout();
        box.add_child(this._icon);
        box.add_child(this._statusLabel);
        this.add_child(box);

        this._statusLabel.hide();

        this._isPlaying = false;
        this._playerProcess = null;
        this._streamUrl = null;
        this._shouldBeePlaying = false;
        this._isBusy = false;

        this._reconnectTimeout = null;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;

        this._statusTimeout = null;

        this.connect('button-press-event', this._onButtonPress.bind(this));
    }

    _updateIcon() {
        this._icon.icon_name = this._isPlaying ?
            'media-playback-pause-symbolic' :
            'audio-x-generic-symbolic';
    }

    _showStatusMessage(text, timeout = 2) {
        if (this._statusTimeout) {
            GLib.source_remove(this._statusTimeout);
            this._statusTimeout = null;
        }

        this._statusLabel.text = text;
        this._statusLabel.show();

        this._statusTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._statusLabel.hide();
            this._statusTimeout = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _onButtonPress() {
        if (this._isBusy) {
            log('deadmau5-player: Action already in progress, ignoring click.');
            return Clutter.EVENT_STOP;
        }

        if (this._isPlaying) {
            this._stopPlayback();
        } else {
            this._startPlayback();
        }
        return Clutter.EVENT_STOP;
    }

    _startPlayback() {
        this._isBusy = true;
        if (this._isPlaying || this._playerProcess) {
            log('deadmau5-player: Already playing or process exists, ignoring');
            this._isBusy = false;
            return;
        }

        this._shouldBeePlaying = true;
        this._reconnectAttempts = 0;
        this._icon.icon_name = 'emblem-synchronizing-symbolic';
        this._showStatusMessage('Loading...');

        if (this._streamUrl) {
            log('deadmau5-player: Using cached stream URL.');
            this._playStream(this._streamUrl);
        } else {
            log('deadmau5-player: No cached URL, fetching new one.');
            this._fetchStreamUrl();
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
                        throw new Error(stderr || 'yt-dlp failed to get stream URL');
                    }

                    this._streamUrl = stdout.trim();
                    log(`deadmau5-player: Fetched new stream URL.`);
                    
                    if (this._shouldBeePlaying) {
                        this._playStream(this._streamUrl);
                    } else {
                        this._isBusy = false;
                    }
                } catch (e) {
                    this._handlePlaybackError('Error fetching URL', 'Error processing yt-dlp output', e);
                }
            });
        } catch (e) {
            this._handlePlaybackError('yt-dlp not found?', 'Error creating yt-dlp process', e);
        }
    }

    _playStream(streamUrl) {
        if (this._playerProcess) {
            log('deadmau5-player: Player process already exists, stopping it first');
            this._killPlayerProcess();
        }

        if (!this._shouldBeePlaying) {
            log('deadmau5-player: Should not be playing, aborting');
            this._isBusy = false;
            return;
        }

        try {
            this._playerProcess = Gio.Subprocess.new(
                ['ffplay', '-nodisp', '-autoexit', '-vn', '-infbuf', '-i', streamUrl],
                Gio.SubprocessFlags.NONE
            );

            this._isPlaying = true;
            this._updateIcon();
            this._showStatusMessage('Playing');
            log('deadmau5-player: Now playing');
            this._isBusy = false;

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

                if (this._shouldBeePlaying) {
                    log('deadmau5-player: Clearing cached URL due to unexpected stop.');
                    this._streamUrl = null;
                    this._reconnectAttempts++;

                    if (this._reconnectAttempts <= this._maxReconnectAttempts) {
                        const delay = 2 + (this._reconnectAttempts * 2);
                        log(`deadmau5-player: Stream ended, reconnecting (${this._reconnectAttempts}/${this._maxReconnectAttempts}) in ${delay}s...`);
                        this._showStatusMessage('Reconnecting...');
                        
                        if (this._reconnectTimeout) {
                            GLib.source_remove(this._reconnectTimeout);
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
                        this._showStatusMessage('Connection lost');
                        this._shouldBeePlaying = false;
                        this._updateIcon();
                    }
                }
            });
        } catch (e) {
            this._handlePlaybackError('ffplay not found?', 'Error starting ffplay process', e);
        }
    }

    _handlePlaybackError(userMessage, logMessage, error = null) {
        if (error) {
            logError(error, `deadmau5-player: ${logMessage}`);
        } else {
            log(`deadmau5-player: ${logMessage}`);
        }

        this._icon.icon_name = 'dialog-error-symbolic';
        this._showStatusMessage(userMessage);
        this._isPlaying = false;
        this._shouldBeePlaying = false;
        this._isBusy = false;
    }

    _killPlayerProcess() {
        if (!this._playerProcess) return;
        try {
            this._playerProcess.force_exit();
        } catch (e) {
            logError(e, 'Error killing player process');
        }
        this._playerProcess = null;
    }

    _stopPlayback(silent = false) {
        this._isBusy = true;
        this._shouldBeePlaying = false;
        this._reconnectAttempts = 0;

        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._killPlayerProcess();

        this._isPlaying = false;
        this._updateIcon();
        
        if (!silent) {
            this._showStatusMessage('Stopped');
        }
        
        this._isBusy = false;
    }

    destroy() {
        this._stopPlayback(true);
        this._streamUrl = null;

        if (this._statusTimeout) {
            GLib.source_remove(this._statusTimeout);
            this._statusTimeout = null;
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