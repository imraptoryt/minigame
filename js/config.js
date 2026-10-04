/* Configuration du transport des données.
 * mode :
 *   'auto'  -> 'nui' dans FiveM, 'local' en local (fichier / localhost), sinon 'http' (site en ligne)
 *   'local' -> démo : logique serveur exécutée dans le navigateur, données en localStorage
 *   'http'  -> production : API Vercel (api/rpc.js) + Supabase
 *   'nui'   -> FiveM : NUI -> client.lua -> server.lua -> API
 */
window.LSC_CONFIG = {
  mode: 'auto',
  apiUrl: '/api/rpc',
  /* Recherche de plaque (API publique GLife) : GET ?plate=XXXX -> modèle, propriétaire... */
  vehicleApi: 'https://apirp.glife.fr/roleplay/vehicles'
};
