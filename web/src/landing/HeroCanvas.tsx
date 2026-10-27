import { useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { DepthField } from "./field";
import { HeroScene } from "./scene";
import type { SceneProps } from "./hero-types";

/** Pins the hero object to its slot in the page layout: each frame it is moved and scaled to where that element is on screen,
 *  so the object scrolls with the page and the canvas behind it can be full-bleed. */
function SlotGroup({ slot, children }: { slot: RefObject<HTMLElement | null>; children: ReactNode }) {
  const g = useRef<Group>(null);
  const viewport = useThree((s) => s.viewport);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const el = slot.current, grp = g.current;
    if (!el || !grp) return;
    const r = el.getBoundingClientRect();
    const perPx = viewport.width / size.width;
    grp.position.x = (r.left + r.width / 2 - size.width / 2) * perPx;
    grp.position.y = -(r.top + r.height / 2 - size.height / 2) * perPx;
    grp.scale.setScalar((r.width * perPx * 1.1) / 4.6);
  });
  return <group ref={g}>{children}</group>;
}

/** The WebGL canvas: full viewport, fixed behind the page. DPR is capped at 2 and drawing stops while the tab is hidden. */
export default function HeroCanvas({ accent, data, progress, page, pointer, slot, active, onReady }: SceneProps & { slot: RefObject<HTMLElement | null>; active: boolean; onReady: () => void }) {
  return (
    <Canvas dpr={[1, 2]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 9], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} onCreated={onReady} aria-hidden="true">
      <DepthField accent={accent} page={page} pointer={pointer} />
      <SlotGroup slot={slot}>
        <HeroScene accent={accent} data={data} progress={progress} page={page} pointer={pointer} />
      </SlotGroup>
    </Canvas>
  );
}
