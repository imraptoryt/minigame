-- LS Customs — serveur FiveM : identifie le joueur (licence) puis relaie
-- l'action vers l'API (api/rpc.js) qui vérifie les permissions et écrit en base.
-- Le client ne peut jamais choisir l'identité de l'employé : elle vient d'ici.
--
-- server.cfg :
--   set lsc_api_url "https://votre-projet.vercel.app/api/rpc"
--   set lsc_server_key "même valeur que LSC_FIVEM_KEY sur Vercel"
--   ensure ls_customs

local API_URL = GetConvar('lsc_api_url', '')
local SERVER_KEY = GetConvar('lsc_server_key', '')

local function licenseOf(src)
  for _, id in ipairs(GetPlayerIdentifiers(src)) do
    if id:sub(1, 8) == 'license:' then return id end
  end
end

-- anti-spam simple : 10 requêtes / 2 s par joueur
local rate = {}
local function allowed(src)
  local now = GetGameTimer()
  local r = rate[src]
  if not r or now - r.t > 2000 then rate[src] = { t = now, n = 1 } return true end
  r.n = r.n + 1
  return r.n <= 10
end
AddEventHandler('playerDropped', function() rate[source] = nil end)

RegisterNetEvent('ls_customs:rpc', function(reqId, action, payload)
  local src = source
  local function reply(res) TriggerLatentClientEvent('ls_customs:rpc:result', src, 250000, reqId, res) end

  if type(action) ~= 'string' or #action > 64 then return reply({ ok = false, error = 'Action invalide' }) end
  if not allowed(src) then return reply({ ok = false, error = 'Trop de requêtes' }) end
  if API_URL == '' or SERVER_KEY == '' then return reply({ ok = false, error = 'lsc_api_url / lsc_server_key non configurés' }) end

  local license = licenseOf(src)
  if not license then return reply({ ok = false, error = 'Licence introuvable' }) end

  local body = json.encode({ action = action, payload = type(payload) == 'table' and payload or {}, actorLicense = license })
  PerformHttpRequest(API_URL, function(status, text)
    local ok, res = pcall(json.decode, text or '')
    if not ok or type(res) ~= 'table' then res = { ok = false, error = 'Serveur injoignable (' .. tostring(status) .. ')' } end
    reply(res)
  end, 'POST', body, { ['Content-Type'] = 'application/json', ['x-lsc-server-key'] = SERVER_KEY })
end)
