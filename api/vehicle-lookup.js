// Vercel Serverless Function — deployed automatically at /api/vehicle-lookup
// because it lives under /api. No build step needed.
//
// Why this exists: the browser can't call api.glife.fr directly — the key
// would be visible to anyone viewing the page source, and the API likely
// blocks cross-origin browser requests anyway. This function runs on
// Vercel's servers instead: the browser calls THIS (same origin, no CORS
// issue), and this calls the real API with the key kept secret.
//
// Setup:
//   1. Vercel dashboard → your project → Settings → Environment Variables
//      → add GLIFE_API_KEY with your real key → redeploy.
//   2. Check the "Authorize" button on https://api.glife.fr/docs to confirm
//      the auth format. This assumes `Authorization: Bearer <key>` — if
//      GLife expects something else (e.g. a custom header), change the
//      `headers` object below accordingly.

module.exports = async function handler(req, res) {
  const plate = (req.query.plate || "").toString().trim();
  if (!plate) {
    res.status(400).json({ error: "Paramètre 'plate' requis" });
    return;
  }

  const apiKey = process.env.GLIFE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GLIFE_API_KEY n'est pas configurée sur Vercel" });
    return;
  }

  try {
    const url = `https://api.glife.fr/roleplay/vehicles?plate=${encodeURIComponent(plate)}`;
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (apiRes.status === 404) {
      res.status(404).json({ error: "Véhicule introuvable" });
      return;
    }
    if (!apiRes.ok) {
      res.status(apiRes.status).json({ error: `Erreur API GLife (${apiRes.status})` });
      return;
    }

    const data = await apiRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Impossible de contacter l'API GLife" });
  }
}
