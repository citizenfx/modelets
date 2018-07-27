/// <reference path="C:/Games/FiveM/FiveM.app/citizen/scripting/v8/index.d.ts" />
/// <reference path="C:/Games/FiveM/FiveM.app/citizen/scripting/v8/natives_server.d.ts" />

let variables = {};
let hostVariables = {};

const SERVER = IsDuplicityVersion() != 0;
const debug = (SERVER) ? (GetConvarInt('varman_debug', 1) === 1) : true;

on('onGameTypeStart', () => {
    variables = {};
});

const secureHost = (key) => {
    if (!SERVER) {
        return false;
    }

    if (key in hostVariables) {
        if (source != GetHostId()) {
            if (debug) {
                console.log(`player ${GetPlayerName(source)} tried to alter host-only variable ${key}`);
            }

            return true;
        }
    }

    return false;
};

const emitTarget = (event, ...args) => {
    if (SERVER) {
        const indices = GetNumPlayerIndices();

        for (let i = 0; i < indices; i++) {
            const player = GetPlayerFromIndex(i);

            if (player != source) {
                emitNet(event, player, ...args);
            }
        }
    } else {
        emitNet(event, ...args);
    }
};

onNet('varman:variableSet', (key, value, local) => {
    if (secureHost(key)) {
        return;
    }

    variables[key] = value;

    if (debug) {
        console.log(`${SERVER ? GetPlayerName(source) : 'sv'} set ${key} to ${value}`);
    }

    if (local || SERVER) {
        emitTarget('varman:variableSet', key, value, false);
    }
});

onNet('varman:variableHSet', (key, h, value, local) => {
    if (secureHost(key)) {
        return;
    }

    if (!variables[key]) {
        variables[key] = {};
    }

    variables[key][h] = value;

    if (debug && SERVER) {
        console.log(`${GetPlayerName(source)} hset ${key}[${h}] to ${value}`);
    }

    if (local || SERVER) {
        emitTarget('varman:variableHSet', key, h, value, false);
    }
});

onNet('varman:variableLAdd', (key, value, local) => {
    if (secureHost(key)) {
        return;
    }

    if (!variables[key]) {
        variables[key] = [];
    }

    variables[key].push(value);

    if (debug && SERVER) {
        console.log(`${GetPlayerName(source)} ladd ${key}, ${value}`);
    }

    if (local || SERVER) {
        emitTarget('varman:variableLAdd', key, value, false);
    }
});

onNet('varman:variableLRem', (key, i, local) => {
    if (secureHost(key)) {
        return;
    }

    if (!variables[key]) {
        return;
    }

    variables[key].splice(i, 1);

    if (debug && SERVER) {
        console.log(`${GetPlayerName(source)} lrem ${key}, ${i}`);
    }

    if (local || SERVER) {
        emitTarget('varman:variableLRem', key, i, false);
    }
});

if (SERVER) {
    onNet('varman:sendMyVars', () => {
        for (const [key, value] of Object.entries(variables)) {
            emitNet('varman:variableSet', source, key, value);
        }
    });
}

exports('sethost', (key) => {
    hostVariables[key] = true;
});

exports('set', (key, value) => {
    emit('varman:variableSet', key, value, true);
});

exports('get', (key) => {
    return variables[key];
});

exports('hset', (key, h, value) => {
    emit('varman:variableHSet', key, h, value, true);
});

exports('hget', (key, h) => {
    if (!variables[key]) {
        return null;
    }

    return variables[key][h];
});

exports('ladd', (key, value) => {
    emit('varman:variableLAdd', key, value, true);
});

exports('lrem', (key, i) => {
    emit('varman:variableLRem', key, i, true);
});

exports('lget', (key, i) => {
    if (!variables[key]) {
        return null;
    }

    return variables[key][i];
});

exports('lcount', (key) => {
    if (!variables[key]) {
        return 0;
    }

    return variables[key].length;
});