import { Canvas } from "@react-three/fiber";
import { HeroScene } from "./scene";
import type { SceneProps } from "./hero-types";

/** The WebGL canvas. DPR is capped at 2, and drawing stops (frameloop "never") when the hero is off screen or the tab is hidden. */
export default function HeroCanvas({ accent, data, progress, pointer, active, onReady }: SceneProps & { active: boolean; onReady: () => void }) {
  return (
    <Canvas dpr={[1, 2]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 9], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} onCreated={onReady} aria-hidden="true">
      <HeroScene accent={accent} data={data} progress={progress} pointer={pointer} />
    </Canvas>
  );
}
