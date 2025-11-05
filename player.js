import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const Player = GObject.registerClass(
{
    Signals: {
        'playback-started': {},
        'playback-stopped': {},
    },
},
class Player extends GObject.Object {
    _init() {
        super._init();
        this._proc = null;
        this._cachedStreamUrl = null;
        this._fetchOperation = null;
    }

    async fetchStreamUrl(forceRefresh = false) {
        if (!forceRefresh && this._cachedStreamUrl) {
            log('deadmau5-player: Using cached stream URL');
            return this._cachedStreamUrl;
        }

        const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@deadmau5/live';

        if (this._fetchOperation) {
            this._fetchOperation.cancelled = true;
            try {
                this._fetchOperation.proc.force_exit();
            } catch (e) {}
        }

        return new Promise((resolve, reject) => {
            try {
                const proc = Gio.Subprocess.new(
                    ['yt-dlp', '-g', '-f', 'ba/b', YOUTUBE_CHANNEL_URL],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                const operation = {
                    proc,
                    cancelled: false,
                };

                this._fetchOperation = operation;

                proc.communicate_utf8_async(null, null, (source, result) => {
                    try {
                        const [ok, stdout, stderr] = source.communicate_utf8_finish(result);

                        if (this._fetchOperation === operation) {
                            this._fetchOperation = null;
                        }

                        if (operation.cancelled) {
                            reject(new Error('Stream fetch cancelled'));
                            return;
                        }

                        if (!ok || !stdout?.trim()) {
                            reject(new Error(stderr || 'Failed to get stream URL'));
                            return;
                        }

                        this._cachedStreamUrl = stdout.trim();
                        log('deadmau5-player: Stream URL cached');
                        resolve(this._cachedStreamUrl);
                    } catch (e) {
                        if (this._fetchOperation === operation) {
                            this._fetchOperation = null;
                        }

                        if (operation.cancelled) {
                            reject(new Error('Stream fetch cancelled'));
                            return;
                        }

                        reject(e);
                    }
                });
            } catch (e) {
                this._fetchOperation = null;
                reject(e);
            }
        });
    }

    async startPlayer(streamUrl) {
        this.stopPlayer();

        const MPV_OPTIONS = [
            'mpv',
            '--no-video',
            '--no-terminal',
            '--pause=no',
            '--ytdl-format=bestaudio/best',
            '--volume=100',
            '--force-window=no',
            '--script-opts=ytdl_hook-try_ytdl_first=yes',
            streamUrl,
        ];

        try {
            this._proc = Gio.Subprocess.new(
                MPV_OPTIONS,
                Gio.SubprocessFlags.STDERR_PIPE
            );

            this._watchProcess();
            this.emit('playback-started');
        } catch (e) {
            this.stopPlayer();
            Main.notifyError('MPV not found', 'Please install mpv');
            throw e;
        }
    }

    _watchProcess() {
        if (!this._proc) return;

        this._proc.wait_async(null, (proc, result) => {
            if (!proc) return;
            
            let exitCode = 0;
            try {
                proc.wait_check_finish(result);
            } catch (e) {
                if (proc.get_if_exited()) {
                    exitCode = proc.get_exit_status();
                }
            }

            if (this._proc === proc) {
                this._proc = null;
                
                if (exitCode !== 0) {
                    log(`deadmau5-player: MPV exited with code ${exitCode}, clearing cache`);
                    this._cachedStreamUrl = null;
                }
                
                this.emit('playback-stopped');
            }
        });
    }

    stopPlayer() {
        if (this._proc) {
            const proc = this._proc;
            this._proc = null;

            try {
                proc.force_exit();
            } catch (e) {}

            proc.wait_check_async(null, () => {});
        }
    }

    isPlaying() {
        return this._proc !== null;
    }

    destroy() {
        this.stopPlayer();
        
        this.cancelFetch();
    }

    cancelFetch() {
        if (!this._fetchOperation) {
            return;
        }

        this._fetchOperation.cancelled = true;

        try {
            this._fetchOperation.proc.force_exit();
        } catch (e) {}
    }
});
