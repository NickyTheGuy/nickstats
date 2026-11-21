import { useEffect, useState } from 'react';
import { GRENADE_ICONS } from './state/replay.mjs';
import { weaponIconKey, weaponIconPath } from './state/weapon-icons.mjs';
let iconPromise;
export function useGrenadeIcons() {
  const [icons, setIcons] = useState({});
  useEffect(() => {
    let active = true;
    iconPromise ||= Promise.all(
      GRENADE_ICONS.map(
        (name) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve([name, image]);
            image.onerror = () => resolve([name, null]);
            image.src = `./assets/grenades/${name}.svg`;
          }),
      ),
    ).then((entries) => Object.fromEntries(entries));
    iconPromise.then((value) => {
      if (active) setIcons(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return icons;
}

const combatCache = new Map();
export function useCombatIcons(rounds) {
  const [icons, setIcons] = useState({});
  const names = [
    ...new Set(
      rounds
        .flatMap((round) => [
          ...(round.deaths || []).map((e) => weaponIconKey(e.weapon)),
          ...(round.equipment || []).flatMap((track) =>
            track.samples.map((s) => weaponIconKey(s[1])),
          ),
        ])
        .filter(Boolean),
    ),
  ]
    .sort()
    .join(',');
  useEffect(() => {
    let active = true;
    Promise.all(
      names
        .split(',')
        .filter(Boolean)
        .map((name) => {
          if (!combatCache.has(name))
            combatCache.set(
              name,
              new Promise((resolve) => {
                const image = new Image();
                image.onload = () => resolve([name, image]);
                image.onerror = () => resolve([name, null]);
                image.src = weaponIconPath(name);
              }),
            );
          return combatCache.get(name);
        }),
    ).then((entries) => {
      if (active) setIcons(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [names]);
  return icons;
}
