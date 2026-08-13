import "./index.css";
import { Composition } from "remotion";
import { StampCardLoop, STAMP_LOOP_DURATION } from "./StampCard";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StampLoop"
        component={StampCardLoop}
        durationInFrames={STAMP_LOOP_DURATION}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ dark: false }}
      />
      <Composition
        id="StampLoopDark"
        component={StampCardLoop}
        durationInFrames={STAMP_LOOP_DURATION}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ dark: true }}
      />
    </>
  );
};
