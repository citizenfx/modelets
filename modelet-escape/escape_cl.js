/// <reference path="C:/Games/FiveM/FiveM.app/citizen/scripting/v8/index.d.ts" />
/// <reference path="C:/Games/FiveM/FiveM.app/citizen/scripting/v8/natives_universal.d.ts" />

const MAX_CLIENTS = 32;

const varman = exports['modelet-varman'];

const tempStart = [ 476.33, 3096.89, 40.65 ];
const tempDestination = [ 243.07, 3320.92, 39.91 ];

class EscapeClient {
    constructor() {
        this.active = false;
        this.blip = -1;

        this.bounds = [0.0, 0.0, 0.0, 0.0];

        this.localState = {
            peds: {},
            blips: {},
            dead: {}
        };

        this.hudOverlay = null;
        this.setbounds = false;

        this.lastTime = 0;
    }

    activate() {
        this.hudOverlay = AddMinimapOverlay('gang_areas.gfx');

        this.blip = AddBlipForCoord(tempDestination[0], tempDestination[1], tempDestination[2]);

        this.bounds = [
            Math.min(tempStart[0], tempDestination[0]),
            Math.min(tempStart[1], tempDestination[1]),
            Math.max(tempStart[0], tempDestination[0]),
            Math.max(tempStart[1], tempDestination[1]),
        ];

        AddNavmeshRequiredRegion(
            (this.bounds[2] - this.bounds[0]) / 2.0,
            (this.bounds[3] - this.bounds[1]) / 2.0,
            500.5 // TODO: actual rect size
        );

        RequestModel('a_m_y_skater_01');

        AddRelationshipGroup('Escape_Enemy');
        AddRelationshipGroup('Escape_Player');
        SetRelationshipBetweenGroups(5, 'Escape_Enemy', 'Escape_Player');
        SetRelationshipBetweenGroups(5, 'Escape_Player', 'Escape_Enemy');

        SetPedRelationshipGroupHash(PlayerPedId(), 'Escape_Player');

        this.active = true;
    }

    update() {
        const state = varman.get('escape:state');

        if (state in this) {
            this[state]();
        } else {
            console.log(`invalid state (${state})`);
        }
    }

    init() {
        if (!NetworkIsHost()) {
            return;
        }
        
        varman.set('escape:state', 'run');
    }

    checkPedGeneration() {
        // are we the responsible player?
        // TODO: better logic to determine relevance
        if (!NetworkIsHost()) {
            return;
        }

        let needPeds = 60;
        const pedCount = varman.lcount('escape:peds');

        for (let i = 0; i < pedCount; i++) {
            const ped = varman.lget('escape:peds', i)
            const pedKey = `escape:peds:${ped}`;

            const dead = varman.hget(pedKey, 'dead');

            if (!dead) {
                needPeds -= 1;
            }
        }

        // create needed peds
        for (let i = 0; i < needPeds; i++) {
            console.log('creating needed ped');

            this.createEnemyPed();
        }
    }

    createEnemyPed() {
        let result = false;
        let pos = [0.0, 0.0, 0.0];

        let tries = 0;

        while (!result) {
            // TODO: cases +0.5 is round?
            const x = GetRandomFloatInRange(this.bounds[0], this.bounds[2]) + 0.5;
            const y = GetRandomFloatInRange(this.bounds[1], this.bounds[3]) + 0.5;
            const z = GetRandomFloatInRange(10, 60);

            [ result, pos ] = GetSafeCoordForPed(x, y, z, false, 16);

            tries++;

            if (tries > 10) {
                console.log('ran out of tries :(');
                return;
            }

            if (Vdist2(pos[0], pos[1], pos[2], tempStart[0], tempStart[1], tempStart[2]) < (40 * 40)) {
                result = false;
            }
        }

        const ped = CreatePed(4, 'a_m_y_skater_01', pos[0], pos[1], pos[2], GetRandomFloatInRange(0, 359.5), true, false);
        const netID = NetworkGetNetworkIdFromEntity(ped);

        GiveWeaponToPed(ped, 'WEAPON_MICROSMG', 500, false, true);
        SetCurrentPedWeapon(ped, 'WEAPON_MICROSMG', true);

        varman.ladd('escape:peds', netID);
    }

    updateClientPed(netID) {
        const ped = NetToPed(netID);

        const updatePedControl = () => {
            const pedKey = `escape:peds:${netID}`;

            const dead = varman.hget(pedKey, 'dead');

            if (dead) {
                return;
            }

            if (GetScriptTaskStatus(ped, 0x42cc4f21) === 7) {
                SetPedRelationshipGroupHash(ped, 'Escape_Enemy');
                SetEntityCanBeDamagedByRelationshipGroup(ped, false, GetHashKey('Escape_Enemy'));

                const coords = GetEntityCoords(ped);
                TaskCombatHatedTargetsInArea(ped, coords[0], coords[1], coords[2], 30.1, 0);
            }

            if (IsEntityDead(ped)) {
                if (!dead) {
                    varman.hset(pedKey, 'dead', true);
                }

                //SetEntityAsNoLongerNeeded(ped);
                SetEntityAsMissionEntity(ped, true, false);
                DeleteEntity(ped);
            }
        };

        if (DoesEntityExist(ped)) {
            if (NetworkHasControlOfEntity(ped)) {
                updatePedControl();
            }

            const dead = this.localState.dead[netID];

            if (dead) {
                return;
            }

            if (!IsEntityDead(ped) && !this.localState.blips[netID]) {
                const blip = AddBlipForEntity(ped);
                SetBlipColour(blip, 1);
                SetBlipDisplay(blip, 2);
                SetBlipScale(blip, 0.6);

                BeginTextCommandSetBlipName('STRING');
                AddTextComponentSubstringPlayerName(`Enemy - ${netID}`);
                EndTextCommandSetBlipName(blip);

                this.localState.blips[netID] = blip;
            } else if (IsEntityDead(ped)) {
                RemoveBlip(this.localState.blips[netID]);
                delete this.localState.blips[netID];

                this.localState.dead[netID] = true;
            }
        } else {
            if (this.localState.blips[netID]) {
                RemoveBlip(this.localState.blips[netID]);
                delete this.localState.blips[netID];
            }
        }
    }

    updatePeds() {
        const peds = varman.get('escape:peds') || [];

        for (let netID of peds) {
            if (NetworkDoesEntityExistWithNetworkId(netID)) {
                this.updateClientPed(netID);
            }
        }
    }

    setupHud() {
        const addGangColor = (gang, r, g, b) => {
            CallMinimapScaleformFunction(this.hudOverlay, 'ADD_GANG_COLOR');
            PushScaleformMovieFunctionParameterString(gang);
            PushScaleformMovieFunctionParameterInt(r);
            PushScaleformMovieFunctionParameterInt(g);
            PushScaleformMovieFunctionParameterInt(b);
            PopScaleformMovieFunctionVoid();
        };

        const addGangArea = (id, x1, y1, x2, y2, owner) => {
            CallMinimapScaleformFunction(this.hudOverlay, 'ADD_GANG_AREA');
            PushScaleformMovieFunctionParameterFloat(x1);
            PushScaleformMovieFunctionParameterFloat(y1);
            PushScaleformMovieFunctionParameterFloat(x2);
            PushScaleformMovieFunctionParameterFloat(y2);
            PushScaleformMovieFunctionParameterString(id);
            PopScaleformMovieFunctionVoid();
        
            CallMinimapScaleformFunction(this.hudOverlay, 'SET_GANG_AREA_OWNER');
            PushScaleformMovieFunctionParameterString(id);
            PushScaleformMovieFunctionParameterString(owner);
            PopScaleformMovieFunctionVoid();
        };

        addGangColor('PLAY_AREA', 255, 255, 0);
        addGangArea('PLAY_AREA_ZONE', this.bounds[0] - 25.0, this.bounds[1] - 25.0, this.bounds[2] + 25.0, this.bounds[3] + 25.0, 'PLAY_AREA');
    }

    run() {
        if (HasMinimapOverlayLoaded(this.hudOverlay)) {
            if (!this.setBounds) {
                this.setBounds = true;

                this.setupHud();
            }
        }

        if ((GetGameTimer() - this.lastTime) > 250) {
            // check if any attacking peds need to be made
            this.checkPedGeneration();

            // update current attacking peds' objectives
            this.updatePeds();

            // save time
            this.lastTime = GetGameTimer();
        }

        // out of the area? screw you
        const localCoords = GetEntityCoords(PlayerPedId());

        if (localCoords[0] < (this.bounds[0] - 30.0) ||
            localCoords[1] < (this.bounds[1] - 30.0) ||
            localCoords[0] > (this.bounds[2] + 30.0) ||
            localCoords[1] > (this.bounds[3] + 30.0)) {
            if (!this.suiciding) {
                this.suiciding = true;

                emit('suicide', PlayerPedId());
            }
        }

        // are all players at the end?
        if (NetworkIsHost()) {
            let totalPlayers = 0;
            let atPlayers = 0;

            for (let i = 0; i < MAX_CLIENTS; i++) {
                if (NetworkIsPlayerActive(i)) {
                    const ped = GetPlayerPed(i);

                    ++totalPlayers;

                    if (IsEntityAtCoord(ped, tempDestination[0], tempDestination[1], tempDestination[2], 10.5, 10.5, 10.5, false, true, 0)) {
                        ++atPlayers;
                    }
                }
            }

            const reqPlayers = Math.max(totalPlayers * 0.4, 1);

            if (atPlayers >= reqPlayers) {
                varman.set('escape:state', 'end');
            }
        }
    }

    end() {
        if (!this.ended) {
            emit('chat:addMessage', {
                args: [ 'you won! how nice :)' ]
            });

            for (let [ id, blip ] of Object.entries(this.localState.blips)) {
                RemoveBlip(blip);
            }

            RemoveBlip(this.blip);

            SetPlayerControl(PlayerId(), false, 256);
            SetEveryoneIgnorePlayer(PlayerId(), true);

            SetMinimapOverlayDisplay(this.hudOverlay, 0, 0, 100.001, 100.001, 0.0);

            this.ended = true;
        }
    }
}

const escapeClient = new EscapeClient();

on('onClientGameTypeStart', () => {
    SetMaxWantedLevel(0);

    exports.spawnmanager.setAutoSpawnCallback(() => {
        exports.spawnmanager.spawnPlayer({
            x: tempStart[0],
            y: tempStart[1],
            z: tempStart[2],
            model: 'a_m_m_skater_01'
        }, () => {
            if (NetworkIsHost() && !escapeClient.inited) {
                varman.set('escape:state', 'init');

                escapeClient.inited = true;
            }

            escapeClient.suiciding = false;

            StatSetInt('MP0_SHOOTING_ABILITY', 100, true);

            const ped = PlayerPedId();
            GiveWeaponToPed(ped, 'WEAPON_ADVANCEDRIFLE', 5000, false, true);
            GiveWeaponToPed(ped, 'WEAPON_SNIPERRIFLE', 10, false, true);
            SetCurrentPedWeapon(ped, 'WEAPON_ADVANCEDRIFLE', true);

            SetPedArmour(ped, 100);
        });
    });
    
    exports.spawnmanager.setAutoSpawn(true);
    exports.spawnmanager.forceRespawn();
});

setTick(() => {
    if (!escapeClient.active) {
        SetPlayerControl(PlayerId(), true, 0);
        SetEveryoneIgnorePlayer(PlayerId(), false);

        ClearArea(0.0, 0.0, 0.0, 20000.5, true, false, false, false);

        escapeClient.activate();
    }

    escapeClient.update();
});