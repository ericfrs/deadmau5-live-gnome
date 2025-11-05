import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import {Player} from './player.js';

const ControllerState = {
    STOPPED: 'stopped',
    LOADING: 'loading',
    PLAYING: 'playing',
    ERROR: 'error',
};

export const PlayerController = GObject.registerClass(
{
    Signals: {
        'state-changed': { param_types: [GObject.TYPE_STRING] },
    },
},
class PlayerController extends GObject.Object {
    _init() {
        super._init();
        
        this._player = new Player();
        this._state = ControllerState.STOPPED;
        this._reconnectTimeout = null;
        this._retryAttempts = 0;
        this._maxRetries = 3;
        this._playbackRequestToken = 0;
        
        this._playerSignals = [];
        this._connectPlayerSignals();
    }

    _connectPlayerSignals() {
        this._playerSignals.push(
            this._player.connect('playback-stopped', () => {
                this._onPlaybackStopped();
            })
        );
    }

    _onPlaybackStopped() {
        if (this._state !== ControllerState.PLAYING) {
            return;
        }

        this._retryAttempts++;
        
        if (this._retryAttempts > this._maxRetries) {
            log(`deadmau5-controller: Max retry attempts (${this._maxRetries}) reached`);
            this._setState(ControllerState.ERROR);
            this._retryAttempts = 0;
            return;
        }

        log(`deadmau5-controller: Playback stopped unexpectedly, retry ${this._retryAttempts}/${this._maxRetries}...`);
        
        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
        }
        
        this._reconnectTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._reconnectTimeout = null;
            
            if (this._state === ControllerState.PLAYING) {
                this._startPlayback(true);
            }
            
            return GLib.SOURCE_REMOVE;
        });
    }

    _setState(newState) {
        if (this._state === newState) {
            return;
        }

        log(`deadmau5-controller: State change: ${this._state} -> ${newState}`);
        this._state = newState;
        this.emit('state-changed', newState);
    }

    async _startPlayback(forceRefresh = false) {
        const requestToken = ++this._playbackRequestToken;

        this._setState(ControllerState.LOADING);

        try {
            const streamUrl = await this._player.fetchStreamUrl(forceRefresh);
            if (!this._shouldContinuePlayback(requestToken)) {
                return;
            }

            await this._player.startPlayer(streamUrl);
            if (!this._shouldContinuePlayback(requestToken)) {
                this._player.stopPlayer();
                return;
            }

            this._setState(ControllerState.PLAYING);
            this._retryAttempts = 0;
            log('deadmau5-controller: Playback started successfully');

        } catch (e) {
            if (!this._shouldContinuePlayback(requestToken)) {
                return;
            }

            logError(e, 'deadmau5-controller: Error starting playback');
            this._setState(ControllerState.ERROR);
            this._retryAttempts = 0;
            throw e;
        }
    }

    play() {
        this._startPlayback(false);
    }

    stop() {
        log('deadmau5-controller: Stopping playback');

        this._playbackRequestToken++;

        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._retryAttempts = 0;
        this._player.cancelFetch();
        this._player.stopPlayer();
        this._setState(ControllerState.STOPPED);
    }

    isPlaying() {
        return this._player.isPlaying();
    }

    getState() {
        return this._state;
    }

    destroy() {
        log('deadmau5-controller: Destroying controller');

        this.stop();

        if (this._reconnectTimeout) {
            GLib.source_remove(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }

        this._playerSignals.forEach(signalId => {
            this._player.disconnect(signalId);
        });
        this._playerSignals = [];

        if (this._player) {
            this._player.destroy();
            this._player = null;
        }
    }

    _shouldContinuePlayback(requestToken) {
        return requestToken === this._playbackRequestToken && this._state === ControllerState.LOADING;
    }
});

export {ControllerState};
