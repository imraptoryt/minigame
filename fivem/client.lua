-- LS Customs — client : ouvre la NUI et relaie les appels vers le serveur.
-- Aucune logique métier ici : le client ne fait que transmettre.

local isOpen = false

-- Véhicule occupé ou le plus proche (6 m) : plaque, modèle et classe GTA (0 à 22) envoyés au POS,
-- qui en déduit la catégorie 1 à 5 (table des modèles / correspondance des classes dans Paramètres).
local function nearbyVehicle()
  local ped = PlayerPedId()
  local veh = GetVehiclePedIsIn(ped, false)
  if veh == 0 then
    local c = GetEntityCoords(ped)
    veh = GetClosestVehicle(c.x, c.y, c.z, 6.0, 0, 71)
  end
  if veh == 0 then return nil end
  local model = GetDisplayNameFromVehicleModel(GetEntityModel(veh))
  return {
    plate = (GetVehicleNumberPlateText(veh):gsub('^%s+', ''):gsub('%s+$', '')),
    gtaClass = GetVehicleClass(veh),
    model = model and model ~= 'CARNOTFOUND' and model:lower() or nil
  }
end

local function setOpen(state)
  isOpen = state
  SetNuiFocus(state, state)
  SendNUIMessage({ type = 'visibility', open = state })
  if state then
    local v = nearbyVehicle()
    if v then SendNUIMessage({ type = 'vehicle', plate = v.plate, gtaClass = v.gtaClass, model = v.model }) end
  end
end

RegisterCommand('lscustoms', function() setOpen(not isOpen) end, false)
RegisterKeyMapping('lscustoms', 'Ouvrir LS Customs Management', 'keyboard', 'F7')

RegisterNUICallback('close', function(_, cb)
  setOpen(false)
  cb({})
end)

-- NUI -> client -> serveur : chaque requête porte un identifiant pour retrouver sa réponse.
local pending, nextId = {}, 0

RegisterNUICallback('rpc', function(data, cb)
  nextId = nextId + 1
  local id = nextId
  pending[id] = cb
  TriggerServerEvent('ls_customs:rpc', id, data.action, data.payload)
  SetTimeout(15000, function()
    if pending[id] then pending[id]({ ok = false, error = 'Délai dépassé' }); pending[id] = nil end
  end)
end)

RegisterNetEvent('ls_customs:rpc:result', function(id, result)
  local cb = pending[id]
  pending[id] = nil
  if cb then cb(result) end
end)

AddEventHandler('onResourceStop', function(res)
  if res == GetCurrentResourceName() and isOpen then SetNuiFocus(false, false) end
end)
