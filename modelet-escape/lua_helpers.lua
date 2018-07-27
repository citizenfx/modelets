local suiciding = false

AddEventHandler('suicide', function()
    if suiciding then
        return
    end

    suiciding = true

    RequestAnimDict('mp_suicide')

    while not HasAnimDictLoaded('mp_suicide') do
        Wait(0)
    end

    SetPedCurrentWeaponVisible(PlayerPedId(), false, true, false, false)
    Wait(500)

    TaskPlayAnim(PlayerPedId(), 'mp_suicide', 'pill', 8.0, 0.0, -1, 0, 0.0, false, false, false)
    Wait(5000)

    SetEntityHealth(PlayerPedId(), 0)

    suiciding = false
end)