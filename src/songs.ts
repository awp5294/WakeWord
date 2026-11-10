// Alarm songs. Each is our own instrumental recording (made by tools/make_songs.py) of a
// traditional or public-domain tune, so they're free to ship with the app.
import { Lang } from "./decks";

export type Song = { id: string; lang: Lang; title: string; about: string; file: number };

export const SONGS: Song[] = [
  { id: "it-bella-ciao", lang: "it", title: "Bella ciao", about: "Folk song, on mandolin", file: require("../assets/song-it-bella-ciao.mp3") },
  { id: "it-la-donna-e-mobile", lang: "it", title: "La donna è mobile", about: "Verdi, on mandolin", file: require("../assets/song-it-la-donna-e-mobile.mp3") },
  { id: "it-william-tell", lang: "it", title: "William Tell gallop", about: "Rossini, on mandolin", file: require("../assets/song-it-william-tell.mp3") },
  { id: "fr-frere-jacques", lang: "fr", title: "Frère Jacques", about: "Folk round, on accordion", file: require("../assets/song-fr-frere-jacques.mp3") },
  { id: "fr-au-clair-de-la-lune", lang: "fr", title: "Au clair de la lune", about: "Folk song, on accordion", file: require("../assets/song-fr-au-clair-de-la-lune.mp3") },
  { id: "fr-alouette", lang: "fr", title: "Alouette", about: "Folk song, on accordion", file: require("../assets/song-fr-alouette.mp3") },
  { id: "es-la-cucaracha", lang: "es", title: "La cucaracha", about: "Folk song, on guitar", file: require("../assets/song-es-la-cucaracha.mp3") },
  { id: "es-romance", lang: "es", title: "Romance", about: "Spanish guitar classic", file: require("../assets/song-es-romance.mp3") },
  { id: "es-habanera", lang: "es", title: "Habanera", about: "Bizet's Carmen, on guitar", file: require("../assets/song-es-habanera.mp3") },
];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
