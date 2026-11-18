# Radar provenance

Radar images and their matching overview calibration come from
https://github.com/MurkyYT/cs2-map-icons at commit
`6dcfb3a770afc08a16c4e843c51b873cac7fc4d5`.

Images: `images/radars/<map>[_lower]_radar_psd.png`.
Calibration: `data/available.json`, derived from Valve's overview files.
The matching calibration is committed in
`frontend/features/analyzer/state/maps.json`; update images and calibration together.
All images are 1024 × 1024. The Source world-to-radar transform is
`x = (world_x - pos_x) / scale`, `y = (pos_y - world_y) / scale`.
Overview `rotate`/`zoom` are retained as provenance; these are fixed full-size
radars, not the rotating/zooming in-game HUD. Vertical sections select the
appropriate image by the player's/event's world Z, with shared XY calibration.

Map images and overview data are property of Valve Corporation. The upstream
repository provides automated extraction/access to the publicly available game
assets; see its README License section. Assets here are served locally, without
third-party runtime radar requests. Old demos may contain earlier map geometry;
this snapshot is not a historical map-asset archive.
