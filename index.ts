import {App} from './src/ts/ui/App.js';

new App(document.getElementById('app')!).start();

// Installable app, playable offline (see sw.js). Not on this computer: the cache would hide changes while developing.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname) && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
}
