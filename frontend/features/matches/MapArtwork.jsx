import { artworkFor } from './state/match-card.mjs';

export default function MapArtwork({ name }) {
  const artwork = artworkFor(name);
  const style = artwork ? { backgroundImage: `url("./assets/maps-v2/${artwork.file}")`, backgroundPosition: artwork.position } : undefined;
  return <span className={`match-list-map-art${artwork ? '' : ' unknown'}`} style={style}>
    <span>{name.replace(/^de_/i, '')}</span>
  </span>;
}
