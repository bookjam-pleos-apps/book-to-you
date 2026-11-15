import fishermanLandscape from "../../assets/covers/fisherman-landscape.webp";
import masterawayLandscape from "../../assets/covers/masteraway-landscape.webp";
import redhoodLandscape from "../../assets/covers/redhood-landscape.webp";
import redhoodPortrait from "../../assets/covers/redhood-portrait.webp";
import type { CoverArtSet } from "./cover";

// 차량 앱 res/drawable-nodpi의 그림을 그대로 복사했다. 새 동화 그림은 두 앱에 같은 이야기 id로 넣는다.
export const COVER_ART: Readonly<Record<string, CoverArtSet>> = {
  redhood: { portrait: redhoodPortrait, landscape: redhoodLandscape },
  fisherman: { landscape: fishermanLandscape },
  masteraway: { landscape: masterawayLandscape },
};
