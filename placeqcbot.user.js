// ==UserScript==
// @name         PlaceQC Bot
// @namespace    https://github.com/PlaceQC/Bot
// @version      1
// @description  Le bot pour PlaceQC
// @author       N_O_P_E (Credit: NoahvdAa)
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/PlaceQC/Bot/raw/main/placeqcbot.user.js
// @downloadURL  https://github.com/PlaceQC/Bot/raw/main/placeqcbot.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

var socket;
var hasOrders = false;
var accessToken;
var currentOrderCanvas = document.createElement('canvas');
var currentOrderCtx = currentOrderCanvas.getContext('2d');
var currentPlaceCanvas = document.createElement('canvas');

const COLOR_MAPPINGS = {
    '#FF4500': 2,
    '#FFA800': 3,
    '#FFD635': 4,
    '#00A368': 6,
    '#7EED56': 8,
    '#2450A4': 12,
    '#3690EA': 13,
    '#51E9F4': 14,
    '#811E9F': 18,
    '#B44AC0': 19,
    '#FF99AA': 23,
    '#9C6926': 25,
    '#000000': 27,
    '#898D90': 29,
    '#D4D7D9': 30,
    '#FFFFFF': 31
};

var order = [];
for (var i = 0; i < 1000000; i++) {
    order.push(i);
}
order.sort(() => Math.random() - 0.5);

(async function () {
    GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
    currentOrderCanvas.width = 1000;
    currentOrderCanvas.height = 1000;
    currentOrderCanvas = document.body.appendChild(currentOrderCanvas);
    currentPlaceCanvas.width = 1000;
    currentPlaceCanvas.height = 1000;
    currentPlaceCanvas = document.body.appendChild(currentPlaceCanvas);

    Toastify({
        text: 'Obtenir le jeton d\'accès...',
        duration: 10000
    }).showToast();
    accessToken = await getAccessToken();
    Toastify({
        text: 'Jeton d\'accès récupéré !',
        duration: 10000
    }).showToast();

    connectSocket();
    attemptPlace();
})();

function connectSocket() {
    Toastify({
        text: 'Connexion au serveur PlaceQC...',
        duration: 10000
    }).showToast();

    socket = new WebSocket('wss://placeqc.nn.r.appspot.com/api/ws');

    socket.onopen = function () {
        Toastify({
            text: 'Connecté au serveur PlaceQC!',
            duration: 10000
        }).showToast();
        socket.send(JSON.stringify({ type: 'getmap' }));
    };

    socket.onmessage = async function (message) {
        var data;
        try {
            data = JSON.parse(message.data);
        } catch (e) {
            return;
        }

        switch (data.type.toLowerCase()) {
            case 'map':
                Toastify({
                    text: `Nouvelle carte chargée (raison: ${data.reason ? data.reason : 'connecté au serveur'})`,
                    duration: 10000
                }).showToast();
                currentOrderCtx = await getCanvasFromUrl(`https://placeqc.nn.r.appspot.com/maps/${data.data}`, currentOrderCanvas);
                hasOrders = true;
                break;
            default:
                break;
        }
    };

    socket.onclose = function (e) {
        Toastify({
            text: `Le serveur PlaceQC s'est déconnecté :${e.reason}`,
            duration: 10000
        }).showToast();
        console.error('Socketfout: ', e.reason);
        socket.close();
        setTimeout(connectSocket, 1000);
    };
}

async function attemptPlace() {
    if (!hasOrders) {
        setTimeout(attemptPlace, 2000); // probeer opnieuw in 2sec.
        return;
    }
    var ctx;
    try {
        const canvasUrl = await getCurrentImageUrl();
        ctx = await getCanvasFromUrl(canvasUrl, currentPlaceCanvas);
    } catch (e) {
        console.warn('Erreur lors de la récupération de la carte: ', e);
        Toastify({
            text: 'Erreur lors de la récupération de la carte. Réessayez dans 15 secondes...',
            duration: 15000
        }).showToast();
        setTimeout(attemptPlace, 15000); // Réessayez dans 15 secondes
        return;
    }

    const rgbaOrder = currentOrderCtx.getImageData(0, 0, 1000, 1000).data;
    const rgbaCanvas = ctx.getImageData(0, 0, 1000, 1000).data;

    for (const i of order) {
        // negeer lege order pixels.
        if (rgbaOrder[(i * 4) + 3] === 0) continue;

        const hex = rgbToHex(rgbaOrder[(i * 4)], rgbaOrder[(i * 4) + 1], rgbaOrder[(i * 4) + 2]);
        // Deze pixel klopt.
        if (hex === rgbToHex(rgbaCanvas[(i * 4)], rgbaCanvas[(i * 4) + 1], rgbaCanvas[(i * 4) + 2])) continue;

        const x = i % 1000;
        const y = Math.floor(i / 1000);
        Toastify({
            text: `Essayer de publier un pixel sur ${x}, ${y}...`,
            duration: 10000
        }).showToast();

        const res = await place(x, y, COLOR_MAPPINGS[hex]);
        const data = await res.json();
        try {
            if (data.errors) {
                const error = data.errors[0];
                const nextPixel = error.extensions.nextAvailablePixelTs + 3000;
                const nextPixelDate = new Date(nextPixel);
                const delay = nextPixelDate.getTime() - Date.now();
                Toastify({
                    text: `Pixel posté trop tôt! Le pixel suivant sera placé à ${nextPixelDate.toLocaleTimeString()}.`,
                    duration: delay
                }).showToast();
                setTimeout(attemptPlace, delay);
            } else {
                const nextPixel = data.data.act.data[0].data.nextAvailablePixelTimestamp + 3000;
                const nextPixelDate = new Date(nextPixel);
                const delay = nextPixelDate.getTime() - Date.now();
                Toastify({
                    text: `Pixel placé sur ${x}, ${y}! Le pixel suivant sera placé à ${nextPixelDate.toLocaleTimeString()}.`,
                    duration: delay
                }).showToast();
                setTimeout(attemptPlace, delay);
            }
        } catch (e) {
            console.warn(' Analyser l\'erreur de réponse', e);
            Toastify({
                text: `Analyser l'erreur de réponse: ${e}.`,
                duration: 10000
            }).showToast();
            setTimeout(attemptPlace, 10000);
        }

        return;
    }

    Toastify({
        text: `Tous les pixels sont déjà au bon endroit ! Réessayez dans 30 secondes...`,
        duration: 30000
    }).showToast();
    setTimeout(attemptPlace, 30000); // probeer opnieuw in 30sec.
}

function place(x, y, color) {
    return fetch('https://gql-realtime-2.reddit.com/query', {
        method: 'POST',
        body: JSON.stringify({
            'operationName': 'setPixel',
            'variables': {
                'input': {
                    'actionName': 'r/replace:set_pixel',
                    'PixelMessageData': {
                        'coordinate': {
                            'x': x,
                            'y': y
                        },
                        'colorIndex': color,
                        'canvasIndex': 0
                    }
                }
            },
            'query': 'mutation setPixel($input: ActInput!) {\n  act(input: $input) {\n    data {\n      ... on BasicMessage {\n        id\n        data {\n          ... on GetUserCooldownResponseMessageData {\n            nextAvailablePixelTimestamp\n            __typename\n          }\n          ... on SetPixelResponseMessageData {\n            timestamp\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n'
        }),
        headers: {
            'origin': 'https://hot-potato.reddit.com',
            'referer': 'https://hot-potato.reddit.com/',
            'apollographql-client-name': 'mona-lisa',
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}

async function getAccessToken() {
    const usingOldReddit = window.location.href.includes('new.reddit.com');
    const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
    const response = await fetch(url);
    const responseText = await response.text();

    // TODO: ew
    return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

async function getCurrentImageUrl() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

        ws.onopen = () => {
            ws.send(JSON.stringify({
                'type': 'connection_init',
                'payload': {
                    'Authorization': `Bearer ${accessToken}`
                }
            }));
            ws.send(JSON.stringify({
                'id': '1',
                'type': 'start',
                'payload': {
                    'variables': {
                        'input': {
                            'channel': {
                                'teamOwner': 'AFD2022',
                                'category': 'CANVAS',
                                'tag': '0'
                            }
                        }
                    },
                    'extensions': {},
                    'operationName': 'replace',
                    'query': 'subscription replace($input: SubscribeInput!) {\n  subscribe(input: $input) {\n    id\n    ... on BasicMessage {\n      data {\n        __typename\n        ... on FullFrameMessageData {\n          __typename\n          name\n          timestamp\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}'
                }
            }));
        };

        ws.onmessage = (message) => {
            const { data } = message;
            const parsed = JSON.parse(data);

            // TODO: ew
            if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

            ws.close();
            resolve(parsed.payload.data.subscribe.data.name);
        }

        ws.onerror = reject;
    });
}

function getCanvasFromUrl(url, canvas) {
    return new Promise((resolve, reject) => {
        var ctx = canvas.getContext('2d');
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            resolve(ctx);
        };
        img.onerror = reject;
        img.src = url;
    });
}

function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
