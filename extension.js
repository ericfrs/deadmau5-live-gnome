import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {PlayerController, ControllerState} from './playerController.js';

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@deadmau5/live';

const Deadmau5Indicator = GObject.registerClass(
class Deadmau5Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'deadmau5 Player');

        this._controller = new PlayerController();
        this._statusMessageTimeout = null;
        this._controllerSignals = [];
        this._connectControllerSignals();

        this._buildUI();
        this._updateUI();
    }

    _connectControllerSignals() {
        this._controllerSignals.push(
            this._controller.connect('state-changed', (controller, state) => {
                this._onStateChanged(state);
            })
        );
    }

    _onStateChanged(state) {
        this._updateUI();

        let message = '';
        let durationSeconds = 2;
        let persistent = state !== ControllerState.STOPPED;

        switch (state) {
            case ControllerState.LOADING:
                message = 'Loading...';
                break;
            case ControllerState.PLAYING:
                message = 'Playing';
                break;
            case ControllerState.STOPPED:
                message = 'Stopped';
                persistent = false;
                break;
            case ControllerState.ERROR:
                message = 'Connection error';
                durationSeconds = 3;
                break;
            default:
                persistent = false;
                break;
        }

        if (message) {
            this._showTemporaryMessage(message, durationSeconds, persistent);
        }
    }

    _buildUI() {
        this._icon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'system-status-icon',
        });

        this._statusLabel = new St.Label({
            text: '',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._statusLabel.hide();

        const panelBox = new St.BoxLayout();
        panelBox.add_child(this._icon);
        panelBox.add_child(this._statusLabel);
        this.add_child(panelBox);

        this._buildMenu();
    }

    _buildMenu() {
        this._stateMenuItem = new PopupMenu.PopupMenuItem('Status: Stopped', {
            reactive: false,
        });
        this.menu.addMenuItem(this._stateMenuItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._playPauseMenuItem = new PopupMenu.PopupMenuItem('▶ Play');
        this._playPauseMenuItem.connect('activate', () => {
            this._togglePlayback();
        });
        this.menu.addMenuItem(this._playPauseMenuItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const openChannelItem = new PopupMenu.PopupMenuItem('🔗 Open YouTube Channel');
        openChannelItem.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri(
                YOUTUBE_CHANNEL_URL,
                global.create_app_launch_context(0, -1)
            );
        });
        this.menu.addMenuItem(openChannelItem);
    }

    _updateUI() {
        const state = this._controller.getState();
        
        switch (state) {
            case ControllerState.STOPPED:
                this._icon.icon_name = 'audio-x-generic-symbolic';
                this._stateMenuItem.label.text = 'Status: Stopped';
                this._playPauseMenuItem.label.text = '▶ Play';
                break;
            case ControllerState.LOADING:
                this._icon.icon_name = 'emblem-synchronizing-symbolic';
                this._stateMenuItem.label.text = 'Status: Loading...';
                this._playPauseMenuItem.label.text = '⏸ Stop';
                break;
            case ControllerState.PLAYING:
                this._icon.icon_name = 'media-playback-start-symbolic';
                this._stateMenuItem.label.text = 'Status: ♫ Playing';
                this._playPauseMenuItem.label.text = '⏸ Stop';
                break;
            case ControllerState.ERROR:
                this._icon.icon_name = 'dialog-error-symbolic';
                this._stateMenuItem.label.text = 'Status: Error';
                this._playPauseMenuItem.label.text = '▶ Retry';
                break;
        }
    }

    _showTemporaryMessage(text, durationSeconds = 2, persistent = false) {
        if (this._statusMessageTimeout) {
            GLib.source_remove(this._statusMessageTimeout);
            this._statusMessageTimeout = null;
        }

        this._statusLabel.text = text;
        this._statusLabel.show();

        if (persistent) {
            return;
        }

        this._statusMessageTimeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            durationSeconds,
            () => {
                this._statusLabel.hide();
                this._statusMessageTimeout = null;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _togglePlayback() {
        const state = this._controller.getState();
        
        if (state === ControllerState.PLAYING || state === ControllerState.LOADING) {
            this._controller.stop();
        } else {
            this._controller.play();
        }
    }

    destroy() {
        log('deadmau5-player: Destroying indicator');

        if (this._statusMessageTimeout) {
            GLib.source_remove(this._statusMessageTimeout);
            this._statusMessageTimeout = null;
        }

        this._controllerSignals.forEach(signalId => {
            this._controller.disconnect(signalId);
        });
        this._controllerSignals = [];

        if (this._controller) {
            this._controller.destroy();
            this._controller = null;
        }

        super.destroy();
    }
});

export default class Deadmau5Extension extends Extension {
    enable() {
        log('deadmau5-player: Enabling extension');
        this._indicator = new Deadmau5Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        log('deadmau5-player: Disabling extension');
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}