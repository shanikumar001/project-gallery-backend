import express from 'express';

const router = express.Router();

router.get('/reverse', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat & lon required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ProjectGallery/1.0 (projectgallery@gmail.com)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OSM failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.address) {
      return res.json({
        location: 'Address not available',
        raw: data,
      });
    }

    const a = data.address;

    const city =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.suburb ||
      a.county ||
      '';

    const fullAddress = [
      city,
      a.state,
      a.country
    ].filter(Boolean).join(', ');

    res.json({
      location: fullAddress || data.display_name,
      address: a,
      display_name: data.display_name,
    });

  } catch (err) {
    console.error('Reverse geocode error:', err.message);
    res.status(500).json({ error: 'Could not fetch address name' });
  }
});

export default router;
